import type { APIContext } from "astro";
import type { MarkdownPage } from "./utils";
import { joinBase, stripBase, toMarkdownPath } from "./path-utils";

interface MarkdownNavNode {
  children: MarkdownNavNode[];
  id: string;
  slug: string;
  sidebar?: SidebarNavData;
  page?: MarkdownPage;
}

interface MarkdownNavigationLink {
  title: string;
  url: string;
}

interface SidebarNavData {
  label?: string;
  order: number;
}

export function buildMarkdownNavigation(
  context: Pick<APIContext, "site" | "url">,
  page: MarkdownPage,
  pages: MarkdownPage[],
  siteBase: string,
  sidebarConfig: unknown[],
) {
  const root = buildMarkdownNavigationTree(pages, sidebarConfig, siteBase);
  const node = findMarkdownNavNode(root, splitPageId(page.id));

  if (!node) {
    return "";
  }

  return buildMarkdownNavigationSection(context, node, siteBase);
}

function buildMarkdownNavigationTree(
  pages: MarkdownPage[],
  sidebarConfig: unknown[],
  siteBase: string,
): MarkdownNavNode {
  const root: MarkdownNavNode = { children: [], id: "", slug: "" };
  const nodeById = new Map<string, MarkdownNavNode>([["", root]]);

  for (const page of pages) {
    const parts = splitPageId(page.id);
    let parent = root;
    let currentId = "";

    if (parts.length === 0) {
      root.page = page;
      continue;
    }

    for (const part of parts) {
      currentId = currentId ? `${currentId}/${part}` : part;
      let node = nodeById.get(currentId);

      if (!node) {
        node = {
          children: [],
          id: currentId,
          slug: part,
        };
        parent.children.push(node);
        nodeById.set(currentId, node);
      }

      parent = node;
    }

    parent.page = page;
  }

  for (const [id, sidebar] of getSidebarNavData(sidebarConfig, siteBase)) {
    const node = nodeById.get(id);
    if (node) {
      node.sidebar = sidebar;
    }
  }

  return root;
}

function splitPageId(id: string) {
  return id ? id.split("/") : [];
}

function findMarkdownNavNode(
  node: MarkdownNavNode,
  pathParts: string[],
): MarkdownNavNode | undefined {
  for (const part of pathParts) {
    const child = node.children.find((candidate) => candidate.slug === part);
    if (!child) {
      return undefined;
    }
    node = child;
  }

  return node;
}

function buildMarkdownNavigationSection(
  context: Pick<APIContext, "site" | "url">,
  node: MarkdownNavNode,
  siteBase: string,
) {
  return renderNavigationSections([
    {
      heading: "Pages in this section",
      items: navLinksFromNodes(
        context,
        getVisibleMarkdownNavChildren(node),
        siteBase,
      ),
    },
  ]);
}

function renderNavigationSections(
  sections: { heading: string; items: MarkdownNavigationLink[] }[],
) {
  return sections
    .filter(({ items }) => items.length > 0)
    .map(
      ({ heading, items }) =>
        `## ${heading}\n\n${items.map(formatNavigationListItem).join("\n")}`,
    )
    .join("\n\n");
}

function formatNavigationListItem({ title, url }: MarkdownNavigationLink) {
  return `- [${escapeMarkdownLinkLabel(title)}](${url})`;
}

function navLinksFromNodes(
  context: Pick<APIContext, "site" | "url">,
  nodes: MarkdownNavNode[],
  siteBase: string,
): MarkdownNavigationLink[] {
  return nodes
    .filter((node): node is MarkdownNavNode & { page: MarkdownPage } =>
      Boolean(node.page),
    )
    .map((node) => ({
      title: getMarkdownNavNodeTitle(node),
      url: getMarkdownPageMarkdownUrl(context, node.page.id, siteBase),
    }));
}

function getVisibleMarkdownNavChildren(node: MarkdownNavNode | undefined) {
  if (!node) {
    return [];
  }

  return node.children
    .filter(isVisibleMarkdownNavNode)
    .sort(compareMarkdownNavNodes);
}

