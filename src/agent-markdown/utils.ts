import type { APIContext, GetStaticPathsItem } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import {
  ELEMENT_NODE,
  TEXT_NODE,
  parse,
  type ElementNode,
  type Node,
  type TextNode,
} from "ultrahtml";
import {
  isIgnoredPath,
  isInBase,
  joinBase,
  toMarkdownPath,
} from "./path-utils";
import { base as siteBase } from "virtual:sentry-starlight-theme/agent-markdown/config";

type DocsEntry = CollectionEntry<"docs"> & {
  body?: string;
  rendered?: {
    html?: string;
  };
};

export interface MarkdownPage extends Record<string, unknown> {
  entry: DocsEntry;
  id: string;
}

let markdownPagesPromise: Promise<MarkdownPage[]> | undefined;

export async function getMarkdownPages(): Promise<MarkdownPage[]> {
  if (import.meta.env.MODE === "production" && markdownPagesPromise) {
    return markdownPagesPromise;
  }

  const pagesPromise = loadMarkdownPages();

  if (import.meta.env.MODE === "production") {
    markdownPagesPromise = pagesPromise;
  }

  return pagesPromise;
}

async function loadMarkdownPages(): Promise<MarkdownPage[]> {
  const entries = (await getCollection("docs", ({ data }: DocsEntry) => {
    return import.meta.env.MODE !== "production" || data.draft !== true;
  })) as DocsEntry[];

  return dedupeMarkdownPages(
    entries.map((entry: DocsEntry) => ({
      entry,
      id: normalizeIndexId(entry.id),
    })),
  );
}

export async function getMarkdownPageById(
  id: string,
): Promise<MarkdownPage | undefined> {
  const pages = await getMarkdownPages();
  return pages.find((page) => page.id === id);
}

export function getMarkdownPageFromProps(
  context: Pick<APIContext, "props">,
): MarkdownPage | undefined {
  const page = context.props as Partial<MarkdownPage> | undefined;

  return page?.entry && typeof page.id === "string"
    ? (page as MarkdownPage)
    : undefined;
}

export async function getMarkdownStaticPaths({
  includeRoot,
}: {
  includeRoot: boolean;
}): Promise<GetStaticPathsItem[]> {
  const pages = await getMarkdownPages();

  return pages
    .filter(({ id }) => (includeRoot ? id === "" : id !== ""))
    .map((page) => ({
      params: includeRoot ? {} : { slug: page.id },
      props: page,
    }));
}

export function renderMarkdownResponse(
  context: Pick<APIContext, "site" | "url">,
  page: MarkdownPage,
): Response {
  const markdown = renderMarkdownDocument(context, page);
  const filename = `${page.id.split("/").at(-1) || "index"}.md`;

  return new Response(markdown, {
    headers: {
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
    },
  });
}

function renderMarkdownDocument(
  context: Pick<APIContext, "site" | "url">,
  { entry, id }: MarkdownPage,
): string {
  const pageUrl = getPageUrl(context, id);
  const frontmatter = formatYamlFrontmatter({
    title: entry.data.title,
    description: entry.data.description,
    url: pageUrl,
  });
  const body = getMarkdownBody(context, { entry, id });
  const title = formatMarkdownHeadingText(entry.data.title);

  return `${frontmatter}# ${title}\n\n${body.trim()}\n`;
}

function getMarkdownBody(
  context: Pick<APIContext, "site" | "url">,
  page: MarkdownPage,
): string {
  const renderedHtml = page.entry.rendered?.html;

  if (renderedHtml) {
    return stripLeadingH1(
      htmlToMarkdown(renderedHtml, {
        context,
        currentPageId: page.id,
      }),
      page.entry.data.title,
    );
  }

  return stripLeadingH1(
    cleanSourceMarkdown(
      rewriteMarkdownLinks(page.entry.body ?? "", context, page.id),
    ),
    page.entry.data.title,
  );
}

