export type MarkdownFence = {
  character: "`" | "~";
  length: number;
};

export type MarkdownInlineCodeSpan = {
  end: number;
  start: number;
};

export function getOpeningFence(line: string): MarkdownFence | undefined {
  const leadingSpaces = countLeadingSpaces(line);
  if (leadingSpaces > 3) {
    return undefined;
  }

  const character = line[leadingSpaces];
  if (character !== "`" && character !== "~") {
    return undefined;
  }

  const length = countFenceCharacters(line, leadingSpaces, character);
  if (length < 3) {
    return undefined;
  }

  const infoString = line.slice(leadingSpaces + length).trim();
  if (character === "`" && infoString.includes("`")) {
    return undefined;
  }

  return { character, length };
}

export function isClosingFence(line: string, fence: MarkdownFence) {
  const leadingSpaces = countLeadingSpaces(line);
  if (leadingSpaces > 3) {
    return false;
  }

  const length = countFenceCharacters(line, leadingSpaces, fence.character);
  if (length < fence.length) {
    return false;
  }

  return line.slice(leadingSpaces + length).trim() === "";
}

export function getCodeFenceLength(code: string) {
  return Math.max(3, getLongestBacktickRunLength(code) + 1);
}

export function formatInlineCodeSpan(code: string) {
  const delimiter = "`".repeat(getLongestBacktickRunLength(code) + 1);
  const padding = code.startsWith("`") || code.endsWith("`") ? " " : "";

  return `${delimiter}${padding}${code}${padding}${delimiter}`;
}

export function normalizeMarkdownHeadingText(value: string) {
  return stripMarkdownFormatting(decodeHtmlEntities(value))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function hasMarkdownHtmlTag(value: string) {
  const tagPattern = /<\/?([a-z][a-z\d:-]*)(?=[\s>/])/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(value))) {
    const tagName = match[1];
    if (tagName && markdownHtmlTagNames.has(tagName)) {
      return true;
    }
  }

  return false;
}

export function isInsideInlineCode(markdown: string, offset: number) {
  return getInlineCodeSpans(markdown).some(
    (span) => span.start < offset && offset < span.end,
  );
}

export function getInlineCodeSpans(markdown: string): MarkdownInlineCodeSpan[] {
  const spans: MarkdownInlineCodeSpan[] = [];
  let index = 0;

  while (index < markdown.length) {
    const codeStart = findUnescapedBacktick(markdown, index);

    if (codeStart === -1) {
      break;
    }

    const tickCount = getBacktickRunLength(markdown, codeStart);
    const codeEnd = findInlineCodeEnd(
      markdown,
      codeStart + tickCount,
      tickCount,
    );

    if (codeEnd === -1) {
      index = codeStart + tickCount;
      continue;
    }

    spans.push({ end: codeEnd, start: codeStart });
    index = codeEnd;
  }

  return spans;
}

export function applyOutsideInlineCode(
  markdown: string,
  transform: (segment: string) => string,
) {
  let result = "";
  let index = 0;
  const spans = getInlineCodeSpans(markdown);

  for (const span of spans) {
    result += transform(markdown.slice(index, span.start));
    result += markdown.slice(span.start, span.end);
    index = span.end;
  }

  result += transform(markdown.slice(index));
  return result;
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi,
    (entity, decimal, hex, named) => {
      if (decimal) {
        return codePointToString(Number(decimal), entity);
      }
      if (hex) {
        return codePointToString(Number.parseInt(hex, 16), entity);
      }

      return (
        {
          amp: "&",
          apos: "'",
          gt: ">",
          lt: "<",
          quot: '"',
        }[String(named).toLowerCase()] ?? entity
      );
    },
  );
}

export function normalizeMarkdown(markdown: string) {
  let result = "";
  let pendingSpaces = "";
  let newlineCount = 0;

  for (const character of markdown.replace(/\r\n?/g, "\n")) {
    if (character === " " || character === "\t") {
      pendingSpaces += character;
      continue;
    }

    if (character === "\n") {
      newlineCount += 1;
      if (newlineCount <= 2) {
        result += pendingSpaces;
        result += "\n";
      }
      pendingSpaces = "";
      continue;
    }

    result += pendingSpaces;
    pendingSpaces = "";
    newlineCount = 0;
    result += character;
  }

  result += pendingSpaces;
  return result.trim();
}

export function rewriteAnchorHrefAttributes(
  markdown: string,
  rewriteUrl: (url: string) => string,
) {
  let result = "";
  let index = 0;

  while (index < markdown.length) {
    const tagStart = findAnchorTagStart(markdown, index);

    if (tagStart === -1) {
      result += markdown.slice(index);
      break;
    }

    const tagEnd = findHtmlTagEnd(markdown, tagStart + 2);
    if (tagEnd === -1) {
      result += markdown.slice(index, tagStart + 1);
      index = tagStart + 1;
      continue;
    }

    if (findNestedAnchorTagStart(markdown, tagStart + 2, tagEnd) !== -1) {
      result += markdown.slice(index, tagStart + 1);
      index = tagStart + 1;
      continue;
    }

    result += markdown.slice(index, tagStart);
    result += rewriteAnchorTagHref(
      markdown.slice(tagStart, tagEnd + 1),
      rewriteUrl,
    );
    index = tagEnd + 1;
  }

  return result;
}

function countLeadingSpaces(line: string) {
  let count = 0;

  while (line[count] === " ") {
    count += 1;
  }

  return count;
}

function countFenceCharacters(
  line: string,
  start: number,
  character: "`" | "~",
) {
  let count = 0;

  while (line[start + count] === character) {
    count += 1;
  }

  return count;
}

