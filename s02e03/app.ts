import type { ChatCompletion } from "openai/resources/chat/completions";
import { submit } from "../common.js";
import { OpenAIService } from "../OpenAIService.js";
const PERSONAL_APIKEY = process.env.PERSONAL_APIKEY;
const URL = process.env.URL;

async function main() {
  const openaiService = new OpenAIService();
  const response = await fetch(`${URL}/data/${PERSONAL_APIKEY}/robotid.json`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const data = await response.json() as { description: string };
  console.log(data);
  
  const description = await openaiService.completion([{
    role: "system",
    content: `Generate a prompt combining keywords and extracting keywords from description. Make sure to include IMPORTANT details from <description> tag. This MUST be easily identifiable.

<keywords>
high resolution, playfull, lego themed, realistic scenery, everyday life, natural colors
</keywords>

<description>
${data.description}
</description>

As the final answer provide ONLY final prompt without any additional headings`
  }], "gpt-4o", false, false) as ChatCompletion;
  
  const prompt = description.choices[0]!.message.content!;
  console.log(prompt);

  try {
    const imageUrl = await openaiService.generateImage(
      prompt,
      "1024x1024",
      "hd",
      "natural"
    );
    
    console.log("Image generated successfully!");
    console.log("🔗 Image URL:", imageUrl);
    const flag = await submit('robotid', imageUrl);
    console.log("Flag:", await flag.json());
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
