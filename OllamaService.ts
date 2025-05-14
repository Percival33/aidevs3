import type { ChatCompletionMessageParam, ChatCompletion } from "openai/resources/chat/completions";

export const OLLAMA_API_URL = "http://localhost:11434/v1/chat/completions";
export const OLLAMA_MODEL = "gemma3:4b";

// Define the OllamaService class
export class OllamaService {
    private apiUrl: string;
    private model: string;

    constructor(apiUrl: string, model: string) {
        this.apiUrl = apiUrl;
        this.model = model;
    }

    async completion(messages: ChatCompletionMessageParam[]): Promise<ChatCompletion> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                stream: false // Assuming stream is false based on previous context
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Ollama API Error Status: ${response.status}`);
            console.error(`Ollama API Error Body: ${errorBody}`);
            throw new Error(`Ollama API error! status: ${response.status}`);
        }
        return response.json() as Promise<ChatCompletion>;
    }
}
