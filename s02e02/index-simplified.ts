import { readFile } from "fs/promises";
import { join } from "path";
import { OpenAIService } from "../OpenAIService";
import type { ChatCompletion, ChatCompletionMessageParam, ChatCompletionContentPartImage, ChatCompletionContentPartText } from "openai/resources/chat/completions";

const openai = new OpenAIService();

(async () => {
    const messages: ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: `The attached images are screenshots of a map of city in Poland.
            - provide the name of the city in <city></city> tag`
        },
        {
            role: "user",
            content: [
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/png;base64,${await readFile(join(__dirname, "img-1.png"), {encoding: "base64"})}`,
                        detail: "high"
                    }
                } as ChatCompletionContentPartImage,
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/png;base64,${await readFile(join(__dirname, "img-2.png"), {encoding: "base64"})}`,
                        detail: "high"
                    }
                } as ChatCompletionContentPartImage,
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/png;base64,${await readFile(join(__dirname, "img-3.png"), {encoding: "base64"})}`,
                        detail: "high"
                    }
                } as ChatCompletionContentPartImage,
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/png;base64,${await readFile(join(__dirname, "img-4.png"), {encoding: "base64"})}`,
                        detail: "high"
                    }
                } as ChatCompletionContentPartImage,
            ]
        }
    ];

    const response = await openai.completion(messages, "gpt-4o", false, false, 2048, 0.5) as ChatCompletion;

    console.log(`\nDetails:\n${response.choices?.[0]?.message.content}`);
})();