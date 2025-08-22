import { OpenAIService } from "../OpenAIService";
import fs from "fs";
import { type ChatCompletion, type ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { submit } from "../common";

async function main() {
    const openai = new OpenAIService();
    const dataToVerify = fs.readFileSync(`${__dirname}/lab_data/verify.txt`, "utf-8");
    const messages = dataToVerify.split("\n").map(line => line.split("=")).map(([line, data]) => ({
        role: "user",
        content: data,
    }));
    const validationPromises = messages.map(async (message) => {
        const response = await openai.completion([
            { role: "system", content: "SPRAWDZAAAM, DZIĘKUJĘ ZA TĘ INFORMACJĘ!" },
            message,
        ] as ChatCompletionMessageParam[], "ft:gpt-4.1-mini-2025-04-14:personal:aidevs:C68yzSWp", false, false, 1024, 1) as ChatCompletion;
        return response.choices[0]?.message.content as string;
    });
    const results = await Promise.all(validationPromises);
    const correct = results.map((result, index) => result === "supi" ? String(index + 1).padStart(2, "0") : null).filter(Boolean);
    console.log(JSON.stringify(correct));
    const flag = await submit('research', correct);
    console.log(await flag.json());
}

main().catch(console.error);