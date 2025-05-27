import { readFile } from "fs/promises";
import { join } from "path";
import { OpenAIService } from "../OpenAIService";
import type { ChatCompletion, ChatCompletionMessageParam, ChatCompletionContentPartImage, ChatCompletionContentPartText } from "openai/resources/chat/completions";

const openai = new OpenAIService();

(async () => {
    const messages: ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: `You are an expert cartographer and geographical analyst with perfect vision capabilities. You will be provided with up to four map images, where three of them likely belong to the same city in Poland, and one might be an outlier. Your task is to identify the city that appears in three of the images.

Key Information:
- The target city is known as a city of fortresses and a breadbasket.

Analysis Guidelines (Use Chain-of-Thought):
1.  Examine all provided images.
2.  Identify characteristic features: road numbers (especially 534), street names, and objects of interest (shops, cemeteries, parks, bus stops, building layouts, landmarks).
3.  Pay close attention to road numbers. If road N is identified, determine which cities it passes through. Use this list of cities for further focused analysis.
4.  Analyze building layouts and street patterns.
5.  Synthesize all gathered information (road numbers, objects, street layouts, building arrangements, geographical features) to compare with known cities.
6.  Remember and utilize all distinctive features throughout your analysis.

Output Structure:
Provide your analysis within <thinking> tags and your final answer within <result> tags.

<thinking>
[Your detailed reasoning process. Document what specific features you notice in each image (or across images) and how they contribute to identifying the location. Clearly state how road numbers, points of interest, and geographical features lead to your conclusions.]
</thinking>

<result>
[List the most probable city (or cities if uncertain) that appears in three of the maps. For each city, provide a confidence percentage (e.g., "City Name: 85%"). If you are highly uncertain, you may return "unknown" but strive to provide at least one potential candidate with a confidence score.]
</result>
`
        },
        {
            role: "user",
            content: [
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/png;base64,${await readFile(join(__dirname, "image.min.jpeg"), {encoding: "base64"})}`,
                        detail: "high"
                    }
                } as ChatCompletionContentPartImage,
            ]
        }
    ];

    const response = await openai.completion(messages, "gpt-4.1-mini", false, false, 2048, 0.5) as ChatCompletion;

    console.log(`\nDetails:\n${response.choices?.[0]?.message.content}`);
})();