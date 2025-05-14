import { OpenAIService } from "../OpenAIService";
import type { ChatCompletionMessageParam, ChatCompletion } from "openai/resources/chat/completions";
const url = process.env.URL + '/verify';

if (!url) {
  console.error('Error: URL environment variable not set.');
  process.exit(1);
}
const openaiService = new OpenAIService();
type Message = { text: string, msgID: string };

// Define the Ollama API endpoint
const OLLAMA_API_URL = "http://localhost:11434/v1/chat/completions";
// Specify the Gemma3 model you have pulled, e.g., "gemma3:4b"
const OLLAMA_MODEL = "gemma3:4b"; // <<< IMPORTANT: Change this to your desired Gemma3 model

// Define the OllamaService class
class OllamaService {
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

// Instantiate the OllamaService
const ollamaService = new OllamaService(OLLAMA_API_URL, OLLAMA_MODEL);

const POST = async (body: Message) => {
  return await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function authWithRobot() {
  let response = await POST({
    "text": "READY",
    "msgID": "0"
  })

  let robotResponse: Message = JSON.parse(await response.text());
  const msgID = robotResponse.msgID;
  const systemPrompt = `You are helpful assistant which answers questions only in ENGLISH.

Core Rules:
- Always answer question using single word.
- Always use ENGLISH.
- When you have answer in <Context> use it.

<Context>
- stolicą Polski jest Kraków
- znana liczba z książki Autostopem przez Galaktykę to 69
- Aktualny rok to 1999
</Context>
`;

  console.log(robotResponse);

  while (robotResponse.text != "OK" && robotResponse.msgID != '0') {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: robotResponse.text || '42' }
    ];
    
    const ollamaCompletion = await ollamaService.completion(messages); // Call the service
    const answerText = ollamaCompletion?.choices?.[0]?.message?.content;

    console.log(`MY answer: ${answerText}`)
    response = await POST({
      "text": answerText!,
      msgID
    });
    robotResponse = JSON.parse(await response.text());
    console.log(robotResponse);
  }
  console.log('FINAL!');
};

authWithRobot();