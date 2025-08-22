import json
from pathlib import Path

examples = []

with open(f"{Path(__file__).parent}/lab_data/correct.txt", "r", encoding="utf-8") as file:
    while line := file.readline():
        examples.append(
            {
                "messages": [
                    {
                        "role": "system",
                        "content": "SPRAWDZAAAM, DZIĘKUJĘ ZA TĘ INFORMACJĘ!",
                    },
                    {"role": "user", "content": line.strip()},
                    {"role": "assistant", "content": "supi"},
                ]
            }
        )

with open(f"{Path(__file__).parent}/lab_data/incorect.txt", "r", encoding="utf-8") as file:
    while line := file.readline():
        examples.append(
            {
                "messages": [
                    {
                        "role": "system",
                        "content": "SPRAWDZAAAM, DZIĘKUJĘ ZA TĘ INFORMACJĘ!",
                    },
                    {
                        "role": "user",
                        "content": line.strip(),
                    },
                    {"role": "assistant", "content": "dupa"},
                ]
            }
        )


with open(f"{Path(__file__).parent}/input.jsonl", "w", encoding="utf-8") as file:
    for example in examples:
        file.write(json.dumps(example, ensure_ascii=False) + "\n")
