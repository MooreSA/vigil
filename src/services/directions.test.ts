import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDirections, toEpochSeconds } from './directions.js';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function okResponse(leg: Record<string, unknown>, summary = 'I-5 S') {
  return new Response(
    JSON.stringify({
      status: 'OK',
      routes: [{ summary, legs: [leg] }],
    }),
    { status: 200 },
  );
}

const baseLeg = {
  start_address: '123 Home St',
  end_address: '456 Daycare Ave',
  distance: { text: '15.2 mi', value: 24462 },
  duration: { text: '18 mins', value: 1080 },
};

describe('toEpochSeconds', () => {
  it('converts valid ISO 8601 to epoch seconds', () => {
    const expected = Math.floor(Date.parse('2026-02-27T16:45:00Z') / 1000);
    expect(toEpochSeconds('2026-02-27T16:45:00Z')).toBe(expected);
  });

  it('returns null for invalid strings', () => {
    expect(toEpochSeconds('not-a-date')).toBeNull();
  });
});

describe('fetchDirections', () => {
  it('returns structured result for a basic request', async () => {
    fetchSpy.mockResolvedValue(okResponse(baseLeg));

    const result = await fetchDirections(
      { origin: 'Home', destination: 'Daycare' },
      'test-key',
    );

    expect(result).toEqual({
      startAddress: '123 Home St',
      endAddress: '456 Daycare Ave',
      distance: { text: '15.2 mi', value: 24462 },
      duration: { text: '18 mins', value: 1080 },
      durationInTraffic: undefined,
      routeSummary: 'I-5 S',
    });
  });

  it('includes durationInTraffic when present', async () => {
    fetchSpy.mockResolvedValue(
      okResponse({
        ...baseLeg,
        duration_in_traffic: { text: '25 mins', value: 1500 },
      }),
    );

    const result = await fetchDirections(
      { origin: 'Home', destination: 'Daycare' },
      'test-key',
    );

    expect(result.durationInTraffic).toEqual({ text: '25 mins', value: 1500 });
  });

  it('sets departure_time=now when no time params given', async () => {
    fetchSpy.mockResolvedValue(okResponse(baseLeg));

    await fetchDirections({ origin: 'A', destination: 'B' }, 'key');

    const url = new URL(fetchSpy.mock.calls[0][0]);
    expect(url.searchParams.get('departure_time')).toBe('now');
  });

  it('converts arrival_time to epoch seconds', async () => {
    fetchSpy.mockResolvedValue(okResponse(baseLeg));
    const iso = '2026-02-27T16:45:00Z';

    await fetchDirections(
      { origin: 'A', destination: 'B', arrival_time: iso },
      'key',
    );

    const expected = String(Math.floor(Date.parse(iso) / 1000));
    const url = new URL(fetchSpy.mock.calls[0][0]);
    expect(url.searchParams.get('arrival_time')).toBe(expected);
    expect(url.searchParams.has('departure_time')).toBe(false);
  });

  it('converts departure_time to epoch seconds', async () => {
    fetchSpy.mockResolvedValue(okResponse(baseLeg));
    const iso = '2026-02-27T16:00:00Z';

    await fetchDirections(
      { origin: 'A', destination: 'B', departure_time: iso },
      'key',
    );

    const expected = String(Math.floor(Date.parse(iso) / 1000));
    const url = new URL(fetchSpy.mock.calls[0][0]);
    expect(url.searchParams.get('departure_time')).toBe(expected);
  });

  it('throws on invalid arrival_time', async () => {
    await expect(
      fetchDirections({ origin: 'A', destination: 'B', arrival_time: 'bad' }, 'key'),
    ).rejects.toThrow('Invalid arrival_time');
  });

  it('throws on invalid departure_time', async () => {
    await expect(
      fetchDirections({ origin: 'A', destination: 'B', departure_time: 'bad' }, 'key'),
    ).rejects.toThrow('Invalid departure_time');
  });

  it('throws on non-OK HTTP response', async () => {
    fetchSpy.mockResolvedValue(new Response('error', { status: 500 }));

    await expect(
      fetchDirections({ origin: 'A', destination: 'B' }, 'key'),
    ).rejects.toThrow('HTTP 500');
  });

  it('throws on non-OK API status', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: 'ZERO_RESULTS', routes: [] }), { status: 200 }),
    );

    await expect(
      fetchDirections({ origin: 'A', destination: 'B' }, 'key'),
    ).rejects.toThrow('No route found: ZERO_RESULTS');
  });

  it('passes API key in query params', async () => {
    fetchSpy.mockResolvedValue(okResponse(baseLeg));

    await fetchDirections({ origin: 'A', destination: 'B' }, 'my-secret-key');

    const url = new URL(fetchSpy.mock.calls[0][0]);
    expect(url.searchParams.get('key')).toBe('my-secret-key');
  });
});