function formatYamlFrontmatter({
  title,
  description,
  url,
}: {
  title?: string;
  description?: string;
  url?: string;
}) {
  let yaml = "---\n";
  if (title) {
    yaml += `title: ${JSON.stringify(title.replace(/\r?\n/g, " "))}\n`;
  }
  if (description) {
    yaml += `description: ${JSON.stringify(description.replace(/\r?\n/g, " "))}\n`;
  }
  if (url) {
    yaml += `url: ${JSON.stringify(url)}\n`;
  }
  yaml += "---\n\n";
  return yaml;
}

function formatMarkdownHeadingText(title: string) {
  return title.replace(/\s+/g, " ").trim();
}

function rewriteMarkdownLinks(
  markdown: string,
  context: Pick<APIContext, "site" | "url">,
  currentPageId: string,
): string {
  return applyOutsideFencedCode(
    markdown,
    (segment) =>
      rewriteMarkdownReferenceLinks(
        rewriteInlineMarkdownLinks(segment, context, currentPageId),
        context,
        currentPageId,
      ),
    { normalize: false },
  );
}

function rewriteInlineMarkdownLinks(
  markdown: string,
  context: Pick<APIContext, "site" | "url">,
  currentPageId: string,
) {
  return applyOutsideInlineCode(markdown, (segment) =>
    rewriteHtmlHrefAttributes(
      rewriteInlineMarkdownLinksInText(segment, context, currentPageId),
      context,
      currentPageId,
    ),
  );
}

function rewriteInlineMarkdownLinksInText(
  markdown: string,
  context: Pick<APIContext, "site" | "url">,
  currentPageId: string,
) {
  let result = "";
  let index = 0;

  while (index < markdown.length) {
    const linkStart = markdown.indexOf("](", index);

    if (linkStart === -1) {
      result += markdown.slice(index);
      break;
    }

    const labelStart = findMarkdownLinkLabelStart(markdown, linkStart);
    if (labelStart === -1 || labelStart < index) {
      result += markdown.slice(index, linkStart + 2);
      index = linkStart + 2;
      continue;
    }

    const urlStart = linkStart + 2;
    const urlEnd = findMarkdownUrlEnd(markdown, urlStart, ")");
    if (urlEnd === -1) {
      result += markdown.slice(index);
      break;
    }

    const url = markdown.slice(urlStart, urlEnd);
    result += markdown.slice(index, urlStart);
    result += rewriteDocsUrl(url, context, currentPageId);
    index = urlEnd;
  }

  return result;
}

function rewriteHtmlHrefAttributes(
  markdown: string,
  context: Pick<APIContext, "site" | "url">,
  currentPageId: string,
) {
  let result = "";
  let index = 0;

  while (index < markdown.length) {
    const hrefStart = markdown.indexOf("href=", index);

    if (hrefStart === -1) {
      result += markdown.slice(index);
      break;
    }

    const quote = markdown[hrefStart + 5];
    if (quote !== '"' && quote !== "'") {
      result += markdown.slice(index, hrefStart + 5);
      index = hrefStart + 5;
      continue;
    }

    const urlStart = hrefStart + 6;
    const urlEnd = markdown.indexOf(quote, urlStart);

    if (urlEnd === -1) {
      result += markdown.slice(index);
      break;
    }

    const url = markdown.slice(urlStart, urlEnd);
    const rewritten = rewriteDocsUrl(url, context, currentPageId);
    result += markdown.slice(index, urlStart);
    result += rewritten;
    index = urlEnd;
  }

  return result;
}

function applyOutsideInlineCode(
  markdown: string,
  transform: (segment: string) => string,
) {
  let result = "";
  let index = 0;

  while (index < markdown.length) {
    const codeStart = markdown.indexOf("`", index);

    if (codeStart === -1) {
      result += transform(markdown.slice(index));
      break;
    }

    const tickCount = getBacktickRunLength(markdown, codeStart);
    const codeEnd = findInlineCodeEnd(
      markdown,
      codeStart + tickCount,
      tickCount,
    );

    if (codeEnd === -1) {
      result += transform(markdown.slice(index));
      break;
    }

    result += transform(markdown.slice(index, codeStart));
    result += markdown.slice(codeStart, codeEnd);
    index = codeEnd;
  }

  return result;
}

