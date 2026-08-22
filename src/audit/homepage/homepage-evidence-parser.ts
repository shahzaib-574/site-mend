import { SAXParser, type EndTag, type StartTag, type Text } from "parse5-sax-parser";

import type { HttpResponseHeaders } from "../../worker/crawler/pinned-http-client";
import { readCharacterEncoding } from "../../worker/crawler/response-body";
import { toEvidenceUrl } from "../../worker/crawler/url-evidence";
import type {
  BoundedTextEvidence,
  CanonicalEntryEvidence,
  HeadingEntryEvidence,
  HeadingLevel,
  HomepageDocumentEvidence,
  IndexDirective,
  IndexDirectiveSourceEvidence,
} from "./types";

const MAX_CANONICALS = 10;
const MAX_CANONICAL_URL_LENGTH = 2_048;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_HEADINGS = 20;
const MAX_HEADING_LENGTH = 200;
const MAX_INDEX_SOURCES = 20;
const MAX_TITLE_LENGTH = 300;

const COLON_DIRECTIVES = new Set([
  "max-image-preview",
  "max-snippet",
  "max-video-preview",
  "unavailable_after",
]);
const HIDDEN_TEXT_ELEMENTS = new Set(["script", "style", "template"]);

class NormalizedTextAccumulator {
  private length = 0;
  private pendingSpace = false;
  private readonly parts: string[] = [];
  private storedLength = 0;

  constructor(private readonly limit: number) {}

  append(value: string): void {
    for (const character of value) {
      if (/\s/u.test(character)) {
        if (this.length > 0) {
          this.pendingSpace = true;
        }
        continue;
      }

      if (this.pendingSpace) {
        this.addCharacter(" ");
        this.pendingSpace = false;
      }

      this.addCharacter(character);
    }
  }

  finish(): BoundedTextEvidence {
    return {
      length: this.length,
      text: this.parts.join(""),
      truncated: this.storedLength < this.length,
    };
  }

  private addCharacter(character: string): void {
    this.length += 1;

    if (this.storedLength < this.limit) {
      this.parts.push(character);
      this.storedLength += 1;
    }
  }
}

function boundedText(value: string, limit: number): BoundedTextEvidence {
  const accumulator = new NormalizedTextAccumulator(limit);
  accumulator.append(value);
  return accumulator.finish();
}

function attribute(startTag: StartTag, name: string): string | null {
  return (
    startTag.attrs.find((candidate) => candidate.name.toLowerCase() === name)
      ?.value ?? null
  );
}

function readHeaderValues(
  headers: HttpResponseHeaders,
  name: string,
): ReadonlyArray<string> {
  const entry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name,
  )?.[1];

  if (entry === undefined) {
    return [];
  }

  return typeof entry === "string" ? [entry] : entry;
}

function normalizeDirectives(value: string): ReadonlyArray<IndexDirective> {
  const directives = new Set<IndexDirective>();

  for (const segment of value.split(",")) {
    if (segment.includes(":")) {
      continue;
    }

    for (const token of segment.trim().toLowerCase().split(/\s+/u)) {
      switch (token) {
        case "all":
          directives.add("index");
          directives.add("follow");
          break;
        case "none":
          directives.add("noindex");
          directives.add("nofollow");
          break;
        case "follow":
        case "index":
        case "nofollow":
        case "noindex":
          directives.add(token);
          break;
      }
    }
  }

  return [...directives];
}

