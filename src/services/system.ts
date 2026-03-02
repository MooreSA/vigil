import os from 'node:os';
import type { LogBuffer, LogEntry } from './log-buffer.js';

interface SystemServiceDeps {
  logBuffer: LogBuffer;
}

export class SystemService {
  private readonly logBuffer: LogBuffer;

  constructor({ logBuffer }: SystemServiceDeps) {
    this.logBuffer = logBuffer;
  }

  getLogs(options?: { level?: number; limit?: number; service?: string }): LogEntry[] {
    return this.logBuffer.getEntries(options);
  }

  subscribeLogs(callback: (entry: LogEntry) => void): () => void {
    return this.logBuffer.onEntry(callback);
  }

  getStats() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpus = os.cpus();
    const loadavg = os.loadavg();

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        usagePercent: ((totalMem - freeMem) / totalMem) * 100,
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model ?? 'unknown',
        loadAvg: {
          '1m': loadavg[0],
          '5m': loadavg[1],
          '15m': loadavg[2],
        },
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
      },
    };
  }
}
