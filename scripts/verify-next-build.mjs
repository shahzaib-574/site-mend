import { access, readFile } from "node:fs/promises";
import path from "node:path";

const manifestPath =
  ".next/server/app/_global-error/page_client-reference-manifest.js";
const routeKey = "/_global-error/page";
const entryKey = "[project]/src/app/global-error";
const buildRoot = path.resolve(".next");

let source;

try {
  source = await readFile(manifestPath, "utf8");
} catch (error) {
  throw new Error(`Missing custom global-error manifest at ${manifestPath}.`, {
    cause: error,
  });
}

const assignmentPrefix =
  `globalThis.__RSC_MANIFEST[${JSON.stringify(routeKey)}] = `;
const manifestStart = source.indexOf(assignmentPrefix);
const manifestEnd = source.lastIndexOf(";");

if (manifestStart === -1 || manifestEnd <= manifestStart) {
  throw new Error("The custom global-error manifest has an unexpected shape.");
}

const manifest = JSON.parse(
  source.slice(manifestStart + assignmentPrefix.length, manifestEnd),
);

const cssFiles = manifest?.entryCSSFiles?.[entryKey];
const cssPaths = Array.isArray(cssFiles)
  ? cssFiles.map((file) => (typeof file === "string" ? file : file?.path))
  : [];

if (
  cssPaths.length === 0 ||
  cssPaths.some(
    (file) =>
      typeof file !== "string" ||
      !file.startsWith("static/") ||
      file.includes("..") ||
      path.extname(file) !== ".css",
  )
) {
  throw new Error(
    "The custom global-error boundary must emit at least one self-contained CSS asset.",
  );
}

const absoluteCssPaths = cssPaths.map((file) => path.resolve(buildRoot, file));

if (
  absoluteCssPaths.some(
    (file) => !file.startsWith(`${buildRoot}${path.sep}`),
  )
) {
  throw new Error("The custom global-error CSS escaped the Next build directory.");
}

await Promise.all(absoluteCssPaths.map((file) => access(file)));
const cssSources = await Promise.all(
  absoluteCssPaths.map((file) => readFile(file, "utf8")),
);

if (
  !cssSources.some((css) =>
    css.replaceAll(/\s/g, "").includes("box-sizing:border-box"),
  )
) {
  throw new Error(
    "The custom global-error CSS must own border-box sizing for narrow viewports.",
  );
}

console.log(`Verified custom global-error CSS: ${cssPaths.join(", ")}`);
