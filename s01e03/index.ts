import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { readFile, writeFile } from 'fs/promises';
import * as fsSync from 'fs';
import { OllamaService, OLLAMA_API_URL, OLLAMA_MODEL } from "../OllamaService";

const APIKEY = process.env.APIKEY;
const URL = process.env.URL+'/report';

if (!APIKEY) {
    console.error('Error: APIKEY environment variable not set.');
    process.exit(1);
}
if (!URL) {
    console.error('Error: URL environment variable not set.');
    process.exit(1);
}

const ollamaService = new OllamaService(OLLAMA_API_URL, OLLAMA_MODEL);

const systemPrompt = `You are helpful assistant which answers questions only in ENGLISH.
<Objective>
Answer questions using single word.
</Objective>

Core Rules:
- Always answer question using single word.
- Always use ENGLISH.
`;

type TestDataItem = { question: string, answer: number, test?: { q: string, a: string | null | undefined } };

async function fixFile(): Promise<void> {
    let rawData: string;
    try {
        rawData = await readFile('s01e03/dane.json', 'utf8');
    } catch (err) {
        console.error('Error reading file s01e03/dane.json:', err);
        return;
    }

    let jsonData: { apikey: string, description: string, copyright: string, "test-data": TestDataItem[] };
    try {
        jsonData = JSON.parse(rawData);
    } catch (err) {
        console.error('Error parsing s01e03/dane.json:', err);
        return;
    }

    for (const test of jsonData["test-data"]) {
        const stringParts = test.question.split('+');
        const part1String = stringParts[0]?.trim();
        const part2String = stringParts[1]?.trim();

        if (part1String !== undefined && part2String !== undefined) {
            const numPart1 = parseInt(part1String, 10);
            const numPart2 = parseInt(part2String, 10);
            test.answer = numPart1 + numPart2;
        } else {
            console.warn(`Could not parse question for addition (expected 2 parts): ${test.question}. Original answer: ${test.answer}`);
        }

        if (test.test) {
            const messages: ChatCompletionMessageParam[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: test.test.q }
            ];
            const ollamaCompletion = await ollamaService.completion(messages);
            test.test.a = ollamaCompletion?.choices?.[0]?.message?.content;
        }
    }

    try {
        await writeFile('s01e03/dane-fixed.json', JSON.stringify(jsonData, null, 2));
        console.log('File s01e03/dane-fixed.json written successfully');
    } catch (err) {
        console.error('Error writing file s01e03/dane-fixed.json:', err);
    }
};

async function main() {
    await fixFile();

    let fixedData;
    try {
        fixedData = JSON.parse(fsSync.readFileSync('s01e03/dane-fixed.json', 'utf8'));
    } catch (err) {
        console.error("Error reading or parsing s01e03/dane-fixed.json for POLIGON task:", err);
        process.exit(1);
    }

    try {
        const polygonResponse = await fetch(URL!, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "task": "JSON",
                "apikey": APIKEY!,
                "answer": { ...fixedData, apikey: APIKEY! }
            }),
        });
        if (!polygonResponse.ok) {
            const errorBody = await polygonResponse.text();
            console.error(`POLIGON API Error Status: ${polygonResponse.status}`);
            console.error(`POLIGON API Error Body: ${errorBody}`);
            throw new Error(`POLIGON API error! status: ${polygonResponse.status}`);
        }
        const polygonResult = await polygonResponse.json();
        console.log("POLIGON API success:", polygonResult);

    } catch (error) {
        console.error("Error during POLIGON API call:", error);
    }
}

main().catch(error => {
    console.error("Unhandled error in main:", error);
    process.exit(1);
});
