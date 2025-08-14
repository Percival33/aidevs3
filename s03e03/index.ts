import { submit } from "../common";
import type { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { OpenAIService } from "../OpenAIService";
import { LangfuseService } from "../LangfuseService";
import type { LangfuseTraceClient, LangfuseSpanClient } from 'langfuse';
import chalk from 'chalk';

const PERSONAL_APIKEY = process.env.PERSONAL_APIKEY!;
const URL = process.env.URL!;
const openai = new OpenAIService();
const langfuse = new LangfuseService();

type IState = {
    stage: 'plan' | 'decide' | 'execute' | 'reflect' | 'critique' | 'final_answer';
    step: number;
    maxSteps: number;
    messages: ChatCompletionMessageParam[];
    trace?: LangfuseTraceClient;
};

async function queryDB(query: string) {
    const result = await fetch(URL + '/apidb', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            "task": "database",
            "apikey": PERSONAL_APIKEY,
            "query": query,
        }),
    });
    return await result.json();
}

async function getTableSchema(table: string) {
    const result = await fetch(URL + '/apidb', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            "task": "database",
            "apikey": PERSONAL_APIKEY,
            "query": `show create table ${table}`,
        }),
    });
    return await result.json();
}

async function describeTable(table: string) {
    const result = await fetch(URL + '/apidb', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            "task": "database",
            "apikey": PERSONAL_APIKEY,
            "query": `desc ${table}`,
        }),
    });
    return await result.json();
}


async function plan(state: IState) {
    console.log(chalk.blue(`[STAGE] PLANNING`));
    state.stage = 'plan';

    const span = state.trace ? langfuse.createSpan(state.trace, 'plan', { stage: 'planning', step: state.step }) : null;

    const messages = [
        {
            role: 'system', content: `
            Based on the main objective and reflection of previous steps, plan the next step.

            <main_objective>
            Find the id number of active datacenters that are managed by managers who are currently on vacation (are inactive).
            Present the answer as a list of ids.
            </main_objective>

            If you need to think add <think>...</think> tag.

            Do not include any other text in your response.
            Return the plan in <step>...</step> tag.

            <previous_steps>
            ${state.messages.map(m => `<previous_step>${m.content}</previous_step>`).join('\n') || 'No previous steps'}
            </previous_steps>
        ` },
        // ...state.messages,
    ] as ChatCompletionMessageParam[];

    const response = await openai.completion(messages) as ChatCompletion;
    const content = response.choices[0]!.message.content!;

    if (span) {
        langfuse.finalizeSpan(span, 'plan', messages, response);
    }

    // Extract only the text between <plan> tags if it exists
    const planMatch = content.match(/<step>(.*?)<\/step>/s);
    const planContent = planMatch ? planMatch[1]?.trim() || content : content;

    state.messages.push({ role: 'assistant', content: `<step>${planContent}</step>` });
    console.log(chalk.gray(`[INFO] Plan: ${content}`));
}

async function decide(state: IState) {
    console.log(chalk.blue(`[STAGE] DECIDING`));
    state.stage = 'decide';

    const span = state.trace ? langfuse.createSpan(state.trace, 'decide', { stage: 'deciding', step: state.step }) : null;

    const messages = [
        {
            role: 'system', content: `
            Based on the plan, DECIDE what tool to use to execute the plan. Make sure you know what data you need to execute the tool.
            Pay attention to the result of the latest step to correct errors if needed.

            <tools>
            - getTableSchema(table_name: string): get table schema
            - describeTable(table_name: string): describe table
            - queryDB(sql_query: string): execute general SQL query
            </tools>

            Do not include any other text in your response.

            <plan>${state.messages[state.messages.length - 1]!.content}</plan>

            Put though process in <thought>...</thought> tag.

            Return the tool to use in <tool>...</tool> tag and the argument for selected tool in <argument>...</argument> tag.
        ` },
        ...state.messages,
    ] as ChatCompletionMessageParam[];

    const response = await openai.completion(messages) as ChatCompletion;
    const content = response.choices[0]!.message.content!;

    if (span) {
        langfuse.finalizeSpan(span, 'decide', messages, response);
    }

    const toolMatch = content.match(/<tool>(.*?)<\/tool>/s);
    const argumentMatch = content.match(/<argument>(.*?)<\/argument>/s);
    const tool = toolMatch ? toolMatch[1]?.trim() || '' : '';
    const argument = argumentMatch ? argumentMatch[1]?.trim() || '' : '';

    state.messages.push({ role: 'assistant', content: `<tool>${tool}</tool>\n<argument>${argument}</argument>\n` });
    console.log(chalk.gray(`[INFO] Decide: ${content}`));
}