function getLongestBacktickRunLength(value: string) {
  const runs = value.match(/`+/g) ?? [];
  return runs.reduce((longest, run) => Math.max(longest, run.length), 0);
}

function findUnescapedBacktick(value: string, start: number) {
  let index = start;

  while (index < value.length) {
    const tickStart = value.indexOf("`", index);
    if (tickStart === -1 || !isEscaped(value, tickStart)) {
      return tickStart;
    }

    index = tickStart + 1;
  }

  return -1;
}

function getBacktickRunLength(value: string, start: number) {
  let length = 0;
  while (value[start + length] === "`") {
    length += 1;
  }
  return length;
}

function findInlineCodeEnd(value: string, start: number, tickCount: number) {
  let index = start;

  while (index < value.length) {
    const tickStart = value.indexOf("`", index);

    if (tickStart === -1) {
      return -1;
    }

    const length = getBacktickRunLength(value, tickStart);
    if (length === tickCount) {
      return tickStart + tickCount;
    }

    index = tickStart + length;
  }

  return -1;
}

function isEscaped(value: string, index: number) {
  let slashCount = 0;

  for (
    let offset = index - 1;
    offset >= 0 && value[offset] === "\\";
    offset -= 1
  ) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

const markdownHtmlTagNames = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "button",
  "code",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "iframe",
  "img",
  "li",
  "noscript",
  "object",
  "ol",
  "p",
  "pre",
  "script",
  "span",
  "strong",
  "style",
  "svg",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

function stripMarkdownFormatting(value: string) {
  let result = value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/(`+)([\s\S]*?)\1/g, "$2");
  let previous: string;

  do {
    previous = result;
    result = result.replace(
      /(^|[\s([{"'])(\*\*|__|\*|_)(?=\S)([\s\S]*?\S)\2(?=$|[\s)\].,;:!?'"])/g,
      "$1$3",
    );
  } while (result !== previous);

  return result;
}

function codePointToString(codePoint: number, fallback: string) {
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function findAnchorTagStart(markdown: string, start: number) {
  let index = start;

  while (index < markdown.length) {
    const tagStart = markdown.indexOf("<", index);
    if (tagStart === -1) {
      return -1;
    }

    if (markdown[tagStart + 1]?.toLowerCase() !== "a") {
      index = tagStart + 1;
      continue;
    }

    const nextCharacter = markdown[tagStart + 2];
    if (
      nextCharacter === ">" ||
      nextCharacter === "/" ||
      isHtmlWhitespace(nextCharacter)
    ) {
      return tagStart;
    }

    index = tagStart + 2;
  }

  return -1;
}

function findHtmlTagEnd(markdown: string, start: number) {
  let quote: string | undefined;

  for (let index = start; index < markdown.length; index += 1) {
    const character = markdown[index];

    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") {
      return index;
    }
  }

  return -1;
}

function findNestedAnchorTagStart(
  markdown: string,
  start: number,
  end: number,
) {
  let quote: string | undefined;

  for (let index = start; index < end; index += 1) {
    const character = markdown[index];

    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (
      character === "<" &&
      markdown[index + 1]?.toLowerCase() === "a" &&
      (markdown[index + 2] === ">" ||
        markdown[index + 2] === "/" ||
        isHtmlWhitespace(markdown[index + 2]))
    ) {
      return index;
    }
  }

  return -1;
}

function rewriteAnchorTagHref(
  tag: string,
  rewriteUrl: (url: string) => string,
) {
  let index = 2;

  while (index < tag.length - 1) {
    while (isHtmlWhitespace(tag[index])) {
      index += 1;
    }

    const nameStart = index;
    while (index < tag.length - 1 && isHtmlAttributeNameCharacter(tag[index])) {
      index += 1;
    }

    if (nameStart === index) {
      index += 1;
      continue;
    }

    const name = tag.slice(nameStart, index).toLowerCase();
    const attributeEnd = index;
    while (isHtmlWhitespace(tag[index])) {
      index += 1;
    }

    if (tag[index] !== "=") {
      if (index === attributeEnd) {
        index += 1;
      }
      continue;
    }

    index += 1;
    while (isHtmlWhitespace(tag[index])) {
      index += 1;
    }

    const quote = tag[index];
    if (quote !== '"' && quote !== "'") {
      const urlStart = index;
      while (
        index < tag.length - 1 &&
        !isHtmlUnquotedAttributeEnd(tag[index])
      ) {
        index += 1;
      }

      if (urlStart === index) {
        continue;
      }

      if (name === "href") {
        const url = tag.slice(urlStart, index);
        return `${tag.slice(0, urlStart)}${rewriteUrl(url)}${tag.slice(index)}`;
      }

      continue;
    }

    const urlStart = index + 1;
    const urlEnd = tag.indexOf(quote, urlStart);
    if (urlEnd === -1) {
      return tag;
    }

    if (name === "href") {
      const url = tag.slice(urlStart, urlEnd);
      return `${tag.slice(0, urlStart)}${rewriteUrl(url)}${tag.slice(urlEnd)}`;
    }

    index = urlEnd + 1;
  }

  return tag;
}

function isHtmlWhitespace(character: string | undefined) {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f"
  );
}

function isHtmlUnquotedAttributeEnd(character: string | undefined) {
  return isHtmlWhitespace(character) || character === ">";
}

function isHtmlAttributeNameCharacter(character: string | undefined) {
  return Boolean(
    character &&
    !isHtmlWhitespace(character) &&
    !["/", ">", "="].includes(character),
  );
}
