# Ассеты

## Модели — `assets/kenney/<kit>/`
Все — Kenney, лицензия CC0 (License.txt в каждой папке). Каталог для генератора — `assets/catalog.json` (`node tools/catalog.js` пересобирает его из файлов; ручные уточнения тегов — `assets/catalog.overrides.json`).

| kit | набор | среды |
|---|---|---|
| chars | Mini Characters (с анимациями: idle, walk, sprint, sit, emote-yes, interact-right, pick-up …) | люди |
| sub | City Kit Suburban | городок, пригород, деревня |
| com | City Kit Commercial | город, магазины, высотки |
| food | Food Kit | еда, кухня, рынок |
| nat | Nature Kit | природа, парк, горы, лес, берег |
| furn | Furniture Kit | интерьеры дома и общественных мест |
| boat | Watercraft Kit | лодки, корабли, буи, контейнеры |
| town | Fantasy Town Kit | деревня, рынок (прилавки, тележки, фонтаны, изгороди, мельница) |
| pirate | Pirate Kit | порт, остров, пляж, бочки, сундуки, пальмы |
| car | Car Kit | машины, автобус, такси, дорога |
| surv | Survival Kit | лагерь, костёр, палатки, инструменты |
| holi | Holiday Kit | зима, праздник, снег |
| train | Train Kit | поезд, вагоны, рельсы, станция |

Поиск модели под слово: `node -e "var c=require('./assets/catalog.json').models;Object.keys(c).filter(k=>c[k].tags.includes('fish')).forEach(k=>console.log(k,c[k].size))"` — или просто `grep` по имени.

Откуда скачано (официальный kenney.nl, страница набора → «Continue without donating» → подписанная ссылка): `_downloads/fetch-kenney.sh <slug-набора>` (не в git). Наборы chars/sub/com/food/nat/furn перенесены из прошлой 3D-версии (тоже kenney.nl).

## Пиктограммы — `assets/pictos/<id>.svg`
Общая библиотека для дневника: `viewBox="0 0 100 100"`, контур `#2b2a33` 3px, плоские цвета. Пополняется каждым новым квестом (если пиктограмма пригодится другим — кладите сюда, а не в `quests/<slug>/pictos/`). Список: `ls assets/pictos`.

## Чего не хватает
См. [assets-wishlist.md](assets-wishlist.md).
