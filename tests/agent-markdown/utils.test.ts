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
              '<p><a href="//example.net/docs/content/">External</a></p>',
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
        "[External](//example.net/docs/content/)",
      ].join("\n\n"),
    );
  });

  it("rewrites source markdown links and preserves source images", async () => {
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
          body: [
            "`[Literal](/docs/code/)`",
            '[Titled](/docs/content/ "Read more")',
            '   [Code ref]: /docs/code/ "Code reference"',
            '<img src="/docs/assets/example.png" alt="Example image">',
            "[External](//example.net/docs/content/)",
            "[`Code label`](/docs/code/)",
          ].join("\n\n"),
        },
      } as never,
    );

    await expect(response.text()).resolves.toContain(
      [
        "`[Literal](/docs/code/)`",
        '[Titled](/docs/content.md "Read more")',
        '   [Code ref]: /docs/code.md "Code reference"',
        "![Example image](/docs/assets/example.png)",
        "[External](//example.net/docs/content/)",
        "[`Code label`](/docs/code.md)",
      ].join("\n\n"),
    );
  });
});
