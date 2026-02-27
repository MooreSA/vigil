import { tool } from '@openai/agents';
import { z } from 'zod';
import type { Logger } from '../logger.js';

const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

interface DirectionsInput {
  origin: string;
  destination: string;
  departure_time?: string;
  arrival_time?: string;
}

export async function getDirections(
  input: DirectionsInput,
  apiKey: string,
  logger: Logger,
): Promise<string> {
  const { origin, destination, departure_time, arrival_time } = input;
  logger.info({ tool: 'directions', origin, destination, departure_time, arrival_time }, 'Tool called: directions');

  try {
    const params = new URLSearchParams({
      origin,
      destination,
      key: apiKey,
    });

    if (arrival_time) {
      const epoch = toEpochSeconds(arrival_time);
      if (!epoch) return `Invalid arrival_time: "${arrival_time}". Use ISO 8601 format (e.g. 2026-02-27T16:45:00).`;
      params.set('arrival_time', String(epoch));
    } else if (departure_time) {
      const epoch = toEpochSeconds(departure_time);
      if (!epoch) return `Invalid departure_time: "${departure_time}". Use ISO 8601 format (e.g. 2026-02-27T16:45:00).`;
      params.set('departure_time', String(epoch));
    } else {
      params.set('departure_time', 'now');
    }

    const response = await fetch(`${DIRECTIONS_URL}?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return `Directions API error: HTTP ${response.status}`;
    }

    const data = (await response.json()) as DirectionsResponse;

    if (data.status !== 'OK') {
      return `No route found: ${data.status}`;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const lines = [
      `${leg.start_address} → ${leg.end_address}`,
      `Distance: ${leg.distance.text}`,
      `Duration: ${leg.duration.text}`,
    ];

    if (leg.duration_in_traffic) {
      lines.push(`Duration in current traffic: ${leg.duration_in_traffic.text}`);
    }

    if (arrival_time) {
      const durationSecs = leg.duration_in_traffic?.value ?? leg.duration.value;
      const arrivalEpoch = toEpochSeconds(arrival_time)!;
      const leaveBy = new Date((arrivalEpoch - durationSecs) * 1000);
      lines.push(`Leave by: ${leaveBy.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
    }

    lines.push(`Via: ${route.summary}`);

    logger.info(
      { tool: 'directions', origin, destination, duration: leg.duration.text },
      'Tool completed: directions',
    );

    return lines.join('\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ tool: 'directions', origin, destination, err: message }, 'directions failed');
    return `Failed to get directions: ${message}`;
  }
}

function toEpochSeconds(iso: string): number | null {
  const ms = Date.parse(iso);
  if (isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

export function createDirectionsTool(apiKey: string, logger: Logger) {
  return tool({
    name: 'directions',
    description:
      'Get driving directions between two locations, including distance and estimated travel time. Supports departure_time ("leave at") and arrival_time ("arrive by") to plan around schedules. Use current_datetime first to determine today\'s date when constructing timestamps.',
    parameters: z.object({
      origin: z.string().describe('Starting location (address, place name, or lat,lng).'),
      destination: z.string().describe('Destination (address, place name, or lat,lng).'),
      departure_time: z.string().optional().describe('When to leave, ISO 8601 (e.g. "2026-02-27T17:00:00"). Omit for current time. Cannot be used with arrival_time.'),
      arrival_time: z.string().optional().describe('When you need to arrive by, ISO 8601 (e.g. "2026-02-27T16:45:00"). The tool will calculate when to leave. Cannot be used with departure_time.'),
    }),
    execute: async (args) => getDirections(args, apiKey, logger),
  });
}

interface DirectionsResponse {
  status: string;
  routes: Array<{
    summary: string;
    legs: Array<{
      start_address: string;
      end_address: string;
      distance: { text: string; value: number };
      duration: { text: string; value: number };
      duration_in_traffic?: { text: string; value: number };
    }>;
  }>;
}
