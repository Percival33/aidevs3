import { submit } from "../common";
import fs from 'fs/promises';
import path from 'path';
import { OpenAIService } from "../OpenAIService";
import type { ChatCompletion } from "openai/resources/chat/completions";

const openai = new OpenAIService();
const dataDir = path.join(__dirname, '..', 'pliki_z_fabryki');

const generateKeywords = async (file: string): Promise<Record<string, string>> => {
    const fileContent = await fs.readFile(file, 'utf8');
    const response = await openai.completion([
        {
            role: 'system',
            content: `Identify object of the text and provide information about it. Return a list of keywords (max 10)in Polish about the object.
                <text>
                ${fileContent}
                </text>

                Keywords MUST BE in Polish.
                Keywords MUST be concise and relevant to the object.
                Keywords MUST enable to distinguish between different objects in the text.
                    
                Example keywords are: name, surname, city, profession, friends, enemies, goals, dreams, actions, etc.

                Return text in specified format:
                NameOfObject: keyword1, keyword2, keyword3, ...
                `
        },
    ]) as ChatCompletion;

    return {
        [path.basename(file)]: response.choices[0]?.message.content ?? ''
    };
}

const combineKeywords = async (raports: Record<string, string>[], facts: Record<string, string>[]) => {
    // console.log(raports, facts);
    const factsAsString = facts.map(fact => Object.values(fact)[0]).join('\n');

    let result: Record<string, string> = {};

    for (const raport of raports) {
        const [raportName, raportKeywords] = Object.entries(raport)[0]!;
        const response = await openai.completion([
            {
                role: 'system',
                content: `Your task is to consolidate information. You will receive a list of facts and a list of report keywords. If a keyword from the report matches a topic or keyword within one of the facts, you must append all keywords from that fact to the report's keywords.

<snippet_objective>
Based on a shared keyword, find the relevant fact entry for the given report keywords. Append all keywords from the identified fact entry (including the topic name) to the original report keywords. The final output should be a single, deduplicated, comma-separated list of keywords in Polish. ALWAYS include sector name and number in one keyword.
</snippet_objective>

<snippet_rules>
1.  **Matching:** A report is considered to match a fact if they share at least one keyword. The topic name in the fact (e.g., "Barbara:") is also considered a keyword for matching purposes.
2.  **Appending:** If a match is found, append ALL keywords from the matching fact entry (both the topic and its associated keywords) to the report keywords.
3.  **Deduplication:** The final list must not contain duplicate keywords. The first occurrence should be kept.
4.  **Language:** ALWAYS use and output only the Polish keywords provided. ABSOLUTELY FORBIDDEN to invent, translate, or expand keywords.
5.  **Output Format:** The output MUST be a plain, comma-separated list. Do not include explanations, headings, or any other formatting.
6.  **No Match:** If no fact entry matches the report keywords, output only the original, deduplicated report keywords.
7.  **Sector name and number:** ALWAYS KEEP sector name and number in one keyword.
</snippet_rules>

<snippet_examples>
USER:
Facts:
Adam: programista, JavaScript
Barbara: kucharz, desery
Report keywords: Barbara,Nagroda,Wygrana
AI: Barbara,Nagroda,Wygrana,kucharz,desery

USER:
Facts:
Kraków: smok, zamek
Warszawa: syrenka, stolica
Report keywords: zamek, wycieczka
AI: zamek, wycieczka,smok,Kraków

USER:
Facts:
Michał: gotowanie, obiad
Report keywords: kolacja, przepis
AI: kolacja, przepis
</snippet_examples>

<snippet_facts>
${factsAsString}
</snippet_facts>
`,
            },
            {
                role: 'user',
                content: `Report keywords: ${raportKeywords}`
            }
        ], 'gpt-4.1-mini', false, false, 1024, 0.5) as ChatCompletion;
        result[raportName] = `${raportName.split('_')[2]!.slice(0, 2)}, ${response.choices[0]?.message.content ?? ''}`;
        console.log(`processed ${raportName}`);
    }


    return result;
}

(async () => {
    const files = await fs.readdir(dataDir);
    const factsFiles = await fs.readdir(path.join(dataDir, 'facts'));

    let raports: Record<string, string>[] = [];
    let facts: Record<string, string>[] = [];

    if (await fs.exists(path.join(__dirname, 'raports.json'))) {
        raports = JSON.parse(await fs.readFile(path.join(__dirname, 'raports.json'), 'utf8'));
    } else {
        raports = await Promise.all(files.filter(file => file.endsWith('.txt')).map(async (file) => {
            return await generateKeywords(path.join(dataDir, file));
        }));
        await fs.writeFile(path.join(__dirname, 'raports.json'), JSON.stringify(raports, null, 2));
    }

    if (await fs.exists(path.join(__dirname, 'facts.json'))) {
        facts = JSON.parse(await fs.readFile(path.join(__dirname, 'facts.json'), 'utf8'));
    } else {
        facts = await Promise.all(factsFiles.filter(file => file.endsWith('.txt')).map(async (file) => {
            return await generateKeywords(path.join(dataDir, 'facts', file));
        }));
        await fs.writeFile(path.join(__dirname, 'facts.json'), JSON.stringify(facts, null, 2));
    }

    const answer = await combineKeywords(raports, facts);
    console.log(answer);

    const flag = await submit('dokumenty', answer);
    console.log(await flag.text());
})();