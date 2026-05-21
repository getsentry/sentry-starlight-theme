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
});

async function requestWithAccept(accept: string) {
  const url = new URL("https://example.com/docs/content/");
  const next = vi.fn(() => new Response("next"));
  const rewrite = vi.fn(
    (destination: URL) => new Response(destination.pathname),
  );

  const response = await onRequest(
    {
      request: new Request(url, { headers: { accept } }),
      rewrite,
      url,
    } as never,
    next,
  );

  return { next, response, rewrite };
}