function findMarkdownLinkLabelStart(value: string, labelEnd: number) {
  let bracketDepth = 0;

  for (let index = labelEnd - 1; index >= 0; index -= 1) {
    const character = value[index];

    if (character === "\n") {
      return -1;
    }

    if (isEscaped(value, index)) {
      continue;
    }

    if (character === "]") {
      bracketDepth += 1;
      continue;
    }

    if (character === "[") {
      if (bracketDepth === 0) {
        return index;
      }

      bracketDepth -= 1;
    }
  }

  return -1;
}

function rewriteMarkdownReferenceLinks(
  markdown: string,
  context: Pick<APIContext, "site" | "url">,
  currentPageId: string,
) {
  return markdown
    .split("\n")
    .map((line) => {
      const labelEnd = line.indexOf("]:");
      if (!line.startsWith("[") || labelEnd === -1) {
        return line;
      }

      let urlStart = labelEnd + 2;
      while (line[urlStart] === " " || line[urlStart] === "\t") {
        urlStart += 1;
      }

      const urlEnd = findMarkdownUrlEnd(line, urlStart);
      if (urlEnd === -1) {
        return line;
      }

      const url = line.slice(urlStart, urlEnd);
      return `${line.slice(0, urlStart)}${rewriteDocsUrl(
        url,
        context,
        currentPageId,
      )}${line.slice(urlEnd)}`;
    })
    .join("\n");
}

function findMarkdownUrlEnd(value: string, start: number, terminator?: string) {
  let parenDepth = 0;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (terminator === ")" && character === "(") {
      parenDepth += 1;
      continue;
    }
    if (terminator && character === terminator) {
      if (parenDepth > 0) {
        parenDepth -= 1;
        continue;
      }
      return index;
    }
    if (!terminator && (character === " " || character === "\t")) {
      return index;
    }
  }

  return terminator ? -1 : value.length;
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

function getBacktickRunLength(value: string, start: number) {
  let length = 0;
  while (value[start + length] === "`") {
    length += 1;
  }
  return length;
}

function findInlineCodeEnd(value: string, start: number, tickCount: number) {
  const ticks = "`".repeat(tickCount);
  const end = value.indexOf(ticks, start);
  return end === -1 ? -1 : end + tickCount;
}

