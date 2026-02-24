import { OpenAIService } from '../OpenAIService';
import { LangfuseService } from '../LangfuseService';
import { submit } from '../common';
import type { LangfuseTraceClient } from "langfuse";
import type { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import fs from 'fs';
import path from 'path';
const pdf = require('pdf-parse');
import { fromPath } from 'pdf2pic';

const MODEL = 'gpt-5-mini-2025-08-07'
const openai = new OpenAIService();
const langfuse = new LangfuseService();

interface Question {
  [key: string]: string;
}

interface Answers {
  [key: string]: string;
}

async function downloadFile(url: string, filepath: string): Promise<void> {
  if (fs.existsSync(filepath)) {
    console.log(`File ${filepath} already exists, skipping download`);
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
  console.log(`Downloaded: ${filepath}`);
}

async function extractTextFromPDF(pdfPath: string): Promise<string> {
  const textPath = pdfPath.replace('.pdf', '_text.txt');

  if (fs.existsSync(textPath)) {
    console.log('Text extraction already done, loading from cache...');
    return fs.readFileSync(textPath, 'utf8');
  }

  console.log('Extracting text from PDF pages 1-18...');
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdf(dataBuffer);

  fs.writeFileSync(textPath, data.text);
  console.log(`Text extracted and saved to: ${textPath}`);

  return data.text;
}

async function ocrPage19(pdfPath: string, trace: LangfuseTraceClient): Promise<string> {
  const ocrPath = pdfPath.replace('.pdf', '_page19_ocr.txt');

  if (fs.existsSync(ocrPath)) {
    console.log('Page 19 OCR already done, loading from cache...');
    return fs.readFileSync(ocrPath, 'utf8');
  }

  console.log('Converting page 19 to image and performing OCR...');

  let result: any;
  try {
    const convert = fromPath(pdfPath, {
      density: 400,
      saveFilename: "page19",
      savePath: "./s04e05/",
      format: "png",
      width: 2480,
      height: 3508
    });

    convert.setGMClass(true);

    console.log('Attempting to convert page 19 using pdf2pic with ImageMagick...');
    result = await convert(19, { responseType: "buffer" });

    if (!result || !result.buffer) {
      throw new Error('Failed to convert page 19 to image - no buffer returned');
    }

    console.log('Page 19 successfully converted to image');
  } catch (conversionError) {
    console.error(`PDF to image conversion failed: ${conversionError}`);
    throw new Error(`PDF conversion failed: ${conversionError}`);
  }

  console.log('Performing OCR on page 19...');
  const span = langfuse.createSpan(trace, 'ocr_page19', { page: 19 });
  const visionPrompt = `Jesteś precyzyjnym czytnikiem odręcznego tekstu po polsku. Przepisz DOSŁOWNIE i KOMPLETNIE cały tekst widoczny na tej stronie notatnika.
Zasady:
- Zachowaj oryginalną interpunkcję, wielkość liter i podział na linie
- Nazwy własne, miejscowości, daty i liczby przepisuj dokładnie
- Nazwy miejscowości weryfikuj z polską geografią — wybieraj wariant tworzący istniejącą polską miejscowość
- Jeśli fragment jest nieczytelny, wstaw [?] w tym miejscu
- NIE parafrazuj ani NIE podsumowuj — przepisz słowo po słowie
- Jeśli są zdjęcia lub rysunki, opisz je krótko w nawiasach kwadratowych`;

  const ocrText = await openai.vision(result.buffer, visionPrompt, 'gpt-5-mini', 4096);
  langfuse.finalizeSpan(span, 'ocr_page19', [{ role: "user", content: visionPrompt }], { 
    choices: [{ message: { content: ocrText } }] 
  } as ChatCompletion);

  fs.writeFileSync(ocrPath, ocrText);
  console.log(`OCR result saved to: ${ocrPath}`);

  const imagePath = `./s04e05/page19.19.png`;
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }

  return ocrText;
}

async function ocrLastPageImage(pdfPath: string, trace: LangfuseTraceClient, page19Ocr = ''): Promise<string> {
  const ocrPath = './s04e05/ostatnia-strona_ocr.txt';

  if (fs.existsSync(ocrPath)) {
    console.log('Last page image OCR already done, loading from cache...');
    return fs.readFileSync(ocrPath, 'utf8');
  }

  console.log('Converting last page PDF to image for visual analysis...');
  const convert = fromPath(pdfPath, {
    density: 400,
    saveFilename: "lastpage",
    savePath: "./s04e05/",
    format: "png",
    width: 2480,
    height: 3508
  });
  convert.setGMClass(true);

  const result = await convert(1, { responseType: "buffer" });
  if (!result?.buffer) throw new Error('Failed to convert last page to image');

  console.log('Analyzing last page image with vision...');
  const span = langfuse.createSpan(trace, 'ocr_lastpage_image', {});
  const visionPrompt = `Jesteś precyzyjnym czytnikiem odręcznego tekstu po polsku. Ta strona zawiera FRAGMENTY POSZARPANEJ KARTKI przyklejone taśmą do tła.
Twoim zadaniem jest:
1. Przepisz DOSŁOWNIE cały odręczny tekst z KAŻDEGO fragmentu kartki, słowo po słowie
2. Zachowaj oryginalną interpunkcję, wielkość liter i podział na linie
3. Nazwy własne, miejscowości i nazwy geograficzne przepisuj SZCZEGÓLNIE DOKŁADNIE — weryfikuj je z polską geografią
4. Nazwy miejscowości weryfikuj z polską geografią — wybieraj wariant tworzący istniejącą polską miejscowość
5. Jeśli fragment jest nieczytelny, wstaw [?] w tym miejscu
6. Opisz też wszelkie elementy wizualne (mapy, szkice, strzałki) jeśli istnieją

Przepisz tekst z KAŻDEGO fragmentu osobno, oznaczając je jako [Fragment górny], [Fragment środkowy], [Fragment dolny].`;

  const rawOcrText = await openai.vision(result.buffer, visionPrompt, 'gpt-4o', 4096);
  langfuse.finalizeSpan(span, 'ocr_lastpage_image', [{ role: "user", content: visionPrompt }], {
    choices: [{ message: { content: rawOcrText } }]
  } as ChatCompletion);

  console.log('Correcting potential OCR misreadings...');
  const correctionSpan = langfuse.createSpan(trace, 'correct_lastpage_ocr', {});
  const crossRef = page19Ocr
    ? `\nDodatkowy kontekst — ten sam obraz odczytany niezależnie przez inny model:\n"""\n${page19Ocr}\n"""\nUżyj obu odczytów do wzajemnej weryfikacji, ale zwróć TYLKO poprawioną wersję pierwszego tekstu.\n`
    : '';
  const correctionPrompt = `Poniżej masz tekst odczytany przez model z odręcznych notatek po polsku. Model mógł coś przekręcić — szczególnie nazwy własne, miejscowości i liczby.
Popraw ewidentne błędy odczytu (np. litery b/n, w/r, ł/l, a/u, y/a mogą być mylone w odręcznym piśmie), zwracając szczególną uwagę na nazwy miejscowości.
Dla nazw geograficznych stosuj NORMALIZACJĘ:
- jeśli odczytana forma nie wygląda na istniejącą miejscowość, popraw ją do najbardziej prawdopodobnej istniejącej polskiej nazwy (minimalna zmiana liter, zgodność z kontekstem)
- przy konstrukcjach typu "X koło Y" traktuj Y jako kotwicę geograficzną i wybieraj realne X pasujące regionalnie
- zwracaj nazwy w formie podstawowej (mianownik), bez odmiany i bez dopowiedzeń
Zwróć TYLKO poprawiony tekst, bez komentarzy.
${crossRef}
TEKST DO POPRAWY:
${rawOcrText}`;

  const correctionMessages: ChatCompletionMessageParam[] = [{ role: "user", content: correctionPrompt }];
  const correctionResponse = await openai.completion(correctionMessages, MODEL, false, false, 4096) as ChatCompletion;
  langfuse.finalizeSpan(correctionSpan, 'correct_lastpage_ocr', correctionMessages, correctionResponse);

  const ocrText = correctionResponse.choices[0]?.message?.content?.trim() || rawOcrText;

  fs.writeFileSync(ocrPath, ocrText);
  console.log(`Last page image analysis saved to: ${ocrPath}`);

  const imagePath = './s04e05/lastpage.1.png';
  if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

  return ocrText;
}

async function answerQuestion(questionId: string, questionText: string, context: string, ocrText: string, trace: LangfuseTraceClient, hints: string[] = [], previousAnswers: any = {}, model = MODEL, lastPageImageOcr = ''): Promise<string> {
  let fullContext = `KONTEKST Z NOTATNIKA (strony 1-18):\n${context}\n\n=== CRITICAL: KONTEKST Z OSTATNIEJ STRONY (19) - OCR (MAY CONTAIN KEY INFORMATION) ===\n${ocrText}\n=== END OCR ===`;
  if (lastPageImageOcr) {
    fullContext += `\n\n=== VISUAL ANALYSIS OF LAST PAGE IMAGES (maps, drawings, photos) ===\n${lastPageImageOcr}\n=== END VISUAL ANALYSIS ===`;
  }

  console.log(`Processing question ${questionId}: ${questionText}`);

  const q05ExtraRules = questionId === '05'
    ? `\n- CRITICAL FOR Q05: destination is on LAST PAGE IMAGE and means intended TRAVEL destination after meeting Andrzej (not shelter from earlier notes)
- CRITICAL FOR Q05: if OCR yields unusual form, test nearest 1-2 letter corrections (especially b<->p, l<->ł, y<->a, u<->a) and choose the most plausible real Polish CITY in this context
- CRITICAL FOR Q05: for phrase patterns like "X koło Y", treat Y as geographic anchor and normalize X to canonical city form
- CRITICAL FOR Q05: reject raw OCR artifacts, inflected/plural forms, and non-destination entities when canonical city normalization is more plausible
- CRITICAL FOR Q05: final answer must be a single canonical city name (one token, mianownik, no extra words)`
    : '';

  const prompt = `<prompt_objective>
Answer the question based on the notebook context. Provide a SHORT, PRECISE answer (a single name, year, date, or place — not a full sentence with reasoning).
</prompt_objective>

<prompt_rules>
- The notebook is CHRONOLOGICAL — entries at the beginning describe events from YEARS BEFORE entries at the end
- CRITICAL: Distinguish between the year Rafał ARRIVED IN (early entries) vs dates mentioned LATER in the notebook (e.g. meeting dates)
- When text contains obscured years like "20... roku", use REAL-WORLD EVENT references in the text to deduce the exact year (e.g. if the text mentions GPT-2 being created, GPT-2 was released by OpenAI in February 2019)
- For name questions: find the exact name of the person described
- For location questions: identify the specific place name (look for biblical references, geographical clues, map/sign labels, or direct mentions)
- If a place name seems OCR-corrupted or non-existent, normalize it to the most likely real Polish locality using nearest-match spelling and contextual anchors (e.g., "X koło Y")
- Return only the canonical place name in Polish (mianownik), without extra words like "koło ...", unless the question explicitly asks for full description
- For date questions: find the exact date in YYYY-MM-DD format${q05ExtraRules}
- If solution_guidance exists, follow it precisely
- Answer in Polish
- Keep answer as SHORT as possible — ideally just the key fact (a year, a name, a place, a date)
</prompt_rules>

<context>
${fullContext}
</context>

<question>
${questionText}
</question>

<solution_guidance>
${hints.length > 0 ? `CRITICAL GUIDANCE from previous analysis:\n${hints.join('\n\n')}` : ''}
</solution_guidance>

Think step by step in <thinking> tags, then provide your SHORT answer in <final_answer> tags.

<thinking>[Your step-by-step reasoning here]</thinking>
<final_answer>[SHORT answer — just the key fact]</final_answer>`;

  const span = langfuse.createSpan(trace, 'answer_question', { questionId, questionText, hints });
  const messages: ChatCompletionMessageParam[] = [
    { role: "user", content: prompt }
  ];
  
  const response = await openai.completion(messages, model, false, false, 4096) as ChatCompletion;
  langfuse.finalizeSpan(span, 'answer_question', messages, response);

  const rawContent = response.choices[0]?.message?.content;
  const refusal = (response.choices[0]?.message as any)?.refusal;
  if (!rawContent) {
    console.error(`Empty response for ${questionId}. Finish reason: ${response.choices[0]?.finish_reason}, refusal: ${refusal}`);
  }

  let answer = rawContent?.trim() || "";
  answer = answer.match(/<final_answer>(.*?)<\/final_answer>/s)?.[1]?.trim()
    || answer.match(/<final_answer>(.*)/s)?.[1]?.trim()
    || answer;
  answer = answer.replace(/<\/?(?:thinking|final_answer)[^>]*>/g, '').trim();
  const isLocationQuestion = /\b(gdzie|dokąd|miejsce)\b/i.test(questionText);
  if (isLocationQuestion && answer) {
    const normalizeSpan = langfuse.createSpan(trace, 'normalize_location_answer', { questionId, questionText, rawAnswer: answer });
    const normalizePrompt = `Ujednolić nazwę miejsca do poprawnej, istniejącej polskiej miejscowości.

Pytanie: ${questionText}
Surowa odpowiedź modelu: ${answer}

Kontekst OCR (może zawierać błędy literowe):
${lastPageImageOcr || ocrText}

Zasady:
- Traktuj surową nazwę jako potencjalnie zniekształconą przez OCR
- Jeśli forma nie jest poprawną nazwą miejscowości, wybierz najbardziej prawdopodobną istniejącą nazwę po minimalnej korekcie liter
- Użyj kotwic geograficznych z kontekstu (np. "X koło Y") do rozstrzygnięcia
- Gdy odczytana nazwa formalnie istnieje, ale wygląda na mało prawdopodobną semantycznie (np. rzadka wieś, forma liczby mnogiej, obiekt niebędący miastem), porównaj bliskie warianty 1-2 literowe i wybierz najbardziej naturalny cel podróży z kontekstu
- Jeśli kontekst dotyczy przelotu/samolotu i celu podróży, preferuj nazwę miasta nad hydronimem/wsią o tej samej lub podobnej pisowni
- Typowe mylone pary OCR: b<->p, l<->ł, y<->a, u<->a — uwzględnij je przy korekcie
- Zwróć wyłącznie nazwę miejscowości w mianowniku, bez dopisków typu "koło ..."
- Zwróć pojedynczy token (jedno słowo) — żadnych wyjaśnień

Zwróć tylko jedną nazwę.`;

    const normalizeMessages: ChatCompletionMessageParam[] = [{ role: "user", content: normalizePrompt }];
    const normalizeResponse = await openai.completion(normalizeMessages, model, false, false, 256, 1) as ChatCompletion;
    langfuse.finalizeSpan(normalizeSpan, 'normalize_location_answer', normalizeMessages, normalizeResponse);

    const normalized = normalizeResponse.choices[0]?.message?.content?.trim();
    if (normalized) answer = normalized;
  }

  console.log(`Answer ${questionId}: ${answer}`);

  return answer;
}

async function parseHintAndProposeSolution(hint: string, questionText: string, previousAnswer: string, trace: LangfuseTraceClient, model = MODEL): Promise<string> {
  console.log(`Analyzing hint for better solution...`);
  
  const q05HintRule = questionText.includes('po spotkaniu z Andrzejem')
    ? `\n- For this destination question, force guidance toward canonical city-name normalization from noisy image OCR (without inventing details)\n- Require final target format: one-word Polish city in mianownik`
    : '';

  const prompt = `You are a precise text analyzer helping solve questions about a Polish notebook. Based on the validator hint, provide SHORT, SPECIFIC guidance for the answering model.

QUESTION: ${questionText}
PREVIOUS WRONG ANSWER: ${previousAnswer}  
VALIDATOR HINT (VERBATIM): ${hint}

RULES:
- The hint is from a validator that KNOWS the correct answer — treat every word as a critical clue
- If the hint mentions "sigla" or "siglum", look for biblical/literary references in the text (e.g. "Iz 2:19" = Izajasz/Isaiah chapter 2, verse 19). The CONTENT of the referenced verse is the clue.
- If the hint mentions "szkic" (sketch), the answer may relate to a shape or pattern described in the text
- Do NOT repeat the wrong answer in any form
- Do NOT speculate broadly — be laser-focused on what the hint actually says
- Write output in Polish${q05HintRule}

OUTPUT exactly two lines:
LINE 1: Co NAPRAWDĘ mówi wskazówka (jedno zdanie)
LINE 2: Dokładna instrukcja dla modelu odpowiadającego — czego szukać i jak to zinterpretować (jedno zdanie)`;

  const span = langfuse.createSpan(trace, 'parse_hint', { hint, questionText, previousAnswer });
  const messages: ChatCompletionMessageParam[] = [
    { role: "user", content: prompt }
  ];
  
  const response = await openai.completion(messages, model, false, false, 4096, 1) as ChatCompletion;
  langfuse.finalizeSpan(span, 'parse_hint', messages, response);

  const solution = response.choices[0]?.message?.content?.trim() || "";
  console.log(`Generated solution: ${solution}`);
  
  return solution;
}

async function main() {
  const PERSONAL_APIKEY = process.env.PERSONAL_APIKEY!;

  try {
    const trace = langfuse.createTrace({
      id: `notes-${Date.now()}`,
      name: 'process_notes',
      sessionId: `session-${Date.now()}`
    });
    
    console.log('Downloading files...');
    const pdfPath = './s04e05/notatnik-rafala.pdf';
    const questionsPath = './s04e05/notes.json';

    await downloadFile(`${process.env.URL}/dane/notatnik-rafala.pdf`, pdfPath);
    await downloadFile(`${process.env.URL}/data/${PERSONAL_APIKEY}/notes.json`, questionsPath);

    const extractedText = await extractTextFromPDF(pdfPath);
    const ocrText = await ocrPage19(pdfPath, trace);
    const lastPageImageOcr = await ocrLastPageImage('./s04e05/ostatnia-strona.pdf', trace, ocrText);

    const questionsContent = fs.readFileSync(questionsPath, 'utf8');
    const questions: Question = JSON.parse(questionsContent);

    const questionEntries = Object.entries(questions).map(([id, text]) => ({ id, text }));

    const questionHints: { [key: string]: string[] } = {};
    const wrongAnswers: { [key: string]: string[] } = {};
    const answers: Answers = {};
    for (const q of questionEntries) answers[q.id] = "nieznane";

    questionHints["05"] = [
      `Q05-specific guidance:
- Treat destination on last-page image as OCR-noisy place string requiring canonical normalization.
- Prefer canonical Polish city name as final output (single word), not a phrase.
- If image shows pattern like "X koło Y", return normalized X only.`
    ];
    const maxRetries = 5;

    for (const question of questionEntries) {
      let accepted = false;

      for (let attempt = 0; attempt < maxRetries && !accepted; attempt++) {
        const hints = questionHints[question.id] || [];
        console.log(`Question ${question.id} (attempt ${attempt + 1}/${maxRetries}): ${question.text}`);

        const isLastQuestion = question === questionEntries[questionEntries.length - 1];
        const answer = await answerQuestion(
          question.id,
          question.text,
          extractedText,
          ocrText,
          trace,
          hints,
          answers,
          MODEL,
          isLastQuestion ? lastPageImageOcr : ''
        );
        answers[question.id] = answer;

        console.log(`Submitting answers...`);
        const response = await submit('notes', answers);
        const result = await response.json();
        console.log(`Submission result: ${JSON.stringify(result)}`);

        if (result.code === 0) {
          console.log(`ALL ANSWERS CORRECT! Task completed.`);
          for (const [qId, ans] of Object.entries(answers)) {
            console.log(`  Q${qId}: ${ans}`);
          }
          accepted = true;
          break;
        }

        const questionMatch = result.message?.match(/Answer for question (\d+) is incorrect/);
        if (!questionMatch) {
          console.error(`Unexpected error: ${result.message}`);
          break;
        }

        const incorrectId = questionMatch[1];
        if (incorrectId !== question.id) {
          console.log(`Q${question.id} ACCEPTED (answer: "${answer}"). Next failing: Q${incorrectId}.`);
          accepted = true;
          break;
        }

        console.log(`Question ${incorrectId} incorrect. Hint: "${result.hint}"`);

        if (!questionHints[incorrectId]) questionHints[incorrectId] = [];
        if (!wrongAnswers[incorrectId]) wrongAnswers[incorrectId] = [];
        if (answer && !wrongAnswers[incorrectId].includes(answer)) {
          wrongAnswers[incorrectId].push(answer);
        }

        const analyzedSolution = await parseHintAndProposeSolution(
          result.hint,
          question.text,
          answer,
          trace
        );
        const wrongList = wrongAnswers[incorrectId].join(', ');
        questionHints[incorrectId].push(`RAW VALIDATOR HINT: "${result.hint}"\n\nPROPOSAL: "${analyzedSolution}"\n\nAVOID these wrong answers: "${wrongList}"`);
      }

      if (!accepted) {
        console.error(`Failed to get correct answer for question ${question.id} after ${maxRetries} attempts.`);
      }
    }

    await langfuse.finalizeTrace(trace, "Notes processing completed", `Processed ${Object.keys(answers).length} questions`);

  } catch (error) {
    console.error(`Error: ${error}`);
  } finally {
    await langfuse.shutdownAsync();
  }
}

main().catch(console.error);
