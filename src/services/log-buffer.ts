import { Writable } from 'node:stream';
import { EventEmitter } from 'node:events';

export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  [key: string]: unknown;
}

export class LogBuffer extends Writable {
  private entries: LogEntry[] = [];
  private readonly maxSize: number;
  private lineBuffer = '';
  private readonly emitter = new EventEmitter();

  constructor(maxSize = 1000) {
    super();
    this.maxSize = maxSize;
  }

  override _write(chunk: Buffer, _encoding: string, callback: () => void) {
    this.lineBuffer += chunk.toString();
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop()!;

    for (const line of lines) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as LogEntry;
        this.entries.push(entry);
        if (this.entries.length > this.maxSize) {
          this.entries.shift();
        }
        this.emitter.emit('entry', entry);
      } catch {
        // ignore non-JSON lines
      }
    }

    callback();
  }

  getEntries(options?: { level?: number; limit?: number; service?: string }): LogEntry[] {
    let result = this.entries;

    if (options?.level !== undefined) {
      result = result.filter((e) => e.level >= options.level!);
    }

    if (options?.service) {
      const svc = options.service;
      result = result.filter(
        (e) =>
          (e as Record<string, unknown>).service === svc ||
          (e as Record<string, unknown>).handler === svc ||
          (e as Record<string, unknown>).skill === svc,
      );
    }

    if (options?.limit) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  onEntry(callback: (entry: LogEntry) => void): () => void {
    this.emitter.on('entry', callback);
    return () => {
      this.emitter.off('entry', callback);
    };
  }
}
