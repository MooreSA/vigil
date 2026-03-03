export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  [key: string]: unknown;
}

export interface LogSearchOptions {
  query?: string;
  level?: number;
  minutesAgo?: number;
  limit?: number;
}

export class LogBuffer {
  private entries: (LogEntry | undefined)[];
  private head = 0;
  private count = 0;

  constructor(private readonly capacity: number = 1000) {
    this.entries = new Array(capacity);
  }

  write(msg: string): void {
    try {
      const entry = JSON.parse(msg) as LogEntry;
      this.entries[this.head] = entry;
      this.head = (this.head + 1) % this.capacity;
      if (this.count < this.capacity) this.count++;
    } catch {
      // Skip malformed entries
    }
  }

  search(options: LogSearchOptions = {}): LogEntry[] {
    const { query, level, minutesAgo, limit = 50 } = options;
    const results: LogEntry[] = [];
    const now = Date.now();
    const cutoff = minutesAgo ? now - minutesAgo * 60_000 : 0;

    for (let i = 0; i < this.count && results.length < limit; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      const entry = this.entries[idx]!;

      if (cutoff && entry.time < cutoff) continue;
      if (level !== undefined && entry.level < level) continue;
      if (query && !this.matches(entry, query)) continue;

      results.push(entry);
    }

    return results;
  }

  private matches(entry: LogEntry, query: string): boolean {
    const lower = query.toLowerCase();
    if (entry.msg?.toLowerCase().includes(lower)) return true;
    return JSON.stringify(entry).toLowerCase().includes(lower);
  }
}
