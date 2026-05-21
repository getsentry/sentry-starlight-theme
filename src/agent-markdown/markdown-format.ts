export type MarkdownFence = {
  character: "`" | "~";
  length: number;
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
      result += markdown.slice(index);
      break;
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

function isHtmlAttributeNameCharacter(character: string | undefined) {
  return Boolean(
    character &&
    !isHtmlWhitespace(character) &&
    !["/", ">", "="].includes(character),
  );
}
