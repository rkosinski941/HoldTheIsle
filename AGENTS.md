# Hold the Isle — agent notes

Static HTML/JS wargame. No Node, no bundler. Serve with `python -m http.server 8080`.

Two campaigns share `data/map.json` and the engine: **1066** (William) and **1940** (Operation Sea Lion). The title screen chooses. 1066 is the default and should keep its dates, order of battle, and week loop.

## Stack

- `index.html`, `style.css`, `src/*.js` (ES modules)
- Map: `tools/gen_map.py` writes `data/map.json`
- Play: open `http://localhost:8080` (modules will not load from `file://`)

## Rules

- 1066: you command William. English and Norse are AI.
- 1940: you command the German invasion. Britain (army, Home Guard, RAF, Royal Navy) is AI. Air superiority gates the barges. London, or a south-coast lodgement on 10 November, wins.
- Simultaneous orders, 32-tick resolution, cardinal movement, max eight orders.
- Channel: land units embark on a friendly fleet; remaining sea orders pass to the fleet. Gales block sea.
- Commit after every working build. Do not merge your own PRs.
- Prefer small PRs that leave the game playable.
- Verify in the browser: title screen, pick 1066, hold a Norman unit, plot an order, execute a week, date advances. Then pick 1940, hold a German unit, plot an order, execute a turn, and confirm the date moves past 15 September 1940.
- `node tools/sim_campaign.mjs` replays both campaigns without a browser.
- Do not add a build step or npm toolchain unless the issue asks for it.

## Layout

| Path | Role |
| --- | --- |
| `src/world.js` | Terrain, map load, unit placement |
| `src/campaigns.js` | 1940 order of battle, calendar, victory towns |
| `src/engine.js` | Orders, pathing, combat, weather, victory |
| `src/ai.js` | English, Norse, and British orders |
| `src/view.js` | Scrolling canvas, HUD, input |
| `src/main.js` | Title / game / end screens |
| `data/map.json` | Generated grid and towns |

If you change coasts or towns, regenerate with `python tools/gen_map.py` and check the ASCII print before committing.

## Cursor Cloud specific instructions

- Python 3 on the base image is enough. There is no package install. `data/map.json` is already committed.
- On boot, the environment start command serves this repo with `python3 -m http.server 8080` and exits once port 8080 answers. If it is not running, start that command from the repo root.
- Open `http://localhost:8080`. Modules do not load from `file://`.
- Verify in the browser: title screen, Cross the Channel, hold a Norman unit, plot an order, Execute week, and confirm the HUD date moves past 18 September 1066.
- Then choose Operation Sea Lion- 1940, Launch Sea Lion, hold a German unit, plot an order, Execute turn, and confirm the HUD date moves past 15 September 1940. `node tools/sim_campaign.mjs` is the headless check.
