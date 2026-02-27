import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUrl, extractAsMarkdown } from './fetch-url.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function mockResponse(body: string, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
  return new Response(body, {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    headers: { 'content-type': 'text/html', ...init?.headers },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('extractAsMarkdown', () => {
  it('extracts article content with links preserved', () => {
    const html = `<html><head><title>Test Article</title></head><body>
      <article>
        <h1>Test Article</h1>
        <p>This is a paragraph with a <a href="https://example.com/page">link</a>.</p>
        <p>Another paragraph here.</p>
      </article>
    </body></html>`;

    const result = extractAsMarkdown(html, 'https://example.com');

    expect(result).toContain('[link](https://example.com/page)');
    expect(result).toContain('This is a paragraph');
  });

  it('includes article title as heading', () => {
    const html = `<html><head><title>My Title</title></head><body>
      <article><h1>My Title</h1><p>Content here with enough words to pass readability threshold for extraction.</p>
      <p>More content to make the article long enough for readability to consider it valid article content.</p>
      <p>Even more content because readability needs a reasonable amount of text to extract.</p></article>
    </body></html>`;

    const result = extractAsMarkdown(html, 'https://example.com');

    expect(result).toContain('# My Title');
  });

  it('falls back to body text when readability cannot extract article', () => {
    const html = `<html><body><p>Just some text</p></body></html>`;

    const result = extractAsMarkdown(html, 'https://example.com');

    expect(result).toContain('Just some text');
  });

  it('returns empty string for blank pages', () => {
    const result = extractAsMarkdown('<html><body></body></html>', 'https://example.com');

    expect(result).toBe('');
  });
});

describe('fetchUrl', () => {
  it('returns error message on HTTP failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse('', { status: 404, statusText: 'Not Found' }),
    );

    const result = await fetchUrl('https://example.com/missing', logger);

    expect(result).toBe('Failed to fetch URL: HTTP 404 Not Found');
  });

  it('rejects non-text content types', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse('binary', { headers: { 'content-type': 'image/png' } }),
    );

    const result = await fetchUrl('https://example.com/image.png', logger);

    expect(result).toContain('Cannot read this content type: image/png');
  });

  it('allows application/json content type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse('{"key": "value"}', { headers: { 'content-type': 'application/json' } }),
    );

    const result = await fetchUrl('https://example.com/api', logger);

    expect(result).not.toContain('Cannot read');
  });

  it('truncates content exceeding max length', async () => {
    const longContent = `<html><body><article><p>${'a'.repeat(25_000)}</p></article></body></html>`;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(longContent));

    const result = await fetchUrl('https://example.com', logger);

    expect(result).toContain('[Content truncated]');
  });

  it('returns error message on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await fetchUrl('https://example.com', logger);

    expect(result).toBe('Failed to fetch URL: ECONNREFUSED');
  });

  it('returns empty content message for blank pages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse('<html><body></body></html>'));

    const result = await fetchUrl('https://example.com', logger);

    expect(result).toBe('Page returned no readable content.');
  });
});
