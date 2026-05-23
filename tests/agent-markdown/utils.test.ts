import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("astro:content", () => ({
  getCollection: vi.fn(),
}));

vi.mock("virtual:sentry-starlight-theme/agent-markdown/config", () => ({
  appendNavigation: false,
  base: "/docs",
  sidebar: [],
}));

let renderMarkdownResponse: typeof import("../../src/agent-markdown/utils").renderMarkdownResponse;

beforeAll(async () => {
  ({ renderMarkdownResponse } = await import("../../src/agent-markdown/utils"));
});

describe("renderMarkdownResponse", () => {
  it("does not rewrite root-relative links outside a non-root docs base", async () => {
    const response = await renderMarkdownResponse(
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
    const response = await renderMarkdownResponse(
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
            "Broken ```open ``[Literal double](/docs/code/)``",
            '[Broken](/docs/missing "unterminated',
            "[After broken](/docs/content/)",
            '[Titled](/docs/content/ "Read more")',
            '   [Code ref]: /docs/code/ "Code reference"',
            '<img src="/docs/assets/example.png" alt="Example image">',
            "Use List<String> values when x < y.",
            "[External](//example.net/docs/content/)",
            "[`Code label`](/docs/code/)",
          ].join("\n\n"),
        },
      } as never,
    );

    await expect(response.text()).resolves.toContain(
      [
        "`[Literal](/docs/code/)`",
        "Broken ```open ``[Literal double](/docs/code/)``",
        '[Broken](/docs/missing "unterminated',
        "[After broken](/docs/content.md)",
        '[Titled](/docs/content.md "Read more")',
        '   [Code ref]: /docs/code.md "Code reference"',
        "![Example image](/docs/assets/example.png)",
        "Use List<String> values when x < y.",
        "[External](//example.net/docs/content/)",
        "[`Code label`](/docs/code.md)",
      ].join("\n\n"),
    );
  });

  it("renders block link containers as markdown lists", async () => {
    const response = await renderMarkdownResponse(
      {
        site: new URL("https://example.com"),
        url: new URL("https://example.com/docs/guide/"),
      },
      {
        id: "guide",
        entry: {
          data: {
            title: "Guide",
            description: "Docs guide",
          },
          rendered: {
            html: [
              "<h2>Reading Path</h2>",
              '<div class="api-link-grid">',
              '  <a class="api-link-card" href="/docs/quickstart/">',
              "    <strong>Quickstart</strong>",
              "    <span>Install and initialize a repository.</span>",
              "  </a>",
              '  <a class="api-link-card" href="/docs/skills/">',
              "    <strong>Skills</strong>",
              "    <span>Write codebase-specific reviews.</span>",
              "  </a>",
              "</div>",
            ].join(""),
          },
        },
      } as never,
    );

    await expect(response.text()).resolves.toContain(
      [
        "## Reading Path",
        "",
        "- [Quickstart Install and initialize a repository.](https://example.com/docs/quickstart.md)",
        "- [Skills Write codebase-specific reviews.](https://example.com/docs/skills.md)",
      ].join("\n"),
    );
  });

  it("omits generated heading anchor labels", async () => {
    const response = await renderMarkdownResponse(
      {
        url: new URL("https://example.com/docs/content/"),
      },
      {
        id: "content",
        entry: {
          data: {
            title: "Content",
          },
          rendered: {
            html: [
              '<div class="sl-heading-wrapper level-h2">',
              '<h2 id="parameters">Parameters</h2>',
              '<a class="sl-anchor-link" href="#parameters">',
              '<span class="sr-only">Section titled “Parameters”</span>',
              "</a>",
              "</div>",
            ].join(""),
          },
        },
      } as never,
    );

    const text = await response.text();
    expect(text).toContain("## Parameters");
    expect(text).not.toContain("Section titled");
  });

  it("preserves Expressive Code line breaks", async () => {
    const response = await renderMarkdownResponse(
      {
        url: new URL("https://example.com/docs/content/"),
      },
      {
        id: "content",
        entry: {
          data: {
            title: "Content",
          },
          rendered: {
            html: [
              '<div class="expressive-code">',
              '<pre data-language="ts"><code>',
              '<div class="ec-line"><div class="code"><span>const</span><span> value = 1;</span></div></div>',
              '<div class="ec-line"><div class="code"></div></div>',
              '<div class="ec-line"><div class="code"><span class="indent">  </span><span>return value;</span></div></div>',
              "</code></pre>",
              "</div>",
            ].join(""),
          },
        },
      } as never,
    );

    await expect(response.text()).resolves.toContain(
      ["```ts", "const value = 1;", "", "  return value;", "```"].join("\n"),
    );
  });

  it("renders definition lists as markdown lists", async () => {
    const response = await renderMarkdownResponse(
      {
        url: new URL("https://example.com/docs/config/"),
      },
      {
        id: "config",
        entry: {
          data: {
            title: "Configuration",
          },
          rendered: {
            html: [
              '<dl class="sentry-key-value-list">',
              "<div>",
              '<dt><code>WARDEN_MODEL</code><span class="sentry-property-meta">string</span></dt>',
              '<dd>Fallback model selector. See <a href="/docs/config/models/">Models</a>.</dd>',
              "</div>",
              "</dl>",
            ].join(""),
          },
        },
      } as never,
    );

    await expect(response.text()).resolves.toContain(
      "- `WARDEN_MODEL` (string): Fallback model selector. See [Models](/docs/config/models.md).",
    );
  });

  it("renders source HTML card and definition list patterns", async () => {
    const response = await renderMarkdownResponse(
      {
        url: new URL("https://example.com/docs/"),
      },
      {
        id: "docs",
        entry: {
          data: {
            title: "Docs",
          },
          body: [
            "## Setup Paths",
            '<div class="api-link-grid">',
            '  <a class="api-link-card" href="/docs/setup/">',
            "    <strong>Setup</strong>",
            "    <span>Install and configure the theme.</span>",
            "  </a>",
            "</div>",
            "## Options",
            '<dl class="sentry-key-value-list">',
            "  <div>",
            '    <dt><code>navigation</code><span class="sentry-property-meta">boolean</span></dt>',
            "    <dd>Append child-page navigation.</dd>",
            "  </div>",
            "</dl>",
          ].join("\n"),
        },
      } as never,
    );

    const text = await response.text();
    expect(text).toContain(
      "- [Setup Install and configure the theme.](/docs/setup.md)",
    );
    expect(text).toContain(
      "- `navigation` (boolean): Append child-page navigation.",
    );
  });
});
