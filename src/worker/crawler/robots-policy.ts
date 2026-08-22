import { CRAWL_LIMITS } from "./crawl-budget";
import { toHttpRequestTarget } from "./request-target";

export const ROBOTS_POLICY_LIMITS = {
  maxAgentEntries: 16_384,
  maxCanonicalPatternCodeUnits: 4_097,
  maxGroups: 8_192,
  maxLineCodeUnits: 65_536,
  maxLines: 65_536,
  maxMatchTransitions: 8_000_000,
  maxNonWildcardPatternCodeUnits: 2_048,
  maxPatternWildcards: 2_049,
  maxRules: 8_192,
  maxStoredPatternCodeUnits: 1_048_576,
  maxStoredWildcards: 16_384,
  maxTargetCodeUnits: 2_048,
  maxTextBytes: CRAWL_LIMITS.robotsBytes,
} as const;

interface RobotsRule {
  allow: boolean;
  endAnchored: boolean;
  matcherPattern: string;
  specificity: number;
  wildcards: number;
}

export class RobotsPolicyComplexityError extends Error {
  constructor() {
    super("The robots policy exceeded safe processing limits.");
    this.name = "RobotsPolicyComplexityError";
  }
}

function isAsciiUnreserved(codePoint: number): boolean {
  return (
    (codePoint >= 0x41 && codePoint <= 0x5a) ||
    (codePoint >= 0x61 && codePoint <= 0x7a) ||
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    codePoint === 0x2d ||
    codePoint === 0x2e ||
    codePoint === 0x5f ||
    codePoint === 0x7e
  );
}

function hexadecimalValue(codePoint: number): number {
  if (codePoint >= 0x30 && codePoint <= 0x39) {
    return codePoint - 0x30;
  }

  if (codePoint >= 0x41 && codePoint <= 0x46) {
    return codePoint - 0x41 + 10;
  }

  if (codePoint >= 0x61 && codePoint <= 0x66) {
    return codePoint - 0x61 + 10;
  }

  return -1;
}

function percentEncodedOctet(codePoint: number): string {
  return `%${codePoint.toString(16).toUpperCase().padStart(2, "0")}`;
}

function normalizeForMatch(
  value: string,
  options: { preserveWildcard: boolean },
): string | null {
  const normalized: string[] = [];

  for (let index = 0; index < value.length; ) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit === 0x25) {
      if (index + 2 >= value.length) {
        return null;
      }

      const high = hexadecimalValue(value.charCodeAt(index + 1));
      const low = hexadecimalValue(value.charCodeAt(index + 2));

      if (high === -1 || low === -1) {
        return null;
      }

      const octet = high * 16 + low;
      normalized.push(
        isAsciiUnreserved(octet)
          ? String.fromCharCode(octet)
          : percentEncodedOctet(octet),
      );
      index += 3;
      continue;
    }

    const codePoint = value.codePointAt(index);

    if (codePoint === undefined || codePoint <= 0x20 || codePoint === 0x7f) {
      return null;
    }

    const character = String.fromCodePoint(codePoint);

    if (codePoint > 0x7f) {
      try {
        normalized.push(encodeURIComponent(character).toUpperCase());
      } catch {
        return null;
      }
    } else if (
      isAsciiUnreserved(codePoint) ||
      character === "/" ||
      character === "?" ||
      (options.preserveWildcard && character === "*")
    ) {
      normalized.push(character);
    } else {
      normalized.push(percentEncodedOctet(codePoint));
    }

    index += character.length;
  }

  return normalized.join("");
}

function countPatternOctets(value: string): number {
  let octets = 0;

  for (let index = 0; index < value.length; ) {
    if (
      value.charCodeAt(index) === 0x25 &&
      index + 2 < value.length &&
      hexadecimalValue(value.charCodeAt(index + 1)) !== -1 &&
      hexadecimalValue(value.charCodeAt(index + 2)) !== -1
    ) {
      index += 3;
    } else {
      index += 1;
    }

    octets += 1;
  }

  return octets;
}

function createRule(allow: boolean, rawValue: string): RobotsRule | null {
  if (!rawValue) {
    return null;
  }

  const endAnchored = rawValue.endsWith("$");
  const value = endAnchored ? rawValue.slice(0, -1) : rawValue;
  const normalized = normalizeForMatch(value, { preserveWildcard: true });

  if (normalized === null) {
    return null;
  }

  const pattern: string[] = [];
  let nonWildcardCodeUnits = 0;
  let previousWasWildcard = false;
  let wildcards = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (character === "*") {
      if (!previousWasWildcard) {
        pattern.push(character);
        wildcards += 1;
      }

      previousWasWildcard = true;
      continue;
    }

    pattern.push(character);
    nonWildcardCodeUnits += 1;
    previousWasWildcard = false;
  }

  if (
    nonWildcardCodeUnits >
    ROBOTS_POLICY_LIMITS.maxNonWildcardPatternCodeUnits
  ) {
    // The admitted canonical path and query cannot be longer than this, so the
    // rule cannot match and can be discarded without weakening the policy.
    return null;
  }

  const matcherPattern = pattern.join("");

  if (
    matcherPattern.length >
      ROBOTS_POLICY_LIMITS.maxCanonicalPatternCodeUnits ||
    wildcards > ROBOTS_POLICY_LIMITS.maxPatternWildcards
  ) {
    throw new RobotsPolicyComplexityError();
  }

  return {
    allow,
    endAnchored,
    matcherPattern,
    specificity: countPatternOctets(normalized) + (endAnchored ? 1 : 0),
    wildcards,
  };
}

