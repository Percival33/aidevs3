import OpenAI, { toFile } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import Groq from "groq-sdk";

export class OpenAIService {
  private openai: OpenAI;
  private groq: Groq;
  private readonly JINA_API_KEY = process.env.JINA_API_KEY;


  constructor() {
    this.openai = new OpenAI();
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
  }

  async completion(
    messages: ChatCompletionMessageParam[],
    model: string = "gpt-4.1-mini",
    stream: boolean = false,
    jsonMode: boolean = false,
    maxTokens: number = 1024,
    temperature: number = 1
  ): Promise<OpenAI.Chat.Completions.ChatCompletion | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    try {
      const chatCompletion = await this.openai.chat.completions.create({
        messages,
        model,
        stream,
        max_tokens: maxTokens,
        temperature,
        response_format: jsonMode ? { type: "json_object" } : { type: "text" }
      });
      
      if (stream) {
        return chatCompletion as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
      } else {
        return chatCompletion as OpenAI.Chat.Completions.ChatCompletion;
      }
    } catch (error) {
      console.error("Error in OpenAI completion:", error);
      throw error;
    }
  }

  async transcribe(audioBuffer: Buffer): Promise<string> {
    console.log("Transcribing audio...");

    const transcription = await this.openai.audio.transcriptions.create({
      file: await toFile(audioBuffer, 'speech.mp3'),
      language: 'pl',
      model: 'whisper-1',
    });
    return transcription.text;
  }

  async transcribeGroq(audioBuffer: Buffer, language: string = 'pl'): Promise<string> {
    console.log("Transcribing audio...");
    const transcription = await this.groq.audio.transcriptions.create({
      file: await toFile(audioBuffer, 'speech.mp3'),
      language,
      model: 'whisper-large-v3',
    });
    return transcription.text;
  }

  async generateImage(
    prompt: string,
    size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024",
    quality: "standard" | "hd" = "standard",
    style: "vivid" | "natural" = "vivid"
  ): Promise<string> {
    try {
      console.log("Generating image with DALLE-3...");
      
      const response = await this.openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size,
        quality,
        style,
        response_format: "url"
      });

      if (!response.data || response.data.length === 0) {
        throw new Error("No image data returned from DALLE-3");
      }

      const imageUrl = response.data[0]?.url;
      if (!imageUrl) {
        throw new Error("No image URL returned from DALLE-3");
      }

      console.log("Image generated successfully:", imageUrl);
      return imageUrl;
    } catch (error) {
      console.error("Error generating image:", error);
      throw error;
    }
  }

  async vision(imageBuffer: Buffer, prompt: string = "Extract all text from this image"): Promise<string> {
    try {
      console.log("Extracting text from image using GPT-4 Vision...");
      
      const base64Image = imageBuffer.toString('base64');
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      console.error("Error in vision processing:", error);
      throw error;
    }
  }

  async createJinaEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.JINA_API_KEY}`
        },
        body: JSON.stringify({
          model: 'jina-embeddings-v3',
          task: 'text-matching',
          dimensions: 1024,
          late_chunking: false,
          embedding_type: 'float',
          input: [text]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error("Error creating Jina embedding:", error);
      throw error;
    }
  }
}