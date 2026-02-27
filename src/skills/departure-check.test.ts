import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { DepartureCheckSkill } from './departure-check.js';
import type { NotificationService } from '../services/notifications.js';
import type { DirectionsResult } from '../services/directions.js';
import type { SkillContext } from './types.js';

vi.mock('../services/directions.js', () => ({
  fetchDirections: vi.fn(),
}));

import { fetchDirections } from '../services/directions.js';

const logger = pino({ level: 'silent' });
const mockedFetchDirections = vi.mocked(fetchDirections);

function mockNotificationService(): NotificationService {
  return { notify: vi.fn() } as unknown as NotificationService;
}

/** Create an AbortController that aborts after the first fetchDirections call. */
function abortAfterFirstCheck(): AbortController {
  const controller = new AbortController();
  const original = mockedFetchDirections.getMockImplementation();
  mockedFetchDirections.mockImplementation(async (...args) => {
    const result = original ? await original(...args) : directionsResult(0);
    controller.abort();
    return result;
  });
  return controller;
}

function makeContext(overrides?: Partial<SkillContext['job']>, signal?: AbortSignal): SkillContext {
  return {
    job: {
      id: '1',
      name: 'Daycare departure',
      skill_config: {
        version: 1,
        origin: '123 Home St',
        destination: '456 Daycare Ave',
        arrivalTime: '16:45',
        leadMinutes: 7,
        pollIntervalMinutes: 1,
      },
      ...overrides,
    },
    logger,
    signal: signal ?? AbortSignal.abort(),
  };
}

function directionsResult(durationSecs: number, traffic?: number): DirectionsResult {
  return {
    startAddress: '123 Home St',
    endAddress: '456 Daycare Ave',
    distance: { text: '15 mi', value: 24000 },
    duration: { text: `${Math.round(durationSecs / 60)} mins`, value: durationSecs },
    durationInTraffic: traffic
      ? { text: `${Math.round(traffic / 60)} mins`, value: traffic }
      : undefined,
    routeSummary: 'I-5 S',
  };
}

let notificationService: ReturnType<typeof mockNotificationService>;
let skill: DepartureCheckSkill;

beforeEach(() => {
  vi.useFakeTimers();
  notificationService = mockNotificationService();
  skill = new DepartureCheckSkill({
    notificationService,
    logger,
    googleMapsApiKey: 'test-key',
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DepartureCheckSkill', () => {
  it('returns failure for invalid skill_config', async () => {
    const ctx = makeContext();
    ctx.job.skill_config = { bad: 'config' };

    const result = await skill.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid skill_config');
  });

  it('disables job when past arrival time', async () => {
    // Set current time to 17:00, arrival is 16:45
    vi.setSystemTime(new Date('2026-02-27T17:00:00'));

    const controller = new AbortController();
    const result = await skill.execute(makeContext(undefined, controller.signal));

    expect(result).toEqual({
      success: true,
      message: 'Past arrival time',
      disableJob: true,
    });
    expect(mockedFetchDirections).not.toHaveBeenCalled();
  });

  it('sends notification and disables job when it is time to leave', async () => {
    // Arrival at 16:45, drive is 25 min (1500s), so leave by ~16:20
    // Set now to 16:15, leadMinutes=7 → leaveBy (16:20) <= now (16:15) + 7min (16:22) → true
    vi.setSystemTime(new Date('2026-02-27T16:15:00'));
    mockedFetchDirections.mockResolvedValue(directionsResult(1500));

    const controller = new AbortController();
    const result = await skill.execute(makeContext(undefined, controller.signal));

    expect(result.success).toBe(true);
    expect(result.disableJob).toBe(true);
    expect(result.message).toContain('Notification sent');
    expect(notificationService.notify).toHaveBeenCalledWith({
      title: 'Time to leave',
      body: 'Leave now — ~25 min drive via I-5 S',
      tag: 'car',
    });
  });

  it('uses durationInTraffic when available', async () => {
    // Duration is 18min but traffic says 30min (1800s) → leave by 16:15
    // Set now to 16:10, lead=7 → leaveBy (16:15) <= 16:10+7min (16:17) → true
    vi.setSystemTime(new Date('2026-02-27T16:10:00'));
    mockedFetchDirections.mockResolvedValue(directionsResult(1080, 1800));

    const controller = new AbortController();
    const result = await skill.execute(makeContext(undefined, controller.signal));

    expect(result.success).toBe(true);
    expect(result.disableJob).toBe(true);
    expect(notificationService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Leave now — ~30 min drive via I-5 S',
      }),
    );
  });

  it('polls and exits via abort when departure is not imminent', async () => {
    // Arrival 16:45, drive 18min (1080s) → leave by ~16:27
    // Set now to 15:00, lead=7 → leaveBy (16:27) > 15:00+7min (15:07) → not yet
    vi.setSystemTime(new Date('2026-02-27T15:00:00'));
    mockedFetchDirections.mockResolvedValue(directionsResult(1080));
    const controller = abortAfterFirstCheck();

    const result = await skill.execute(makeContext(undefined, controller.signal));

    expect(result.success).toBe(true);
    expect(result.message).toBe('Aborted');
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('retries on directions API failure instead of returning', async () => {
    vi.setSystemTime(new Date('2026-02-27T15:00:00'));
    const controller = new AbortController();
    mockedFetchDirections.mockImplementation(async () => {
      controller.abort();
      throw new Error('Network timeout');
    });

    const result = await skill.execute(makeContext(undefined, controller.signal));

    // Skill doesn't fail — it logs the error and exits via abort
    expect(result.success).toBe(true);
    expect(result.message).toBe('Aborted');
  });

  it('applies default leadMinutes when not provided', async () => {
    // Arrival 16:45, drive 25min (1500s) → leave by 16:20
    // Now = 16:14, default lead = 7min → leaveBy (16:20) <= 16:14+7 (16:21) → true
    vi.setSystemTime(new Date('2026-02-27T16:14:00'));
    mockedFetchDirections.mockResolvedValue(directionsResult(1500));

    const controller = new AbortController();
    const ctx = makeContext(undefined, controller.signal);
    (ctx.job.skill_config as Record<string, unknown>).leadMinutes = undefined;
    delete (ctx.job.skill_config as Record<string, unknown>).leadMinutes;

    const result = await skill.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.disableJob).toBe(true);
  });

  it('passes correct origin/destination/arrival to fetchDirections', async () => {
    vi.setSystemTime(new Date('2026-02-27T15:00:00'));
    mockedFetchDirections.mockResolvedValue(directionsResult(1080));
    const controller = abortAfterFirstCheck();

    await skill.execute(makeContext(undefined, controller.signal));

    expect(mockedFetchDirections).toHaveBeenCalledWith(
      {
        origin: '123 Home St',
        destination: '456 Daycare Ave',
        arrival_time: expect.stringContaining('2026-02-27'),
      },
      'test-key',
    );
  });
});
