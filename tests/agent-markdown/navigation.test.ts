import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCollection: vi.fn(),
  sidebar: [] as unknown[],
}));

vi.mock("astro:content", () => ({
  getCollection: mocks.getCollection,
}));

vi.mock("virtual:sentry-starlight-theme/agent-markdown/config", () => ({
  appendNavigation: true,
  base: "/docs",
  sidebar: mocks.sidebar,
}));

let renderMarkdownResponse: typeof import("../../src/agent-markdown/utils").renderMarkdownResponse;

beforeAll(async () => {
  ({ renderMarkdownResponse } = await import("../../src/agent-markdown/utils"));
});

beforeEach(() => {
  mocks.getCollection.mockReset();
  mocks.sidebar.length = 0;
});

describe("agent markdown navigation", () => {
  it("does not special-case Sentry docs platform routes", async () => {
    const pages = [
      entry("platforms", "Platforms"),
      entry("platforms/javascript", "JavaScript"),
      entry("platforms/javascript/configuration", "Configuration", {
        sidebar_order: 1,
      }),
      entry("platforms/javascript/guides", "Guides", {
        sidebar_order: 2,
      }),
      entry("platforms/javascript/guides/nextjs", "Next.js", {
        sidebar_order: 1,
      }),
    ];
    mocks.getCollection.mockResolvedValue(pages);

    const response = await renderMarkdownResponse(
      {
        site: new URL("https://example.com"),
        url: new URL("https://example.com/docs/platforms/javascript/"),
      },
      {
        id: "platforms/javascript",
        entry: pages[1],
      } as never,
    );

    const text = await response.text();

    expect(text).toContain(
      [
        "## Pages in this section",
        "",
        "- [Configuration](https://example.com/docs/platforms/javascript/configuration.md)",
        "- [Guides](https://example.com/docs/platforms/javascript/guides.md)",
      ].join("\n"),
    );

    expect(text).not.toContain("## Frameworks");
    expect(text).not.toContain("## Topics");
  });

  it("adds visible child pages using Starlight sidebar metadata", async () => {
    const pages = [
      entry("reference", "Reference"),
      entry("reference/first", "First", {
        sidebar: { label: "Getting Started", order: 2 },
      }),
      entry("reference/second", "Second", {
        sidebar: { label: "API", order: 1 },
      }),
      entry("reference/hidden", "Hidden", {
        sidebar: { hidden: true, order: 0 },
      }),
    ];
    mocks.getCollection.mockResolvedValue(pages);

    const response = await renderMarkdownResponse(
      {
        url: new URL("https://example.com/docs/reference/"),
      },
      {
        id: "reference",
        entry: pages[0],
      } as never,
    );

    const text = await response.text();

    expect(text).toContain(
      [
        "## Pages in this section",
        "",
        "- [API](/docs/reference/second.md)",
        "- [Getting Started](/docs/reference/first.md)",
      ].join("\n"),
    );
    expect(text).not.toContain("Hidden");
  });

  it("uses explicit Starlight sidebar config before frontmatter order", async () => {
    mocks.sidebar.push({
      label: "Reference",
      items: [
        { label: "Second From Config", slug: "reference/second" },
        { label: "First From Config", link: "/docs/reference/first/" },
      ],
    });
    const pages = [
      entry("reference", "Reference"),
      entry("reference/first", "First", {
        sidebar: { label: "First From Frontmatter", order: 1 },
      }),
      entry("reference/second", "Second", {
        sidebar: { label: "Second From Frontmatter", order: 2 },
      }),
    ];
    mocks.getCollection.mockResolvedValue(pages);

    const response = await renderMarkdownResponse(
      {
        url: new URL("https://example.com/docs/reference/"),
      },
      {
        id: "reference",
        entry: pages[0],
      } as never,
    );

    await expect(response.text()).resolves.toContain(
      [
        "## Pages in this section",
        "",
        "- [Second From Config](/docs/reference/second.md)",
        "- [First From Config](/docs/reference/first.md)",
      ].join("\n"),
    );
  });

  it("orders autogenerate pages relative to explicit sidebar items", async () => {
    mocks.sidebar.push(
      { slug: "reference/intro" },
      { autogenerate: { directory: "reference" } },
      { slug: "reference/advanced" },
    );
    const pages = [
      entry("reference", "Reference"),
      entry("reference/intro", "Introduction"),
      entry("reference/alpha", "Alpha"),
      entry("reference/beta", "Beta"),
      entry("reference/advanced", "Advanced"),
    ];
    mocks.getCollection.mockResolvedValue(pages);

    const response = await renderMarkdownResponse(
      {
        url: new URL("https://example.com/docs/reference/"),
      },
      {
        id: "reference",
        entry: pages[0],
      } as never,
    );

    // intro is explicit (order 0); alpha and beta come from autogenerate
    // (orders 1-2, alphabetical, skipping the explicit intro/advanced);
    // advanced is explicit (order 3).
    await expect(response.text()).resolves.toContain(
      [
        "## Pages in this section",
        "",
        "- [Introduction](/docs/reference/intro.md)",
        "- [Alpha](/docs/reference/alpha.md)",
        "- [Beta](/docs/reference/beta.md)",
        "- [Advanced](/docs/reference/advanced.md)",
      ].join("\n"),
    );
  });

  it("allows frontmatter to override autogenerate sort position", async () => {
    mocks.sidebar.push({ autogenerate: { directory: "guide" } });
    const pages = [
      entry("guide", "Guide"),
      entry("guide/alpha", "Alpha", { sidebar: { order: 2 } }),
      entry("guide/beta", "Beta", { sidebar: { order: 1 } }),
    ];
    mocks.getCollection.mockResolvedValue(pages);

    const response = await renderMarkdownResponse(
      {
        url: new URL("https://example.com/docs/guide/"),
      },
      {
        id: "guide",
        entry: pages[0],
      } as never,
    );

    // Frontmatter sidebar.order overrides the alphabetical autogenerate order.
    await expect(response.text()).resolves.toContain(
      [
        "## Pages in this section",
        "",
        "- [Beta](/docs/guide/beta.md)",
        "- [Alpha](/docs/guide/alpha.md)",
      ].join("\n"),
    );
  });
});

function entry(id: string, title: string, data: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      title,
      ...data,
    },
    rendered: {
      html: `<p>${title} content.</p>`,
    },
  };
}
