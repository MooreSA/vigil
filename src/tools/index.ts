import type { Tool } from '@openai/agents';
import type { MemoryService } from '../services/memory.js';
import type { JobService } from '../services/jobs.js';
import type { Logger } from '../logger.js';
import { createRememberTool } from './remember.js';
import { createRecallTool } from './recall.js';
import { createDatetimeTool } from './datetime.js';
import { createFetchUrlTool } from './fetch-url.js';
import { createDirectionsTool } from './directions.js';
import { createListJobsTool, createCreateJobTool, createUpdateJobTool, createDeleteJobTool } from './jobs.js';

interface ToolsDeps {
  memoryService: MemoryService;
  jobService: JobService;
  logger: Logger;
  googleMapsApiKey?: string;
}

export function createTools({ memoryService, jobService, logger, googleMapsApiKey }: ToolsDeps): Tool[] {
  const tools: Tool[] = [
    createRememberTool(memoryService, logger),
    createRecallTool(memoryService, logger),
    createDatetimeTool(logger),
    createFetchUrlTool(logger),
    createListJobsTool(jobService, logger),
    createCreateJobTool(jobService, logger),
    createUpdateJobTool(jobService, logger),
    createDeleteJobTool(jobService, logger),
  ];

  if (googleMapsApiKey) {
    tools.push(createDirectionsTool(googleMapsApiKey, logger));
  }

  logger.info({ tools: tools.map((t) => t.name) }, 'Registered %d tools', tools.length);

  return tools;
}