interface SeenPattern {
  flags: number;
  indexes: number[];
}

class RuleAccumulator {
  readonly rules: RobotsRule[] = [];
  private readonly seen = new Map<string, SeenPattern>();
  private storedPatternCodeUnits = 0;
  private storedWildcards = 0;
  overflowed = false;

  add(rule: RobotsRule): void {
    if (this.overflowed) {
      return;
    }

    const variant = rule.endAnchored ? (rule.allow ? 2 : 3) : rule.allow ? 0 : 1;
    const bit = 1 << variant;
    const seenPattern = this.seen.get(rule.matcherPattern);

    if (seenPattern && (seenPattern.flags & bit) !== 0) {
      const ruleIndex = seenPattern.indexes[variant];

      if (rule.specificity > this.rules[ruleIndex].specificity) {
        this.rules[ruleIndex] = rule;
      }

      return;
    }

    const nextPatternCodeUnits =
      this.storedPatternCodeUnits + rule.matcherPattern.length;
    const nextWildcards = this.storedWildcards + rule.wildcards;

    if (
      this.rules.length >= ROBOTS_POLICY_LIMITS.maxRules ||
      nextPatternCodeUnits >
        ROBOTS_POLICY_LIMITS.maxStoredPatternCodeUnits ||
      nextWildcards > ROBOTS_POLICY_LIMITS.maxStoredWildcards
    ) {
      this.overflowed = true;
      this.rules.length = 0;
      this.seen.clear();
      this.storedPatternCodeUnits = 0;
      this.storedWildcards = 0;
      return;
    }

    const ruleIndex = this.rules.length;

    if (seenPattern) {
      seenPattern.flags |= bit;
      seenPattern.indexes[variant] = ruleIndex;
    } else {
      const indexes = [-1, -1, -1, -1];
      indexes[variant] = ruleIndex;
      this.seen.set(rule.matcherPattern, { flags: bit, indexes });
    }

    this.rules.push(rule);
    this.storedPatternCodeUnits = nextPatternCodeUnits;
    this.storedWildcards = nextWildcards;
  }
}

class MatchBudget {
  private remaining: number = ROBOTS_POLICY_LIMITS.maxMatchTransitions;

  use(): void {
    if (this.remaining === 0) {
      throw new RobotsPolicyComplexityError();
    }

    this.remaining -= 1;
  }
}

function matchesRule(
  path: string,
  rule: RobotsRule,
  budget: MatchBudget,
): boolean {
  const pattern = rule.matcherPattern;
  let pathIndex = 0;
  let patternIndex = 0;
  let wildcardIndex = -1;
  let wildcardPathIndex = -1;

  while (true) {
    budget.use();

    if (patternIndex === pattern.length) {
      if (!rule.endAnchored || pathIndex === path.length) {
        return true;
      }

      if (wildcardIndex !== -1 && wildcardPathIndex < path.length) {
        wildcardPathIndex += 1;
        pathIndex = wildcardPathIndex;
        patternIndex = wildcardIndex + 1;
        continue;
      }

      return false;
    }

    if (pattern[patternIndex] === "*") {
      wildcardIndex = patternIndex;
      wildcardPathIndex = pathIndex;
      patternIndex += 1;

      if (patternIndex === pattern.length) {
        return true;
      }

      continue;
    }

    if (
      pathIndex < path.length &&
      pattern[patternIndex] === path[pathIndex]
    ) {
      patternIndex += 1;
      pathIndex += 1;
      continue;
    }

    if (wildcardIndex !== -1 && wildcardPathIndex < path.length) {
      wildcardPathIndex += 1;
      pathIndex = wildcardPathIndex;
      patternIndex = wildcardIndex + 1;
      continue;
    }

    return false;
  }
}

export class RobotsPolicy {
  constructor(private readonly rules: ReadonlyArray<RobotsRule>) {}

  isAllowed(url: string): boolean {
    const target = new URL(url);
    const pathAndQuery = toHttpRequestTarget(target);

    if (pathAndQuery === "/robots.txt") {
      return true;
    }

    const path = normalizeForMatch(pathAndQuery, {
      preserveWildcard: false,
    });

    if (
      path === null ||
      path.length > ROBOTS_POLICY_LIMITS.maxTargetCodeUnits
    ) {
      throw new RobotsPolicyComplexityError();
    }

    const budget = new MatchBudget();
    let winningRule: RobotsRule | undefined;

    for (const rule of this.rules) {
      if (
        matchesRule(path, rule, budget) &&
        (!winningRule ||
          rule.specificity > winningRule.specificity ||
          (rule.specificity === winningRule.specificity && rule.allow))
      ) {
        winningRule = rule;
      }
    }

    return winningRule?.allow ?? true;
  }
}