function isVisibleMarkdownNavNode(node: MarkdownNavNode) {
  if (!node.page || !getMarkdownNavNodeTitle(node)) {
    return false;
  }

  const data = getPageData(node.page);
  const sidebar = getSidebarData(node.page);

  return (
    data.draft !== true &&
    data.sidebar_hidden !== true &&
    sidebar?.hidden !== true &&
    !node.id.includes("__v")
  );
}

function compareMarkdownNavNodes(
  nodeA: MarkdownNavNode,
  nodeB: MarkdownNavNode,
) {
  const orderDiff =
    getMarkdownNavNodeOrder(nodeA) - getMarkdownNavNodeOrder(nodeB);
  if (orderDiff !== 0) {
    return orderDiff;
  }

  return nodeA.id.localeCompare(nodeB.id);
}

function getMarkdownNavNodeTitle(node: MarkdownNavNode) {
  if (!node.page) {
    return node.slug;
  }

  const data = getPageData(node.page);
  const sidebar = getSidebarData(node.page);

  return (
    getStringValue(node.sidebar?.label) ??
    getStringValue(data.sidebar_title) ??
    getStringValue(sidebar?.label) ??
    getStringValue(data.title) ??
    node.slug
  );
}

function getMarkdownNavNodeOrder(node: MarkdownNavNode) {
  if (!node.page) {
    return Number.MAX_SAFE_INTEGER;
  }

  const data = getPageData(node.page);
  const sidebar = getSidebarData(node.page);

  return (
    node.sidebar?.order ??
    getNumberValue(data.sidebar_order) ??
    getNumberValue(sidebar?.order) ??
    Number.MAX_SAFE_INTEGER
  );
}

function getPageData(page: MarkdownPage): Record<string, unknown> {
  return page.entry.data as Record<string, unknown>;
}

function getSidebarData(
  page: MarkdownPage,
): Record<string, unknown> | undefined {
  const sidebar = getPageData(page).sidebar;
  return sidebar && typeof sidebar === "object" && !Array.isArray(sidebar)
    ? (sidebar as Record<string, unknown>)
    : undefined;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getMarkdownPageMarkdownUrl(
  context: Pick<APIContext, "site" | "url">,
  id: string,
  siteBase: string,
) {
  const markdownPath = toMarkdownPath(getPagePath(siteBase, id), siteBase);
  return context.site ? new URL(markdownPath, context.site).href : markdownPath;
}

function getPagePath(siteBase: string, id: string) {
  return joinBase(siteBase, id ? `${id}/` : "");
}

function escapeMarkdownLinkLabel(value: string) {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function getSidebarNavData(sidebarConfig: unknown[], siteBase: string) {
  const navData = new Map<string, SidebarNavData>();
  let order = 0;

  visitSidebarItems(sidebarConfig, (item) => {
    const id = getSidebarItemPageId(item, siteBase);
    if (id === undefined || navData.has(id)) {
      return;
    }

    const entry: SidebarNavData = { order };
    const label = getStringValue(item.label);
    if (label) {
      entry.label = label;
    }
    navData.set(id, entry);
    order += 1;
  });

  return navData;
}

function visitSidebarItems(
  items: unknown[],
  visit: (item: Record<string, unknown>) => void,
) {
  for (const item of items) {
    if (typeof item === "string") {
      visit({ slug: item });
      continue;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    visit(record);

    if (Array.isArray(record.items)) {
      visitSidebarItems(record.items, visit);
    }
  }
}

function getSidebarItemPageId(item: Record<string, unknown>, siteBase: string) {
  const slug = getStringValue(item.slug);
  if (slug !== undefined) {
    return normalizeSidebarPageId(slug);
  }

  const link = getStringValue(item.link);
  if (link === undefined) {
    return undefined;
  }

  return pageIdFromSidebarLink(link, siteBase);
}

function pageIdFromSidebarLink(link: string, siteBase: string) {
  if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//")) {
    return undefined;
  }

  const [pathname] = link.split(/[?#]/, 1);
  if (pathname === undefined) {
    return undefined;
  }

  return normalizeSidebarPageId(stripBase(pathname, siteBase));
}

function normalizeSidebarPageId(id: string) {
  const normalized = id
    .replace(/^\/|\/$/g, "")
    .replace(/\.mdx?$/, "")
    .replace(/(?:^|\/)index$/, "");

  return normalized;
}
