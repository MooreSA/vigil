import { tool } from '@openai/agents';
import { z } from 'zod';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import type { Logger } from '../logger.js';

const MAX_CONTENT_LENGTH = 20_000;
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export async function fetchUrl(url: string, logger: Logger): Promise<string> {
  logger.info({ tool: 'fetch_url', url }, 'Tool called: fetch_url');

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Vigil/1.0' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/') && !contentType.includes('application/json')) {
      return `Cannot read this content type: ${contentType}`;
    }

    const html = await response.text();
    let text = extractAsMarkdown(html, url);

    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated]';
    }

    logger.info({ tool: 'fetch_url', url, length: text.length }, 'Tool completed: fetch_url');
    return text || 'Page returned no readable content.';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ tool: 'fetch_url', url, err: message }, 'fetch_url failed');
    return `Failed to fetch URL: ${message}`;
  }
}

export function createFetchUrlTool(logger: Logger) {
  return tool({
    name: 'fetch_url',
    description:
      'Fetch the content of a web page as Markdown. Uses Mozilla Readability to extract the main article content, stripping navigation, ads, and other clutter. Preserves links, headings, and structure. Useful for reading articles, documentation, or any public web page.',
    parameters: z.object({
      url: z.url().describe('The URL to fetch.'),
    }),
    execute: async ({ url }) => fetchUrl(url, logger),
  });
}

export function extractAsMarkdown(html: string, url: string): string {
  const { document } = parseHTML(html);
  Object.defineProperty(document, 'documentURI', { value: url });
  const reader = new Readability(document);
  const article = reader.parse();

  if (article?.content) {
    const title = article.title ? `# ${article.title}\n\n` : '';
    return title + turndown.turndown(article.content);
  }

  // Fallback: convert full body HTML to markdown
  const bodyHtml = document.body?.innerHTML ?? '';
  return bodyHtml ? turndown.turndown(bodyHtml) : '';
}
