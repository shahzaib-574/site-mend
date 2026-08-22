import { describe, expect, it } from "vitest";

import {
  ROBOTS_POLICY_LIMITS,
  RobotsPolicyComplexityError,
  parseRobotsPolicy,
} from "./robots-policy";

const productToken = "SiteMendBot";

function isAllowed(robotsText: string, path: string): boolean {
  return parseRobotsPolicy(robotsText, productToken).isAllowed(
    new URL(path, "https://example.com").toString(),
  );
}

function stringsThroughLength(
  alphabet: ReadonlyArray<string>,
  maxLength: number,
): string[] {
  const values = [""];
  let layer = [""];

  for (let length = 1; length <= maxLength; length += 1) {
    layer = layer.flatMap((prefix) =>
      alphabet.map((character) => `${prefix}${character}`),
    );
    values.push(...layer);
  }

  return values;
}

function referenceGlobMatch(path: string, source: string): boolean {
  const anchored = source.endsWith("$");
  const pattern = anchored ? source.slice(0, -1) : source;
  const memo = new Map<string, boolean>();

  function visit(patternIndex: number, pathIndex: number): boolean {
    const key = `${patternIndex}:${pathIndex}`;
    const cached = memo.get(key);

    if (cached !== undefined) {
      return cached;
    }

    let matches: boolean;

    if (patternIndex === pattern.length) {
      matches = !anchored || pathIndex === path.length;
    } else if (pattern[patternIndex] === "*") {
      matches =
        visit(patternIndex + 1, pathIndex) ||
        (pathIndex < path.length && visit(patternIndex, pathIndex + 1));
    } else {
      matches =
        pathIndex < path.length &&
        pattern[patternIndex] === path[pathIndex] &&
        visit(patternIndex + 1, pathIndex + 1);
    }

    memo.set(key, matches);
    return matches;
  }

  return visit(0, 0);
}

