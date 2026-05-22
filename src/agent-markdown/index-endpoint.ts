import type { APIContext } from "astro";
import {
  getMarkdownPageById,
  getMarkdownPageFromProps,
  getMarkdownStaticPaths,
  renderMarkdownResponse,
} from "./utils";

export const prerender = true;

export async function getStaticPaths() {
  return getMarkdownStaticPaths({ includeRoot: true });
}

export async function GET(context: APIContext) {
  const page =
    getMarkdownPageFromProps(context) ?? (await getMarkdownPageById(""));

  if (!page) {
    return new Response(null, { status: 404 });
  }

  return renderMarkdownResponse(context, page);
}
