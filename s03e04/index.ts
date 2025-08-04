import { ChatCompletionMessageParam, ChatCompletion } from "openai/resources/chat/completions";
import { OpenAIService } from "../OpenAIService";
import { LangfuseService } from "../LangfuseService";
import { submit } from "../common";
import fs from 'fs';

const MAIN_ENDPOINT = process.env.MAIN_ENDPOINT;
const PEOPLE_ENDPOINT = `${MAIN_ENDPOINT}/people`;
const PLACES_ENDPOINT = `${MAIN_ENDPOINT}/places`;
const PERSONAL_APIKEY = process.env.PERSONAL_APIKEY;

async function getPeopleAtPlace(place: string): Promise<string> {
    const response = await fetch(PLACES_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: place, apikey: PERSONAL_APIKEY })
    });

    const data = await response.json();
    if(data.code == 0) {
        return data.message;
    }
    return '';
}

async function getPlacesForPerson(person: string): Promise<string> {
    const response = await fetch(PEOPLE_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: person, apikey: PERSONAL_APIKEY })
    });

    const data = await response.json();

    if(data.code == 0) {
        return data.message;
    }
    return '';
}

class Extractor {
    private openai: OpenAIService;
    private langfuse: LangfuseService;
    private extractPeoplePrompt: string;
    private extractPlacesPrompt: string;

    constructor(openai: OpenAIService, langfuse: LangfuseService) {
        this.openai = openai;
        this.langfuse = langfuse;
        this.extractPeoplePrompt = `
        You are a helpful assistant that extracts people from a text.
        <text>{}</text>
        Return comma separated list of names of the people in the text. Use CAPITAL LETTERS AND NOMINATIVE CASE.
        `;
        this.extractPlacesPrompt = `
        You are a helpful assistant that extracts places from a text.
        <text>{}</text>
        Return comma separated list of names of the places in the text. Use CAPITAL LETTERS AND NOMINATIVE CASE.
        `;
    }

    async extractPeople(text: string): Promise<ChatCompletion> {
        const prompt = this.extractPeoplePrompt.replace('{}', text);
        return await this.openai.completion([{ role: "user", content: prompt }], "gpt-4.1-mini") as ChatCompletion;
    }

    async extractPlaces(text: string): Promise<ChatCompletion> {
        const prompt = this.extractPlacesPrompt.replace('{}', text);
        return await this.openai.completion([{ role: "user", content: prompt }], "gpt-4.1-mini") as ChatCompletion;
    }

    getText(chatCompletion: ChatCompletion): string {
        return chatCompletion.choices?.[0]?.message.content ?? '';
    }
}

async function main() {
    const openai = new OpenAIService();
    const langfuse = new LangfuseService();
    const extractor = new Extractor(openai, langfuse);

    let step = 0;
    let peopleSet: Set<string> = new Set();
    let placesSet: Set<string> = new Set();

    let peopleToExtract: Array<string> = [];
    let placesToExtract: Array<string> = [];

    let extractedPeople: ChatCompletion;
    let extractedPlaces: ChatCompletion;
    if(fs.existsSync('s03e04/extractedPeople.txt') && fs.existsSync('s03e04/extractedPlaces.txt')) {
        extractedPeople = JSON.parse(fs.readFileSync('s03e04/extractedPeople.txt', 'utf8'));
        extractedPlaces = JSON.parse(fs.readFileSync('s03e04/extractedPlaces.txt', 'utf8'));
    } else {
        const startingNote = await fetch(`${MAIN_ENDPOINT}/dane/barbara.txt`);
        let text = await startingNote.text();
        
        extractedPeople = await extractor.extractPeople(text);
        extractedPlaces = await extractor.extractPlaces(text);
    
        fs.writeFileSync('s03e04/extractedPeople.txt', JSON.stringify(extractedPeople, null, 2));
        fs.writeFileSync('s03e04/extractedPlaces.txt', JSON.stringify(extractedPlaces, null, 2));
    }
    let peopleText = extractor.getText(extractedPeople);
    let placesText = extractor.getText(extractedPlaces);

    peopleToExtract.push(...peopleText.split(','));
    placesToExtract.push(...placesText.split(','));

    console.log(peopleToExtract);
    console.log(placesToExtract);
    // return;

    let answer = '';
    while(placesToExtract.length > 0 || peopleToExtract.length > 0) {
        console.log(step);
        // const span = langfuse.createSpan(trace, `step-${step}`, { step });
        let place = placesToExtract.shift();

        if(place) {
            if(placesSet.has(place)) {
                continue;
            }

            console.log(`place: ${place} places to process: ${placesToExtract.length} places processed: ${placesSet.size}`);
            const peopleResponse = await getPeopleAtPlace(place);
            if(peopleResponse === "[**RESTRICTED DATA**]") {
                console.log(`RESTRICTED DATA at place: ${place}`);
                continue;
            }
            for(const person of peopleResponse.split(' ')) {
                if(person == 'BARBARA') {
                    console.log(`ANSWER: ${place}`);
                    answer = place;
                    break;
                }
                if(peopleSet.has(person)) {
                    continue;
                }
                peopleToExtract.push(person);
            }
            placesSet.add(place);
        }

        let person = peopleToExtract.shift();
        if(person) {
            if(peopleSet.has(person)) {
                continue;
            }
            console.log(`person: ${person} people to process: ${peopleToExtract.length} people processed: ${peopleSet.size}`);
            const placesResponse = await getPlacesForPerson(person);
            if(placesResponse === "[**RESTRICTED DATA**]") {
                console.log(`RESTRICTED DATA at person: ${person}`);
                continue;
            }
            for(const place of placesResponse.split(' ')) {
                if(placesSet.has(place)) {
                    continue;
                }
                placesToExtract.push(place);
            }
            peopleSet.add(person);
        }
        step++;
    }
    // await langfuse.finalizeTrace(trace, [], []);


    const flag = await submit('loop', answer);
    console.log(await flag.text());
}

main();