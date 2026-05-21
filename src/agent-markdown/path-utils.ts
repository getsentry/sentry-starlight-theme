const ASSET_PATH_PATTERN =
  /\.(?:avif|bmp|css|gif|ico|jpe?g|js|json|map|pdf|png|svg|txt|xml|webp|woff2?|zip)$/i;

export function isAssetPath(pathname: string) {
  return ASSET_PATH_PATTERN.test(pathname);
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
