// Headless campaign check. No browser, no network.
//   node tools/sim_campaign.mjs
import { readFileSync } from "fs";
import { planAI } from "../src/ai.js";
import {
  applyUpkeep,
  beginResolve,
  checkVictory,
  createGame,
  dateOf,
  living,
  pickUp,
  setPathTo,
  stepTick,
  unitById,
} from "../src/engine.js";
import { TERRAIN, isAirType, isGroundType, terrainAt } from "../src/world.js";

const map = JSON.parse(readFileSync(new URL("../data/map.json", import.meta.url), "utf8"));
let failed = 0;

function assert(cond, msg) {
  if (cond) return;
  failed += 1;
  console.error("FAIL:", msg);
}

function resolve(game) {
  beginResolve(game);
  for (let i = 0; i < 40 && game.phase === "resolve"; i++) stepTick(game);
  applyUpkeep(game);
}

function week(game) {
  planAI(game);
  resolve(game);
}

function legalStart(game) {
  for (const u of game.units) {
    assert(u.x >= 0 && u.y >= 0 && u.x < game.w && u.y < game.h, `${u.id} off the map`);
    const terr = terrainAt(game.map, u.x, u.y);
    assert(terr !== TERRAIN.OUT, `${u.name} starts out of play at ${u.x},${u.y}`);
    if (u.type === "fleet") {
      const naval = terr === TERRAIN.SEA || terr === TERRAIN.BEACH || terr === TERRAIN.RIVER;
      const port = game.towns.some((t) => t.x === u.x && t.y === u.y && t.port);
      assert(naval || port, `${u.name} fleet is on ${terr} at ${u.x},${u.y}`);
    } else if (!isAirType(u.type)) {
      assert(terr !== TERRAIN.SEA && terr !== TERRAIN.RIVER, `${u.name} starts in the water`);
    }
  }
}

console.log("— 1066 regression —");
const y1066 = createGame(map, "normal", 1066);
assert(y1066.campaign === "1066", "default campaign");
assert(dateOf(y1066).label === "18 September 1066", "opening date " + dateOf(y1066).label);
assert(y1066.weather.id === "rain", "opening weather " + y1066.weather.id);
assert(y1066.units.length === 28, "unit count " + y1066.units.length);
assert(y1066.log[0].startsWith("18 September 1066. Hardrada"), "opening log");
const william = unitById(y1066, "william");
const harold = unitById(y1066, "harold");
assert(william.x === 24 && william.y === 34 && william.muster === 32 && william.combat === 160, "William setup");
assert(unitById(y1066, "eustace").x === 24 && unitById(y1066, "eustace").y === 33, "Eustace setup");
assert(harold.x === 19 && harold.y === 27, "Harold setup");
week(y1066);
assert(dateOf(y1066).label === "22 September 1066", "turn 1 date " + dateOf(y1066).label);
assert(y1066.weather.label === "Rain and chop", "turn 1 weather");
assert(harold.x === 18 && harold.y === 22 && harold.orders.join("") === "NN", "Harold march " + harold.x + "," + harold.y);
assert(unitById(y1066, "edwin").muster === 6 && unitById(y1066, "edwin").combat === 30, "Edwin after York");
week(y1066);
assert(dateOf(y1066).label === "26 September 1066", "turn 2 date");
assert(y1066.weather.label === "East wind", "turn 2 weather");
assert(unitById(y1066, "edwin").broken, "Edwin breaks");
assert(y1066.log.some((l) => l.includes("Edwin of Mercia breaks")), "break log");
week(y1066);
assert(dateOf(y1066).label === "30 September 1066", "turn 3 date");
assert(harold.x === 17 && harold.y === 19 && harold.combat === 150, "Harold turn 3");
assert(william.x === 24 && william.y === 34, "William still at St-Valery");
assert(y1066.towns.find((t) => t.name === "York").owner === "norse", "York falls to the Norse");
assert(!y1066.winner, "1066 still being fought");

console.log("— 1940 setup —");
const sea = createGame(map, "normal", 1940, "1940");
assert(sea.campaign === "1940" && sea.playerSide === "german", "campaign id");
assert(dateOf(sea).label === "15 September 1940", "Sea Lion date " + dateOf(sea).label);
assert(sea.maxTurns === 14, "turn limit");
assert(sea.air && sea.air.id === "raf", "RAF opens with the air, got " + (sea.air && sea.air.id));
assert(sea.units.filter((u) => u.side === "german").length >= 12, "German host");
assert(sea.units.some((u) => u.type === "fighters" && u.side === "british"), "RAF on the map");
assert(sea.units.some((u) => u.name === "Ramsay"), "Dover Command");
assert(sea.units.some((u) => u.name === "7th Flieger"), "Student's division");
legalStart(sea);
for (const u of sea.units) {
  if (u.side === "german" && isGroundType(u.type) && u.type !== "fleet") {
    assert(u.y >= 33, `${u.name} should muster in France, at ${u.x},${u.y}`);
  }
  if (u.side === "british" && isGroundType(u.type) && u.type !== "fleet" && !isAirType(u.type)) {
    assert(u.y < 33, `${u.name} should stand in Britain, at ${u.x},${u.y}`);
  }
}
assert(sea.towns.find((t) => t.name === "London").owner === "british", "London holds");
assert(sea.towns.find((t) => t.name === "St-Valery").owner === "german", "St-Valery is German");
assert(sea.towns.every((t) => t.owner === "german" || t.owner === "british"), "no 1066 owners left");

