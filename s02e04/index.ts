// open folder 'pliki_z_fabryki'
// use only files with *.txt, *.png, *.mp3
// use OpenAIService to:
// 1. for *.png read the file and read text from it. Save it to a file with the same name but with .txt extension in folder 'processed'
// 2. for *.mp3 read the file use OpenAI Groq to generate text from it. Save it to a file with the same name but with .txt extension in folder 'processed'
// 3. for *.txt read the file and copy it to folder 'processed'
// 4. Now create a using OpenAIService create summary of all files in folder 'processed'. It should be divided into sections with *thinking* and <final_answer> tags.
// 5. Using OpenAIService and summary create a prompt which will classify all files in folder 'processed' into categories:
// - "people" - should contain information about people
// - "hardware" - should contain information about hardware
// - "other" - contain information which does not fit into other categories
// 6. take all files from 'people' and 'hardware' categories and save it to json structure where filenames are sorted alphabetically, using original file extension. Filenames are case sensivitve.
// i.e.
// { "people": ["file1.mp3", "file2.png"], "hardware": ["file3.txt", "file4.mp3"] }
// 7. save json to file 'summary.json' and use it to submit task using task name 'kategorie'. Data should be encoded in utf-8.

import { promises as fs } from 'fs';
import path from 'path';
import { OpenAIService } from '../OpenAIService';
import { submit } from '../common';

const openaiService = new OpenAIService();

