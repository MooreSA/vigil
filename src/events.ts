import { EventEmitter } from 'node:events';

export type EventBus = EventEmitter;

export function createEventBus(): EventBus {
  return new EventEmitter();
}
