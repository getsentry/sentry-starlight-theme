import { defineMiddleware } from "astro:middleware";
import { isIgnoredPath, toMarkdownPath } from "./path-utils";
import { base as siteBase } from "virtual:sentry-starlight-theme/agent-markdown/config";

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = context.url;

  if (isMarkdownPath(pathname) || isIgnoredPath(pathname, siteBase)) {
    return next();
  }

  if (!wantsMarkdown(context.request.headers)) {
    return next();
  }

  const destination = new URL(context.url);
  destination.pathname = toMarkdownPath(pathname, siteBase);
  destination.search = search;

  return context.rewrite(destination);
});

function wantsMarkdown(headers: Headers) {
  const accept = headers.get("accept")?.toLowerCase() ?? "";

  return accept.includes("text/markdown") || accept.includes("text/x-markdown");
}

function isMarkdownPath(pathname: string) {
  return pathname.endsWith(".md");
}
