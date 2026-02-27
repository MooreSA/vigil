import type OpenAI from 'openai';

interface EmbeddingServiceDeps {
  openai: OpenAI;
  model: string;
}

export class EmbeddingService {
  private openai: OpenAI;
  private model: string;

  constructor(deps: EmbeddingServiceDeps) {
    this.openai = deps.openai;
    this.model = deps.model;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0].embedding;
  }
}
