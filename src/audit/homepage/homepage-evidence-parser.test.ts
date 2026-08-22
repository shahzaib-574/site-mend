import { describe, expect, it } from "vitest";

import { HomepageEvidenceParser } from "./homepage-evidence-parser";

function parse(
  html: string | Uint8Array,
  headers: Record<string, string | string[]> = {
    "content-type": "text/html; charset=utf-8",
  },
) {
  const parser = new HomepageEvidenceParser("https://example.com/", headers);
  const bytes = typeof html === "string" ? new TextEncoder().encode(html) : html;

  for (let offset = 0; offset < bytes.length; offset += 7) {
    parser.write(bytes.slice(offset, offset + 7));
  }

  return parser.finish();
}

describe("HomepageEvidenceParser", () => {
  it("extracts normalized metadata, headings, canonicals, and directives across chunks", () => {
    const evidence = parse(
      `<!doctype html>
      <html><head>
        <title> Café\n   Home </title>
        <meta NAME="description" content="  A useful   homepage summary. ">
        <meta name="robots" content="index, nofollow">
        <link rel="alternate CANONICAL" href="/">
      </head><body>
        <h1>Main <span>homepage</span></h1>
        <h3>Details</h3>
      </body></html>`,
      {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": [
          "otherbot: noindex, nofollow",
          "googlebot: noindex",
        ],
      },
    );

    expect(evidence).toMatchObject({
      canonical: {
        count: 1,
        entries: [
          { matchesPage: true, url: "https://example.com/", valid: true },
        ],
      },
      characterEncoding: "utf-8",
      characterEncodingSource: "http-header",
      description: {
        count: 1,
        emptyCount: 0,
        first: { text: "A useful homepage summary." },
      },
      headings: {
        counts: { h1: 1, h2: 0, h3: 1, h4: 0, h5: 0, h6: 0 },
        entries: [
          { level: 1, text: "Main homepage" },
          { level: 3, text: "Details" },
        ],
        skippedLevelCount: 1,
      },
      indexing: {
        effectiveFollow: "blocked",
        effectiveIndex: "conflicting",
        totalSources: 2,
      },
      schemaVersion: 1,
      title: {
        count: 1,
        emptyCount: 0,
        first: { text: "Café Home" },
      },
    });
    expect(evidence.indexing.sources).toEqual([
      { directives: ["noindex"], source: "x-robots-tag" },
      { directives: ["index", "nofollow"], source: "meta-robots" },
    ]);
  });

  it("honors a supported HTTP charset and falls back safely for an unknown one", () => {
    const latin = parse(Buffer.from("<title>Caf\xe9</title>", "latin1"), {
      "content-type": "text/html; charset=windows-1252",
    });
    const fallback = parse("<title>Home</title>", {
      "content-type": "text/html; charset=made-up-encoding",
    });

    expect(latin.title.first?.text).toBe("Café");
    expect(latin.characterEncoding).toBe("windows-1252");
    expect(fallback.characterEncoding).toBe("utf-8");
    expect(fallback.characterEncodingSource).toBe("fallback");
  });

  it("counts Unicode code points and keeps a true bounded prefix", () => {
    const evidence = parse(`<title>${"a".repeat(299)}😀z</title>`);

    expect(evidence.title.first).toMatchObject({
      length: 301,
      text: `${"a".repeat(299)}😀`,
      truncated: true,
    });
  });

  it("bounds every repeated or text-bearing evidence collection", () => {
    const html = [
      `<title>${"x".repeat(350)}</title>`,
      ...Array.from(
        { length: 12 },
        (_, index) => `<link rel="canonical" href="/page-${index}">`,
      ),
      ...Array.from(
        { length: 20 },
        () => '<meta name="robots" content="index">',
      ),
      '<meta name="robots" content="noindex">',
      ...Array.from(
        { length: 25 },
        (_, index) => `<h2>${"heading ".repeat(40)}${index}</h2>`,
      ),
    ].join("");
    const evidence = parse(html);

    expect(evidence.title.first).toMatchObject({
      length: 350,
      text: "x".repeat(300),
      truncated: true,
    });
    expect(evidence.canonical).toMatchObject({
      count: 12,
      entriesTruncated: true,
    });
    expect(evidence.canonical.entries).toHaveLength(10);
    expect(evidence.headings.entries).toHaveLength(20);
    expect(evidence.headings.entriesTruncated).toBe(true);
    expect(evidence.headings.entries[0]).toMatchObject({
      length: 321,
      truncated: true,
    });
    expect(evidence.indexing.sources).toHaveLength(20);
    expect(evidence.indexing).toMatchObject({
      effectiveIndex: "conflicting",
      sourcesTruncated: true,
      totalSources: 21,
    });
  });

  it("ignores template and SVG metadata and sanitizes canonical URLs", () => {
    const evidence = parse(`
      <template><title>Template title</title><h1>Template heading</h1></template>
      <svg><title>SVG title</title></svg><svg/>
      <title>Real title</title>
      <link rel="canonical" href="https://example.com/?token=secret#part">
      <link rel="canonical" href="javascript:alert(1)">
      <h1>Real heading</h1>
    `);

    expect(evidence.title).toMatchObject({
      count: 1,
      first: { text: "Real title" },
    });
    expect(evidence.headings.counts.h1).toBe(1);
    expect(evidence.canonical.entries).toEqual([
      {
        matchesPage: false,
        url: "https://example.com/",
        valid: true,
      },
      { matchesPage: false, url: null, valid: false },
    ]);
    expect(JSON.stringify(evidence)).not.toContain("secret");
    expect(JSON.stringify(evidence)).not.toContain("javascript");
    expect(JSON.stringify(evidence)).not.toContain("Template title");
  });

  it("applies generic and googlebot X-Robots-Tag values but ignores other bots", () => {
    const evidence = parse("<title>Home</title><h1>Home</h1>", {
      "content-type": "text/html",
      "X-Robots-Tag": [
        "max-image-preview:none, noindex, nofollow",
        "otherbot: index, follow, googlebot: index",
      ],
    });

    expect(evidence.indexing).toMatchObject({
      effectiveFollow: "blocked",
      effectiveIndex: "conflicting",
      totalSources: 3,
    });
  });

  it("does not confuse colon-valued preview rules with the none directive", () => {
    const evidence = parse(
      '<meta name="robots" content="max-image-preview:none, max-snippet:0">',
      {
        "content-type": "text/html",
        "x-robots-tag": "max-image-preview:none, max-video-preview:0",
      },
    );

    expect(evidence.indexing).toMatchObject({
      effectiveFollow: "allowed",
      effectiveIndex: "allowed",
      sources: [],
      totalSources: 0,
    });
  });

  it("does not credit head metadata after the body starts but keeps body robots rules", () => {
    const evidence = parse(`
      <body>
        <title>Body title</title>
        <meta name="description" content="Body description">
        <link rel="canonical" href="https://example.com/">
        <meta name="robots" content="noindex">
        <h1>Visible heading</h1>
      </body>
    `);

    expect(evidence.title.count).toBe(0);
    expect(evidence.description.count).toBe(0);
    expect(evidence.canonical.count).toBe(0);
    expect(evidence.headings.nonEmptyCounts.h1).toBe(1);
    expect(evidence.indexing.effectiveIndex).toBe("blocked");
  });
});
