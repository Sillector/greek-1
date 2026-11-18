# game-greek — движок мини-квестов для заучивания греческих слов

Каждый пул слов (20–50 слов A1) → своя 3D-игра-исследование: свой мир, сюжет с «ага!», жители говорят по-гречески, ученик сам выводит значения, раскладывает слова по картинкам в дневнике, помогает жителям (пропуски) и в финале сам переводит главный текст.

> **Ничего не коммитить без прямой просьбы человека.** Ветки, коммиты и пуш — только по его слову.

## Куда идти за чем

| вопрос | где |
|---|---|
| сделать новый квест из пула слов | скил **make-quest** — [.claude/skills/make-quest/SKILL.md](.claude/skills/make-quest/SKILL.md) |
| формат квеста: зоны, предметы, жители, таблички, просьбы, главная задача, финал | [docs/content-schema.md](docs/content-schema.md), схема — [schema/quest.schema.json](schema/quest.schema.json) |
| правило «текст = сцена» и утверждения claims | [docs/consistency.md](docs/consistency.md) |
| как придумать место, главную задачу и сюжет | [docs/story-guide.md](docs/story-guide.md) |
| как устроен движок, управление, отладка, расширение | [docs/engine.md](docs/engine.md) |
| модели и пиктограммы, чего не хватает | [docs/assets.md](docs/assets.md), [docs/assets-wishlist.md](docs/assets-wishlist.md) |
| пример готового квеста | [quests/lemonies/quest.json](quests/lemonies/quest.json) (городской квартал) и [quests/agora/quest.json](quests/agora/quest.json) (рынок у моря) |

## Папки

- `engine/` — движок (общий для всех игр; правится только как движок, не под одну игру)
- `assets/kenney/` — модели CC0 по наборам, `assets/catalog.json` — каталог (не править руками: `node tools/catalog.js`), `assets/pictos/` — общая библиотека пиктограмм
- `quests/<slug>/` — исходник квеста: `quest.json`, `pictos/`, `NOTES.md`, `_shots/`
- `games/<slug>/` — собранная игра (не править руками; пересобирать)
- `tools/` — `parse-words.js`, `validate.js`, `build.js`, `shot.mjs`, `catalog.js`

## Правила

1. **Игры собираются только через `node tools/build.js <slug>`** — он сначала зовёт `validate` и не собирает красное. Правки — в `quests/<slug>/` или в `engine/`, никогда в `games/`.
2. **Текст = сцена.** Всё, что в репликах проверяемо глазами (большой/маленький, дорогой/дешёвый, рядом/далеко, кто где, открыто/закрыто), объявлено в `claims` и проверено `validate` по геометрии. Расхождение чинится сценой.
3. **Уровень A1.** Целевые слова — из пула ученика; всё остальное — самые простые слова (≤ 60–70 лемм), короткие фразы, настоящее время.
4. **Тултип на каждом греческом слове.** Любая греческая словоформа — либо `[[целевое|форма]]`, либо в `gloss`/`names`. Иначе validate красный.
5. **Свой сюжет на каждый словарь.** Главная задача — текст для перевода в финале (надпись, объявление, рецепт…), не письмо. Не повторять сюжеты прошлых квестов.
6. **Без сети в игре.** Только относительные пути, никаких CDN. Собранная папка работает с file://, с флешки и в iframe.
7. **Ассеты** — только CC0 с официального kenney.nl; лицензии лежат рядом с моделями и копируются в сборку.
8. **Проверка глазами обязательна:** после зелёного validate — `node --experimental-websocket tools/shot.mjs <slug>` и просмотр снимков (минимум три захода «снимок → правка»).

## Команды

```bash
node tools/parse-words.js words.txt --out quests/<slug>/words.json
node tools/validate.js <slug>
node tools/build.js <slug>
node --experimental-websocket tools/shot.mjs <slug>
node tools/catalog.js
```

Просмотр в браузере: `.claude/launch.json` → сервер `games` на http://localhost:8780/<slug>/ (или просто двойной щелчок по `games/<slug>/index.html`).
