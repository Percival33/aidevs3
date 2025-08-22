import fs from "fs";

const correctStream = fs.createReadStream(`${__dirname}/lab_data/correct.txt`, { encoding: 'utf-8' });
const incorrectStream = fs.createReadStream(`${__dirname}/lab_data/incorect.txt`, { encoding: 'utf-8' });
const input = fs.createWriteStream(`${__dirname}/lab_data/input-ts.jsonl`, { encoding: 'utf-8' });

correctStream.on('data', (chunk) => {
    const lines = (chunk as string).split("\n").filter(line => line.trim() !== '');
    for (const line of lines) {
        const message = {
            "messages": [
                { "role": "system", "content": "SPRAWDZAAAM, DZIĘKUJĘ ZA TĘ INFORMACJĘ!" },
                { "role": "user", "content": line.trim() },
                { "role": "assistant", "content": "supi" }
            ]
        };
        input.write(JSON.stringify(message) + "\n");
    }
});

incorrectStream.on('data', (chunk) => {
    const lines = (chunk as string).split("\n").filter(line => line.trim() !== '');
    for (const line of lines) {
        const message = {
            "messages": [
                { "role": "system", "content": "SPRAWDZAAAM, DZIĘKUJĘ ZA TĘ INFORMACJĘ!" },
                { "role": "user", "content": line.trim() },
                { "role": "assistant", "content": "dupa" }
            ]
        };
        input.write(JSON.stringify(message) + "\n");
    }
});

let streamsFinished = 0;

correctStream.on('end', () => {
    streamsFinished++;
    if (streamsFinished === 2) {
        input.end();
    }
});

incorrectStream.on('end', () => {
    streamsFinished++;
    if (streamsFinished === 2) {
        input.end();
    }
});