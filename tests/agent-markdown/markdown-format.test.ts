import { describe, expect, it } from "vitest";

import {
  getCodeFenceLength,
  getOpeningFence,
  isClosingFence,
  rewriteAnchorHrefAttributes,
} from "../../src/agent-markdown/markdown-format";

describe("getCodeFenceLength", () => {
  it("uses a minimum triple-backtick fence", () => {
    expect(getCodeFenceLength("const value = true;")).toBe(3);
    expect(getCodeFenceLength("inline `tick`")).toBe(3);
  });

  it("exceeds the longest backtick run in code content", () => {
    expect(getCodeFenceLength("```\nconst value = true;\n```")).toBe(4);
    expect(getCodeFenceLength("````md\n```js\n```\n````")).toBe(5);
  });
});

describe("fenced code parsing", () => {
  it("recognizes valid opening and closing fences", () => {
    expect(getOpeningFence("```ts")).toEqual({ character: "`", length: 3 });
    expect(getOpeningFence("   ~~~~ markdown")).toEqual({
      character: "~",
      length: 4,
    });
    expect(isClosingFence("````", { character: "`", length: 3 })).toBe(true);
    expect(isClosingFence("```js", { character: "`", length: 3 })).toBe(false);
  });

  it("rejects invalid backtick opening fences", () => {
    expect(getOpeningFence("    ```ts")).toBeUndefined();
    expect(getOpeningFence("``foo")).toBeUndefined();
    expect(getOpeningFence("```foo`bar")).toBeUndefined();
  });

  it("allows backticks in tilde fence info strings", () => {
    expect(getOpeningFence("~~~foo`bar")).toEqual({
      character: "~",
      length: 3,
    });
  });
});

describe("rewriteAnchorHrefAttributes", () => {
  const rewriteUrl = (url: string) => `/docs${url}`;

  it("rewrites href attributes on anchor tags", () => {
    expect(
      rewriteAnchorHrefAttributes('<a href="/intro/">Intro</a>', rewriteUrl),
    ).toBe('<a href="/docs/intro/">Intro</a>');
    expect(
      rewriteAnchorHrefAttributes(
        "<A data-label='x' HREF='/intro/'>Intro</A>",
        rewriteUrl,
      ),
    ).toBe("<A data-label='x' HREF='/docs/intro/'>Intro</A>");
  });

  it("leaves non-anchor href text alone", () => {
    expect(
      rewriteAnchorHrefAttributes(
        'The attribute is href="/intro/".',
        rewriteUrl,
      ),
    ).toBe('The attribute is href="/intro/".');
    expect(
      rewriteAnchorHrefAttributes(
        '<span href="/intro/">Intro</span>',
        rewriteUrl,
      ),
    ).toBe('<span href="/intro/">Intro</span>');
  });

  it("does not stop scanning at a quoted greater-than character", () => {
    expect(
      rewriteAnchorHrefAttributes(
        '<a title="1 > 0" href="/intro/">Intro</a>',
        rewriteUrl,
      ),
    ).toBe('<a title="1 > 0" href="/docs/intro/">Intro</a>');
  });
});
