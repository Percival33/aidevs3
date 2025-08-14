import { type ChatCompletionMessageParam, type ChatCompletion } from "openai/resources/chat/completions";
import { OpenAIService } from "../OpenAIService";
import { LangfuseService } from "../LangfuseService";
import { submit } from "../common";
import fs from 'fs';
import { Neo4jService } from "../Neo4jService";

const MAIN_ENDPOINT = process.env.MAIN_ENDPOINT;
const PERSONAL_APIKEY = process.env.PERSONAL_APIKEY;
const URL = process.env.URL!;

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

async function preprocessData(neo4j: Neo4jService) {
    let users: any[] = [];
    let connections: any[] = [];
    
    if(fs.existsSync('s03e05/users.json') && fs.existsSync('s03e05/connections.json')) {
        users = JSON.parse(fs.readFileSync('s03e05/users.json', 'utf8'));
        connections = JSON.parse(fs.readFileSync('s03e05/connections.json', 'utf8'));
    } else {
        users = (await queryDB(`select * from users`)).reply;
        fs.writeFileSync('s03e05/users.json', JSON.stringify(users, null, 2));
        connections = (await queryDB(`select * from connections`)).reply;
        fs.writeFileSync('s03e05/connections.json', JSON.stringify(connections, null, 2));
    }

    await Promise.all(users.map(async (user: any) => {
        await neo4j.addNode('User', { name: user.username, db_id: user.id });
        console.log(`Added user: ${user.username}`);
    }));

    await Promise.all(connections.map(async (connection: any) => {
        const fromNode = await neo4j.findNodeByProperty('User', 'db_id', connection.user1_id);
        const toNode = await neo4j.findNodeByProperty('User', 'db_id', connection.user2_id);

        await neo4j.connectNodes(fromNode!.id, toNode!.id, 'KNOWS');
        console.log(`Added connection: ${connection.user1_id} -> ${connection.user2_id}`);
    }));
}

async function main() {
    const openai = new OpenAIService();
    const neo4j = new Neo4jService(process.env.NEO4J_URI!, process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!, openai);
    await preprocessData(neo4j);
    const result = await neo4j.executeQuery(`MATCH path=shortestPath((a:User {name: "Rafał"})-[:KNOWS*]->(b:User {name: "Barbara"})) RETURN path`);
    const names = new Array<string>("Rafał");
    result.records[0]?.["_fields"][0].segments.forEach((segment: any) => {
        names.push(segment.end.properties.name);
    });
    const response = await submit('connections', names.join(','));
    console.log(await response.text());
}
main().then(() => {
    process.exit(0);
});