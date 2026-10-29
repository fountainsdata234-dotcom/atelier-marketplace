declare module '@google/genai' {
  export interface GenerateContentResult {
    text?: string;
  }

  export interface GenerateContentOptions {
    model: string;
    contents: string;
    config?: {
      systemInstruction?: string;
      temperature?: number;
      maxOutputTokens?: number;
    };
  }

  export class GoogleGenAI {
    constructor(options: { apiKey: string });
    models: {
      generateContent(options: GenerateContentOptions): Promise<GenerateContentResult>;
    };
  }
}
