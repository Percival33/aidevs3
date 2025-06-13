import path from "path";
import { OpenAIService } from "../OpenAIService";
import { VectorService } from "../VectorService";
import fs from "fs/promises";
import { submit } from "../common";
import type { ChatCompletion } from "openai/resources/chat/completions";

async function main() {
    const dataDir = path.join(__dirname, '..', 'pliki_z_fabryki', 'do-not-share');
    const collectionName = 's03e02';
    const query = 'W raporcie, z którego dnia znajduje się wzmianka o kradzieży prototypu broni?';


    const openai = new OpenAIService();
    const vectorService = new VectorService(openai);
    
    const files = await fs.readdir(dataDir);

    const points = await Promise.all(files.map(async (file) => {
        const content = await fs.readFile(path.join(dataDir, file), 'utf8');
        return { text: content, metadata: { date: file.split('.')[0]!.replaceAll('_', '-') } };
    }));

    await vectorService.initializeCollectionWithData(collectionName, points);

    const searchResults = await vectorService.performSearch(collectionName, query, {}, 10);

    const rerankedPoints = await Promise.all(searchResults.map(async point => {
        const isRelated = await openai.completion([
            {
                role: 'system',
                content: `Classify if this text is about the theft of a prototype weapon. Return 1 if it is, 0 if it is not, and nothing else.
                <snippet_examples>
                USER:
                ${point.payload?.text}
                AI: 1
                </snippet_examples>
                `
            },
            {
                role: 'user',
                content: `Text: ${point.payload?.text}`
            }
        ]) as ChatCompletion;
        return { ...point, isRelated: isRelated.choices[0]?.message.content === '1' };
    }));

    const relatedPoints = rerankedPoints.filter((point: any) => point.isRelated);
    
    const flag = await submit('wektory', relatedPoints[0]?.payload?.date);
    console.log(await flag.text());
}

main().catch(console.error);