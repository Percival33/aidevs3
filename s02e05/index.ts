import { OpenAIService } from '../OpenAIService';
import { PROMPTS } from './prompts';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { submit } from '../common';
import type { ChatCompletion } from "openai/resources/chat/completions";
import TurndownService from 'turndown';

interface MediaFile {
  url: string;
  filename: string;
  altText?: string | null;
  caption?: string | null;
}

const openai = new OpenAIService();
const processedDir = path.join(__dirname, 'processed');


function ensureProcessedDir(): void {
  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
    console.log(`Created processed directory: ${processedDir}`);
  }
}

// Download HTML content from URL
async function downloadHtml(url: string): Promise<string> {
  console.log('Downloading HTML...');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download HTML: ${response.status}`);
  }
  return await response.text();
}

// Parse HTML and extract media URLs and text content
function parseHtml(htmlContent: string, baseUrl: string): {
  images: MediaFile[],
  audioFiles: MediaFile[],
  textContent: string
} {
  console.log('Parsing HTML content...');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  // Extract images
  const images: MediaFile[] = [];
  const imgElements = document.querySelectorAll('img');
  imgElements.forEach((img: HTMLImageElement, index: number) => {
    const src = img.getAttribute('src');
    if (src) {
      const fullUrl = new URL(src, baseUrl).href;
      images.push({
        url: fullUrl,
        filename: `image_${index + 1}.${getFileExtension(fullUrl) || 'jpg'}`,
        altText: img.getAttribute('alt') || null,
        caption: img.getAttribute('title') || img.nextElementSibling?.textContent || null
      });
    }
  });

  // Extract audio files
  const audioFiles: MediaFile[] = [];
  const audioElements = document.querySelectorAll('audio source, a[href$=".mp3"], a[href*=".mp3"]');
  audioElements.forEach((audio: Element, index: number) => {
    const src = audio.getAttribute('src') || audio.getAttribute('href');
    if (src) {
      const fullUrl = new URL(src, baseUrl).href;
      audioFiles.push({
        url: fullUrl,
        filename: `audio_${index + 1}.mp3`
      });
    }
  });

  // Extract text content
  const textContent = document.body?.innerHTML || htmlContent;

  console.log(`Found ${images.length} images and ${audioFiles.length} audio files`);
  return { images, audioFiles, textContent };
}

async function downloadImages(images: MediaFile[]): Promise<Array<{ buffer: Buffer, metadata: MediaFile }>> {
  console.log('Downloading images...');
  const results = [];

  for (const image of images) {
    try {
      const response = await fetch(image.url);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        results.push({ buffer, metadata: image });
        console.log(`Downloaded: ${image.filename}`);
      }
    } catch (error) {
      console.error(`Failed to download image ${image.url}:`, error);
    }
  }

  return results;
}

// Download all audio files
async function downloadAudio(audioFiles: MediaFile[]): Promise<Array<{ buffer: Buffer, metadata: MediaFile }>> {
  console.log('Downloading audio files...');
  const results = [];

  for (const audio of audioFiles) {
    try {
      const response = await fetch(audio.url);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        results.push({ buffer, metadata: audio });
        console.log(`Downloaded: ${audio.filename}`);
      }
    } catch (error) {
      console.error(`Failed to download audio ${audio.url}:`, error);
    }
  }

  return results;
}

// Convert HTML to Markdown using turndown
async function processHtmlToMarkdown(htmlContent: string): Promise<string> {
  console.log('Converting HTML to Markdown...');

  try {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      fence: '```'
    });

    const markdownContent = turndownService.turndown(htmlContent);
    const filePath = path.join(processedDir, 'content.md');
    fs.writeFileSync(filePath, markdownContent, 'utf-8');
    console.log(`Saved markdown content to: ${filePath}`);

    return markdownContent;
  } catch (error) {
    console.error('Error processing HTML to markdown:', error);
    return '';
  }
}

// Modified function to process media and return descriptions
async function processImagesForDescriptions(imageBuffers: Array<{ buffer: Buffer, metadata: MediaFile }>): Promise<Map<string, string>> {
  console.log('Generating image captions...');
  const descriptions = new Map<string, string>();

  const captionPromises = imageBuffers.map(async ({ buffer, metadata }) => {
    try {
      const contextInfo = [
        metadata.altText ? `Alt text: ${metadata.altText}` : '',
        metadata.caption ? `Caption: ${metadata.caption}` : ''
      ].filter(Boolean).join('\n');

      const prompt = `${PROMPTS.IMAGE_CAPTION}
      
      ${contextInfo ? `Context information:\n${contextInfo}\n` : ''}`;

      const caption = await openai.vision(buffer, prompt);
      const filename = metadata.filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '_caption.txt');
      const filePath = path.join(processedDir, filename);
      await fs.promises.writeFile(filePath, caption, 'utf-8');
      console.log(`Saved caption to: ${filePath}`);

      // Store description with URL as key
      descriptions.set(metadata.url, caption);
    } catch (error) {
      console.error(`Error generating caption for ${metadata.filename}:`, error);
    }
  });

  await Promise.all(captionPromises);
  return descriptions;
}

