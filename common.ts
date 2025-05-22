const PERSONAL_APIKEY = process.env.PERSONAL_APIKEY!;
const URL = process.env.URL!;

export const submit = async (task: string, answer: any) => await fetch(URL+'/report', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        "task": task,
        "apikey": PERSONAL_APIKEY,
        "answer": answer
    }),
});