console.log("— 1940 four turns, player holding —");
const combats = new Map(sea.units.map((u) => [u.id, u.combat]));
for (let i = 0; i < 4; i++) week(sea);
assert(sea.turn === 4, "turn advanced to " + sea.turn);
assert(dateOf(sea).label === "1 October 1940", "date after four turns " + dateOf(sea).label);
assert(sea.phase === "orders", "back to orders");
const fought =
  sea.units.some((u) => u.combat !== combats.get(u.id)) ||
  sea.log.some((l) => /breaks|destroyed|ashore|lost with/.test(l));
assert(fought, "something should have fought or moved into contact");
assert(sea.units.filter((u) => u.alive).length > 10, "the board is not empty");
for (const u of living(sea)) {
  assert(u.x >= 0 && u.y >= 0 && u.x < sea.w && u.y < sea.h, u.name + " left the map");
}

console.log("— landing and victory —");
const land = createGame(map, "normal", 1940, "1940");
land.weather = { id: "fair", label: "Fair wind", seaMul: 1, landMul: 1, cross: true };
land.air = { id: "luftwaffe", label: "Luftwaffe superiority" };
const army = unitById(land, "army16");
const fleet = unitById(land, "flot-e");
const fair = { id: "fair", label: "Fair wind", seaMul: 1, landMul: 1, cross: true };
const heldAir = { id: "luftwaffe", label: "Luftwaffe superiority" };
let ashore = [];
for (let i = 0; i < 3 && ashore.length === 0 && army.alive && fleet.alive; i++) {
  land.weather = fair;
  land.air = heldAir;
  pickUp(land, army);
  setPathTo(land, 21, 30);
  const plotted = army.embarkedOn ? fleet.orders : army.orders;
  if (i === 0) assert(plotted.length > 0, "crossing orders were plotted");
  console.log(`  turn ${i} orders ${plotted.join(" ")} army ${army.x},${army.y} fleet ${fleet.x},${fleet.y}`);
  planAI(land);
  resolve(land);
  ashore = living(land).filter(
    (u) => u.side === "german" && isGroundType(u.type) && !isAirType(u.type) && !u.embarkedOn && u.y < 33,
  );
}
console.log(
  "  ashore:",
  ashore.map((u) => `${u.name}@${u.x},${u.y}`).join(" ") || "(none)",
);
console.log("  fleet now", fleet.x + "," + fleet.y, "alive", fleet.alive, "army", army.x + "," + army.y, "embarked", army.embarkedOn);
assert(ashore.length > 0, "a German ground unit should be on English soil");

const beach = findBeach(land);
const drop = createGame(map, "normal", 7, "1940");
const barge = unitById(drop, "flot-e");
const foot = unitById(drop, "div17");
barge.x = beach.x;
barge.y = beach.y;
foot.embarkedOn = barge.id;
foot.x = beach.x;
foot.y = beach.y;
beginResolve(drop);
stepTick(drop);
assert(!foot.embarkedOn && foot.y < 33, "unload puts the division ashore");

const win = createGame(map, "normal", 3, "1940");
win.towns.find((t) => t.name === "London").owner = "german";
assert(checkVictory(win) && win.winner === "german", "London wins at once");

const lodge = createGame(map, "normal", 3, "1940");
lodge.turn = lodge.maxTurns;
lodge.towns.find((t) => t.name === "Dover").owner = "german";
lodge.towns.find((t) => t.name === "Hastings").owner = "german";
assert(checkVictory(lodge) && lodge.winner === "german", "lodgement on the deadline");

const late = createGame(map, "normal", 3, "1940");
late.turn = late.maxTurns;
assert(checkVictory(late) && late.winner === "british", "Britain wins if the lodgement fails");
assert(late.outcome.includes("10 November 1940"), "deadline date in the outcome: " + late.outcome);

const wiped = createGame(map, "normal", 3, "1940");
wiped.turn = 2;
for (const u of wiped.units) {
  if (u.side === "german" && isGroundType(u.type)) {
    u.alive = false;
    u.muster = 0;
  }
}
assert(checkVictory(wiped) && wiped.winner === "british", "a destroyed army loses");

console.log("— 1940 to a decision, player never sails —");
const end = createGame(map, "normal", 1940, "1940");
let guard = 0;
while (end.phase !== "ended" && guard++ < 20) week(end);
assert(end.winner === "british", "holding without a landing should lose, got " + end.winner);
assert(end.phase === "ended", "campaign ended");
console.log("  outcome:", end.outcome);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll campaign checks passed.");

function findBeach(game) {
  for (let y = 28; y <= 31; y++) {
    for (let x = 0; x < game.w; x++) {
      if (terrainAt(game.map, x, y) === TERRAIN.BEACH) return { x, y };
    }
  }
  throw new Error("no beach");
}