describe("RFC 9309 robots policy", () => {
  describe("Google-compatible rule precedence", () => {
    it("counts wildcard syntax when a longer matching disallow competes with an allow", () => {
      const robotsText = `
        User-agent: *
        Allow: /page
        Disallow: /*.htm
      `;

      expect(isAllowed(robotsText, "/page.htm")).toBe(false);
      expect(isAllowed(robotsText, "/page.php")).toBe(true);
    });

    it("counts the end anchor when selecting the most specific rule", () => {
      const robotsText = `
        User-agent: *
        Allow: /
        Disallow: /$
      `;

      expect(isAllowed(robotsText, "/")).toBe(false);
      expect(isAllowed(robotsText, "/page")).toBe(true);
    });

    it("backtracks a wildcard until an anchored suffix reaches the URL end", () => {
      expect(isAllowed("User-agent: *\nDisallow: /*a$", "/aa")).toBe(false);
      expect(isAllowed("User-agent: *\nDisallow: /*a$", "/ab")).toBe(true);
    });

    it("preserves wildcard-run specificity after canonical matcher collapse", () => {
      expect(
        isAllowed("User-agent: *\nDisallow: /**\nAllow: /$", "/"),
      ).toBe(false);

      expect(
        isAllowed(
          "User-agent: *\nAllow: /*/private\nDisallow: /**/private",
          "/x/private",
        ),
      ).toBe(false);
    });

    it("counts percent-normalized reserved characters as single octets", () => {
      expect(
        isAllowed("User-agent: *\nAllow: /=\nDisallow: /*ab", "/=ab"),
      ).toBe(false);
      expect(
        isAllowed("User-agent: *\nAllow: /::\nDisallow: /*abc", "/::abc"),
      ).toBe(false);
    });

    it("keeps the strongest duplicate specificity for a canonical rule", () => {
      const robotsText = `
        User-agent: *
        Disallow: /*
        Disallow: /**
        Allow: /$
      `;

      expect(isAllowed(robotsText, "/")).toBe(false);
    });

    it.each([
      ["disallow first", "Disallow: /same\nAllow: /same"],
      ["allow first", "Allow: /same\nDisallow: /same"],
    ])("lets allow win an equal-specificity tie: %s", (_name, rules) => {
      expect(isAllowed(`User-agent: *\n${rules}`, "/same")).toBe(true);
    });

    it("keeps anchored and unanchored forms as distinct precedence candidates", () => {
      const robotsText = `
        User-agent: *
        Disallow: /same
        Disallow: /same$
        Allow: /same
      `;

      expect(isAllowed(robotsText, "/same")).toBe(false);
      expect(isAllowed(robotsText, "/same/more")).toBe(true);
    });
  });

  it("matches bounded wildcard patterns like an exhaustive reference matcher", () => {
    const patterns = stringsThroughLength(["a", "b", "*"], 4).flatMap(
      (suffix) => [`/${suffix}`, `/${suffix}$`],
    );
    const paths = stringsThroughLength(["a", "b"], 4).map(
      (suffix) => `/${suffix}`,
    );

    for (const pattern of patterns) {
      const policy = parseRobotsPolicy(
        `User-agent: *\nDisallow: ${pattern}`,
        productToken,
      );

      for (const path of paths) {
        const expectedAllowed = !referenceGlobMatch(path, pattern);
        expect(
          policy.isAllowed(new URL(path, "https://example.com").toString()),
          `${pattern} against ${path}`,
        ).toBe(expectedAllowed);
      }
    }
  });

  describe("group selection", () => {
    it("merges all exact groups and ignores wildcard groups when an exact group exists", () => {
      const robotsText = `
        User-agent: *
        Disallow: /

        User-agent: SiteMendBot
        Disallow: /private

        User-agent: SiteMendBot
        Allow: /private/public
      `;

      const policy = parseRobotsPolicy(robotsText, productToken);

      expect(policy.isAllowed("https://example.com/unlisted")).toBe(true);
      expect(policy.isAllowed("https://example.com/private")).toBe(false);
      expect(policy.isAllowed("https://example.com/private/public")).toBe(true);
    });

    it("lets an empty exact group suppress a wildcard group", () => {
      const robotsText = `
        User-agent: *
        Disallow: /

        User-agent: SiteMendBot
      `;

      expect(isAllowed(robotsText, "/anything")).toBe(true);
      expect(
        parseRobotsPolicy(robotsText, "OtherBot").isAllowed(
          "https://example.com/anything",
        ),
      ).toBe(false);
    });

    it("discards an overflowed wildcard fallback when a later exact group applies", () => {
      const fallbackRules = Array.from(
        { length: ROBOTS_POLICY_LIMITS.maxRules + 1 },
        (_, index) => `Disallow: /fallback-${index.toString(36)}`,
      ).join("\n");
      const policy = parseRobotsPolicy(
        `User-agent: *\n${fallbackRules}\nUser-agent: SiteMendBot`,
        productToken,
      );

      expect(policy.isAllowed("https://example.com/fallback-1")).toBe(true);
    });

    it("combines separate wildcard groups when no exact group exists", () => {
      const robotsText = `
        User-agent: *
        Disallow: /one

        User-agent: OtherBot
        Disallow: /other

        User-agent: *
        Disallow: /two
      `;

      expect(isAllowed(robotsText, "/one")).toBe(false);
      expect(isAllowed(robotsText, "/two")).toBe(false);
      expect(isAllowed(robotsText, "/other")).toBe(true);
    });
  });

  it("implicitly allows robots.txt even when a matching rule disallows it", () => {
    const policy = parseRobotsPolicy(
      "User-agent: *\nDisallow: /robots.txt?$\nDisallow: /robots.txt?private$\nDisallow: /robots.txt\nDisallow: /",
      productToken,
    );

    expect(policy.isAllowed("https://example.com/robots.txt")).toBe(true);
    expect(policy.isAllowed("https://example.com/robots.txt?")).toBe(false);
    expect(
      policy.isAllowed("https://example.com/robots.txt?private"),
    ).toBe(false);
    expect(policy.isAllowed("https://example.com/private")).toBe(false);
  });

  it("evaluates an explicit empty query exactly as the HTTP client transmits it", () => {
    const policy = parseRobotsPolicy(
      "User-agent: *\nDisallow: /secret$\nAllow: /secret?$",
      productToken,
    );

    expect(policy.isAllowed("https://example.com/secret")).toBe(false);
    expect(policy.isAllowed("https://example.com/secret?")).toBe(true);
  });

  describe("encoded and non-ASCII paths", () => {
    const robotsText = `
      User-agent: *
      Disallow: /literal%2Apath
      Disallow: /cash%24
      Disallow: /%62%61%7A$
      Disallow: /café$
    `;

    it("treats percent-encoded wildcard and anchor characters as literals", () => {
      expect(isAllowed(robotsText, "/literal%2Apath")).toBe(false);
      expect(isAllowed(robotsText, "/literal-any-path")).toBe(true);
      expect(isAllowed(robotsText, "/cash%24")).toBe(false);
      expect(isAllowed(robotsText, "/cash")).toBe(true);
    });

    it("decodes percent-encoded unreserved octets before matching", () => {
      expect(isAllowed(robotsText, "/baz")).toBe(false);
      expect(isAllowed(robotsText, "/%62%61%7a")).toBe(false);
      expect(isAllowed(robotsText, "/bazooka")).toBe(true);
    });

    it("matches raw non-ASCII rules against their percent-encoded URL form", () => {
      expect(isAllowed(robotsText, "/caf%C3%A9")).toBe(false);
      expect(isAllowed(robotsText, "/café")).toBe(false);
      expect(isAllowed(robotsText, "/cafe")).toBe(true);
    });
  });

  describe("line and group parsing", () => {
    it.each([
      ["LF", "\n"],
      ["CRLF", "\r\n"],
      ["CR", "\r"],
    ])("accepts a BOM and %s newlines", (_name, newline) => {
      const robotsText = [
        "\uFEFFUser-agent: SiteMendBot",
        "Sitemap: https://example.com/sitemap.xml",
        "Disallow: /private",
      ].join(newline);

      expect(isAllowed(robotsText, "/private")).toBe(false);
      expect(isAllowed(robotsText, "/public")).toBe(true);
    });

    it("ignores malformed records without poisoning surrounding valid groups", () => {
      const policy = parseRobotsPolicy(
        `
          Disallow: /outside-a-group
          User-agent:
          Disallow: /after-empty-agent
          User-agent: SiteMendBot/1.0
          Disallow: /after-invalid-agent

          User-agent: SiteMendBot
          Unknown-field: value
          this line has no colon
          Disallow: /private

          User-agent: OtherBot
          Disallow: /other
        `,
        productToken,
      );

      expect(policy.isAllowed("https://example.com/outside-a-group")).toBe(true);
      expect(policy.isAllowed("https://example.com/after-empty-agent")).toBe(true);
      expect(policy.isAllowed("https://example.com/after-invalid-agent")).toBe(true);
      expect(policy.isAllowed("https://example.com/private")).toBe(false);
      expect(policy.isAllowed("https://example.com/other")).toBe(true);
    });

    it("does not require a final newline", () => {
      expect(
        isAllowed("User-agent: SiteMendBot\nDisallow: /private", "/private"),
      ).toBe(false);
    });

    it("strips inline comments from user-agent and rule values", () => {
      const robotsText = `
        User-agent: SiteMendBot # exact product
        Disallow: /private # hidden area
        Allow: /private/public # explicit exception
      `;

      expect(isAllowed(robotsText, "/private")).toBe(false);
      expect(isAllowed(robotsText, "/private/public")).toBe(true);
    });
  });
});

