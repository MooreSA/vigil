import { tool } from '@openai/agents';
import { z } from 'zod';
import type { Logger } from '../logger.js';
import { fetchDirections, toEpochSeconds } from '../services/directions.js';

export async function getDirections(
  input: { origin: string; destination: string; departure_time?: string; arrival_time?: string },
  apiKey: string,
  logger: Logger,
): Promise<string> {
  const { origin, destination, departure_time, arrival_time } = input;
  logger.info({ tool: 'directions', origin, destination, departure_time, arrival_time }, 'Tool called: directions');

  try {
    const result = await fetchDirections({ origin, destination, departure_time, arrival_time }, apiKey);

    const lines = [
      `${result.startAddress} → ${result.endAddress}`,
      `Distance: ${result.distance.text}`,
      `Duration: ${result.duration.text}`,
    ];

    if (result.durationInTraffic) {
      lines.push(`Duration in current traffic: ${result.durationInTraffic.text}`);
    }

    if (arrival_time) {
      const durationSecs = result.durationInTraffic?.value ?? result.duration.value;
      const arrivalEpoch = toEpochSeconds(arrival_time)!;
      const leaveBy = new Date((arrivalEpoch - durationSecs) * 1000);
      lines.push(`Leave by: ${leaveBy.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
    }

    lines.push(`Via: ${result.routeSummary}`);

    logger.info(
      { tool: 'directions', origin, destination, duration: result.duration.text },
      'Tool completed: directions',
    );

    return lines.join('\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ tool: 'directions', origin, destination, err: message }, 'directions failed');
    return `Failed to get directions: ${message}`;
  }
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
