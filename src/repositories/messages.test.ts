import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { inject } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';
import { createTestDb, truncateAll } from '../test/helpers.js';
import { ThreadRepository } from './threads.js';
import { MessageRepository } from './messages.js';

let db: Kysely<DB>;
let threadRepo: ThreadRepository;
let messageRepo: MessageRepository;
let threadId: string;

beforeAll(() => {
  const url = inject('testDatabaseUrl');
  db = createTestDb(url);
  threadRepo = new ThreadRepository(db);
  messageRepo = new MessageRepository(db);
});

beforeEach(async () => {
  await truncateAll(db);
  const thread = await threadRepo.create({ title: 'Test Thread' });
  threadId = thread.id;
});

afterAll(async () => {
  await db.destroy();
});

describe('MessageRepository', () => {
  describe('create', () => {
    it('creates a message with JSONB content', async () => {
      const content = { role: 'user', content: 'Hello, world!' };
      const message = await messageRepo.create({
        thread_id: threadId,
        role: 'user',
        content,
      });

      expect(message.id).toBeDefined();
      expect(message.thread_id).toBe(threadId);
      expect(message.role).toBe('user');
      expect(message.model).toBeNull();
      expect(message.content).toEqual(content);
      expect(message.deleted_at).toBeNull();
    });

    it('stores model for assistant messages', async () => {
      const message = await messageRepo.create({
        thread_id: threadId,
        role: 'assistant',
        model: 'anthropic/claude-sonnet-4',
        content: { role: 'assistant', content: 'Hi there!' },
      });

      expect(message.model).toBe('anthropic/claude-sonnet-4');
    });

    it('round-trips complex JSONB content', async () => {
      const content = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'remember', arguments: '{"content":"test"}' },
          },
        ],
      };

      const message = await messageRepo.create({
        thread_id: threadId,
        role: 'assistant',
        content,
      });

      const found = await messageRepo.findById(message.id);
      expect(found!.content).toEqual(content);
    });
  });

  describe('createMany', () => {
    it('inserts multiple messages at once', async () => {
      const messages = await messageRepo.createMany([
        { thread_id: threadId, role: 'system', content: { role: 'system', content: 'You are helpful.' } },
        { thread_id: threadId, role: 'user', content: { role: 'user', content: 'Hi' } },
        { thread_id: threadId, role: 'assistant', model: 'gpt-4', content: { role: 'assistant', content: 'Hello!' } },
      ]);

      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[2].role).toBe('assistant');
    });
  });

  describe('findByThreadId', () => {
    it('returns messages ordered by id asc', async () => {
      await messageRepo.createMany([
        { thread_id: threadId, role: 'user', content: { role: 'user', content: 'First' } },
        { thread_id: threadId, role: 'assistant', content: { role: 'assistant', content: 'Second' } },
        { thread_id: threadId, role: 'user', content: { role: 'user', content: 'Third' } },
      ]);

      const messages = await messageRepo.findByThreadId(threadId);

      expect(messages).toHaveLength(3);
      expect(BigInt(messages[0].id)).toBeLessThan(BigInt(messages[1].id));
      expect(BigInt(messages[1].id)).toBeLessThan(BigInt(messages[2].id));
    });

    it('excludes soft-deleted messages', async () => {
      const m1 = await messageRepo.create({
        thread_id: threadId,
        role: 'user',
        content: { role: 'user', content: 'Keep' },
      });
      const m2 = await messageRepo.create({
        thread_id: threadId,
        role: 'user',
        content: { role: 'user', content: 'Delete' },
      });
      await messageRepo.softDelete(m2.id);

      const messages = await messageRepo.findByThreadId(threadId);
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(m1.id);
    });

    it('returns empty array for thread with no messages', async () => {
      const messages = await messageRepo.findByThreadId(threadId);
      expect(messages).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns a message by id', async () => {
      const created = await messageRepo.create({
        thread_id: threadId,
        role: 'user',
        content: { role: 'user', content: 'Find me' },
      });

      const found = await messageRepo.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('returns undefined for non-existent id', async () => {
      const found = await messageRepo.findById('999999');
      expect(found).toBeUndefined();
    });
  });

  describe('softDelete', () => {
    it('sets deleted_at on the message', async () => {
      const created = await messageRepo.create({
        thread_id: threadId,
        role: 'user',
        content: { role: 'user', content: 'Delete me' },
      });

      const deleted = await messageRepo.softDelete(created.id);
      expect(deleted).toBeDefined();
      expect(deleted!.deleted_at).toBeInstanceOf(Date);
    });

    it('returns undefined when deleting already-deleted message', async () => {
      const created = await messageRepo.create({
        thread_id: threadId,
        role: 'user',
        content: { role: 'user', content: 'test' },
      });
      await messageRepo.softDelete(created.id);

      const result = await messageRepo.softDelete(created.id);
      expect(result).toBeUndefined();
    });
  });
});
