import { OpenAIService } from "../OpenAIService";
import type { ChatCompletionMessageParam, ChatCompletion } from "openai/resources/chat/completions";
const url = process.env.URL;

if (!url) {
  console.error('Error: URL environment variable not set.');
  process.exit(1);
}
const openaiService = new OpenAIService();

async function fetchHtml(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    
    // Use regex to find the element and extract its content
    const regex = /<p id="human-question">([\s\S]*?)<\/p>/;
    const match = html.match(regex);
    
    if (match && match[1]) {
      const questionText = match[1].trim().split('<br />')[1]; // Get the potential question text

      if (questionText) { // Ensure questionText is defined and not empty
        const allMessages: ChatCompletionMessageParam[] = [
          { role: 'system', content: 'Answer the question with a single word.', name: 'Alice' },
          { role: 'user', content: questionText } // Now questionText is guaranteed to be a string
        ];
        const answerResponse = await openaiService.completion(allMessages, "gpt-4.1-nano", false) as ChatCompletion;
        const answerText = answerResponse?.choices?.[0]?.message?.content;
        console.log('Question:', questionText);
        console.log('LLM Answer:', answerText);

        if (answerText) { // Ensure we got an answer before proceeding
          // Prepare POST data
          const postData = new URLSearchParams();
          postData.append('username', 'tester');
          postData.append('password', '574e112a');
          postData.append('answer', answerText); // Use extracted LLM answer text

          // Send POST request
          try {
            console.log(`Sending POST to ${url} with body: ${postData.toString()}`);
            const postResponse = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: postData.toString(),
            });

            if (!postResponse.ok) {
               const errorBody = await postResponse.text();
               console.error(`POST Response Error Status: ${postResponse.status}`);
               console.error(`POST Response Error Body: ${errorBody}`);
               throw new Error(`HTTP error! status: ${postResponse.status}`);
            }

            const postResult = await postResponse.text(); // Or .json() if appropriate
            console.log('POST Response Body:', postResult);

          } catch (postError) {
            console.error('Error sending POST request:', postError);
          }
        } else {
          console.log('LLM did not provide an answer text.');
        }
      } else {
        console.log('Could not extract question text.');
      }
    } else {
      console.log('Question element not found. Cannot proceed with POST.');
    }
    // console.log(html); // Commented out the original log
  } catch (error) {
    console.error('Error fetching HTML:', error);
  }
}

fetchHtml(url); 