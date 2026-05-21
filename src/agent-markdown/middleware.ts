import { defineMiddleware } from "astro:middleware";
import { base as siteBase } from "virtual:sentry-starlight-theme/agent-markdown/config";

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = context.url;

  if (isMarkdownPath(pathname) || isIgnoredPath(pathname)) {
    return next();
  }

  if (!wantsMarkdown(context.request.headers)) {
    return next();
  }

  const destination = new URL(context.url);
  destination.pathname = toMarkdownPath(pathname);
  destination.search = search;

  return context.rewrite(destination);
});

function wantsMarkdown(headers: Headers) {
  const accept = headers.get("accept")?.toLowerCase() ?? "";

  return (
    accept.includes("text/markdown") ||
    accept.includes("text/x-markdown") ||
    accept.includes("text/plain")
  );
}

function toMarkdownPath(pathname: string) {
  const relativePathname = stripBase(pathname).replace(/\/+$/, "");

  if (relativePathname === "") {
    return joinBase("index.md");
  }

  return joinBase(`${relativePathname}.md`);
}

function isMarkdownPath(pathname: string) {
  return pathname.endsWith(".md");
}

function isIgnoredPath(pathname: string) {
  return (
    !isInBase(pathname) ||
    pathname.startsWith("/_") ||
    pathname.startsWith("/api/") ||
    /\.(?:avif|bmp|css|gif|ico|jpe?g|js|json|map|pdf|png|svg|xml|webp|woff2?|zip)$/i.test(
      pathname,
    )
  );
}

function isInBase(pathname: string) {
  return (
    siteBase === "/" ||
    pathname === siteBase ||
    pathname.startsWith(`${siteBase}/`)
  );
}

function stripBase(pathname: string) {
  if (siteBase === "/") {
    return pathname.replace(/^\//, "");
  }

  if (pathname === siteBase) {
    return "";
  }

  return pathname.startsWith(`${siteBase}/`)
    ? pathname.slice(siteBase.length + 1)
    : pathname.replace(/^\//, "");
}

function joinBase(pathname: string) {
  const normalizedPathname = pathname.replace(/^\/+/, "");

  if (siteBase === "/") {
    return `/${normalizedPathname}`;
  }

  return normalizedPathname
    ? `${siteBase}/${normalizedPathname}`
    : `${siteBase}/`;
}
