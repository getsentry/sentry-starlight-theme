import { defineMiddleware } from "astro:middleware";
import { isIgnoredPath, toMarkdownPath } from "./path-utils";
import { base as siteBase } from "virtual:sentry-starlight-theme/agent-markdown/config";

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = context.url;
  const forceMarkdown = context.url.searchParams.get("format") === "md";

  if (isMarkdownPath(pathname) || isIgnoredPath(pathname, siteBase)) {
    return next();
  }

  if (!forceMarkdown && !wantsMarkdown(context.request.headers)) {
    return next();
  }

  const destination = new URL(context.url);
  destination.pathname = toMarkdownPath(pathname, siteBase);
  destination.search = search;
  destination.searchParams.delete("format");

  return context.rewrite(destination);
});

function wantsMarkdown(headers: Headers) {
  const accept = headers.get("accept") ?? "";
  const userAgent = headers.get("user-agent") ?? "";

  if (isAIOrDevTool(userAgent)) {
    return true;
  }

  return accept.split(",").some((entry) => {
    const [type = "", ...parameters] = entry.trim().toLowerCase().split(";");

    const mediaType = type.trim();
    if (
      mediaType !== "text/markdown" &&
      mediaType !== "text/plain" &&
      mediaType !== "text/x-markdown"
    ) {
      return false;
    }

    return getAcceptQuality(parameters) > 0;
  });
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
