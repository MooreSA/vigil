const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

export interface DirectionsInput {
  origin: string;
  destination: string;
  departure_time?: string;
  arrival_time?: string;
}

export interface DirectionsResult {
  startAddress: string;
  endAddress: string;
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  durationInTraffic?: { text: string; value: number };
  routeSummary: string;
}

export function toEpochSeconds(iso: string): number | null {
  const ms = Date.parse(iso);
  if (isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

export async function fetchDirections(
  input: DirectionsInput,
  apiKey: string,
): Promise<DirectionsResult> {
  const { origin, destination, departure_time, arrival_time } = input;

  const params = new URLSearchParams({
    origin,
    destination,
    key: apiKey,
  });

  if (arrival_time) {
    const epoch = toEpochSeconds(arrival_time);
    if (!epoch) throw new Error(`Invalid arrival_time: "${arrival_time}". Use ISO 8601 format.`);
    params.set('arrival_time', String(epoch));
  } else if (departure_time) {
    const epoch = toEpochSeconds(departure_time);
    if (!epoch) throw new Error(`Invalid departure_time: "${departure_time}". Use ISO 8601 format.`);
    params.set('departure_time', String(epoch));
  } else {
    params.set('departure_time', 'now');
  }

  const response = await fetch(`${DIRECTIONS_URL}?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Directions API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as DirectionsResponse;

  if (data.status !== 'OK') {
    throw new Error(`No route found: ${data.status}`);
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  return {
    startAddress: leg.start_address,
    endAddress: leg.end_address,
    distance: leg.distance,
    duration: leg.duration,
    durationInTraffic: leg.duration_in_traffic,
    routeSummary: route.summary,
  };
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
