interface RobotsRule {
  allow: boolean;
  matcher: RegExp;
  specificity: number;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

const unreservedOctet = /^[A-Za-z0-9._~-]$/;

function stripComment(line: string): string {
  const commentIndex = line.indexOf("#");
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function normalizeForMatch(value: string): string {
  let normalized = "";

  for (let index = 0; index < value.length; ) {
    const percent = value.slice(index).match(/^%([0-9A-Fa-f]{2})/);

    if (percent) {
      const octet = String.fromCharCode(Number.parseInt(percent[1], 16));
      normalized += unreservedOctet.test(octet)
        ? octet
        : `%${percent[1].toUpperCase()}`;
      index += 3;
      continue;
    }

    const codePoint = value.codePointAt(index);

    if (codePoint === undefined) {
      break;
    }

    const character = String.fromCodePoint(codePoint);
    normalized += codePoint <= 0x7f ? character : encodeURIComponent(character);
    index += character.length;
  }

  return normalized;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function countPatternOctets(value: string): number {
  let octets = 0;

  for (let index = 0; index < value.length; ) {
    if (/^%[0-9A-F]{2}/.test(value.slice(index, index + 3))) {
      octets += 1;
      index += 3;
      continue;
    }

    octets += 1;
    index += 1;
  }

  return octets;
}

function createRule(allow: boolean, pathPattern: string): RobotsRule | null {
  const trimmed = pathPattern.trim();

  if (!trimmed) {
    return null;
  }

  let normalized: string;

  try {
    normalized = normalizeForMatch(trimmed);
  } catch {
    return null;
  }

  const endsAtPath = normalized.endsWith("$");
  const pattern = endsAtPath ? normalized.slice(0, -1) : normalized;
  const matcherSource = pattern
    .split("*")
    .map(escapeRegularExpression)
    .join(".*");
  const specificity = countPatternOctets(pattern.replaceAll("*", ""));

  return {
    allow,
    matcher: new RegExp(`^${matcherSource}${endsAtPath ? "$" : ""}`, "u"),
    specificity,
  };
}

export class RobotsPolicy {
  constructor(private readonly groups: ReadonlyArray<RobotsGroup>) {}

  isAllowed(url: string, productToken: string): boolean {
    const token = productToken.toLowerCase();
    const exactGroups = this.groups.filter((group) =>
      group.agents.includes(token),
    );
    const applicableGroups =
      exactGroups.length > 0
        ? exactGroups
        : this.groups.filter((group) => group.agents.includes("*"));
    const target = new URL(url);
    const path = normalizeForMatch(`${target.pathname}${target.search}`);
    let winningRule: RobotsRule | undefined;

    for (const group of applicableGroups) {
      for (const rule of group.rules) {
        if (
          rule.matcher.test(path) &&
          (!winningRule ||
            rule.specificity > winningRule.specificity ||
            (rule.specificity === winningRule.specificity && rule.allow))
        ) {
          winningRule = rule;
        }
      }
    }

    return winningRule?.allow ?? true;
  }
}

export function parseRobotsPolicy(text: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  let currentGroup: RobotsGroup | undefined;
  let rulesStarted = false;

  for (const rawLine of text.split(/\r\n|\n|\r/)) {
    const line = stripComment(rawLine);
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const field = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (field === "user-agent") {
      if (!/^(?:[A-Za-z_-]+|\*)$/.test(value)) {
        continue;
      }

      if (!currentGroup || rulesStarted) {
        currentGroup = { agents: [], rules: [] };
        groups.push(currentGroup);
        rulesStarted = false;
      }

      currentGroup.agents.push(value.toLowerCase());
      continue;
    }

    if ((field === "allow" || field === "disallow") && currentGroup) {
      rulesStarted = true;
      const rule = createRule(field === "allow", value);

      if (rule) {
        currentGroup.rules.push(rule);
      }
    }
  }

  return new RobotsPolicy(groups);
}
