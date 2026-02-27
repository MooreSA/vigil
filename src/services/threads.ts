import type { ThreadRepository, CreateThreadInput } from '../repositories/threads.js';
import type { MessageRepository, CreateMessageInput } from '../repositories/messages.js';

interface ThreadServiceDeps {
  threadRepo: ThreadRepository;
  messageRepo: MessageRepository;
}

export class ThreadService {
  private threadRepo: ThreadRepository;
  private messageRepo: MessageRepository;

  constructor(deps: ThreadServiceDeps) {
    this.threadRepo = deps.threadRepo;
    this.messageRepo = deps.messageRepo;
  }

  async create(opts?: CreateThreadInput) {
    return this.threadRepo.create(opts);
  }

  async findById(id: string) {
    return this.threadRepo.findById(id);
  }

  async addMessage(input: CreateMessageInput) {
    return this.messageRepo.create(input);
  }

  async getMessages(threadId: string) {
    return this.messageRepo.findByThreadId(threadId);
  }
}
