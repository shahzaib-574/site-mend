export function toHttpRequestTarget(url: URL): string {
  const serializedWithoutFragment = url.hash
    ? url.href.slice(0, -url.hash.length)
    : url.href;
  const query =
    url.search || (serializedWithoutFragment.includes("?") ? "?" : "");

  return `${url.pathname}${query}`;
}