function xRobotsSources(
  headers: HttpResponseHeaders,
): ReadonlyArray<IndexDirectiveSourceEvidence> {
  const sources: IndexDirectiveSourceEvidence[] = [];

  for (const header of readHeaderValues(headers, "x-robots-tag")) {
    let appliesToGooglebot = true;

    for (const segment of header.split(",")) {
      const trimmed = segment.trim();
      const prefix = /^([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i.exec(trimmed);
      let directiveText = trimmed;

      if (prefix) {
        const prefixName = prefix[1]?.toLowerCase() ?? "";

        if (COLON_DIRECTIVES.has(prefixName)) {
          directiveText = "";
        } else {
          appliesToGooglebot = prefixName === "googlebot";
          directiveText = prefix[2] ?? "";
        }
      }

      if (!appliesToGooglebot) {
        continue;
      }

      const directives = normalizeDirectives(directiveText);

      if (directives.length > 0) {
        sources.push({ directives, source: "x-robots-tag" });
      }
    }
  }

  return sources;
}

function createDecoder(headers: HttpResponseHeaders): {
  decoder: TextDecoder;
  source: HomepageDocumentEvidence["characterEncodingSource"];
} {
  const declared = readCharacterEncoding(headers);

  if (!declared) {
    return { decoder: new TextDecoder("utf-8"), source: "default" };
  }

  try {
    return { decoder: new TextDecoder(declared), source: "http-header" };
  } catch {
    return { decoder: new TextDecoder("utf-8"), source: "fallback" };
  }
}

function canonicalEntry(
  href: string,
  pageUrl: string,
): CanonicalEntryEvidence {
  if (!href.trim() || href.length > MAX_CANONICAL_URL_LENGTH) {
    return { matchesPage: false, url: null, valid: false };
  }

  try {
    const resolved = new URL(href, pageUrl);

    if (!(["http:", "https:"] as const).includes(resolved.protocol as "http:" | "https:")) {
      return { matchesPage: false, url: null, valid: false };
    }

    const page = new URL(pageUrl);
    page.hash = "";
    resolved.hash = "";

    return {
      matchesPage: resolved.toString() === page.toString(),
      url: toEvidenceUrl(resolved.toString()),
      valid: true,
    };
  } catch {
    return { matchesPage: false, url: null, valid: false };
  }
}

function isHeading(tagName: string): tagName is `h${HeadingLevel}` {
  return /^h[1-6]$/.test(tagName);
}

export class HomepageEvidenceParser {
  private activeHeading:
    | { accumulator: NormalizedTextAccumulator; level: HeadingLevel }
    | undefined;
  private activeTitle: NormalizedTextAccumulator | undefined;
  private bodyStarted = false;
  private canonicalCount = 0;
  private readonly canonicals: CanonicalEntryEvidence[] = [];
  private descriptionCount = 0;
  private descriptionEmptyCount = 0;
  private descriptionFirst: BoundedTextEvidence | null = null;
  private readonly decoder: TextDecoder;
  private readonly encodingSource: HomepageDocumentEvidence["characterEncodingSource"];
  private finalized = false;
  private readonly headingCounts: Record<`h${HeadingLevel}`, number> = {
    h1: 0,
    h2: 0,
    h3: 0,
    h4: 0,
    h5: 0,
    h6: 0,
  };
  private headingEmptyCount = 0;
  private readonly headings: HeadingEntryEvidence[] = [];
  private hasFollow = false;
  private hasIndex = false;
  private hasNofollow = false;
  private hasNoindex = false;
  private hiddenTextDepth = 0;
  private readonly indexSources: IndexDirectiveSourceEvidence[] = [];
  private indexSourcesTruncated = false;
  private indexSourceTotal = 0;
  private lastHeadingLevel: HeadingLevel | null = null;
  private readonly nonEmptyHeadingCounts: Record<`h${HeadingLevel}`, number> = {
    h1: 0,
    h2: 0,
    h3: 0,
    h4: 0,
    h5: 0,
    h6: 0,
  };
  private skippedLevelCount = 0;
  private svgDepth = 0;
  private readonly parser = new SAXParser();
  private titleCount = 0;
  private titleEmptyCount = 0;
  private titleFirst: BoundedTextEvidence | null = null;

  constructor(
    private readonly pageUrl: string,
    headers: HttpResponseHeaders,
  ) {
    const { decoder, source } = createDecoder(headers);
    this.decoder = decoder;
    this.encodingSource = source;

    this.parser.on("startTag", (tag) => this.onStartTag(tag));
    this.parser.on("endTag", (tag) => this.onEndTag(tag));
    this.parser.on("text", (text) => this.onText(text));

    for (const entry of xRobotsSources(headers)) {
      this.addIndexSource(entry);
    }
  }

  write(chunk: Uint8Array): void {
    if (this.finalized) {
      throw new Error("Homepage evidence parser is already finalized.");
    }

    this.parser.write(this.decoder.decode(chunk, { stream: true }));
  }

  finish(): HomepageDocumentEvidence {
    if (this.finalized) {
      throw new Error("Homepage evidence parser is already finalized.");
    }

    this.finalized = true;
    this.parser.end(this.decoder.decode());
    this.finishTitle();
    this.finishHeading();

    return {
      canonical: {
        count: this.canonicalCount,
        entries: this.canonicals,
        entriesTruncated: this.canonicalCount > this.canonicals.length,
      },
      characterEncoding: this.decoder.encoding,
      characterEncodingSource: this.encodingSource,
      description: {
        count: this.descriptionCount,
        emptyCount: this.descriptionEmptyCount,
        first: this.descriptionFirst,
      },
      headings: {
        counts: this.headingCounts,
        emptyCount: this.headingEmptyCount,
        entries: this.headings,
        entriesTruncated:
          Object.values(this.headingCounts).reduce((sum, count) => sum + count, 0) >
          this.headings.length,
        nonEmptyCounts: this.nonEmptyHeadingCounts,
        skippedLevelCount: this.skippedLevelCount,
      },
      indexing: {
        effectiveFollow: this.hasNofollow
          ? this.hasFollow
            ? "conflicting"
            : "blocked"
          : "allowed",
        effectiveIndex: this.hasNoindex
          ? this.hasIndex
            ? "conflicting"
            : "blocked"
          : "allowed",
        sources: this.indexSources,
        sourcesTruncated: this.indexSourcesTruncated,
        totalSources: this.indexSourceTotal,
      },
      schemaVersion: 1,
      title: {
        count: this.titleCount,
        emptyCount: this.titleEmptyCount,
        first: this.titleFirst,
      },
    };
  }

  private addIndexSource(source: IndexDirectiveSourceEvidence): void {
    this.indexSourceTotal += 1;
    this.hasFollow ||= source.directives.includes("follow");
    this.hasIndex ||= source.directives.includes("index");
    this.hasNofollow ||= source.directives.includes("nofollow");
    this.hasNoindex ||= source.directives.includes("noindex");

    if (this.indexSources.length < MAX_INDEX_SOURCES) {
      this.indexSources.push(source);
    } else {
      this.indexSourcesTruncated = true;
    }
  }

  private finishHeading(): void {
    if (!this.activeHeading) {
      return;
    }

    const { accumulator, level } = this.activeHeading;
    const text = accumulator.finish();
    this.headingCounts[`h${level}`] += 1;

    if (text.length === 0) {
      this.headingEmptyCount += 1;
    } else {
      this.nonEmptyHeadingCounts[`h${level}`] += 1;
    }

    if (this.lastHeadingLevel !== null && level > this.lastHeadingLevel + 1) {
      this.skippedLevelCount += 1;
    }

    this.lastHeadingLevel = level;

    if (this.headings.length < MAX_HEADINGS) {
      this.headings.push({ ...text, level });
    }

    this.activeHeading = undefined;
  }

  private finishTitle(): void {
    if (!this.activeTitle) {
      return;
    }

    const title = this.activeTitle.finish();

    if (title.length === 0) {
      this.titleEmptyCount += 1;
    }

    if (!this.titleFirst) {
      this.titleFirst = title;
    }

    this.activeTitle = undefined;
  }

  private onEndTag(tag: EndTag): void {
    const name = tag.tagName.toLowerCase();

    if (name === "title" && this.svgDepth === 0) {
      this.finishTitle();
    }

    if (isHeading(name) && this.activeHeading?.level === Number(name[1])) {
      this.finishHeading();
    }

    if (name === "svg" && this.svgDepth > 0) {
      this.svgDepth -= 1;
    }

    if (HIDDEN_TEXT_ELEMENTS.has(name) && this.hiddenTextDepth > 0) {
      this.hiddenTextDepth -= 1;
    }
  }

  private onStartTag(tag: StartTag): void {
    const name = tag.tagName.toLowerCase();

    if (name === "svg") {
      if (!tag.selfClosing) {
        this.svgDepth += 1;
      }

      return;
    }

    if (HIDDEN_TEXT_ELEMENTS.has(name)) {
      this.hiddenTextDepth += 1;
    }

    if (this.hiddenTextDepth > 0 || this.svgDepth > 0) {
      return;
    }

    if (name === "body") {
      this.bodyStarted = true;
      return;
    }

    if (name === "title") {
      if (this.bodyStarted) {
        return;
      }

      this.finishTitle();
      this.titleCount += 1;
      this.activeTitle = new NormalizedTextAccumulator(MAX_TITLE_LENGTH);
      return;
    }

    if (isHeading(name)) {
      this.finishHeading();
      this.activeHeading = {
        accumulator: new NormalizedTextAccumulator(MAX_HEADING_LENGTH),
        level: Number(name[1]) as HeadingLevel,
      };
      return;
    }

    if (name === "meta") {
      const metaName = attribute(tag, "name")?.trim().toLowerCase();
      const content = attribute(tag, "content") ?? "";

      if (metaName === "description" && !this.bodyStarted) {
        const description = boundedText(content, MAX_DESCRIPTION_LENGTH);
        this.descriptionCount += 1;

        if (description.length === 0) {
          this.descriptionEmptyCount += 1;
        }

        this.descriptionFirst ??= description;
      }

      if (metaName === "robots" || metaName === "googlebot") {
        const directives = normalizeDirectives(content);

        if (directives.length > 0) {
          this.addIndexSource({
            directives,
            source: metaName === "robots" ? "meta-robots" : "meta-googlebot",
          });
        }
      }

      return;
    }

    if (name === "link") {
      if (this.bodyStarted) {
        return;
      }

      const rel = attribute(tag, "rel")
        ?.toLowerCase()
        .split(/\s+/u)
        .filter(Boolean);

      if (!rel?.includes("canonical")) {
        return;
      }

      this.canonicalCount += 1;

      if (this.canonicals.length < MAX_CANONICALS) {
        this.canonicals.push(canonicalEntry(attribute(tag, "href") ?? "", this.pageUrl));
      }
    }
  }

  private onText(token: Text): void {
    if (this.activeTitle) {
      this.activeTitle.append(token.text);
    }

    if (this.activeHeading && this.hiddenTextDepth === 0) {
      this.activeHeading.accumulator.append(token.text);
    }
  }
}