describe("robots policy resource limits", () => {
  function asciiCommentsAtByteLength(byteLength: number): string {
    const block = `${"#".repeat(1_023)}\n`;
    return (
      block.repeat(Math.floor(byteLength / block.length)) +
      "#".repeat(byteLength % block.length)
    );
  }

  function canonicalPatternAtLength(
    codeUnits: number,
    uniqueSuffix = "",
  ): string {
    const bodyLength = codeUnits - 1 - uniqueSuffix.length;
    return (
      "/" +
      "€".repeat(Math.floor(bodyLength / 9)) +
      "a".repeat(bodyLength % 9) +
      uniqueSuffix
    );
  }

  it("accepts the exact UTF-8 text limit and rejects the next byte", () => {
    const atLimit = asciiCommentsAtByteLength(
      ROBOTS_POLICY_LIMITS.maxTextBytes,
    );
    const overLimit = `${atLimit}#`;

    expect(new TextEncoder().encode(atLimit)).toHaveLength(
      ROBOTS_POLICY_LIMITS.maxTextBytes,
    );
    expect(() => parseRobotsPolicy(atLimit, productToken)).not.toThrow();
    expect(() => parseRobotsPolicy(overLimit, productToken)).toThrow(
      RobotsPolicyComplexityError,
    );
  });

  it("accepts the exact line length and rejects the next code unit", () => {
    const atLimit = "x".repeat(ROBOTS_POLICY_LIMITS.maxLineCodeUnits);
    const overLimit = `${atLimit}x`;

    expect(() => parseRobotsPolicy(atLimit, productToken)).not.toThrow();
    expect(() => parseRobotsPolicy(overLimit, productToken)).toThrow(
      RobotsPolicyComplexityError,
    );
  });

  it("accepts the exact line count and rejects one additional line", () => {
    const atLimit = Array.from(
      { length: ROBOTS_POLICY_LIMITS.maxLines },
      () => "#",
    ).join("\n");

    expect(() => parseRobotsPolicy(atLimit, productToken)).not.toThrow();
    expect(() => parseRobotsPolicy(`${atLimit}\n#`, productToken)).toThrow(
      RobotsPolicyComplexityError,
    );
  });

  it("bounds the total number of parsed groups", () => {
    const group = "User-agent: OtherBot\nDisallow: /private";
    const atLimit = Array.from(
      { length: ROBOTS_POLICY_LIMITS.maxGroups },
      () => group,
    ).join("\n");

    expect(() => parseRobotsPolicy(atLimit, productToken)).not.toThrow();
    expect(() => parseRobotsPolicy(`${atLimit}\n${group}`, productToken)).toThrow(
      RobotsPolicyComplexityError,
    );
  });

  it("bounds the total number of user-agent entries", () => {
    const atLimit = Array.from(
      { length: ROBOTS_POLICY_LIMITS.maxAgentEntries },
      () => "User-agent: OtherBot",
    ).join("\n");

    expect(() => parseRobotsPolicy(atLimit, productToken)).not.toThrow();
    expect(() =>
      parseRobotsPolicy(`${atLimit}\nUser-agent: OtherBot`, productToken),
    ).toThrow(RobotsPolicyComplexityError);
  });

  it("bounds selected rules without counting harmlessly short patterns as complex", () => {
    const rules = Array.from(
      { length: ROBOTS_POLICY_LIMITS.maxRules + 1 },
      (_, index) => `Disallow: /p${index.toString(36)}`,
    );
    const atLimit = `User-agent: SiteMendBot\n${rules
      .slice(0, ROBOTS_POLICY_LIMITS.maxRules)
      .join("\n")}`;

    expect(() => parseRobotsPolicy(atLimit, productToken)).not.toThrow();
    expect(() =>
      parseRobotsPolicy(`${atLimit}\n${rules.at(-1)}`, productToken),
    ).toThrow(RobotsPolicyComplexityError);
  });

  it("accepts the exact aggregate normalized-pattern budget and rejects one more unit", () => {
    const perPattern = ROBOTS_POLICY_LIMITS.maxNonWildcardPatternCodeUnits;
    const fullPatterns = Math.floor(
      ROBOTS_POLICY_LIMITS.maxStoredPatternCodeUnits / perPattern,
    );
    const remainder =
      ROBOTS_POLICY_LIMITS.maxStoredPatternCodeUnits % perPattern;
    const rules = Array.from(
      { length: fullPatterns },
      (_, index) =>
        `Disallow: ${canonicalPatternAtLength(
          perPattern,
          index.toString(36).padStart(4, "0"),
        )}`,
    );

    if (remainder > 0) {
      rules.push(`Disallow: ${canonicalPatternAtLength(remainder)}`);
    }

    const atLimit = `User-agent: SiteMendBot\n${rules.join("\n")}`;

    expect(new TextEncoder().encode(atLimit).length).toBeLessThanOrEqual(
      ROBOTS_POLICY_LIMITS.maxTextBytes,
    );
    expect(() => parseRobotsPolicy(atLimit, productToken)).not.toThrow();
    expect(() =>
      parseRobotsPolicy(`${atLimit}\nDisallow: /`, productToken),
    ).toThrow(RobotsPolicyComplexityError);
  });

  it("accepts the exact aggregate wildcard budget and rejects one more wildcard", () => {
    const wildcardsPerRule = 4;
    const fullRules =
      ROBOTS_POLICY_LIMITS.maxStoredWildcards / wildcardsPerRule;
    const rules = Array.from(
      { length: fullRules },
      (_, index) => `Disallow: /*a*a*a*${index.toString(36)}`,
    );
    const atLimit = `User-agent: SiteMendBot\n${rules.join("\n")}`;

    expect(Number.isInteger(fullRules)).toBe(true);
    expect(() => parseRobotsPolicy(atLimit, productToken)).not.toThrow();
    expect(() =>
      parseRobotsPolicy(`${atLimit}\nDisallow: /overflow*`, productToken),
    ).toThrow(RobotsPolicyComplexityError);
  });

  it("discards a rule whose required literal path cannot fit an admitted target", () => {
    const atLimit = `/${"a".repeat(
      ROBOTS_POLICY_LIMITS.maxNonWildcardPatternCodeUnits - 1,
    )}`;
    const impossible = `${atLimit}a`;

    expect(
      parseRobotsPolicy(
        `User-agent: *\nDisallow: ${atLimit}$`,
        productToken,
      ).isAllowed(`https://example.com${atLimit}`),
    ).toBe(false);
    expect(
      parseRobotsPolicy(
        `User-agent: *\nDisallow: ${impossible}`,
        productToken,
      ).isAllowed(`https://example.com${atLimit}`),
    ).toBe(true);
  });

  it("accepts the exact derived rule shape and filters the next impossible shape", () => {
    const atLimit = `*/${"*a".repeat(
      ROBOTS_POLICY_LIMITS.maxNonWildcardPatternCodeUnits - 1,
    )}*`;
    const impossible = `${atLimit}b*`;
    const target = `/${"a".repeat(
      ROBOTS_POLICY_LIMITS.maxTargetCodeUnits - 1,
    )}`;

    expect(atLimit.length).toBe(
      ROBOTS_POLICY_LIMITS.maxCanonicalPatternCodeUnits,
    );
    expect(atLimit.match(/\*/g)).toHaveLength(
      ROBOTS_POLICY_LIMITS.maxPatternWildcards,
    );
    expect(impossible.length).toBe(
      ROBOTS_POLICY_LIMITS.maxCanonicalPatternCodeUnits + 2,
    );
    expect(impossible.match(/\*/g)).toHaveLength(
      ROBOTS_POLICY_LIMITS.maxPatternWildcards + 1,
    );
    expect(isAllowed(`User-agent: *\nDisallow: ${atLimit}$`, target)).toBe(
      false,
    );
    expect(isAllowed(`User-agent: *\nDisallow: ${impossible}$`, target)).toBe(
      true,
    );
  });

  it("collapses a long run of wildcards before storing and matching it", () => {
    const wildcardRun = "*".repeat(
      ROBOTS_POLICY_LIMITS.maxLineCodeUnits - "Disallow: /".length,
    );
    const policy = parseRobotsPolicy(
      `User-agent: *\nDisallow: /${wildcardRun}`,
      productToken,
    );

    expect(policy.isAllowed("https://example.com/anything")).toBe(false);
  });

  it("accepts an exact-length target and rejects one additional code unit", () => {
    const policy = parseRobotsPolicy("User-agent: *\nAllow: /", productToken);
    const atLimit = `/${"a".repeat(
      ROBOTS_POLICY_LIMITS.maxTargetCodeUnits - 1,
    )}`;
    const overLimit = `${atLimit}a`;

    expect(policy.isAllowed(`https://example.com${atLimit}`)).toBe(true);
    expect(() => policy.isAllowed(`https://example.com${overLimit}`)).toThrow(
      RobotsPolicyComplexityError,
    );
  });

  it("accepts the exact transition budget and rejects one more transition", () => {
    const targetBodyLength = ROBOTS_POLICY_LIMITS.maxTargetCodeUnits - 1;
    const wildcardNearMissTransitions = targetBodyLength + 3;
    const finalLiteralTransitions = 900;
    const wildcardRules =
      (ROBOTS_POLICY_LIMITS.maxMatchTransitions - finalLiteralTransitions) /
      wildcardNearMissTransitions;
    const exactRules = Array.from(
      { length: wildcardRules },
      (_, index) => `Disallow: /*b${index.toString(36)}`,
    );
    exactRules.push(
      `Disallow: /${"a".repeat(finalLiteralTransitions - 2)}b`,
    );
    const atLimitPolicy = parseRobotsPolicy(
      `User-agent: SiteMendBot\n${exactRules.join("\n")}`,
      productToken,
    );
    const overLimitPolicy = parseRobotsPolicy(
      `User-agent: SiteMendBot\n${exactRules.join("\n")}\nDisallow: /z`,
      productToken,
    );
    const target = `/${"a".repeat(targetBodyLength)}`;

    expect(Number.isInteger(wildcardRules)).toBe(true);
    expect(
      wildcardRules * wildcardNearMissTransitions + finalLiteralTransitions,
    ).toBe(ROBOTS_POLICY_LIMITS.maxMatchTransitions);
    expect(atLimitPolicy.isAllowed(`https://example.com${target}`)).toBe(true);
    expect(() =>
      overLimitPolicy.isAllowed(`https://example.com${target}`),
    ).toThrow(RobotsPolicyComplexityError);
  });

  it("stops adversarial wildcard backtracking at the transition budget", () => {
    const target = `/${"a".repeat(
      ROBOTS_POLICY_LIMITS.maxTargetCodeUnits - 1,
    )}`;
    const rules = Array.from(
      { length: 4_000 },
      (_, index) => `Disallow: /*b${index.toString(36)}`,
    );
    const policy = parseRobotsPolicy(
      `User-agent: SiteMendBot\n${rules.join("\n")}`,
      productToken,
    );

    expect(() => policy.isAllowed(`https://example.com${target}`)).toThrow(
      RobotsPolicyComplexityError,
    );
  });

  it("exposes a distinct deterministic complexity error", () => {
    const error = new RobotsPolicyComplexityError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RobotsPolicyComplexityError);
    expect(error.name).toBe("RobotsPolicyComplexityError");
  });
});
