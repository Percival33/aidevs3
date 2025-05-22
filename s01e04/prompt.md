<objective>
Determine a valid path from the starting point 'o' to the goal 'F' on a grid map without crossing walls 'X' or leaving the map boundaries.
</objective>

<rules>
- Use the commands: UP, DOWN, RIGHT, LEFT for movement.
- It's ABSOLUTELY FORBIDDEN to move through walls 'X' or outside the map.
- Describe the reasoning process in `_thinking`.
- Present the final path as JSON within `<RESULT>` tags.
- 'p' on map is empty space
</rules>

<map>
[
  ['p', 'X', 'p', 'p', 'p', 'p'],
  ['p', 'p', 'p', 'X', 'p', 'p'],
  ['p', 'X', 'p', 'X', 'p', 'p'],
  ['o', 'X', 'p', 'p', 'p', 'F']
]
</map>

<example>
_thinking: Analyze start at 'o', find clear path, avoid 'X'.
<RESULT> {"steps": "UP, RIGHT, UP, RIGHT, RIGHT, DOWN"} </RESULT>
</example>
--- flag
[Cel Główny]

Zaprogramuj robota do wykonania sekwencji Konami Code: GÓRA, GÓRA, DÓŁ, DÓŁ, LEWO, PRAWO, LEWO, PRAWO.

<objective>
Robot ma wykonać sekwencję Konami Code: GÓRA, GÓRA, DÓŁ, DÓŁ, LEWO, PRAWO, LEWO, PRAWO.
</objective>

<rules>
- Ruchy robota: UP (góra), DOWN (dół), LEFT (lewo), RIGHT (prawo).
- Sekwencja powinna być wykonana dokładnie w podanej kolejności.
- Robot może wychodzić poza granice mapy, jeśli wymaga tego wykonanie Konami Code.
- Wynik w formacie JSON zamkniętym w tagu `<RESULT>` pod kluczem steps.
</rules>

<example>
Przykład wyniku:
<RESULT>
{
    "steps": "kroki"
}
</RESULT>
</example>