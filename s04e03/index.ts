import {submit} from "../common.ts";
import {NodeHtmlMarkdown} from "node-html-markdown";
import {LangfuseService} from "../LangfuseService.ts";
import {createLogDash, Logger} from '@logdash/js-sdk';
import type {LangfuseTraceClient} from "langfuse";
import type {ChatCompletion, ChatCompletionMessageParam} from "openai/resources/chat/completions";
import assert from "node:assert";
import {OpenAIService} from "../OpenAIService.ts";

const URL = process.env.URL;
const PERSONAL_APIKEY = process.env.PERSONAL_APIKEY;
const SOFTO_PAGE = process.env.SOFTO_PAGE;

interface IState {
    currentPage: string;
    question: string;
    step: number;
    maxSteps: number;
    history: Array<string>;
    trace: LangfuseTraceClient
}


class Assistant {
    private nhm: NodeHtmlMarkdown;
    private langfuseService: LangfuseService;
    private openai: OpenAIService;
    private logger: Logger;
    visited: Map<string, string>;

    constructor(logger: Logger) {
        this.logger = logger;
        this.nhm = new NodeHtmlMarkdown();
        this.openai = new OpenAIService();
        this.langfuseService = new LangfuseService();
        this.visited = new Map();
    }

    async getMarkdownPage(url: string): Promise<string> {
        if (this.visited.has(url)) {
            this.logger.info(`Already visited: ${url}`);
            return this.visited.get(url) as string;
        }
        this.logger.info(`Fetching page: ${url}`);
        const page = await fetch(url).then(res => res.text());
        const text = this.nhm.translate(page);
        this.visited.set(url, text);
        return this.visited.get(url) as string;
    }

    initializeState(question: string, trace: LangfuseTraceClient): IState {
        return {
            currentPage: SOFTO_PAGE!,
            question,
            step: 0,
            maxSteps: 5,
            history: [],
            trace
        };
    }

