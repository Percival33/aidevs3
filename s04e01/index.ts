import { submit } from "../common";
import { LangfuseService } from "../LangfuseService";
import { OpenAIService } from "../OpenAIService";
import type { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Langfuse, LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';

import { createLogDash } from '@logdash/js-sdk';


class Solution {
  private readonly openai: OpenAIService;
  private readonly langfuse: LangfuseService;
  private photosOfBarbara: string[];
  private trace: LangfuseTraceClient | null = null;
  public logger: { info: (message: string) => void; error: (message: string) => void; warn: (message: string) => void };
  constructor() {
    this.openai = new OpenAIService();
    this.langfuse = new LangfuseService();
    this.photosOfBarbara = [];
    this.logger = createLogDash({
      apiKey: process.env.LOGDASH_API_KEY || ''
    }).logger;
  }

  async extractPhotos(prompt: string) {
    this.logger.info("Starting photo extraction from prompt");
    const span = this.langfuse.createSpan(this.trace!, 'extractPhotos');

    try {
      const messages = [
        {
          role: 'system', content: `You are a helpful assistant that extracts photos from a text. Extract all images names from the text AND the url of the image. Return the result in JSON json format. 
        <response>{"photos": ["IMG_0001.jpg", "IMG_0002.jpg"], "url": "https://example.com/aaa/bbb"}</response>
        
        Remember to return the url without the last slash.
        ` },
        { role: 'user', content: prompt }
      ] as ChatCompletionMessageParam[];

      const response = await this.openai.completion(
        messages,
        'gpt-4.1-nano',
        false,
        true,
        1024,
        1
      ) as ChatCompletion;

      const content = JSON.parse(response.choices[0]?.message.content || '{}');
      const result = {
        photos: content?.photos.map((el: string) => {
          return el.replace('.PNG', '-small.PNG').replaceAll('"', '');
        }) || [],
        url: content?.url || ''
      };

      this.logger.info(`Successfully extracted ${result.photos.length} photos from URL: ${result.url}`);

      if (span) {
        await this.langfuse.finalizeSpan(span, 'extractPhotos', messages, response);
      }

      return result;
    } catch (error) {
      this.logger.error(`Error extracting photos: ${error}`);
      if (span) {
        await this.langfuse.finalizeSpan(span, 'extractPhotos', [], error as string);
      }
      throw error;
    }
  }

  async repairPhoto(photo: string): Promise<string> {
    this.logger.info(`Starting photo repair for: ${photo}`);
    const span = this.langfuse.createSpan(this.trace!, `repairPhoto-${photo}`);

    try {
      const response = await submit('photos', `REPAIR ${photo}`);
      const { message } = await response.json();
      this.logger.info(`Photo repair completed for: ${photo}`);

      if (span) {
        await this.langfuse.finalizeSpan(span, `repairPhoto-${photo}`, [{ role: 'user', content: `REPAIR ${photo}` }], message);
      }
      return message;
    } catch (error) {
      this.logger.error(`Error repairing photo ${photo}: ${error}`);
      if (span) {
        await this.langfuse.finalizeSpan(span, `repairPhoto-${photo}`, [{ role: 'user', content: `REPAIR ${photo}` }], error as string);
      }
      throw error;
    }
  }

  async darkenPhoto(photo: string): Promise<string> {
    this.logger.info(`Starting photo darkening for: ${photo}`);
    const span = this.langfuse.createSpan(this.trace!, `darkenPhoto-${photo}`);

    try {
      const response = await submit('photos', `DARKEN ${photo}`);
      const { message } = await response.json();
      this.logger.info(`Photo darkening completed for: ${photo}`);

      if (span) {
        await this.langfuse.finalizeSpan(span, `darkenPhoto-${photo}`, [{ role: 'user', content: `DARKEN ${photo}` }], message);
      }
      return message;
    } catch (error) {
      this.logger.error(`Error darkening photo ${photo}: ${error}`);
      if (span) {
        await this.langfuse.finalizeSpan(span, `darkenPhoto-${photo}`, [{ role: 'user', content: `DARKEN ${photo}` }], error as string);
      }
      throw error;
    }
  }

  async brightenPhoto(photo: string): Promise<string> {
    this.logger.info(`Starting photo brightening for: ${photo}`);
    const span = this.langfuse.createSpan(this.trace!, `brightenPhoto-${photo}`);

    try {
      const response = await submit('photos', `BRIGHTEN ${photo}`);
      const { message } = await response.json();
      this.logger.info(`Photo brightening completed for: ${photo}`);

      if (span) {
        await this.langfuse.finalizeSpan(span, `brightenPhoto-${photo}`, [{ role: 'user', content: `BRIGHTEN ${photo}` }], message);
      }
      return message;
    } catch (error) {
      this.logger.error(`Error brightening photo ${photo}: ${error}`);
      if (span) {
        await this.langfuse.finalizeSpan(span, `brightenPhoto-${photo}`, [{ role: 'user', content: `BRIGHTEN ${photo}` }], error as string);
      }
      throw error;
    }
  }


  async processResponse(serviceResponse: string, step: string, photo: string) {
    this.logger.info(`Processing response for photo: ${photo}, step: ${step}`);
    const span = this.langfuse.createSpan(this.trace!, `processResponse-${photo}`, { serviceResponse, step, photo });

    try {
      const messages = [
        {
          role: 'system', content: `
        <main_objective>Based on the service response, last step, and the photo name before this step, extract new photo name from serviceResponse.</main_objective>
        <service_response>${serviceResponse.replace('.PNG', '-small.PNG')}</service_response>
        <last_step>${step}</last_step>
        <photo_name>${photo.replace('.PNG', '-small.PNG')}</photo_name>

        <EXAMPLE>
        IMG_0001-small.PNG
        </EXAMPLE>

        Return only the new photo name. IT SHOULD NOT CONTAIN URL. DO NOT CHANGE THE FILE EXTENSION.
        <response>
        </response>
        ` },
        { role: 'user', content: serviceResponse }
      ] as ChatCompletionMessageParam[];

      const response = await this.openai.completion(messages, 'gpt-4.1-nano', false, false, 1024, 1) as ChatCompletion;
      const newPhotoName = response.choices[0]?.message.content || '';

      this.logger.info(`Successfully processed response for photo: ${photo} -> ${newPhotoName}`);

      if (span) {
        await this.langfuse.finalizeSpan(span, `processResponse-${photo}`, messages, response);
      }

      return newPhotoName;
    } catch (error) {
      this.logger.error(`Error processing response for photo ${photo}: ${error}`);
      if (span) {
        await this.langfuse.finalizeSpan(span, `processResponse-${photo}`, [], error as string);
      }
      throw error;
    }
  }

  async processPhoto(photo: string, url: string) {
    this.logger.info(`Starting photo processing for: ${photo}`);
    let steps: string[] = [];
    const decidePrompt = `<main_objective>Analyze the photo and decide what tools to use to improve the photo. If you think the photo is already good, return "NONE".</main_objective>
      <tools_to_use>
      - DARKEN - darken the photo which is too bright
      - BRIGHTEN - brighten the photo which is too dark
      - REPAIR - repair the photo which is damaged
      </tools_to_use>
      <steps>${steps.length ? steps.join(', ') : 'none taken yet'}</steps>
      
      Return name of action which should be taken next. If you think the photo is already good, return "NONE". DO NOT RETURN ANYTHING ELSE.
      `;

    let iteration = 0;
    const maxIterations = 3;
    let currentPhoto = photo;
    let serviceResponse = '';

    while (iteration < maxIterations) {
      this.logger.info(`Processing photo iteration ${iteration + 1}/${maxIterations} for: ${currentPhoto}`);
      const span = this.langfuse.createSpan(this.trace!, `processPhoto-${photo}-${iteration}`, { decidePrompt, currentPhoto });

      try {
        const response = await this.openai.visionUrl(`${url}/${currentPhoto}`, decidePrompt);
        this.logger.info(`AI decision for ${currentPhoto}: ${response}`);

        switch (response.toLowerCase()) {
          case 'darken':
            this.logger.info(`Executing DARKEN operation on ${currentPhoto}`);
            serviceResponse = await this.darkenPhoto(currentPhoto);
            steps.push('darken');
            break;
          case 'brighten':
            this.logger.info(`Executing BRIGHTEN operation on ${currentPhoto}`);
            serviceResponse = await this.brightenPhoto(currentPhoto);
            steps.push('brighten');
            break;
          case 'repair':
            this.logger.info(`Executing REPAIR operation on ${currentPhoto}`);
            serviceResponse = await this.repairPhoto(currentPhoto);
            steps.push('repair');
            break;
          case 'none':
            this.logger.info(`No further processing needed for ${currentPhoto}`);
            if (span) {
              await this.langfuse.finalizeSpan(span, `processPhoto-${photo}-${iteration}`, [{ role: 'user', content: 'NONE' }], `${currentPhoto} - no action needed`);
            }
            return currentPhoto;
          default:
            this.logger.warn(`Unknown AI response for ${currentPhoto}: ${response}`);
            break;
        }

        if (serviceResponse) {
          currentPhoto = await this.processResponse(serviceResponse, steps[steps.length - 1] || 'none', currentPhoto);
          this.logger.info(`Photo processing step completed: ${steps[steps.length - 1]} -> ${currentPhoto}`);
        }

        iteration++;

        // Finalize span on successful completion
        if (span) {
          await this.langfuse.finalizeSpan(span, `processPhoto-${photo}-${iteration}`, [{ role: 'user', content: serviceResponse }], `${currentPhoto} ${iteration} ${response} ${steps.join(', ')}`);
        }
      } catch (error) {
        this.logger.error(`Error in photo processing iteration ${iteration} for ${photo}: ${error}`);
        console.error(error);

        // Finalize span with error information
        if (span) {
          await this.langfuse.finalizeSpan(span, `processPhoto-${photo}-${iteration}`, [{ role: 'user', content: serviceResponse }], error as string);
        }

        process.exit(1);
      }
    }

    this.logger.info(`Photo processing completed for ${photo}. Final result: ${currentPhoto}, Steps taken: ${steps.join(', ')}`);
    return currentPhoto;
  }
  async findPersonAndCreateDescription(photos: string[], url: string) {
    this.logger.info(`Starting person identification and description for ${photos.length} photos`);

    try {
      this.logger.info("Starting Barbara identification process with iterative photo analysis");

      let iteration = 0;
      const maxIterations = 3;
      let hints: string[] = [];

      while (iteration < maxIterations) {
        this.logger.info(`Barbara identification attempt ${iteration + 1}/${maxIterations} - generating fresh photo descriptions`);

        const descriptions: string[] = await Promise.all(photos.map(async (photo: string, index: number) => {
          if (!photo.endsWith('-small.PNG')) {
            photo = photo.replace('.PNG', '-small.PNG');
          }
          this.logger.info(`Analyzing photo ${index + 1}/${photos.length}: ${photo} (attempt ${iteration + 1})`);
          const response = await this.openai.visionUrl(`${url}/${photo}`, `You have perfect vision and excel at identifying distinctive features. Analyze this image with forensic precision, focusing on people and their unique characteristics.

<analysis_framework>
For each person in the image, systematically describe:

**PHYSICAL FEATURES:**
- Facial structure: face shape, jawline, cheekbones, forehead
- Eyes: color, shape, size, spacing, eyebrows (shape, thickness, color)
- Nose: shape, size, bridge characteristics
- Mouth: lip shape, size, smile characteristics
- Hair: color, style, length, texture, hairline
- Skin tone and any visible marks/scars/freckles
- Body type and posture

**DISTINCTIVE MARKS:**
- Birthmarks, scars, tattoos, piercings
- Unique facial features or asymmetries
- Glasses, jewelry, or accessories
- Any other identifying characteristics

**CLOTHING & CONTEXT:**
- Detailed clothing description (colors, patterns, style)
- Background elements and setting
- Person's position and pose in the image
- Any objects they're holding or interacting with
</analysis_framework>

<hints>${hints.length ? hints.join('\n') : 'No specific hints provided yet'}</hints>

**CRITICAL:** Use the hints above to refine your analysis. If hints mention specific features, pay extra attention to those details.

Provide a comprehensive description for each person, emphasizing unique identifying features that would help distinguish them from others. Be extremely detailed and specific.`);
          return response;
        }));

        this.logger.info(`Photo analysis completed for attempt ${iteration + 1}, processing Barbara identification`);
        const span = this.langfuse.createSpan(this.trace!, `findPersonAndCreateDescription-${iteration}`, { photos, url, descriptions, hints });

        try {
          const response = await this.openai.completion([
            {
              role: 'system', content: `
<main_objective>
You are an expert in person identification. Analyze the provided photo descriptions to identify Barbara - a woman who likely appears in multiple photos. Use distinctive features and cross-reference details to make an accurate identification.
</main_objective>

<identification_strategy>
1. **Cross-Reference Analysis:** Look for a woman described in multiple photos with consistent distinctive features
2. **Distinctive Feature Matching:** Focus on unique physical characteristics that remain consistent across descriptions:
   - Facial structure and features (eyes, nose, mouth, face shape)
   - Hair characteristics (color, style, length)
   - Body type and height indicators
   - Unique marks (scars, birthmarks, accessories)
3. **Consistency Check:** Verify that clothing may vary but core physical features remain consistent
4. **Elimination Process:** Rule out descriptions that don't match established Barbara characteristics
</identification_strategy>

<photo_descriptions>
${descriptions.join('\n\n---PHOTO SEPARATOR---\n\n')}
</photo_descriptions>

<hints>
${hints.length ? hints.join('\n') : 'No specific hints provided yet - rely on cross-referencing consistent features across multiple photos'}
</hints>

<critical_instructions>
- Barbara is a woman who should appear in multiple photos with consistent physical features
- Pay special attention to hints - they provide crucial guidance for identification
- Focus on distinctive physical features that don't change (facial structure, eye color, etc.)
- Ignore clothing variations - focus on permanent physical characteristics
- If multiple women appear, choose the one with most consistent cross-photo matches
- Be extremely detailed in your description, including all distinctive features found
- Use polish language
</critical_instructions>

<output_requirements>
Return ONLY a detailed description of Barbara focusing on her distinctive physical features. Include:
- Most prominent identifying characteristics
- Physical features that make her recognizable
- Any unique marks or distinguishing features
- Clothing description from the clearest photo
- OPIS MUSI BYĆ PO POLSKU

If you cannot confidently identify Barbara from the descriptions, return exactly: "Barbara not found"
</output_requirements>
              ` },
          ], 'gpt-4.1-mini', false, false, 2048, 1) as ChatCompletion;

          const candidateDescription = response.choices[0]?.message.content || '';
          this.logger.info(`Generated description candidate: ${candidateDescription.substring(0, 100)}...`);

          const serviceRet = await submit('photos', candidateDescription);
          const serviceResponse = await serviceRet.json();

          this.logger.info(`Service response code: ${serviceResponse.code}, message: ${serviceResponse.message?.substring(0, 100) || 'N/A'}...`);

          if (span) {
            await this.langfuse.finalizeSpan(span, `findPersonAndCreateDescription-${iteration}`, [{ role: 'user', content: descriptions.join('\n') }], JSON.stringify(serviceResponse));
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          if (serviceResponse.code === 0) {
            this.logger.info("Barbara successfully identified and description accepted!");
            return serviceResponse.message;
          }

          if (serviceResponse.hints) {
            hints.push(serviceResponse.hints);
            this.logger.warn(`Attempt ${iteration + 1} failed, received hint: ${serviceResponse.hints}`);
          } else {
            this.logger.warn(`Attempt ${iteration + 1} failed, no hints provided`);
          }

          iteration++;
        } catch (error) {
          this.logger.error(`Error in Barbara identification iteration ${iteration}: ${error}`);
          if (span) {
            await this.langfuse.finalizeSpan(span, `findPersonAndCreateDescription-${iteration}`, [{ role: 'user', content: descriptions.join('\n') }], error as string);
          }
          throw error;
        }
      }

      this.logger.error("Failed to identify Barbara after all attempts");
      return 'ERROR';
    } catch (error) {
      this.logger.error(`Error in findPersonAndCreateDescription: ${error}`);
      throw error;
    }
  }

  async describePerson() {
    this.logger.info("Starting describePerson workflow");

    try {
      this.trace = this.langfuse.createTrace({ id: `photos-task-${Date.now()}`, name: 'photos', sessionId: `session-${Date.now()}` });
      this.logger.info("Langfuse trace created successfully");

      this.logger.info("Submitting START command to photos service");
      const startPrompt = await submit('photos', 'START');
      const startPromptText = await startPrompt.json();
      this.logger.info("START command completed, extracting photo information");

      const { photos, url } = await this.extractPhotos(startPromptText.message);
      this.logger.info(`Extracted ${photos.length} photos from URL: ${url}`);
      console.log(photos, url);

      this.logger.info("Starting photo processing phase");
      const processedPhotos: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        this.logger.info(`Processing photo ${i + 1}/${photos.length}: ${photo}`);

        const processedPhoto = await this.processPhoto(photo, url);
        processedPhotos.push(processedPhoto);

        this.logger.info(`Photo ${i + 1} processed: ${photo} -> ${processedPhoto}`);
        this.logger.info("Waiting 1 second before next photo...");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.logger.info("All photos processed, starting Barbara identification");
      const description = await this.findPersonAndCreateDescription(processedPhotos, url);

      if (description !== 'ERROR') {
        this.logger.info("Barbara identification successful");
        this.logger.info(`Final description: ${description.substring(0, 200)}...`);
      } else {
        this.logger.error("Barbara identification failed");
      }

      this.langfuse.finalizeTrace(this.trace, startPromptText, description);
      this.logger.info("Workflow completed successfully");
      return description;
    } catch (error) {
      this.logger.error(`Critical error in describePerson workflow: ${error}`);
      console.error(error);
      this.langfuse.finalizeTrace(this.trace!, error, error);
      return 'ERROR'
    }
  }
}

async function main() {
  console.log("🚀 Application started - Photo Processing and Barbara Identification");

  try {
    const photoDescriber = new Solution();
    photoDescriber.logger.info("Application started successfully");

    const flag = await photoDescriber.describePerson();

    if (flag !== 'ERROR') {
      photoDescriber.logger.info("Application completed successfully");
      console.log("✅ Final result:", flag);
    } else {
      photoDescriber.logger.error("Application completed with errors");
      console.log("❌ Application failed");
    }

    console.log(flag);
  } catch (error) {
    console.error("💥 Critical application error:", error);
    process.exit(1);
  }
}

main().then(() => {
  console.log("🏁 Application finished");
  process.exit(0);
}).catch((error) => {
  console.error("💥 Unhandled application error:", error);
  process.exit(1);
});