function trimHorizontalWhitespace(
  text: string,
  start: number,
  end: number,
): { end: number; start: number } {
  while (
    start < end &&
    (text.charCodeAt(start) === 0x20 || text.charCodeAt(start) === 0x09)
  ) {
    start += 1;
  }

  while (
    end > start &&
    (text.charCodeAt(end - 1) === 0x20 ||
      text.charCodeAt(end - 1) === 0x09)
  ) {
    end -= 1;
  }

  return { end, start };
}

function assertBoundedRobotsText(text: string): void {
  if (
    text.length > ROBOTS_POLICY_LIMITS.maxTextBytes ||
    Buffer.byteLength(text, "utf8") > ROBOTS_POLICY_LIMITS.maxTextBytes
  ) {
    throw new RobotsPolicyComplexityError();
  }
}

export function parseRobotsPolicy(
  text: string,
  productToken: string,
): RobotsPolicy {
  assertBoundedRobotsText(text);

  if (
    productToken.length === 0 ||
    productToken.length > 256 ||
    !/^[A-Za-z_-]+$/.test(productToken)
  ) {
    throw new TypeError("The robots product token is invalid.");
  }

  const token = productToken.toLowerCase();
  let selectedRules = new RuleAccumulator();
  let exactGroupSeen = false;
  let currentGroupExists = false;
  let currentGroupExact = false;
  let currentGroupWildcard = false;
  let rulesStarted = false;
  let groups = 0;
  let agentEntries = 0;
  let lines = 0;
  let lineStart = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (lineStart <= text.length) {
    let lineEnd = lineStart;

    while (
      lineEnd < text.length &&
      text.charCodeAt(lineEnd) !== 0x0a &&
      text.charCodeAt(lineEnd) !== 0x0d
    ) {
      lineEnd += 1;
    }

    lines += 1;

    if (
      lines > ROBOTS_POLICY_LIMITS.maxLines ||
      lineEnd - lineStart > ROBOTS_POLICY_LIMITS.maxLineCodeUnits
    ) {
      throw new RobotsPolicyComplexityError();
    }

    let contentEnd = lineEnd;

    for (let index = lineStart; index < lineEnd; index += 1) {
      if (text.charCodeAt(index) === 0x23) {
        contentEnd = index;
        break;
      }
    }

    const line = trimHorizontalWhitespace(text, lineStart, contentEnd);
    let separatorIndex = -1;

    for (let index = line.start; index < line.end; index += 1) {
      if (text.charCodeAt(index) === 0x3a) {
        separatorIndex = index;
        break;
      }
    }

    if (separatorIndex !== -1) {
      const fieldRange = trimHorizontalWhitespace(
        text,
        line.start,
        separatorIndex,
      );
      const valueRange = trimHorizontalWhitespace(
        text,
        separatorIndex + 1,
        line.end,
      );
      const field = text
        .slice(fieldRange.start, fieldRange.end)
        .toLowerCase();
      const value = text.slice(valueRange.start, valueRange.end);

      if (field === "user-agent" && /^(?:[A-Za-z_-]+|\*)$/.test(value)) {
        if (!currentGroupExists || rulesStarted) {
          groups += 1;

          if (groups > ROBOTS_POLICY_LIMITS.maxGroups) {
            throw new RobotsPolicyComplexityError();
          }

          currentGroupExists = true;
          currentGroupExact = false;
          currentGroupWildcard = false;
          rulesStarted = false;
        }

        agentEntries += 1;

        if (agentEntries > ROBOTS_POLICY_LIMITS.maxAgentEntries) {
          throw new RobotsPolicyComplexityError();
        }

        if (value.toLowerCase() === token) {
          currentGroupExact = true;

          if (!exactGroupSeen) {
            exactGroupSeen = true;
            selectedRules = new RuleAccumulator();
          }
        } else if (value === "*") {
          currentGroupWildcard = true;
        }
      } else if (
        (field === "allow" || field === "disallow") &&
        currentGroupExists
      ) {
        rulesStarted = true;
        const selectedGroup =
          currentGroupExact || (!exactGroupSeen && currentGroupWildcard);

        if (selectedGroup) {
          const rule = createRule(field === "allow", value);

          if (rule) {
            selectedRules.add(rule);
          }
        }
      }
    }

    if (lineEnd === text.length) {
      break;
    }

    lineStart =
      text.charCodeAt(lineEnd) === 0x0d &&
      text.charCodeAt(lineEnd + 1) === 0x0a
        ? lineEnd + 2
        : lineEnd + 1;
  }

  if (selectedRules.overflowed) {
    throw new RobotsPolicyComplexityError();
  }

  return new RobotsPolicy(selectedRules.rules);
}
