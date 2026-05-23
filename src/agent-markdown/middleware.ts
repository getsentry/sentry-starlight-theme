import { defineMiddleware } from "astro:middleware";
import { isIgnoredPath, toMarkdownPath } from "./path-utils";
import { base as siteBase } from "virtual:sentry-starlight-theme/agent-markdown/config";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  const forceMarkdown = context.url.searchParams.get("format") === "md";

  if (isMarkdownPath(pathname) || isIgnoredPath(pathname, siteBase)) {
    return next();
  }

  const uaTriggered =
    !forceMarkdown &&
    isAIOrDevTool(context.request.headers.get("user-agent") ?? "");

  if (
    !forceMarkdown &&
    !uaTriggered &&
    !acceptsMarkdown(context.request.headers)
  ) {
    return next();
  }

  const destination = new URL(context.url);
  destination.pathname = toMarkdownPath(pathname, siteBase);
  destination.search = search;
  destination.searchParams.delete("format");

  const response = await context.rewrite(destination);

  // When the rewrite was triggered by User-Agent rather than an explicit Accept
  // header or format param, add Vary: User-Agent so caches key on the UA and
  // don't serve Markdown to regular browsers at the same URL.
  if (uaTriggered) {
    response.headers.append("Vary", "User-Agent");
  }

  return response;
});

function acceptsMarkdown(headers: Headers) {
  const accept = headers.get("accept") ?? "";
  if (!accept) {
    return false;
  }

  const entries = accept.split(",").map((entry) => {
    const [type = "", ...parameters] = entry.trim().toLowerCase().split(";");
    return { type: type.trim(), q: getAcceptQuality(parameters) };
  });

  const htmlQuality = entries.find(({ type }) => type === "text/html")?.q ?? 0;
  const markdownQuality = entries.reduce((max, { type, q }) => {
    if (
      type === "text/markdown" ||
      type === "text/plain" ||
      type === "text/x-markdown"
    ) {
      return Math.max(max, q);
    }
    return max;
  }, 0);

  // Only rewrite when a markdown type is explicitly wanted AND outranks text/html.
  // Equal quality defers to HTML since that is the native format for these URLs.
  return markdownQuality > 0 && markdownQuality > htmlQuality;
}

function isAIOrDevTool(userAgent: string) {
  return /claude|anthropic|gptbot|chatgpt|openai|cursor|codex|copilot|perplexity|cohere|gemini/i.test(
    userAgent,
  );
}

function isMarkdownPath(pathname: string) {
  return pathname.endsWith(".md");
}

function getAcceptQuality(parameters: string[]) {
  for (const parameter of parameters) {
    const [name, value = ""] = parameter.trim().split("=", 2);
    if (name !== "q") {
      continue;
    }

    const quality = Number.parseFloat(value.trim());
    return Number.isFinite(quality) ? quality : 1;
  }

  return 1;
}
