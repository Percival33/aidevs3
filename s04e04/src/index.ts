import { Hono } from 'hono'
import OpenAI from "openai";
import { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";
import { createLogDash } from '@logdash/js-sdk';

const app = new Hono()

const TERRAIN: string[][] = [
    ['start', 'trawa', 'drzewo', 'dom'],
    ['trawa', 'wiatrak', 'trawa', 'trawa'],
    ['trawa', 'trawa', 'małe skałki', 'dwa drzewa'],
    ['wysokie skały', 'wysokie skały', 'samochód', 'jaskinia']
];
const logger = createLogDash({
    apiKey: process.env.LOGDASH_API_KEY!,
}).logger;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const getPosition = async (instructions: string): Promise<{ x: number, y: number }> => {
    const chatCompletion = await openai.chat.completions.create({
        messages: [{
            role: 'system', content:
                //                 `Your task is to translate instructions into coordinates.
                // You are given 4x4 map and starting coordinates are top left corner (0,0) and bottom right corner is (3,3).
                //                 use _thinking to reason about the instructions and then give final answer in format X=x, Y=y.
                //
                //                 <examples>
                //                 <example>
                //                 Instructions: Move right, down
                //                 AI: X=1, Y=1
                //                 </example>
                //
                //                 <example>
                //                 Instructions: Move down, down, right, right. Hmm actually no, let's start from begging. Just go down.
                //                 AI: X=0, Y=1
                //                 </example>
                //                 </examples>`

                `Your task is to translate natural language instructions into coordinates on a 4x4 grid.
- The grid starts at the top left corner (0,0) and ends at the bottom right corner (3,3).
- The starting position is always (0,0).
- Each instruction (e.g., "move right", "go down") changes the position by 1 in the specified direction.
- If the instructions include corrections, changes of mind, or conversational language, only the final intended path should be followed.
- Ignore any instructions that are retracted, canceled, or replaced by later instructions.
- Use _thinking to reason step by step about the instructions, especially if they are ambiguous or conversational.
- Output only the final coordinates in the format: X=x, Y=y.
<examples> <example> Instructions: Move right, down AI: X=1, Y=1 </example> <example> Instructions: Move down, down, right, right. Hmm actually no, let's start from beginning. Just go down. AI: X=0, Y=1 </example> <example> Instructions: Let's go down, or maybe not! Wait, let's go right and then down. AI: X=1, Y=1 </example> </examples>
ALWAYS PROVIDE THE FINAL COORDINATES IN THE FORMAT: X=x, Y=y.`
        }, { role: 'user', content: instructions }] as ChatCompletionMessageParam[],
        model: "gpt-4.1-nano",
        stream: false,
        max_completion_tokens: 1024,
        temperature: 1,
        response_format: { type: "text" }
    }) as ChatCompletion;
    const response = chatCompletion.choices[0].message.content as string;
    const match = response.match(/X=(\d+), Y=(\d+)/);
    const alternativeMatch = response.match(/(\d,\d)/);
    if (!match && !alternativeMatch) {
        logger.error('Invalid response from AI', { response });
        throw new Error('Invalid response from AI');
    }
    const x = match ? parseInt(match[1], 10) : parseInt(alternativeMatch![0].split(',')[0], 10);
    const y = match ? parseInt(match[2], 10) : parseInt(alternativeMatch![0].split(',')[1], 10);
    if (x < 0 || x > 3 || y < 0 || y > 3) {
        logger.error('Coordinates out of bounds', { x, y });
        throw new Error('Coordinates out of bounds');
    }

    return { x, y };
}

app.post('/dron', async (c) => {
    try {
        const { instruction } = await c.req.json();
        if (!instruction || typeof instruction !== 'string') {
            logger.error('Invalid instruction');
            return c.json({ error: 'Invalid instruction' }, 400);
        }
        logger.info(`Received instructions: ${instruction}`);
        const { x, y } = await getPosition(instruction);
        logger.debug(`Got coordinates: ${x} ${y} -> ${TERRAIN[y][x]}`);
        return c.json({ description: TERRAIN[y][x] });
    } catch (e) {
        logger.error('Error in /dron', e);
        return c.json({ error: 'Internal Server Error' }, 500);
    }
})

export default app