import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("astro:middleware", () => ({
  defineMiddleware: vi.fn((handler) => handler),
}));

vi.mock("virtual:sentry-starlight-theme/agent-markdown/config", () => ({
  base: "/docs",
}));

let onRequest: typeof import("../../src/agent-markdown/middleware").onRequest;

beforeAll(async () => {
  ({ onRequest } = await import("../../src/agent-markdown/middleware"));
});

describe("agent markdown middleware", () => {
  it("rewrites docs requests that accept markdown", async () => {
    const { next, response, rewrite } =
      await requestWithAccept("text/markdown");

    expect(next).not.toHaveBeenCalled();
    expect(rewrite).toHaveBeenCalledOnce();
    await expect(response.text()).resolves.toBe("/docs/content.md");
  });

  it("does not rewrite requests that reject markdown", async () => {
    const { next, rewrite } = await requestWithAccept(
      "text/html, text/markdown;q=0",
    );

    expect(next).toHaveBeenCalledOnce();
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("uses positive quality values for markdown aliases", async () => {
    const { next, rewrite } = await requestWithAccept(
      "text/markdown;q=0, text/x-markdown; q=0.5",
    );

    expect(next).not.toHaveBeenCalled();
    expect(rewrite).toHaveBeenCalledOnce();
  });

  it("allows optional whitespace before accept parameters", async () => {
    const { next, rewrite } = await requestWithAccept(
      "text/html;q=0.5, text/markdown ; q=1",
    );

    expect(next).not.toHaveBeenCalled();
    expect(rewrite).toHaveBeenCalledOnce();
  });

  it("does not rewrite when text/html outranks text/plain", async () => {
    const { next, rewrite } = await requestWithAccept(
      "text/html, text/plain;q=0.8",
    );

    expect(next).toHaveBeenCalledOnce();
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("rewrites when text/plain outranks text/html", async () => {
    const { next, rewrite } = await requestWithAccept(
      "text/html;q=0.5, text/plain",
    );

    expect(next).not.toHaveBeenCalled();
    expect(rewrite).toHaveBeenCalledOnce();
  });

  it("does not rewrite when text/html and text/markdown have equal quality", async () => {
    const { next, rewrite } = await requestWithAccept(
      "text/html, text/markdown",
    );

    expect(next).toHaveBeenCalledOnce();
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("rewrites requests that prefer plain text", async () => {
    const { next, rewrite } = await requestWithAccept("text/plain");

    expect(next).not.toHaveBeenCalled();
    expect(rewrite).toHaveBeenCalledOnce();
  });

  it("rewrites AI agent requests without markdown accept headers", async () => {
    const { next, rewrite } = await requestWithHeaders({
      accept: "text/html",
      "user-agent": "ClaudeBot",
    });

    expect(next).not.toHaveBeenCalled();
    expect(rewrite).toHaveBeenCalledOnce();
  });

  it("adds Vary: User-Agent when UA triggered the rewrite", async () => {
    const { response } = await requestWithHeaders({
      accept: "text/html",
      "user-agent": "ClaudeBot",
    });

    expect(response.headers.get("vary")).toBe("User-Agent");
  });

  it("does not add Vary: User-Agent for Accept-header triggered rewrites", async () => {
    const { response } = await requestWithAccept("text/markdown");

    expect(response.headers.get("vary")).toBeNull();
  });

  it("does not add Vary: User-Agent for format=md overrides", async () => {
    const { response } = await requestWithHeaders(
      { accept: "text/html", "user-agent": "ClaudeBot" },
      "https://example.com/docs/content/?format=md",
    );

    expect(response.headers.get("vary")).toBeNull();
  });

  it("supports format=md as an explicit request override", async () => {
    const { next, response, rewrite } = await requestWithHeaders(
      { accept: "text/html" },
      "https://example.com/docs/content/?format=md&utm_source=test",
    );

    expect(next).not.toHaveBeenCalled();
    expect(rewrite).toHaveBeenCalledOnce();
    await expect(response.text()).resolves.toBe(
      "/docs/content.md?utm_source=test",
    );
  });
});

async function requestWithAccept(accept: string) {
  return requestWithHeaders({ accept });
}

async function requestWithHeaders(
  headers: Record<string, string>,
  requestUrl = "https://example.com/docs/content/",
) {
  const url = new URL(requestUrl);
  const next = vi.fn(() => new Response("next"));
  const rewrite = vi.fn(
    (destination: URL) =>
      new Response(destination.pathname + destination.search),
  );

  const response = await onRequest(
    {
      request: new Request(url, { headers }),
      rewrite,
      url,
    } as never,
    next,
  );

  return { next, response, rewrite };
}
