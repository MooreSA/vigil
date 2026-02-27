import type {MemoryRepository, SimilarityResult } from '../repositories/memory.js';
import type { EmbeddingService } from './embedding.js';
import type { Logger } from '../logger.js';

interface MemoryServiceDeps {
  memoryRepo: MemoryRepository;
  embeddingService: EmbeddingService;
  logger: Logger;
}

const DEDUP_THRESHOLD = 0.85;
const RECALL_THRESHOLD = 0.3;
const RECALL_DEFAULT_LIMIT = 10;

export class MemoryService {
  private memoryRepo: MemoryRepository;
  private embeddingService: EmbeddingService;
  private logger: Logger;

  constructor(deps: MemoryServiceDeps) {
    this.memoryRepo = deps.memoryRepo;
    this.embeddingService = deps.embeddingService;
    this.logger = deps.logger;
  }

  async remember(
    content: string,
    source: 'agent' | 'user' = 'agent',
    threadId?: string | null,
  ) {
    const embedding = await this.embeddingService.embed(content);

    const similar = await this.memoryRepo.similaritySearch(
      embedding,
      1,
      DEDUP_THRESHOLD,
    );

    if (similar.length > 0) {
      this.logger.info(
        { existingId: similar[0].id, similarity: similar[0].similarity },
        'Dedup: updating existing memory entry',
      );
      return this.memoryRepo.update(similar[0].id, content, embedding);
    }

    return this.memoryRepo.create({ content, embedding, source, thread_id: threadId });
  }

  async recall(query: string, limit: number = RECALL_DEFAULT_LIMIT): Promise<SimilarityResult[]> {
    const embedding = await this.embeddingService.embed(query);
    return this.memoryRepo.similaritySearch(embedding, limit, RECALL_THRESHOLD);
  }

  async list() {
    return this.memoryRepo.findAll();
  }

  async delete(id: string) {
    return this.memoryRepo.softDelete(id);
  }

  async update(id: string, content: string) {
    const embedding = await this.embeddingService.embed(content);
    return this.memoryRepo.update(id, content, embedding);
  }
}
