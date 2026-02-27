import type { Logger } from '../logger.js';
import type { NotificationService } from '../services/notifications.js';
import type { SkillRegistry } from './types.js';
import { DepartureCheckSkill } from './departure-check.js';

interface SkillRegistryDeps {
  notificationService: NotificationService;
  logger: Logger;
  googleMapsApiKey?: string;
}

export function createSkillRegistry(deps: SkillRegistryDeps): SkillRegistry {
  const registry: SkillRegistry = new Map();

  if (deps.googleMapsApiKey) {
    const skill = new DepartureCheckSkill({
      notificationService: deps.notificationService,
      googleMapsApiKey: deps.googleMapsApiKey,
    });
    registry.set(skill.name, skill);
  }

  deps.logger.info({ skills: [...registry.keys()] }, 'Registered %d skills', registry.size);

  return registry;
}
