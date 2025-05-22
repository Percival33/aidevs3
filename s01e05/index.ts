import type OpenAI from "openai";
import { OllamaService } from "../OllamaService";

const PERSONAL_APIKEY = process.env.PERSONAL_APIKEY!;
const URL = process.env.URL!;

const model = new OllamaService();
const systemPrompt = `
<Objective>
You are a helpful assistant that censors personal data from text.
</Objective>

<Rules>
- Each data sample is a text with personal data about a person.
- Data contains name, surname it should be replaced with "CENZURA".
- Data contains address it should be replaced with "CENZURA".
- Data contains city it should be replaced with "CENZURA".
- Data contains street and home number it should be replaced with "CENZURA".
- DO NOT replace any other data.
</Rules>

<Examples>
USER: Osoba podejrzana to Adam Nowak. Adres: Warszawa, ul. Dworkowa 10. Wiek: 42 lata.
ASSISTANT: Osoba podejrzana to CENZURA. Adres: CENZURA, ul. CENZURA. Wiek: CENZURA lata.
</Examples>
`;

const submit = async (task: string, answer: any) => await fetch(URL+'/report', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        "task": task,
        "apikey": PERSONAL_APIKEY,
        "answer": answer
    }),
});

const getFile = async () => await fetch(`${URL}/data/${PERSONAL_APIKEY}/cenzura.txt`, {
    method: 'GET',
});

const main = async () => {
    const file = await getFile();
    const text = await file.text();
    console.log(`TEXT: ${text}`);

    const censoredData: OpenAI.Chat.Completions.ChatCompletion = await model.completion([
        {
            role: 'system',
            content: systemPrompt
        },
        {
            role: 'user',
            content: text
        }
    ]);
    const answer = censoredData.choices?.[0]?.message?.content ?? '';
    console.log(`ANSWER: ${answer}`);
    const result = await submit('CENZURA', answer);
    console.log(await result.text());
}

await main();