function rewriteDocsUrl(
  rawUrl: string,
  context: Pick<APIContext, "site" | "url">,
  currentPageId: string,
): string {
  if (rawUrl.startsWith("<") && rawUrl.endsWith(">")) {
    const innerUrl = rawUrl.slice(1, -1);
    const rewritten = rewriteDocsUrl(innerUrl, context, currentPageId);
    return rewritten === innerUrl ? rawUrl : `<${rewritten}>`;
  }

  if (
    rawUrl.startsWith("#") ||
    rawUrl.startsWith("mailto:") ||
    rawUrl.startsWith("tel:")
  ) {
    return rawUrl;
  }

  try {
    if (rawUrl.startsWith("/") && isIgnoredPath(rawUrl, siteBase)) {
      return rawUrl;
    }

    const normalizedRawUrl =
      siteBase !== "/" &&
      rawUrl.startsWith("/") &&
      rawUrl !== siteBase &&
      !rawUrl.startsWith(`${siteBase}/`)
        ? joinBase(siteBase, rawUrl)
        : rawUrl;
    const baseUrl = context.site ?? new URL(context.url.origin);
    const currentPageUrl = new URL(getPagePath(currentPageId), baseUrl);
    const url = new URL(normalizedRawUrl, currentPageUrl);

    if (
      normalizedRawUrl.match(/^[a-z][a-z\d+.-]*:/i) &&
      url.origin !== baseUrl.origin
    ) {
      return rawUrl;
    }

    if (
      !isInBase(url.pathname, siteBase) ||
      isIgnoredPath(url.pathname, siteBase)
    ) {
      return rawUrl;
    }

    url.pathname = toMarkdownPath(url.pathname, siteBase);

    if (context.site) {
      return url.href;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawUrl;
  }
}

function getPageUrl(context: Pick<APIContext, "site" | "url">, id: string) {
  const pathname = getPagePath(id);
  return context.site ? new URL(pathname, context.site).href : pathname;
}

function getPagePath(id: string) {
  return joinBase(siteBase, id ? `${id}/` : "");
}

function normalizeIndexId(id: string) {
  return id.replace(/(?:^|\/)index$/, "");
}

function dedupeMarkdownPages(pages: MarkdownPage[]) {
  const pageById = new Map<string, MarkdownPage>();

  for (const page of pages) {
    const existing = pageById.get(page.id);
    if (!existing || isIndexEntryId(page.entry.id)) {
      pageById.set(page.id, page);
    }
  }

  return [...pageById.values()];
}

function isIndexEntryId(id: string) {
  return id === "index" || id.endsWith("/index");
}

function stripLeadingH1(markdown: string, title: string) {
  const lines = markdown.replace(/^\s+/, "").split("\n");
  const firstLine = lines[0]?.replace(/^#\s+/, "").trim();

  if (firstLine?.toLowerCase() !== title.trim().toLowerCase()) {
    return markdown;
  }

  return lines.slice(1).join("\n").replace(/^\n+/, "");
}

function cleanSourceMarkdown(markdown: string) {
  return applyOutsideFencedCode(markdown, (segment) => {
    const normalized = segment
      .replace(/^import\s.+$/gm, "")
      .replace(/^export\s.+$/gm, "")
      .replace(/\{"\s+"\}/g, " ");

    return applyOutsideInlineCode(normalized, (htmlSegment) =>
      renderSourceFragment(parse(htmlSegment) as Node),
    );
  });
}

function applyOutsideFencedCode(
  markdown: string,
  transform: (segment: string) => string,
  { normalize = true }: { normalize?: boolean } = {},
) {
  let result = "";
  let segment = "";
  let fence: MarkdownFence | undefined;
  let index = 0;

  while (index < markdown.length) {
    const lineEnd = markdown.indexOf("\n", index);
    const nextIndex = lineEnd === -1 ? markdown.length : lineEnd + 1;
    const line = markdown.slice(index, nextIndex);

    if (fence) {
      result += line;

      if (isClosingFence(line, fence)) {
        fence = undefined;
      }
    } else {
      const openingFence = getOpeningFence(line);

      if (openingFence) {
        result += transformMarkdownSegment(segment);
        segment = "";
        result += line;
        fence = openingFence;
      } else {
        segment += line;
      }
    }

    index = nextIndex;
  }

  result += transformMarkdownSegment(segment);
  return normalize ? result.trim() : result;

  function transformMarkdownSegment(segment: string) {
    const transformed = transform(segment);
    return normalize ? normalizeMarkdownSegment(transformed) : transformed;
  }
}

type MarkdownFence = {
  character: "`" | "~";
  length: number;
};

function getOpeningFence(line: string): MarkdownFence | undefined {
  const leadingSpaces = countLeadingSpaces(line);
  if (leadingSpaces > 3) {
    return undefined;
  }

  const character = line[leadingSpaces];
  if (character !== "`" && character !== "~") {
    return undefined;
  }

  const length = countFenceCharacters(line, leadingSpaces, character);
  return length >= 3 ? { character, length } : undefined;
}

function isClosingFence(line: string, fence: MarkdownFence) {
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

function renderSourceFragment(
  node: Node,
  { insidePre = false }: { insidePre?: boolean } = {},
): string {
  if (node.type === TEXT_NODE) {
    return (node as TextNode).value;
  }

  if (node.type !== ELEMENT_NODE && !("children" in node)) {
    return "";
  }

  const element = node as ElementNode;
  const name = element.name?.toLowerCase();
  const childOptions = { insidePre: insidePre || name === "pre" };

  if (
    name &&
    [
      "script",
      "style",
      "button",
      "svg",
      "iframe",
      "object",
      "embed",
      "noscript",
    ].includes(name)
  ) {
    return "";
  }

  if (name === "br") {
    return "\n";
  }

  if (name === "a") {
    const text = renderSourceChildren(element, childOptions)
      .replace(/\s+/g, " ")
      .trim();
    const href = element.attributes.href;
    return href ? `[${text}](${href})` : text;
  }

  if (name === "code" && !insidePre) {
    return `\`${getTextContent(element).trim()}\``;
  }

  return renderSourceChildren(element, childOptions);
}

function renderSourceChildren(
  node: Node,
  options: { insidePre?: boolean } = {},
): string {
  if (!("children" in node)) {
    return "";
  }

  return (node.children as Node[])
    .map((child) => renderSourceFragment(child, options))
    .join("");
}

function htmlToMarkdown(
  html: string,
  {
    context,
    currentPageId,
  }: {
    context: Pick<APIContext, "site" | "url">;
    currentPageId: string;
  },
) {
  const root = parse(html) as Node;
  return normalizeMarkdownOutsideFencedCode(
    renderChildren(root, { context, currentPageId }),
  );
}

function renderChildren(
  node: Node,
  options: {
    context: Pick<APIContext, "site" | "url">;
    currentPageId: string;
  },
) {
  if (!("children" in node)) {
    return "";
  }

  return (node.children as Node[])
    .map((child) => renderNode(child, options))
    .join("");
}

function renderInlineChildren(
  node: Node,
  options: {
    context: Pick<APIContext, "site" | "url">;
    currentPageId: string;
  },
) {
  return renderChildren(node, options).replace(/\s+/g, " ").trim();
}

function renderNode(
  node: Node,
  options: {
    context: Pick<APIContext, "site" | "url">;
    currentPageId: string;
  },
): string {
  if (node.type === TEXT_NODE) {
    return (node as TextNode).value;
  }

  if (node.type !== ELEMENT_NODE) {
    return "";
  }

  const element = node as ElementNode;
  const name = element.name.toLowerCase();

  if (
    [
      "script",
      "style",
      "button",
      "svg",
      "iframe",
      "object",
      "embed",
      "noscript",
    ].includes(name)
  ) {
    return "";
  }

  if (name.match(/^h[1-6]$/)) {
    const level = Number(name[1]);
    return `\n\n${"#".repeat(level)} ${renderInlineChildren(element, options)}\n\n`;
  }

  if (name === "p") {
    return `\n\n${renderInlineChildren(element, options)}\n\n`;
  }

  if (name === "a") {
    const text = renderInlineChildren(element, options);
    const href = element.attributes.href;
    if (!href) {
      return text;
    }
    return `[${text}](${rewriteDocsUrl(href, options.context, options.currentPageId)})`;
  }

  if (name === "strong" || name === "b") {
    return `**${renderInlineChildren(element, options)}**`;
  }

  if (name === "em" || name === "i") {
    return `_${renderInlineChildren(element, options)}_`;
  }

  if (name === "code") {
    return `\`${renderInlineChildren(element, options)}\``;
  }

  if (name === "pre") {
    const codeElement = element.children.find(
      (child): child is ElementNode =>
        child.type === ELEMENT_NODE && child.name.toLowerCase() === "code",
    );
    const language = getCodeLanguage(codeElement);
    const code = codeElement
      ? getDecodedTextContent(codeElement)
      : getDecodedTextContent(element);
    return `\n\n\`\`\`${language}\n${code.replace(/\n+$/, "")}\n\`\`\`\n\n`;
  }

  if (name === "br") {
    return "\n";
  }

  if (name === "ul" || name === "ol") {
    const ordered = name === "ol";
    const items = element.children.filter(
      (child): child is ElementNode =>
        child.type === ELEMENT_NODE && child.name.toLowerCase() === "li",
    );
    return `\n${items
      .map((item, index) => {
        const prefix = ordered ? `${index + 1}. ` : "- ";
        return renderListItem(item, prefix, options);
      })
      .join("\n")}\n\n`;
  }

  if (name === "blockquote") {
    const content = normalizeMarkdownOutsideFencedCode(
      renderChildren(element, options),
    );
    return `\n\n${content
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n")}\n\n`;
  }

  if (name === "img") {
    const src = element.attributes.src;
    if (!src) {
      return "";
    }
    const alt = element.attributes.alt ?? "";
    return `![${alt}](${rewriteDocsUrl(src, options.context, options.currentPageId)})`;
  }

  if (name === "table") {
    return renderTable(element, options);
  }

  return renderChildren(element, options);
}

function renderListItem(
  item: ElementNode,
  prefix: string,
  options: {
    context: Pick<APIContext, "site" | "url">;
    currentPageId: string;
  },
) {
  const content = normalizeMarkdownOutsideFencedCode(
    renderChildren(item, options),
  );
  const [firstLine = "", ...remainingLines] = content.split("\n");
  const continuation = remainingLines
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n");

  return continuation
    ? `${prefix}${firstLine}\n${continuation}`
    : `${prefix}${firstLine}`;
}

function renderTable(
  table: ElementNode,
  options: {
    context: Pick<APIContext, "site" | "url">;
    currentPageId: string;
  },
) {
  const rows = collectTableRows(table).map((row) =>
    row.children
      .filter(
        (child): child is ElementNode =>
          child.type === ELEMENT_NODE &&
          ["td", "th"].includes(child.name.toLowerCase()),
      )
      .map((cell) => escapeTableCell(renderInlineChildren(cell, options))),
  );

  if (rows.length === 0) {
    return "";
  }

  const [firstRow = [], ...remainingRows] = rows;
  const separator = firstRow.map(() => "---");
  return `\n\n${[firstRow, separator, ...remainingRows]
    .filter((row): row is string[] => Boolean(row))
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n")}\n\n`;
}

function collectTableRows(table: ElementNode): ElementNode[] {
  const rows: ElementNode[] = [];

  collectRowsFromTableSection(table, rows);
  return rows;
}

function collectRowsFromTableSection(
  element: ElementNode,
  rows: ElementNode[],
) {
  for (const child of element.children) {
    if (child.type !== ELEMENT_NODE) {
      continue;
    }

    const name = child.name.toLowerCase();
    if (name === "tr") {
      rows.push(child as ElementNode);
      continue;
    }

    if (["thead", "tbody", "tfoot"].includes(name)) {
      collectRowsFromTableSection(child as ElementNode, rows);
    }
  }
}

function getTextContent(node: Node): string {
  if (node.type === TEXT_NODE) {
    return (node as TextNode).value;
  }
  if (!("children" in node)) {
    return "";
  }
  return node.children.map(getTextContent).join("");
}

function getDecodedTextContent(node: Node): string {
  return decodeHtmlEntities(getTextContent(node));
}

function decodeHtmlEntities(value: string): string {
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

function codePointToString(codePoint: number, fallback: string) {
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function getCodeLanguage(codeElement: ElementNode | undefined) {
  const className = codeElement?.attributes.class ?? "";
  const match = className.match(/(?:^|\s)language-([^\s]+)/);
  return match?.[1] ?? "";
}

function normalizeMarkdown(markdown: string) {
  let result = "";
  let pendingSpaces = "";
  let newlineCount = 0;

  for (const character of markdown) {
    if (character === " " || character === "\t") {
      pendingSpaces += character;
      continue;
    }

    if (character === "\n") {
      pendingSpaces = "";
      newlineCount += 1;
      if (newlineCount <= 2) {
        result += "\n";
      }
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

function normalizeMarkdownOutsideFencedCode(markdown: string) {
  return applyOutsideFencedCode(markdown, (segment) => segment).trim();
}

function normalizeMarkdownSegment(markdown: string) {
  const normalized = normalizeMarkdown(markdown);

  if (!normalized) {
    return "\n".repeat(
      Math.max(
        countBoundaryNewlines(markdown, "start"),
        countBoundaryNewlines(markdown, "end"),
      ),
    );
  }

  const leadingNewlines = countBoundaryNewlines(markdown, "start");
  const trailingNewlines = countBoundaryNewlines(markdown, "end");
  return `${"\n".repeat(leadingNewlines)}${normalized}${"\n".repeat(trailingNewlines)}`;
}

function countBoundaryNewlines(value: string, boundary: "start" | "end") {
  let count = 0;
  const start = boundary === "start" ? 0 : value.length - 1;
  const step = boundary === "start" ? 1 : -1;

  for (let index = start; index >= 0 && index < value.length; index += step) {
    const character = value[index];

    if (character === "\n") {
      count += 1;
      continue;
    }

    if (character !== " " && character !== "\t" && character !== "\r") {
      break;
    }
  }

  return Math.min(count, 2);
}

function escapeTableCell(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}
