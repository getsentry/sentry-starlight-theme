const ASSET_PATH_PATTERN =
  /\.(?:avif|bmp|bz2|cjs|css|csv|eot|gif|gz|ico|jpe?g|js|json|map|mjs|mov|mp3|mp4|ogg|otf|pdf|png|svg|tar|tgz|ttf|txt|wasm|wav|webm|webp|woff2?|xml|zip)$/i;

export function isAssetPath(pathname: string) {
  return ASSET_PATH_PATTERN.test(pathname);
}

export function isIgnoredPath(pathname: string, base: string) {
  if (!isInBase(pathname, base)) {
    return true;
  }

  const relativePathname = stripBase(pathname, base);

  return (
    relativePathname.startsWith("_") ||
    relativePathname.startsWith("api/") ||
    isAssetPath(relativePathname)
  );
}

export function isInBase(pathname: string, base: string) {
  return base === "/" || pathname === base || pathname.startsWith(`${base}/`);
}

export function stripBase(pathname: string, base: string) {
  if (base === "/") {
    return pathname.replace(/^\//, "");
  }

  if (pathname === base) {
    return "";
  }

  return pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1)
    : pathname.replace(/^\//, "");
}

export function joinBase(base: string, pathname: string) {
  const normalizedPathname = pathname.replace(/^\/+/, "");

  if (base === "/") {
    return `/${normalizedPathname}`;
  }

  return normalizedPathname ? `${base}/${normalizedPathname}` : `${base}/`;
}

export function toMarkdownPath(pathname: string, base: string) {
  const relativePathname = stripBase(pathname, base).replace(/\/+$/, "");

  if (relativePathname === "") {
    return joinBase(base, "index.md");
  }

  if (relativePathname.endsWith(".md")) {
    return joinBase(base, relativePathname);
  }

  return joinBase(base, `${relativePathname}.md`);
}
