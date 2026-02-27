import type { MemoryService } from '../services/memory.js';
import type { Logger } from '../logger.js';
import { createRememberTool } from './remember.js';
import { createRecallTool } from './recall.js';
import { createDatetimeTool } from './datetime.js';
import { createFetchUrlTool } from './fetch-url.js';

export function createTools(memoryService: MemoryService, logger: Logger) {
  return [
    createRememberTool(memoryService, logger),
    createRecallTool(memoryService, logger),
    createDatetimeTool(logger),
    createFetchUrlTool(logger),
  ];
}