    async answerQuestion(state: IState, pageContent: string): Promise<{ code: number, text: string }> {
        const span = this.langfuseService.createSpan(state.trace, 'answer_question', state);
        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system', content: `You are an AI assistant that helps navigate a website to find answers to questions.

Answer the question based solely on the provided page content in markdown. If you cannot find the answer in the page content, set OK to false, provide a detailed reason, and leave ANSWER as an empty string.

<page_content>
${pageContent}
</page_content>

<question>
${state.question}
</question>

When the answer is NOT found, your REASON must include:
1. Why the current page doesn't contain the answer
2. Specific suggestions for 2-3 alternative pages/sections that might contain the answer, based on:
   - Links mentioned in the current page content
   - Common website sections for this type of information (e.g., FAQ, About, Contact, Pricing, Documentation, Support)
   - Related topics or categories that would logically contain this information
   - Any navigation menus, site maps, or directory structures visible on the page

Example REASON format when answer not found:
"This page focuses on [current page topic] but doesn't contain information about [question topic]. Try checking: 1) [specific page/section name] - likely contains [why relevant], 2) [another specific page] - typically has [type of info], 3) [third option] - might include [relevant details]."

<response_format>
OK: boolean, true when answer found, false otherwise
REASON: string, detailed explanation why answer not found + 2-3 specific page suggestions with reasoning
ANSWER: string, the answer to the question or empty string if not found
</response_format>

DO NOT RESPOND WITH ANYTHING ELSE.`
            },
        ];
        const answer = await this.openai.completion(messages) as ChatCompletion;
        this.langfuseService.finalizeSpan(span, 'answer_question', messages, answer);

        const answerText: string = answer.choices[0]?.message.content!;
        this.logger.debug(`Answer response: ${answerText}`);
        if (answerText.includes('OK: true')) {
            return {
                code: 0,
                text: answerText.split('ANSWER:')[1]?.trim() || ""
            }
        }
        return {
            code: -1,
            text: answerText.split('REASON:')[1]?.trim() || ""
        }
    }

    async decideNext(state: IState, pageContent: string, reason: string): Promise<{ code: number; text: string }> {
        const span = this.langfuseService.createSpan(state.trace, 'decide_next', state);
        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system', content: `You are an expert web navigation assistant. Your goal: Choose the next page to visit that maximizes chances of answering the question.

CONTEXT:
- Question: ${state.question}
- Current page content (markdown): ${pageContent}
- Visited pages (avoid these): ${state.history.length ? state.history.join(', ') : 'None'}
- Reason previous page failed: ${reason}

INSTRUCTIONS:
- Extract and evaluate links from pageContent based on relevance to question (anchor text, URL, context).
- Prioritize high-relevance, unvisited links; prefer specific content over general nav.
- If no good options, pick the most promising available.

<response_format>
THINKING: (optional) Brief reasoning for choice
URL: Full URL starting with ${SOFTO_PAGE} (e.g., ${SOFTO_PAGE}/path/to/page)
</response_format>

IMPORTANT: Respond ONLY in this format. Always return a valid, full URL.`,
            },
        ];
        const answer = await this.openai.completion(messages) as ChatCompletion;
        this.langfuseService.finalizeSpan(span, 'decide_next', messages, answer);
        return {code: 0, text: answer.choices[0]?.message.content!.split('URL:')[1]?.trim() || ""};
    }

    async process(question: string): Promise<string> {
        const trace = this.langfuseService.createTrace({id: `softo-${Date.now()}`, name: 'process', sessionId: `session-${Date.now()}`});
        const state = this.initializeState(question, trace);
        let answer = {code: -1, text: ""};

        try {
            while (state.step < state.maxSteps) {
                this.logger.info(`Step ${state.step}: Visiting ${state.currentPage} Q: ${state.question.substring(0, 50)}...`);
                assert(state.currentPage.startsWith(SOFTO_PAGE!), `Invalid domain! got ${state.currentPage}, expected to start with ${SOFTO_PAGE}`);
                const pageContent = await this.getMarkdownPage(state.currentPage);

                answer = await this.answerQuestion(state, pageContent);
                if (answer.code === 0) {
                    this.logger.info(`Answer found at step ${state.step}`);
                    break;
                }

                const nextPage = await this.decideNext(state, pageContent, answer.text!);
                state.history.push(state.currentPage);
                state.currentPage = nextPage.text!;
                state.step++;
                this.logger.info(`Moving to next page: ${state.currentPage}`);
            }
        } finally {
            await this.langfuseService.finalizeTrace(trace, question, "Process completed");
        }

        return answer.text;
    }
}

async function main() {
    const logger = createLogDash({
        apiKey: process.env.LOGDASH_API_KEY || ''
    }).logger;
    const assistant = new Assistant(logger);

    const taskName: string = 'softo';
    const questions = await fetch(`${URL}/data/${PERSONAL_APIKEY}/softo.json`).then(res => res.json()).catch(logger.error);
    if (!questions) {
        logger.error('Failed to fetch questions');
        throw new Error('Failed to fetch questions');
    }
    logger.info(`Fetched questions: ${JSON.stringify(questions)}`);
    const results = await Promise.all(Object.values(questions).map((q) => new Assistant(logger).process(q as string)));
    const answers: { [key: string]: string } = Object.fromEntries(
        results.map((result, idx) => [`0${idx + 1}`, result])
    );

    // for (const [idx, q] of Object.values(questions).entries()) {
    //     logger.info(`Processing question ${idx + 1}/${Object.values(questions).length}`);
    //     const a = await assistant.process(q as string);
    //     answers[`0${idx + 1}`] = a;
    // }

    logger.info(`Completed processing all questions`);
    const flag = await submit(taskName, answers).then(res => res.json()).catch(logger.error);
    logger.info(`Submission result: ${JSON.stringify(flag)}`);
}

main().catch(console.error);