async function execute(state: IState) {
    console.log(chalk.blue(`[STAGE] EXECUTING`));
    state.stage = 'execute';

    const tool = (state.messages[state.messages.length - 1]!.content as string).match(/<tool>(.*?)<\/tool>/s)?.[1]?.trim() || '';
    const argument = (state.messages[state.messages.length - 1]!.content as string).match(/<argument>(.*?)<\/argument>/s)?.[1]?.trim() || '';

    switch (tool) {
        case 'queryDB':
            const result = await queryDB(argument);
            state.messages.push({ role: 'user', content: JSON.stringify(`<result>${JSON.stringify(result)}</result>\n`) });
            console.log(chalk.gray(`[INFO] Query result: ${JSON.stringify(result)}`));
            break;
        case 'getTableSchema':
            const schema = await getTableSchema(argument);
            state.messages.push({ role: 'user', content: JSON.stringify(`<schema>${JSON.stringify(schema)}</schema>\n`) });
            console.log(chalk.gray(`[INFO] Table schema: ${JSON.stringify(schema)}`));
            break;
        case 'describeTable':
            const description = await describeTable(argument);
            state.messages.push({ role: 'user', content: JSON.stringify(`<description>${JSON.stringify(description)}</description>\n`) });
            console.log(chalk.gray(`[INFO] Table description: ${JSON.stringify(description)}`));
            break;
    }
}

async function reflect(state: IState) {
    console.log(chalk.blue(`[STAGE] REFLECTING`));
    state.stage = 'reflect';

    const span = state.trace ? langfuse.createSpan(state.trace, 'reflect', { stage: 'reflecting', step: state.step }) : null;

    const messages = [
        {
            role: 'system', content:
                `
                <task>
                Find the id number of active datacenters that are managed by managers who are currently on vacation (are inactive).
                Present the answer as a list of ids.
                </task>

Your objective is to reflect on the last step and decide if you already have a concrete list of IDs that fully solves the task.

If you already have an explicit list of IDs that directly answers the task, you MUST return '<stop>stop</stop>'. Do not include any other text in your response.

Otherwise, explain clearly what specific data or steps are still missing to produce that list in <reason>...</reason> tag.

Note: Knowing which tables or columns to query or how to construct a query is not enough; you must have the actual list of IDs before stopping.
                `
        },
        ...state.messages,
    ] as ChatCompletionMessageParam[];


    const response = await openai.completion(messages) as ChatCompletion;
    const content = response.choices[0]!.message.content!;

    if (span) {
        langfuse.finalizeSpan(span, 'reflect', messages, response);
    }

    console.log(chalk.gray(`[INFO] Reflection: ${content}`));
    if (content.includes('<stop>stop</stop>')) {
        state.stage = 'final_answer';
        console.log(chalk.gray('[INFO] Ready for final answer'));
    } else {
        const reasonMatch = content.match(/<reason>(.*?)<\/reason>/s);
        const reason = reasonMatch ? reasonMatch[1]?.trim() || '' : '';
        state.messages.push({ role: 'assistant', content: `<reason>${reason}</reason>\n` });
    }
}

async function main() {
    console.log(chalk.gray('[INFO] Starting database task'));
    let done = false;

    // Create Langfuse trace
    const trace = langfuse.createTrace({
        id: `database-task-${Date.now()}`,
        name: 'Database Task Resolution',
        sessionId: `session-${Date.now()}`
    });

    let state: IState = {
        stage: 'plan',
        step: 0,
        maxSteps: 10,
        messages: [],
        trace: trace,
    };

    try {
        while (!done && state.step < state.maxSteps) {
            console.log(chalk.yellow(`[INFO] Step ${state.step + 1} of ${state.maxSteps}`));
            await plan(state);
            await decide(state);
            await execute(state);
            await reflect(state);
            if (state.stage === 'final_answer') break;
            state.step++;
        }

        console.log(chalk.blue(`[STAGE] GENERATING FINAL ANSWER`));
        const finalSpan = langfuse.createSpan(trace, 'final_answer', { stage: 'final_answer' });

        const finalMessages = [
            {
                role: 'system', content: `
                Based on the previous steps, generate a final answer to the question. If you have no answer, return empty array.

                The answer should be a list of ids of active datacenters that are managed by managers who are currently on vacation (are inactive).
                Do not include any other text in your response.

                Example:
                [1, 2, 3]
            ` },
            ...state.messages,
        ] as ChatCompletionMessageParam[];

        const response = await openai.completion(finalMessages) as ChatCompletion;
        const answer = response.choices[0]!.message.content!;

        langfuse.finalizeSpan(finalSpan, 'final_answer', finalMessages, response);

        const parsedAnswer = JSON.parse(answer);
        console.log(chalk.green(`[FINAL ANSWER] ${JSON.stringify(parsedAnswer)}`));

        const flag = await submit('database', parsedAnswer);
        console.log(chalk.gray(`[INFO] Submission result: ${await flag.text()}`));

        // Finalize trace
        await langfuse.finalizeTrace(trace, state.messages, [{ role: 'assistant', content: answer }]);

    } catch (error) {
        console.log(chalk.red(`[ERROR] ${error}`));
    } finally {
        // Shutdown Langfuse
        await langfuse.shutdownAsync();
    }
}

main();
