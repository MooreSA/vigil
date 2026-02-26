CREATE EXTENSION IF NOT EXISTS pgvector;

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-------------------------------------------------------------------
-- Threads
-------------------------------------------------------------------
CREATE TABLE threads (
    id          BIGSERIAL PRIMARY KEY,
    title       TEXT,
    source      TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'wake')),
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_threads_updated_at
BEFORE UPDATE ON threads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-------------------------------------------------------------------
-- Messages
-------------------------------------------------------------------
CREATE TABLE messages (
    id          BIGSERIAL PRIMARY KEY,
    thread_id   BIGINT NOT NULL REFERENCES threads(id),
    role        TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    model       TEXT,
    content     JSONB NOT NULL,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_thread ON messages(thread_id, id)
WHERE deleted_at IS NULL;

-------------------------------------------------------------------
-- Memory
-------------------------------------------------------------------
CREATE TABLE memory_entries (
    id          BIGSERIAL PRIMARY KEY,
    content     TEXT NOT NULL,
    embedding   vector(1536) NOT NULL,
    source      TEXT NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'user')),
    thread_id   BIGINT REFERENCES threads(id),
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_embedding ON memory_entries
USING hnsw (embedding vector_cosine_ops);

CREATE TRIGGER trg_memory_entries_updated_at
BEFORE UPDATE ON memory_entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-------------------------------------------------------------------
-- Jobs
-------------------------------------------------------------------
CREATE TABLE jobs (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    schedule      TEXT NOT NULL,
    prompt        TEXT NOT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    max_retries   INT NOT NULL DEFAULT 3,
    next_run_at   TIMESTAMPTZ NOT NULL,
    last_run_at   TIMESTAMPTZ,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_next_run ON jobs(next_run_at)
WHERE enabled = TRUE AND deleted_at IS NULL;

CREATE TRIGGER trg_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-------------------------------------------------------------------
-- Job runs
-------------------------------------------------------------------
CREATE TABLE job_runs (
    id            BIGSERIAL PRIMARY KEY,
    job_id        BIGINT NOT NULL REFERENCES jobs(id),
    scheduled_for TIMESTAMPTZ NOT NULL,
    locked_until  TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    retry_count   INT NOT NULL DEFAULT 0,
    thread_id     BIGINT REFERENCES threads(id),
    error         TEXT,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (job_id, scheduled_for)
);

CREATE INDEX idx_job_runs_job ON job_runs(job_id);
CREATE INDEX idx_job_runs_status ON job_runs(status, locked_until)
WHERE status IN ('pending', 'running');