async function processFiles() {
  const sourceDir = path.join(__dirname, '../pliki_z_fabryki');
  const processedDir = path.join(__dirname, 'processed');

  // Create processed directory if it doesn't exist
  await fs.mkdir(processedDir, { recursive: true });

  // Get all files from source directory
  const files = await fs.readdir(sourceDir);
  const relevantFiles = files.filter(file => 
    file.endsWith('.txt') || file.endsWith('.png') || file.endsWith('.mp3')
  );

  console.log('Processing files:', relevantFiles);

  // Step 1-3: Process each file type asynchronously
  const processFile = async (file: string) => {
    const filePath = path.join(sourceDir, file);
    const extension = path.extname(file);
    const baseName = path.basename(file, extension);
    const outputPath = path.join(processedDir, `${baseName}.txt`);

    // Check if file is already processed
    try {
      await fs.access(outputPath);
      console.log(`⏭️  Skipping already processed file: ${file}`);
      return;
    } catch {
      // File doesn't exist, proceed with processing
    }

    try {
      if (extension === '.png') {
        // Process PNG files - extract text using vision
        console.log(`Processing PNG: ${file}`);
        const imageBuffer = await fs.readFile(filePath);
        const extractedText = await openaiService.vision(imageBuffer, "Extract all text from this image. Return only the text content, no additional commentary.");
        await fs.writeFile(outputPath, extractedText, 'utf-8');
        
      } else if (extension === '.mp3') {
        // Process MP3 files - transcribe audio using Groq
        console.log(`Processing MP3: ${file}`);
        const audioBuffer = await fs.readFile(filePath);
        const transcription = await openaiService.transcribeGroq(audioBuffer, 'en');
        await fs.writeFile(outputPath, transcription, 'utf-8');
        
      } else if (extension === '.txt') {
        // Process TXT files - copy to processed folder
        console.log(`Processing TXT: ${file}`);
        const textContent = await fs.readFile(filePath, 'utf-8');
        await fs.writeFile(outputPath, textContent, 'utf-8');
      }
      
      console.log(`✓ Processed: ${file} -> ${baseName}.txt`);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  };

  // Process all files concurrently
  await Promise.all(relevantFiles.map(processFile));

  // Step 4: Create summary of all processed files
  // console.log('Creating summary...');
  // const processedFiles = await fs.readdir(processedDir);
  // let allContent = '';
  // 
  // for (const file of processedFiles) {
  //   if (file.endsWith('.txt')) {
  //     const content = await fs.readFile(path.join(processedDir, file), 'utf-8');
  //     allContent += `\n\n=== FILE: ${file} ===\n${content}`;
  //   }
  // }
  // 
  // const summaryPrompt = `Analyze all the following files and create a comprehensive summary. Divide your response into sections with *thinking* and <final_answer> tags.
  // 
  // *thinking*
  // Think about the content, patterns, and key information across all files.
  // 
  // <final_answer>
  // Provide a structured summary of the information found in all files.
  // 
  // Files content:
  // ${allContent}`;
  // 
  // const summaryResponse = await openaiService.completion([
  //   { role: 'user', content: summaryPrompt }
  // ], 'gpt-4o', false, false, 4000);
  // 
  // const summary = typeof summaryResponse === 'object' && 'choices' in summaryResponse 
  //   ? summaryResponse.choices[0]?.message?.content || ''
  //   : '';

  // Step 5: Classify files into categories
  console.log('Classifying files...');
  
  // Get all processed files
  const processedFiles = await fs.readdir(processedDir);
  const txtFiles = processedFiles.filter(file => file.endsWith('.txt'));

  // Function to classify a single file
  const classifyFile = async (file: string) => {
    const content = await fs.readFile(path.join(processedDir, file), 'utf-8');
    
    const classificationPrompt = `Analyze the following file content and classify it into one of these categories:

people — Contains information about specific captured individuals or traces/signs of their presence. This includes: names, photos, biometric data, identification, personal belongings, or direct evidence of a person's physical presence.

hardware — Contains information about repaired faults or malfunctions in physical equipment or hardware devices. This excludes any software topics or software faults.

software — Contains information about software, applications, code, or software faults. For this task, do not extract software-related information.

other — Contains information unrelated to captured people or hardware repairs, including general supplies, food, materials, directory content, or personal desires (e.g., people wanting pizza). These should be skipped.

Important:

Pay EXTRA attention to notes about captured people (or their traces/signs) OR about repaired hardware faults.

Do NOT extract software-related content.

Output the category exactly as one word in lowercase inside the <final_answer> tag.

Format your response like this:

thinking  
[Your reasoning here]

<final_answer>  
[one of: people, hardware, software, other]  
</final_answer>

<example>
File content:
"Fingerprint identified on the broken glass at the scene."

thinking
The text provides a trace of a captured individual's presence (fingerprint), so it relates to people.

<final_answer>
people
</final_answer>
</example>

<file_content>
${content}
</file_content>`;

    try {
      const response = await openaiService.completion([
        { role: 'user', content: classificationPrompt }
      ], 'gpt-4.1-mini', false, false, 1000);

      const responseContent = typeof response === 'object' && 'choices' in response 
        ? response.choices[0]?.message?.content || ''
        : '';
      
      const match = responseContent.match(/<final_answer>\s*(\w+)\s*<\/final_answer>/i);
      const result = match && match[1] ? match[1].trim().toLowerCase() : 'other';

      console.log(`Classified ${file}: ${result}`);
      return { file, category: result };
    } catch (error) {
      console.error(`Error classifying ${file}:`, error);
      return { file, category: 'other' };
    }
  };

  // Classify all files concurrently
  const classificationResults = await Promise.all(txtFiles.map(classifyFile));

  // Group results by category
  const classification = {
    people: [] as string[],
    hardware: [] as string[],
    other: [] as string[]
  };

  classificationResults.forEach(({ file, category }) => {
    if (category === 'people' || category === 'hardware' || category === 'other') {
      classification[category].push(file);
    } else {
      classification.other.push(file);
    }
  });

  // Step 6: Create final JSON with original extensions and sort alphabetically
  const finalResult = {
    people: [] as string[],
    hardware: [] as string[]
  };

  // Map processed filenames back to original extensions
  const originalExtensions: { [key: string]: string } = {};
  for (const file of relevantFiles) {
    const baseName = path.basename(file, path.extname(file));
    originalExtensions[`${baseName}.txt`] = file;
  }

  // Process people category
  if (classification.people) {
    finalResult.people = classification.people
      .map((file: string) => originalExtensions[file] || file)
      .filter((file: string) => file)
      .sort();
  }

  // Process hardware category
  if (classification.hardware) {
    finalResult.hardware = classification.hardware
      .map((file: string) => originalExtensions[file] || file)
      .filter((file: string) => file)
      .sort();
  }

  // Step 7: Save to summary.json
  const summaryPath = path.join(__dirname, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(finalResult, null, 2), 'utf-8');
  
  console.log('Final classification result:', finalResult);
  
  // Submit the task
  console.log('Submitting task...');
  const response = await submit('kategorie', finalResult);
  console.log('Submission response:', await response.text());
}

// Run the process
processFiles().catch(console.error);
