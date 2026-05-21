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
    yaml += `url: ${url}\n`;
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
      ).replace(
        /\bhref=(["'])([^"']+)\1/g,
        (match: string, quote: string, url: string) => {
          const rewritten = rewriteDocsUrl(url, context, currentPageId);
          return rewritten === url
            ? match
            : `href=${quote}${rewritten}${quote}`;
        },
      ),
    { normalize: false },
  );
}

function rewriteInlineMarkdownLinks(
  markdown: string,
  context: Pick<APIContext, "site" | "url">,
  currentPageId: string,
) {
  let result = "";
  let index = 0;

  while (index < markdown.length) {
    const linkStart = markdown.indexOf("](", index);
    const codeStart = markdown.indexOf("`", index);

    if (codeStart !== -1 && (linkStart === -1 || codeStart < linkStart)) {
      const tickCount = getBacktickRunLength(markdown, codeStart);
      const codeEnd = findInlineCodeEnd(
        markdown,
        codeStart + tickCount,
        tickCount,
      );
      if (codeEnd !== -1) {
        result += markdown.slice(index, codeEnd);
        index = codeEnd;
        continue;
      }
    }

    if (linkStart === -1) {
      result += markdown.slice(index);
      break;
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
    if (rawUrl.startsWith("/") && isIgnoredPath(rawUrl, "/")) {
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
    if (!existing || existing.entry.id.endsWith("/index")) {
      pageById.set(page.id, page);
    }
  }

  return [...pageById.values()];
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
      .replace(/\{"\s+"\}/g, " ")
      .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_match, text) => {
        return `\`${extractHtmlFragmentText(String(text)).trim()}\``;
      })
      .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs, text) => {
        const href = String(attrs).match(/\bhref=(["'])([^"']+)\1/i)?.[2];
        const label = extractHtmlFragmentText(String(text)).trim();
        return href ? `[${label}](${href})` : label;
      });

    return renderSourceFragment(parse(normalized) as Node);
  });
}

function applyOutsideFencedCode(
  markdown: string,
  transform: (segment: string) => string,
  { normalize = true }: { normalize?: boolean } = {},
) {
  const fencePattern = /^```[\s\S]*?^```/gm;
  let result = "";
  let lastIndex = 0;

  for (const match of markdown.matchAll(fencePattern)) {
    const index = match.index ?? 0;
    result += transform(markdown.slice(lastIndex, index));
    result += match[0];
    lastIndex = index + match[0].length;
  }

  result += transform(markdown.slice(lastIndex));
  return normalize ? normalizeMarkdown(result) : result;
}

function extractHtmlFragmentText(value: string) {
  return getTextContent(parse(value) as Node);
}

function renderSourceFragment(node: Node): string {
  if (node.type === TEXT_NODE) {
    return (node as TextNode).value;
  }

  if (node.type !== ELEMENT_NODE && !("children" in node)) {
    return "";
  }

  const element = node as ElementNode;
  const name = element.name?.toLowerCase();

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
    const text = renderSourceChildren(element).replace(/\s+/g, " ").trim();
    const href = element.attributes.href;
    return href ? `[${text}](${href})` : text;
  }

  if (name === "code" && element.parent?.type !== ELEMENT_NODE) {
    return `\`${getTextContent(element).trim()}\``;
  }

  if (
    name === "code" &&
    (element.parent as ElementNode).name?.toLowerCase() !== "pre"
  ) {
    return `\`${getTextContent(element).trim()}\``;
  }

  return renderSourceChildren(element);
}

function renderSourceChildren(node: Node): string {
  if (!("children" in node)) {
    return "";
  }

  return (node.children as Node[]).map(renderSourceFragment).join("");
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
  return normalizeMarkdown(renderChildren(root, { context, currentPageId }));
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

  if (name === "code" && element.parent?.type !== ELEMENT_NODE) {
    return `\`${renderInlineChildren(element, options)}\``;
  }

  if (
    name === "code" &&
    (element.parent as ElementNode).name?.toLowerCase() !== "pre"
  ) {
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
    const content = normalizeMarkdown(renderChildren(element, options));
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
  const content = normalizeMarkdown(renderChildren(item, options));
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
  return markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeTableCell(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}