async function processAudioForDescriptions(audioBuffers: Array<{ buffer: Buffer, metadata: MediaFile }>): Promise<Map<string, string>> {
  console.log('Transcribing audio files...');
  const descriptions = new Map<string, string>();

  const transcriptionPromises = audioBuffers.map(async ({ buffer, metadata }) => {
    try {
      const transcript = await openai.transcribeGroq(buffer, 'pl');
      const filename = metadata.filename.replace('.mp3', '_transcript.txt');
      const filePath = path.join(processedDir, filename);
      await fs.promises.writeFile(filePath, transcript, 'utf-8');
      console.log(`Saved transcript to: ${filePath}`);

      // Store description with URL as key
      descriptions.set(metadata.url, transcript);
    } catch (error) {
      console.error(`Error transcribing ${metadata.filename}:`, error);
    }
  });

  await Promise.all(transcriptionPromises);
  return descriptions;
}

// Function to replace media elements with descriptions in HTML
function replaceMediaWithDescriptions(
  htmlContent: string,
  baseUrl: string,
  imageDescriptions: Map<string, string>,
  audioDescriptions: Map<string, string>
): string {
  console.log('Replacing media elements with descriptions...');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  // Replace images with descriptions
  const imgElements = document.querySelectorAll('img');
  imgElements.forEach((img: HTMLImageElement) => {
    const src = img.getAttribute('src');
    if (src) {
      const fullUrl = new URL(src, baseUrl).href;
      const description = imageDescriptions.get(fullUrl);
      if (description) {
        const descriptionElement = document.createElement('div');
        descriptionElement.textContent = `[Image description: ${description}]`;
        img.parentNode?.replaceChild(descriptionElement, img);
      }
    }
  });

  // Replace audio elements with descriptions
  const audioElements = document.querySelectorAll('audio');
  audioElements.forEach((audio: HTMLAudioElement) => {
    const source = audio.querySelector('source');
    const src = source?.getAttribute('src');
    if (src) {
      const fullUrl = new URL(src, baseUrl).href;
      const description = audioDescriptions.get(fullUrl);
      if (description) {
        const descriptionElement = document.createElement('div');
        descriptionElement.textContent = `[Audio transcript: ${description}]`;
        audio.parentNode?.replaceChild(descriptionElement, audio);
      }
    }
  });

  // Replace audio links with descriptions
  const audioLinks = document.querySelectorAll('a[href$=".mp3"], a[href*=".mp3"]');
  audioLinks.forEach((link: Element) => {
    const href = (link as HTMLAnchorElement).getAttribute('href');
    if (href) {
      const fullUrl = new URL(href, baseUrl).href;
      const description = audioDescriptions.get(fullUrl);
      if (description) {
        const descriptionElement = document.createElement('div');
        descriptionElement.textContent = `[Audio transcript: ${description}]`;
        link.parentNode?.replaceChild(descriptionElement, link);
      }
    }
  });

  return dom.serialize();
}

function getFileExtension(url: string): string | null {
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match && match[1] ? match[1] : null;
}

// Main processing function
async function processWebsite(url: string): Promise<string> {
  console.log(`Processing website: ${url}`);

  ensureProcessedDir();

  const htmlContent = await downloadHtml(url);

  const { images, audioFiles, textContent } = parseHtml(htmlContent, url);

  const [imageBuffers, audioBuffers] = await Promise.all([
    downloadImages(images),
    downloadAudio(audioFiles)
  ]);

  // Process media files to get descriptions
  const [imageDescriptions, audioDescriptions] = await Promise.all([
    processImagesForDescriptions(imageBuffers),
    processAudioForDescriptions(audioBuffers)
  ]);

  // Replace media elements with descriptions in HTML
  const htmlWithDescriptions = replaceMediaWithDescriptions(
    textContent,
    url,
    imageDescriptions,
    audioDescriptions
  );

  // Convert modified HTML to markdown
  const markdownContent = await processHtmlToMarkdown(htmlWithDescriptions);

  console.log('All processing completed!');
  return markdownContent;
}

// Main execution
(async () => {
  const targetUrl = `${process.env.URL}/dane/arxiv-draft.html`;

  try {
    let markdownContent = '';
    if (!fs.existsSync(path.join(processedDir, 'content.md'))) {
      markdownContent = await processWebsite(targetUrl);
    } else {
      markdownContent = fs.readFileSync(path.join(processedDir, 'content.md'), 'utf-8');
    }

    const questions = await fetch(`${process.env.URL}/data/${process.env.PERSONAL_APIKEY}/arxiv.txt`).then(res => res.text());

    const response = await openai.completion([
      { role: 'system', content: `Here is context of the website that you should use to answer the questions. <context>${markdownContent}</context>` },
      {
        role: 'user',
        content: `Answer the following questions using one sentence. Use relevant context from the website.\n<questions>${questions}</questions>\nAnswer each question using json format: \n` +
          `{
          "01": "answer",
          "02": "answer",
          ...
        }`
      }
    ], 'gpt-4.1-mini', false, false, 2000) as ChatCompletion;

    const answer = JSON.parse(response.choices[0]?.message?.content || '{}');
    console.log(answer);
    const systemResponse = await submit('arxiv', answer);
    console.log(await systemResponse.text());
  } catch (error) {
    console.error('Error processing website:', error);
    process.exit(1);
  }
})();