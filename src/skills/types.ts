import type { z } from 'zod';
import type { Logger } from '../logger.js';

export interface SkillContext {
  job: { id: string; name: string; skill_config: Record<string, unknown> | null };
  logger: Logger;
  signal: AbortSignal;
}

export interface SkillResult {
  success: boolean;
  message: string;
  disableJob?: boolean;
}

export interface Skill {
  name: string;
  description: string;
  configSchema: z.ZodType;
  execute(context: SkillContext): Promise<SkillResult>;
}

export type SkillRegistry = Map<string, Skill>;
