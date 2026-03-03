export interface Thread {
  id: string;
  title: string | null;
  source: string;
  job_run_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  model: string | null;
  content: Record<string, unknown>;
  created_at: string;
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export async function fetchThreads(): Promise<Thread[]> {
  const res = await fetch('/v1/threads');
  if (!res.ok) throw new Error(`Failed to fetch threads: ${res.status}`);
  return res.json();
}

export async function fetchArchivedThreads(): Promise<Thread[]> {
  const res = await fetch('/v1/threads/archived');
  if (!res.ok) throw new Error(`Failed to fetch archived threads: ${res.status}`);
  return res.json();
}

export async function archiveThread(id: string): Promise<Thread> {
  const res = await fetch(`/v1/threads/${id}/archive`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to archive thread: ${res.status}`);
  return res.json();
}

export async function unarchiveThread(id: string): Promise<Thread> {
  const res = await fetch(`/v1/threads/${id}/unarchive`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to unarchive thread: ${res.status}`);
  return res.json();
}

export async function fetchThread(id: string): Promise<{ thread: Thread; messages: Message[] }> {
  const res = await fetch(`/v1/threads/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch thread: ${res.status}`);
  return res.json();
}

export async function fetchUserProfile(): Promise<{ content: string }> {
  const res = await fetch('/v1/user-profile');
  if (!res.ok) throw new Error(`Failed to fetch user profile: ${res.status}`);
  return res.json();
}

export async function updateUserProfile(content: string): Promise<{ content: string }> {
  const res = await fetch('/v1/user-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Failed to update user profile: ${res.status}`);
  return res.json();
}

// Jobs

export interface Job {
  id: string;
  name: string;
  schedule: string | null;
  prompt: string | null;
  enabled: boolean;
  max_retries: number;
  skill_name: string | null;
  skill_config: Record<string, unknown> | null;
  notify: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRun {
  id: string;
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  retry_count: number;
  thread_id: string | null;
  created_at: string;
}

export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch('/v1/jobs');
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`);
  return res.json();
}

export async function fetchJob(id: string): Promise<{ job: Job; runs: JobRun[] }> {
  const res = await fetch(`/v1/jobs/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch job: ${res.status}`);
  return res.json();
}

export interface SkillFieldMeta {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'literal';
  description: string;
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  pattern?: string;
  literalValue?: unknown;
}

export interface SkillInfo {
  name: string;
  description: string;
  fields: SkillFieldMeta[];
}

export async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch('/v1/skills');
  if (!res.ok) throw new Error(`Failed to fetch skills: ${res.status}`);
  return res.json();
}

export type CreateJobInput = Partial<Pick<Job, 'name' | 'schedule' | 'prompt' | 'notify' | 'enabled' | 'max_retries' | 'skill_name' | 'skill_config'>> & {
  run_at?: string | null;
};

export type UpdateJobInput = Partial<Pick<Job, 'name' | 'schedule' | 'prompt' | 'notify' | 'enabled' | 'max_retries' | 'skill_name' | 'skill_config'>>;

export async function createJob(data: CreateJobInput): Promise<Job> {
  const res = await fetch('/v1/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to create job: ${res.status}`);
  }
  return res.json();
}

export async function updateJob(id: string, data: UpdateJobInput): Promise<Job> {
  const res = await fetch(`/v1/jobs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to update job: ${res.status}`);
  }
  return res.json();
}

export async function deleteJob(id: string): Promise<void> {
  const res = await fetch(`/v1/jobs/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete job: ${res.status}`);
}

export async function* streamChat(
  threadId: string | null,
  message: string,
): AsyncGenerator<SSEEvent> {
  const res = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(threadId ? { thread_id: threadId } : {}),
      message,
    }),
  });

  if (!res.ok) {
    throw new Error(`Chat request failed: ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    // Keep the last part as it may be incomplete
    buffer = parts.pop()!;

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const lines = trimmed.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event:'));
      const dataLine = lines.find((l) => l.startsWith('data:'));

      if (eventLine && dataLine) {
        const event = eventLine.slice(6).trim();
        const data = JSON.parse(dataLine.slice(5).trim());
        yield { event, data };
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    const lines = buffer.trim().split('\n');
    const eventLine = lines.find((l) => l.startsWith('event:'));
    const dataLine = lines.find((l) => l.startsWith('data:'));

    if (eventLine && dataLine) {
      const event = eventLine.slice(6).trim();
      const data = JSON.parse(dataLine.slice(5).trim());
      yield { event, data };
    }
  }
}
