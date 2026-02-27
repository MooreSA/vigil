import { z } from 'zod';
import type { Logger } from '../logger.js';
import type { NotificationService } from '../services/notifications.js';
import { fetchDirections } from '../services/directions.js';
import type { Skill, SkillContext, SkillResult } from './types.js';

export const DepartureCheckConfigV1 = z.object({
  version: z.literal(1),
  origin: z.string(),
  destination: z.string(),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/),
  leadMinutes: z.number().int().min(1).max(60).default(7),
  pollIntervalMinutes: z.number().int().min(1).max(30).default(5),
});

type DepartureCheckConfig = z.infer<typeof DepartureCheckConfigV1>;

interface DepartureCheckDeps {
  notificationService: NotificationService;
  logger: Logger;
  googleMapsApiKey: string;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export class DepartureCheckSkill implements Skill {
  name = 'departure-check';
  description = 'Polls traffic and sends a notification when it\'s time to leave.';
  configSchema = DepartureCheckConfigV1;

  private notificationService: NotificationService;
  private logger: Logger;
  private googleMapsApiKey: string;

  constructor(deps: DepartureCheckDeps) {
    this.notificationService = deps.notificationService;
    this.logger = deps.logger;
    this.googleMapsApiKey = deps.googleMapsApiKey;
  }

  async execute(context: SkillContext): Promise<SkillResult> {
    const parsed = DepartureCheckConfigV1.safeParse(context.job.skill_config);
    if (!parsed.success) {
      return { success: false, message: `Invalid skill_config: ${parsed.error.message}` };
    }

    const config: DepartureCheckConfig = parsed.data;
    const pollMs = config.pollIntervalMinutes * 60 * 1000;

    while (!context.signal.aborted) {
      const now = new Date();

      // Construct today's arrival time
      const [hours, minutes] = config.arrivalTime.split(':');
      const arrivalDate = new Date(now);
      arrivalDate.setHours(Number(hours), Number(minutes), 0, 0);

      // Past arrival time — stop checking
      if (now >= arrivalDate) {
        context.logger.info({ jobId: context.job.id }, 'Past arrival time, disabling');
        return { success: true, message: 'Past arrival time', disableJob: true };
      }

      try {
        const arrivalIso = arrivalDate.toISOString();
        const result = await fetchDirections(
          { origin: config.origin, destination: config.destination, arrival_time: arrivalIso },
          this.googleMapsApiKey,
        );

        const durationSecs = result.durationInTraffic?.value ?? result.duration.value;
        const leaveBy = new Date(arrivalDate.getTime() - durationSecs * 1000);
        const leadMs = config.leadMinutes * 60 * 1000;

        context.logger.info(
          { jobId: context.job.id, leaveBy: leaveBy.toISOString(), durationMin: Math.round(durationSecs / 60) },
          'Departure check result',
        );

        if (leaveBy.getTime() <= now.getTime() + leadMs) {
          const durationMin = Math.round(durationSecs / 60);
          await this.notificationService.notify({
            title: 'Time to leave',
            body: `Leave for daycare — ~${durationMin} min drive via ${result.routeSummary}`,
            tag: 'car',
          });
          return {
            success: true,
            message: `Notification sent — leave by ${leaveBy.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
            disableJob: true,
          };
        }

        context.logger.info(
          { jobId: context.job.id, nextCheckIn: `${config.pollIntervalMinutes}m` },
          `Not yet — leave by ${leaveBy.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        context.logger.error({ jobId: context.job.id, err: message }, 'Directions API failed, will retry');
      }

      await abortableSleep(pollMs, context.signal);
    }

    return { success: true, message: 'Aborted' };
  }
}
