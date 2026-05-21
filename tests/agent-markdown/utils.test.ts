import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("astro:content", () => ({
  getCollection: vi.fn(),
}));

vi.mock("virtual:sentry-starlight-theme/agent-markdown/config", () => ({
  base: "/docs",
}));

let renderMarkdownResponse: typeof import("../../src/agent-markdown/utils").renderMarkdownResponse;

beforeAll(async () => {
  ({ renderMarkdownResponse } = await import("../../src/agent-markdown/utils"));
});

describe("renderMarkdownResponse", () => {
  it("does not rewrite root-relative links outside a non-root docs base", async () => {
    const response = renderMarkdownResponse(
      {
        url: new URL("https://example.com/docs/content/"),
      },
      {
        id: "content",
        entry: {
          data: {
            title: "Content",
            description: "Docs content",
          },
          rendered: {
            html: [
              '<p><a href="/pricing">Pricing</a></p>',
              '<p><a href="/docs/content/">Docs content</a></p>',
              '<p><a href="../code/">Code</a></p>',
            ].join(""),
          },
        },
      } as never,
    );

    await expect(response.text()).resolves.toContain(
      [
        "[Pricing](/pricing)",
        "[Docs content](/docs/content.md)",
        "[Code](/docs/code.md)",
      ].join("\n\n"),
    );
  });
});
