import type { APIContext } from "astro";
import {
  getMarkdownPageById,
  getMarkdownPageFromProps,
  getMarkdownStaticPaths,
  renderMarkdownResponse,
} from "./utils";

export const prerender = true;

export async function getStaticPaths() {
  return getMarkdownStaticPaths({ includeRoot: false });
}

export async function GET(context: APIContext) {
  const slug = context.params.slug;
  const page =
    getMarkdownPageFromProps(context) ??
    (slug ? await getMarkdownPageById(slug) : undefined);

  if (!page) {
    return new Response(null, { status: 404 });
  }

  return renderMarkdownResponse(context, page);
}
