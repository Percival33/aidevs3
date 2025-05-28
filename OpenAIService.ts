import OpenAI, { toFile } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import Groq from "groq-sdk";

export class OpenAIService {
  private openai: OpenAI;
  private groq: Groq;

  constructor() {
    this.openai = new OpenAI();
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
  }

  async completion(
    messages: ChatCompletionMessageParam[],
    model: string = "gpt-4",
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

  async transcribeGroq(audioBuffer: Buffer): Promise<string> {
    console.log("Transcribing audio...");
    const transcription = await this.groq.audio.transcriptions.create({
      file: await toFile(audioBuffer, 'speech.mp3'),
      language: 'pl',
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
}