import { submit } from "../common";
import fs from 'fs';
import OpenAI from "openai";
import { OpenAIService } from "../OpenAIService";
import { OllamaService } from "../OllamaService";

const URL = process.env.URL!;
const PERSONAL_APIKEY = process.env.PERSONAL_APIKEY!;

const systemPrompt = `
<Objective>
Extract where professor Andrzej Maj is teaching.
</Objective>

<Rules>
- You are given a transcript of a confession of a criminal.
- Analyze the transcript separately and describe reasoning process in "_thinking" field.
- At the end, summarize your reasoning process in another "_thinking" field.
- Provide name of the university where he is teaching.
</Rules>
`;

const main = async () => {
    const openaiService = new OpenAIService();
    let transcriptionsString = '';
    if (!fs.existsSync('./s02e01/transcriptions.txt')) {
        const files = fs.readdirSync('./s02e01/audio');
        const transcriptions = await Promise.all(files.map(async file => {
            const buffer = fs.readFileSync(`./s02e01/audio/${file}`);
            return openaiService.transcribeGroq(buffer);
        }));
        transcriptionsString = transcriptions.join('\n');
        fs.writeFileSync('./s02e01/transcriptions.txt', transcriptionsString);
    } else {
        transcriptionsString = fs.readFileSync('./s02e01/transcriptions.txt', 'utf8');
    }
    // console.log(`Transcriptions: """\n${transcriptionsString}\n"""`);

    // const ollamaService = new OllamaService();
    let relevantInformation = '';
    if (!fs.existsSync('./s02e01/relevant_information.txt')) {
        const summary = (await openaiService.completion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcriptionsString }
        ], 'gpt-4.1-mini', false, false)) as OpenAI.Chat.Completions.ChatCompletion;

        fs.writeFileSync('./s02e01/relevant_information.txt', summary.choices[0]?.message?.content || '');
    } else {
        relevantInformation = fs.readFileSync('./s02e01/relevant_information.txt', 'utf8');
    }

    const answer = (await openaiService.completion([
        {
            role: 'system', content: `Given the name of faculty provide the street name where is located. Answer only with street name.` },
        { role: 'user', content: relevantInformation }
    ], 'gpt-4.1-mini', false, false)) as OpenAI.Chat.Completions.ChatCompletion;

    console.log(`Answer: ${answer.choices[0]?.message?.content}`);

    const response = await submit('mp3', answer.choices[0]?.message?.content || 'dupa');
    console.log(await response.text());
};

main();