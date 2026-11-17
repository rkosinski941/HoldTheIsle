import { noteGermansLanded, noteNormansLanded } from "./ai.js";
import {
  SEALION_BEACHHEADS,
  SEALION_CALENDAR,
  SEALION_CALLUPS,
  SEALION_ID,
  SEALION_OPENING,
  SEALION_OWNERS,
  SEALION_TURNS,
  SEALION_UNITS,
} from "./campaigns.js";
import {
  DIRS,
  ENGLAND_LAT,
  MAX_ORDERS,
  MOVE_COST,
  TERRAIN,
  TICKS_PER_TURN,
  TNAME,
  TURNS_TO_CHRISTMAS,
  buildUnits,
  englandLat,
  inBounds,
  isAirType,
  isAirborneType,
  isGroundType,
  isNavalTerrain,
  isPort,
  makeUnits,
  terrainAt,
  townAt,
  townByName,
} from "./world.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneTowns(towns) {
  return towns.map((t) => ({ ...t }));
}

export function createGame(map, difficulty = "normal", seed = 1066, campaign = "1066") {
  if (campaign === SEALION_ID) return createSealion(map, difficulty, seed);
  const game = {
    map,
    w: map.w,
    h: map.h,
    difficulty,
    seed,
    rng: mulberry32(seed),
    turn: 0,
    phase: "orders",
    tick: 0,
    weather: null,
    units: makeUnits(map),
    towns: cloneTowns(map.towns),
    cursor: { x: 0, y: 0 },
    selectedId: null,
    log: [],
    flags: { normansLanded: false },
    winner: null,
    score: 0,
    flash: [],
    campaign: "1066",
    playerSide: "norman",
  };
  const william = unitById(game, "william");
  if (william) {
    game.cursor.x = william.x;
    game.cursor.y = william.y;
  }
  applyDifficulty(game);
  game.weather = rollWeather(game);
  log(game, "18 September 1066. Hardrada lies before York. Harold holds London. The Channel still pent you in.");
  return game;
}

function createSealion(map, difficulty, seed) {
  const towns = cloneTowns(map.towns);
  for (const t of towns) {
    if (SEALION_OWNERS[t.name]) t.owner = SEALION_OWNERS[t.name];
  }
  const game = {
    map,
    w: map.w,
    h: map.h,
    difficulty,
    seed,
    rng: mulberry32(seed),
    turn: 0,
    phase: "orders",
    tick: 0,
    weather: null,
    units: buildUnits(map, SEALION_UNITS),
    towns,
    cursor: { x: 0, y: 0 },
    selectedId: null,
    log: [],
    flags: { germansLanded: false },
    winner: null,
    score: 0,
    flash: [],
    campaign: SEALION_ID,
    playerSide: "german",
    calendar: { ...SEALION_CALENDAR },
    maxTurns: SEALION_TURNS,
    beachheads: SEALION_BEACHHEADS.slice(),
    air: null,
  };
  const lead = unitById(game, "army16");
  if (lead) {
    game.cursor.x = lead.x;
    game.cursor.y = lead.y;
  }
  applyDifficulty(game);
  game.weather = rollWeather(game);
  game.air = airBalance(game);
  log(game, SEALION_OPENING);
  return game;
}

function applyDifficulty(game) {
  if (game.campaign === SEALION_ID) {
    const mul = game.difficulty === "easy" ? 0.85 : game.difficulty === "hard" ? 1.15 : 1;
    for (const u of game.units) {
      if (u.side === "british") {
        u.combat = Math.round(u.combat * mul);
        u.muster = Math.round(u.muster * (mul > 1 ? 1.05 : mul < 1 ? 0.95 : 1));
        u.maxMuster = u.muster;
      }
      if (u.side === "german" && game.difficulty === "easy" && isAirType(u.type)) {
        u.combat = Math.round(u.combat * 1.12);
      }
    }
    return;
  }
  const mul = game.difficulty === "easy" ? 0.85 : game.difficulty === "hard" ? 1.15 : 1;
  for (const u of game.units) {
    if (u.side === "english") {
      u.combat = Math.round(u.combat * mul);
      u.muster = Math.round(u.muster * (mul > 1 ? 1.05 : mul < 1 ? 0.95 : 1));
      u.maxMuster = u.muster;
    }
  }
}

export function log(game, msg) {
  game.log.unshift(msg);
  if (game.log.length > 14) game.log.pop();
}

export function living(game) {
  return game.units.filter((u) => u.alive && u.muster > 0);
}

export function unitById(game, id) {
  return game.units.find((u) => u.id === id) || null;
}

export function unitsAt(game, x, y) {
  return living(game).filter((u) => displayPos(game, u).x === x && displayPos(game, u).y === y);
}

export function landUnitAt(game, x, y) {
  return (
    living(game).find((u) => {
      const p = displayPos(game, u);
      return p.x === x && p.y === y && u.type !== "fleet" && !isAirType(u.type) && !u.embarkedOn;
    }) || null
  );
}

export function displayPos(game, u) {
  if (u.embarkedOn) {
    const f = unitById(game, u.embarkedOn);
    if (f && f.alive) return { x: f.x, y: f.y };
  }
  return { x: u.x, y: u.y };
}

export function selectedUnit(game) {
  return game.selectedId ? unitById(game, game.selectedId) : null;
}

export function dateOf(game) {
  // 1066 is 18 September, four days a turn. 1940 carries its own calendar.
  const start = game.calendar || { day: 18, month: 9, year: 1066, daysPerTurn: 4 };
  let day = start.day + game.turn * start.daysPerTurn;
  let month = start.month;
  let year = start.year;
  const mdays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  while (day > mdays[month]) {
    day -= mdays[month];
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  const names = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return { day, month, year, monthName: names[month], label: `${day} ${names[month]} ${year}` };
}

// The orders phase shows the turn you are about to play. Upkeep increments
// the counter before the campaign-ended screen, so that screen must not add
// one again (that was the 15/14 readout).
export function displayTurn(game) {
  const limit = game.maxTurns || TURNS_TO_CHRISTMAS;
  const n = game.phase === "ended" ? game.turn : game.turn + 1;
  return Math.max(1, Math.min(limit, n));
}

const WEATHERS = [
  { id: "fair", label: "Fair wind", seaMul: 1, landMul: 1, cross: true },
  { id: "breeze", label: "East wind", seaMul: 0.85, landMul: 1, cross: true },
  { id: "rain", label: "Rain and chop", seaMul: 1.25, landMul: 1.3, cross: true },
  { id: "gale", label: "Channel gale", seaMul: 8, landMul: 1.15, cross: false },
];

function galeChance(game) {
  const { month } = dateOf(game);
  let g = month === 9 ? 0.18 : month === 10 ? 0.3 : month === 11 ? 0.42 : 0.52;
  if (game.difficulty === "easy") g -= 0.08;
  if (game.difficulty === "hard") g += 0.08;
  return g;
}

export function rollWeather(game) {
  const g = galeChance(game);
  const r = game.rng();
  if (r < g) return WEATHERS[3];
  if (r < g + 0.28) return WEATHERS[2];
  if (r < g + 0.28 + 0.28) return WEATHERS[1];
  return WEATHERS[0];
}

export function moveCost(game, unit, x, y) {
  const terr = terrainAt(game.map, x, y);
  let type = unit.type;
  if (unit.embarkedOn) type = "fleet";
  const table = MOVE_COST[type] || MOVE_COST.infantry;
  let cost = table[terr];
  if (type === "fleet" && terr === TERRAIN.TOWN && !isPort(game.map, x, y)) return 99;
  if (unit.type !== "fleet" && !unit.embarkedOn && terr === TERRAIN.SEA) return 99;
  if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER || terr === TERRAIN.BEACH) {
    cost = Math.ceil(cost * game.weather.seaMul);
  } else {
    cost = Math.ceil(cost * game.weather.landMul);
  }
  if (!game.weather.cross && terr === TERRAIN.SEA) return 99;
  if (game.campaign === SEALION_ID) cost = sealionMoveCost(game, unit, y, terr, cost);
  return cost;
}

// RAF superiority pins the barges. Luftwaffe superiority slows the British
// columns in the south and eases the crossing. Gales are already impassable.
function sealionMoveCost(game, unit, y, terr, cost) {
  if (cost >= 90) return cost;
  const air = game.air && game.air.id;
  const germanSea = unit.side === "german" && (unit.type === "fleet" || unit.embarkedOn);
  if (germanSea && terr === TERRAIN.SEA) {
    if (air === "raf") return 99;
    if (air === "contested") return Math.ceil(cost * 1.35);
    if (air === "luftwaffe") return Math.ceil(cost * 0.85);
  }
  if (
    air === "luftwaffe" &&
    unit.side === "british" &&
    !isAirType(unit.type) &&
    unit.type !== "fleet" &&
    y < ENGLAND_LAT &&
    y >= 20 &&
    terr !== TERRAIN.SEA &&
    terr !== TERRAIN.RIVER
  ) {
    return Math.ceil(cost * 1.3);
  }
  return cost;
}

function fleetMayEnter(game, unit, x, y) {
  const terr = terrainAt(game.map, x, y);
  if (unit.side === "german") {
    // Barges beach. They do not run the Thames up to London.
    if (terr === TERRAIN.RIVER) return false;
    if (isPort(game.map, x, y)) {
      const town = townAt(game.map, x, y);
      if (town && town.owner !== "german" && town.y < 28) return false;
    }
  }
  if (unit.side === "british" && isPort(game.map, x, y)) {
    const town = townAt(game.map, x, y);
    if (town && town.owner === "german") return false;
  }
  return true;
}

export function canEnter(game, unit, x, y) {
  if (!inBounds(game.map, x, y)) return false;
  const terr = terrainAt(game.map, x, y);
  if (terr === TERRAIN.OUT) return false;
  if (isAirType(unit.type)) {
    if (terr === TERRAIN.SEA && game.weather && !game.weather.cross) return false;
    return true;
  }
  if (isAirborneType(unit.type) && (terr === TERRAIN.SEA || terr === TERRAIN.RIVER)) {
    if (game.weather && !game.weather.cross) return false;
    if (game.campaign === SEALION_ID && unit.side === "german" && game.air && game.air.id === "raf") return false;
    return moveCost(game, unit, x, y) < 90;
  }
  if (unit.type === "fleet") {
    if (!isNavalTerrain(game.map, x, y)) return false;
    if (game.campaign === SEALION_ID && !fleetMayEnter(game, unit, x, y)) return false;
    return moveCost(game, unit, x, y) < 90;
  }
  if (unit.embarkedOn) {
    if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER) return moveCost(game, unit, x, y) < 90;
    return terr !== TERRAIN.SEA;
  }
  if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER) {
    return living(game).some((f) => f.side === unit.side && f.type === "fleet" && f.alive);
  }
  return moveCost(game, unit, x, y) < 90;
}

export function enemyZoc(game, unit, x, y) {
  for (const [dx, dy] of Object.values(DIRS)) {
    const o = landUnitAt(game, x + dx, y + dy);
    if (o && o.side !== unit.side && o.type !== "fleet") return true;
  }
  return false;
}

function cargoOf(game, fleetId) {
  return living(game).filter((u) => u.embarkedOn === fleetId);
}

export function tryEmbark(game, unit, nx, ny) {
  const terr = terrainAt(game.map, nx, ny);
  if (terr !== TERRAIN.SEA && terr !== TERRAIN.RIVER) return false;
  const fleets = living(game).filter(
    (f) =>
      f.type === "fleet" &&
      f.side === unit.side &&
      Math.abs(f.x - unit.x) + Math.abs(f.y - unit.y) <= 1,
  );
  const roomy = fleets.find((f) => cargoOf(game, f.id).length < (f.capacity == null ? 3 : f.capacity));
  if (!roomy) return false;
  unit.embarkedOn = roomy.id;
  unit.x = roomy.x;
  unit.y = roomy.y;
  return true;
}

export function tryDisembark(game, unit, nx, ny) {
  if (!unit.embarkedOn) return false;
  const terr = terrainAt(game.map, nx, ny);
  if (terr !== TERRAIN.BEACH && !isPort(game.map, nx, ny) && terr !== TERRAIN.CLEAR && terr !== TERRAIN.ROAD && terr !== TERRAIN.TOWN) {
    return false;
  }
  if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER) return false;
  unit.embarkedOn = null;
  unit.x = nx;
  unit.y = ny;
  return true;
}

export function pathToOrders(game, unit, tx, ty, limit = MAX_ORDERS) {
  const start = displayPos(game, unit);
  if (start.x === tx && start.y === ty) return [];
  const key = (x, y) => x + "," + y;
  const open = [{ x: start.x, y: start.y, g: 0, prev: null }];
  const best = new Map([[key(start.x, start.y), 0]]);
  let found = null;
  let guard = 0;
  while (open.length && guard++ < 2500) {
    open.sort((a, b) => a.g + Math.abs(a.x - tx) + Math.abs(a.y - ty) - (b.g + Math.abs(b.x - tx) + Math.abs(b.y - ty)));
    const cur = open.shift();
    if (cur.x === tx && cur.y === ty) {
      found = cur;
      break;
    }
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(game.map, nx, ny)) continue;
      const occ = blockerAt(game, unit, nx, ny);
      const isDest = nx === tx && ny === ty;
      if (occ && occ.id !== unit.id && occ.side === unit.side && !isDest) continue;
      if (!isDest && occ && occ.side !== unit.side) continue;
      if (!canEnter(game, unit, nx, ny) && !(isDest && occ && occ.side !== unit.side)) continue;
      const step = moveCost(game, unit, nx, ny);
      const g = cur.g + (step >= 90 ? 50 : step);
      const k = key(nx, ny);
      if (best.has(k) && best.get(k) <= g) continue;
      best.set(k, g);
      open.push({ x: nx, y: ny, g, prev: cur, dir });
    }
  }
  if (!found) return [];
  const dirs = [];
  let n = found;
  while (n && n.prev) {
    dirs.push(n.dir);
    n = n.prev;
  }
  dirs.reverse();
  return dirs.slice(0, limit);
}

export function orderPath(unit, game) {
  let mover = unit;
  if (game && unit.embarkedOn) {
    const f = unitById(game, unit.embarkedOn);
    if (f && f.alive) mover = f;
  }
  const start = game ? displayPos(game, mover) : { x: mover.x, y: mover.y };
  const pts = [{ x: start.x, y: start.y }];
  let x = start.x;
  let y = start.y;
  for (const d of mover.orders) {
    const [dx, dy] = DIRS[d];
    x += dx;
    y += dy;
    pts.push({ x, y });
  }
  return pts;
}

export function playerSide(game) {
  return game.playerSide || "norman";
}

export function pickUp(game, unit) {
  if (!unit || !unit.alive || unit.side !== playerSide(game)) return;
  game.selectedId = unit.id;
  const p = orderPath(unit, game);
  const last = p[p.length - 1];
  game.cursor.x = last.x;
  game.cursor.y = last.y;
}

export function putDown(game) {
  game.selectedId = null;
}

export function addOrder(game, dir) {
  const u = selectedUnit(game);
  if (!u || game.phase !== "orders") return false;
  const target = u.embarkedOn ? unitById(game, u.embarkedOn) || u : u;
  if (target.orders.length >= MAX_ORDERS) return false;
  const step = DIRS[dir];
  if (!step) return false;
  const last = orderPath(target, game).at(-1);
  const nx = last.x + step[0];
  const ny = last.y + step[1];
  // The grey margin is not a destination. Refusing it here keeps the plot
  // off those tiles; movement rules for sea, beach, and ports are unchanged.
  if (!inBounds(game.map, nx, ny) || terrainAt(game.map, nx, ny) === TERRAIN.OUT) return false;
  target.orders.push(dir);
  return true;
}

export function cancelLast(game) {
  const u = selectedUnit(game);
  if (!u) return;
  const target = u.embarkedOn ? unitById(game, u.embarkedOn) || u : u;
  if (!target.orders.length) return;
  target.orders.pop();
  const p = orderPath(u, game);
  const last = p[p.length - 1];
  game.cursor.x = last.x;
  game.cursor.y = last.y;
}

export function clearOrders(game, unit) {
  const u = unit || selectedUnit(game);
  if (!u) return;
  u.orders = [];
  if (u.embarkedOn) {
    const f = unitById(game, u.embarkedOn);
    if (f) f.orders = [];
  }
}

export function setPathTo(game, x, y) {
  const u = selectedUnit(game);
  if (!u || game.phase !== "orders") return false;
  if (!inBounds(game.map, x, y) || terrainAt(game.map, x, y) === TERRAIN.OUT) return false;
  const crossing = planCrossing(game, u, x, y);
  const path = crossing && crossing.length ? crossing : pathToOrders(game, u, x, y);
  if (pathCrossesOut(game, u, path)) return false;
  if (u.embarkedOn) {
    const f = unitById(game, u.embarkedOn);
    if (f) f.orders = path;
    u.orders = [];
  } else {
    u.orders = path;
  }
  const p = orderPath(u, game);
  const last = p[p.length - 1];
  game.cursor.x = last.x;
  game.cursor.y = last.y;
  return true;
}

function pathCrossesOut(game, unit, orders) {
  const target = unit.embarkedOn ? unitById(game, unit.embarkedOn) || unit : unit;
  let { x, y } = displayPos(game, target);
  for (const d of orders) {
    const step = DIRS[d];
    if (!step) return true;
    x += step[0];
    y += step[1];
    if (!inBounds(game.map, x, y) || terrainAt(game.map, x, y) === TERRAIN.OUT) return true;
  }
  return false;
}

export function moveCursor(game, dx, dy) {
  const nx = game.cursor.x + dx;
  const ny = game.cursor.y + dy;
  if (!inBounds(game.map, nx, ny)) return;
  const ordering = game.selectedId && game.phase === "orders";
  if (ordering) {
    if (terrainAt(game.map, nx, ny) === TERRAIN.OUT) return;
    const dir = Object.entries(DIRS).find(([, v]) => v[0] === dx && v[1] === dy);
    if (dir) {
      const u = selectedUnit(game);
      const target = u && u.embarkedOn ? unitById(game, u.embarkedOn) || u : u;
      const full = !!(target && target.orders.length >= MAX_ORDERS);
      if (!addOrder(game, dir[0]) && !full) return;
    }
  }
  game.cursor.x = nx;
  game.cursor.y = ny;
}

export function cycleStack(game) {
  const stack = unitsAt(game, game.cursor.x, game.cursor.y).filter((u) => u.side === playerSide(game));
  if (!stack.length) return;
  const i = stack.findIndex((u) => u.id === game.selectedId);
  pickUp(game, stack[(i + 1) % stack.length]);
}

export function nextNorman(game) {
  const mine = living(game).filter((u) => u.side === playerSide(game));
  if (!mine.length) return;
  const i = mine.findIndex((u) => u.id === game.selectedId);
  const nxt = mine[(i + 1) % mine.length];
  pickUp(game, nxt);
}

function breakThreshold(u) {
  return Math.max(8, Math.floor(u.maxMuster * 0.9));
}

function inSupply(game, u) {
  const pos = displayPos(game, u);
  if ((u.side === "norman" || u.side === "german") && !englandLat(pos.y)) return true;
  const sources = [];
  for (const t of game.towns) {
    if (t.owner === u.side) sources.push([t.x, t.y]);
  }
  if (u.side === "norman") {
    for (const f of living(game).filter((x) => x.side === "norman" && x.type === "fleet")) {
      sources.push([f.x, f.y]);
    }
  }
  if (u.side === "norse") {
    for (const f of living(game).filter((x) => x.side === "norse" && x.type === "fleet")) {
      sources.push([f.x, f.y]);
    }
  }
  if (u.side === "german") {
    for (const f of living(game).filter((x) => x.side === "german" && x.type === "fleet")) {
      sources.push([f.x, f.y]);
    }
  }
  if (!sources.length) return false;
  const key = (x, y) => x + "," + y;
  const seen = new Set([key(pos.x, pos.y)]);
  const q = [{ x: pos.x, y: pos.y, d: 0 }];
  while (q.length) {
    const cur = q.shift();
    if (sources.some(([sx, sy]) => sx === cur.x && sy === cur.y)) return true;
    if (cur.d >= 12) continue;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = key(nx, ny);
      if (seen.has(k) || !inBounds(game.map, nx, ny)) continue;
      const terr = terrainAt(game.map, nx, ny);
      if (terr === TERRAIN.OUT) continue;
      if (terr === TERRAIN.SEA && u.side !== "norman" && u.side !== "norse" && u.side !== "german") continue;
      if (u.side === "german") {
        const block = living(game).some(
          (f) => f.type === "fleet" && f.side !== "german" && f.x === nx && f.y === ny,
        );
        if (block) continue;
      }
      const enemy = landUnitAt(game, nx, ny);
      if (enemy && enemy.side !== u.side) continue;
      seen.add(k);
      q.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return false;
}

function fight(game, a, b) {
  const strike = (atk, def, attacker) => {
    let str = atk.combat;
    if (!inSupply(game, atk)) str = Math.max(1, Math.floor(str / 2));
    if (atk.fatigue) str = Math.floor(str * (1 - 0.12 * atk.fatigue));
    const terr = terrainAt(game.map, def.x, def.y);
    if (!attacker && (terr === TERRAIN.TOWN || terr === TERRAIN.HILL)) str = Math.floor(str * 1.45);
    if (attacker && terr === TERRAIN.FOREST && atk.type === "knights") str = Math.floor(str * 0.7);
    if (attacker && atk.type === "archers") str = Math.floor(str * 1.12);
    if (!attacker && def.type === "housecarls") str = Math.floor(str * 1.1);
    if (game.campaign === SEALION_ID) str = sealionStrike(game, str, atk, def, attacker);
    const p = Math.min(0.72, str / 240);
    if (game.rng() < p) {
      def.combat = Math.max(0, def.combat - 4);
      def.muster = Math.max(0, def.muster - 1);
      def.flash = 1;
      return true;
    }
    return false;
  };
  strike(a, b, true);
  strike(b, a, false);
  a.fought = true;
  b.fought = true;
  // Log the break once. A later blow in the same week used to write the
  // line again while the unit was already broken.
  if (!b.broken && b.combat < breakThreshold(b) && b.muster > 0) {
    b.broken = true;
    b.orders = [];
    log(game, `${b.name} breaks.`);
  }
  if (!a.broken && a.combat < breakThreshold(a) && a.muster > 0) {
    a.broken = true;
    a.orders = [];
    log(game, `${a.name} breaks.`);
  }
  if (b.muster <= 0) destroy(game, b, a);
  if (a.muster <= 0) destroy(game, a, b);
}

function destroy(game, dead, killer) {
  if (game.campaign === SEALION_ID && dead.type === "fleet") {
    const lost = cargoOf(game, dead.id).slice();
    const terr = terrainAt(game.map, dead.x, dead.y);
    for (const c of lost) {
      c.embarkedOn = null;
      if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER) {
        c.alive = false;
        c.muster = 0;
        c.combat = 0;
        c.orders = [];
        log(game, `${c.name} is lost with ${dead.name}.`);
      }
    }
  }
  dead.alive = false;
  dead.muster = 0;
  dead.combat = 0;
  dead.orders = [];
  log(game, `${dead.name} is destroyed${killer ? " by " + killer.name : ""}.`);
  const near = living(game).filter(
    (u) => u.side === dead.side && Math.abs(u.x - dead.x) + Math.abs(u.y - dead.y) <= 2,
  );
  if (near.length) {
    const rec = near[0];
    rec.muster = Math.min(rec.maxMuster + 4, rec.muster + 2);
    rec.combat += 6;
  }
}

function retreatDir(game, u) {
  const enemies = living(game).filter((o) => o.side !== u.side);
  if (!enemies.length) return null;
  let best = null;
  let bestScore = -1e9;
  for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
    const nx = u.x + dx;
    const ny = u.y + dy;
    if (!canEnter(game, u, nx, ny)) continue;
    if (landUnitAt(game, nx, ny)) continue;
    const d = enemies.reduce((s, e) => s + Math.abs(e.x - nx) + Math.abs(e.y - ny), 0);
    if (d > bestScore) {
      bestScore = d;
      best = dir;
    }
  }
  return best;
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function beginResolve(game) {
  game.phase = "resolve";
  game.tick = 0;
  for (const u of living(game)) {
    u.progress = 0;
    u.fought = false;
  }
}

export function stepTick(game) {
  game.tick += 1;
  const order = shuffled(living(game), game.rng);
  for (const u of order) {
    if (!u.alive) continue;
    if (u.embarkedOn) {
      const f = unitById(game, u.embarkedOn);
      if (!f || !f.alive) {
        u.embarkedOn = null;
      } else {
        u.x = f.x;
        u.y = f.y;
      }
    }
    if (u.broken) {
      u.progress += 1;
      if (u.progress >= 4) {
        const d = retreatDir(game, u);
        if (d) {
          const [dx, dy] = DIRS[d];
          u.x += dx;
          u.y += dy;
        }
        u.progress = 0;
      }
      continue;
    }
    if (game.campaign === SEALION_ID && u.type === "fleet") unloadOnEnglishShore(game, u);
    if (!u.orders.length) continue;
    const dir = u.orders[0];
    const [dx, dy] = DIRS[dir] || [0, 0];
    const from = displayPos(game, u);
    const nx = from.x + dx;
    const ny = from.y + dy;
    const cost = canEnter(game, u, nx, ny) ? moveCost(game, u, nx, ny) : 6;
    u.progress += 1;
    if (u.progress < Math.max(2, Math.min(cost, 16))) continue;

    if (!inBounds(game.map, nx, ny)) {
      u.orders.shift();
      u.progress = 0;
      continue;
    }

    const occ = blockerAt(game, u, nx, ny);
    if (occ && occ.id !== u.id && occ.side === u.side) {
      continue;
    }
    if (occ && occ.side !== u.side) {
      fight(game, u, occ);
      u.progress = 0;
      continue;
    }

    // A barge has to beach inside the defender's zone. Land ZOC would delete
    // that order. 1066 fleets still obey it.
    const fleetLanding = game.campaign === SEALION_ID && u.type === "fleet";
    if (!isAirType(u.type) && !fleetLanding && enemyZoc(game, u, from.x, from.y) && enemyZoc(game, u, nx, ny)) {
      u.orders.shift();
      u.progress = 0;
      continue;
    }

    if (u.embarkedOn) {
      if (tryDisembark(game, u, nx, ny)) {
        u.orders.shift();
        u.progress = 0;
        continue;
      }
      const terr = terrainAt(game.map, nx, ny);
      if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER) {
        // cargo stays with the fleet; skip independent sea walking
        u.orders.shift();
        u.progress = 0;
        continue;
      }
    } else if (u.type !== "fleet" && !isAirType(u.type) && !isAirborneType(u.type)) {
      const terr = terrainAt(game.map, nx, ny);
      if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER) {
        if (tryEmbark(game, u, nx, ny)) {
          const rest = u.orders.slice(1);
          const f = unitById(game, u.embarkedOn);
          if (f) f.orders = [...f.orders, ...rest].slice(0, MAX_ORDERS);
          u.orders = [];
          u.progress = 0;
          continue;
        }
        u.orders.shift();
        u.progress = 0;
        continue;
      }
    }

    if (!canEnter(game, u, nx, ny)) {
      u.orders.shift();
      u.progress = 0;
      continue;
    }

    u.x = nx;
    u.y = ny;
    if (u.type === "fleet") {
      for (const c of cargoOf(game, u.id)) {
        c.x = nx;
        c.y = ny;
      }
      if (game.campaign === SEALION_ID) unloadOnEnglishShore(game, u);
    }
    u.orders.shift();
    u.progress = 0;
  }
  return game.tick >= TICKS_PER_TURN;
}

function captureTowns(game) {
  for (const t of game.towns) {
    const u = landUnitAt(game, t.x, t.y);
    if (u) t.owner = u.side;
  }
}

function englishLevies(game) {
  if (game.campaign === SEALION_ID) return;
  // Same sticky test as planAI. Imported here so a landing during this week
  // is visible at upkeep, before the next orders phase.
  if (!noteNormansLanded(game)) return;
  if (game.turn !== 6 && game.turn !== 9 && game.turn !== 12) return;
  const spots = ["Gloucester", "Oxford", "Lincoln"];
  const names = ["Gloucester Fyrd", "Oxford Fyrd", "Lindsey Fyrd"];
  const i = game.turn === 6 ? 0 : game.turn === 9 ? 1 : 2;
  const town = townByName({ towns: game.towns }, spots[i]);
  if (!town || town.owner !== "english") return;
  if (landUnitAt(game, town.x, town.y)) return;
  game.units.push({
    id: "levy" + game.turn,
    name: names[i],
    side: "english",
    type: "fyrd",
    x: town.x,
    y: town.y,
    muster: 10,
    combat: 36,
    maxMuster: 12,
    orders: [],
    progress: 0,
    broken: false,
    fatigue: 0,
    fought: false,
    embarkedOn: null,
    region: "south",
    flash: 0,
    alive: true,
    index: game.units.length,
  });
  log(game, `${names[i]} answers the fyrd-call at ${town.name}.`);
}

export function sideScore(game, side) {
  let s = 0;
  for (const t of game.towns) if (t.owner === side) s += t.value;
  return s;
}

export function checkVictory(game) {
  if (game.campaign === SEALION_ID) return checkSealionVictory(game);
  const london = game.towns.find((t) => t.name === "London");
  const winch = game.towns.find((t) => t.name === "Winchester");
  const harold = unitById(game, "harold");
  const william = unitById(game, "william");
  const hardrada = unitById(game, "hardrada");
  const williamDead = !william || !william.alive;
  const haroldDead = !harold || !harold.alive;
  game.score = sideScore(game, "norman") + (haroldDead ? 20 : 0) + (hardrada && !hardrada.alive ? 8 : 0);
  if (williamDead) {
    game.winner = "english";
    game.outcome = "William has fallen. The invasion dies with him.";
    return true;
  }
  if (london && london.owner === "norman" && ((winch && winch.owner === "norman") || haroldDead)) {
    game.winner = "norman";
    game.outcome = haroldDead
      ? "Harold is dead and London is yours. The Witan will come to heel."
      : "London and Winchester are yours. England has a new king.";
    return true;
  }
  if (game.turn >= TURNS_TO_CHRISTMAS) {
    if (london && london.owner === "norman") {
      game.winner = "norman";
      game.outcome = "Christmas, and London holds for William. The kingdom is his to keep.";
    } else {
      game.winner = "english";
      game.outcome = "Christmas, and London still holds for Harold. The invasion has spent itself.";
    }
    return true;
  }
  return false;
}

export function applyUpkeep(game) {
  captureTowns(game);
  for (const u of living(game)) {
    const supplied = inSupply(game, u);
    u.supplied = supplied;
    if (supplied) {
      u.combat = Math.min(u.muster * 5, u.combat + 2);
      if (u.side === "english" && u.type === "fyrd") {
        u.muster = Math.min(u.maxMuster, u.muster + 1);
      }
    } else {
      if (game.rng() < 0.18) u.muster = Math.max(1, u.muster - 1);
      u.combat = Math.min(u.combat, u.muster * 4);
    }
    if (supplied && game.campaign === SEALION_ID && u.side === "british" && u.type === "home_guard") {
      u.muster = Math.min(u.maxMuster, u.muster + 1);
    }
    if (u.fought) u.fatigue = Math.min(3, u.fatigue + 1);
    else u.fatigue = Math.max(0, u.fatigue - 1);
    if (u.broken && u.combat >= 12) u.broken = false;
  }
  englishLevies(game);
  if (game.campaign === SEALION_ID) britishCallup(game);
  game.turn += 1;
  game.weather = rollWeather(game);
  if (game.campaign === SEALION_ID) game.air = airBalance(game);
  const d = dateOf(game);
  if (game.campaign === SEALION_ID) log(game, `${d.label}. ${game.weather.label}. ${game.air.label}.`);
  else log(game, `${d.label}. ${game.weather.label}.`);
  if (checkVictory(game)) {
    game.phase = "ended";
    log(game, game.outcome);
    return;
  }
  game.phase = "orders";
  game.tick = 0;
}

function layerOf(unit) {
  if (isAirType(unit.type)) return "air";
  if (unit.type === "fleet") return "sea";
  return "land";
}

// 1066 keeps land-only blocking. In 1940, ships fight ships and aircraft fight
// aircraft. Bombers also strike whatever is on the ground or the water.
export function blockerAt(game, mover, x, y) {
  if (!mover || game.campaign !== SEALION_ID) return landUnitAt(game, x, y);
  const layer = layerOf(mover);
  const at = living(game).filter((u) => {
    if (u.id === mover.id || u.embarkedOn) return false;
    const p = displayPos(game, u);
    return p.x === x && p.y === y;
  });
  const friendly = at.find((u) => u.side === mover.side && layerOf(u) === layer);
  if (friendly) return friendly;
  const enemy = at.find((u) => u.side !== mover.side && layerOf(u) === layer);
  if (enemy) return enemy;
  if (mover.type === "bombers") {
    return at.find((u) => u.side !== mover.side && !isAirType(u.type)) || null;
  }
  return null;
}

function sealionStrike(game, str, atk, def, attacker) {
  const at = terrainAt(game.map, atk.x, atk.y);
  if (atk.type === "home_guard" && (at === TERRAIN.TOWN || at === TERRAIN.HILL)) {
    str = Math.floor(str * 1.2);
  }
  if (!attacker) return str;
  const dt = terrainAt(game.map, def.x, def.y);
  if (atk.type === "panzers" && (dt === TERRAIN.FOREST || dt === TERRAIN.TOWN || dt === TERRAIN.MARSH)) {
    str = Math.floor(str * 0.65);
  }
  if (atk.type === "panzers" && (dt === TERRAIN.CLEAR || dt === TERRAIN.ROAD)) {
    str = Math.floor(str * 1.12);
  }
  if (atk.type === "fighters" && isAirType(def.type)) str = Math.floor(str * 1.35);
  if (atk.type === "fighters" && !isAirType(def.type)) str = Math.floor(str * 0.45);
  if (atk.type === "bombers" && !isAirType(def.type)) str = Math.floor(str * 1.3);
  if (atk.type === "bombers" && isAirType(def.type)) str = Math.floor(str * 0.65);
  if (atk.type === "fleet" && def.type === "fleet" && atk.side === "british") str = Math.floor(str * 1.25);
  if (game.air && game.air.id === "luftwaffe" && atk.side === "german" && isGroundType(atk.type)) {
    str = Math.floor(str * 1.1);
  }
  if (
    game.air &&
    game.air.id === "raf" &&
    atk.side === "german" &&
    isGroundType(atk.type) &&
    atk.type !== "fleet" &&
    atk.y < ENGLAND_LAT
  ) {
    str = Math.floor(str * 0.85);
  }
  return str;
}

export function airBalance(game) {
  let german = 0;
  let british = 0;
  for (const u of living(game)) {
    if (!isAirType(u.type)) continue;
    const weight = (u.type === "bombers" ? 0.35 : 1) * (u.broken ? 0.5 : 1);
    const strength = u.combat * weight;
    if (u.side === "german") german += strength;
    else if (u.side === "british") british += strength;
  }
  if (german > british * 1.2 && german > 0) return { id: "luftwaffe", label: "Luftwaffe superiority" };
  if (british > german * 1.15 && british > 0) return { id: "raf", label: "RAF superiority" };
  return { id: "contested", label: "Contested skies" };
}

function southCoastLanding(game, x, y) {
  if (y >= ENGLAND_LAT) return false;
  const terr = terrainAt(game.map, x, y);
  if (terr === TERRAIN.BEACH) return true;
  if (!isPort(game.map, x, y)) return false;
  const town = townAt(game.map, x, y);
  return !!(town && town.y >= 28);
}

function unloadOnEnglishShore(game, fleet) {
  if (!southCoastLanding(game, fleet.x, fleet.y)) return;
  const cargo = cargoOf(game, fleet.id).filter((c) => isGroundType(c.type) && c.type !== "fleet");
  if (!cargo.length) return;
  const spots = [];
  const consider = (x, y) => {
    if (!inBounds(game.map, x, y) || y >= ENGLAND_LAT) return;
    if (landUnitAt(game, x, y)) return;
    const terr = terrainAt(game.map, x, y);
    if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER || terr === TERRAIN.OUT) return;
    spots.push({ x, y });
  };
  consider(fleet.x, fleet.y);
  for (const [dx, dy] of Object.values(DIRS)) consider(fleet.x + dx, fleet.y + dy);
  let landed = 0;
  for (const c of cargo) {
    const spot = spots.shift();
    if (!spot) break;
    c.embarkedOn = null;
    c.x = spot.x;
    c.y = spot.y;
    c.orders = [];
    landed += 1;
  }
  if (landed) log(game, `${fleet.name} puts ${landed === 1 ? "a unit" : landed + " units"} ashore.`);
}

function shoreTargets(game) {
  const out = [];
  for (let y = 0; y < game.h; y++) {
    for (let x = 0; x < game.w; x++) {
      if (southCoastLanding(game, x, y)) out.push({ x, y });
    }
  }
  return out;
}

function nearestReachableShore(game, fleet, tx, ty) {
  let best = null;
  let bestScore = 1e9;
  for (const s of shoreTargets(game)) {
    if (fleet.x === s.x && fleet.y === s.y) return s;
    const orders = pathToOrders(game, fleet, s.x, s.y);
    if (!orders.length) continue;
    const score = orders.length * 2 + Math.abs(s.x - tx) + Math.abs(s.y - ty);
    if (score < bestScore) {
      bestScore = score;
      best = { ...s, orders };
    }
  }
  return best;
}

function landApproach(game, unit, tx, ty) {
  const start = displayPos(game, unit);
  const key = (x, y) => x + "," + y;
  const q = [{ x: start.x, y: start.y, path: [] }];
  const seen = new Set([key(start.x, start.y)]);
  while (q.length) {
    const cur = q.shift();
    if (cur.x === tx && cur.y === ty) return cur.path;
    if (cur.path.length >= MAX_ORDERS) continue;
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = key(nx, ny);
      if (seen.has(k) || !inBounds(game.map, nx, ny)) continue;
      const terr = terrainAt(game.map, nx, ny);
      const isTarget = nx === tx && ny === ty;
      if (!isTarget) {
        if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER || terr === TERRAIN.OUT) continue;
        const occ = landUnitAt(game, nx, ny);
        if (occ && occ.id !== unit.id && occ.side === unit.side) continue;
      }
      seen.add(k);
      q.push({ x: nx, y: ny, path: cur.path.concat(dir) });
    }
  }
  return null;
}

function seaBeside(game, x, y) {
  const out = [];
  const here = terrainAt(game.map, x, y);
  if (here === TERRAIN.SEA || here === TERRAIN.RIVER) out.push({ x, y });
  for (const [dx, dy] of Object.values(DIRS)) {
    const nx = x + dx;
    const ny = y + dy;
    const terr = terrainAt(game.map, nx, ny);
    if (terr === TERRAIN.SEA || terr === TERRAIN.RIVER) out.push({ x: nx, y: ny });
  }
  return out;
}

function transportFleets(game, side) {
  return living(game).filter((f) => {
    if (f.side !== side || f.type !== "fleet") return false;
    const cap = f.capacity == null ? 3 : f.capacity;
    return cap > cargoOf(game, f.id).length;
  });
}

// Clicking an English square from France plots the embarkation and the
// barge's run to the nearest beach. Arrow keys still lay the orders by hand.
function planCrossing(game, unit, tx, ty) {
  if (game.campaign !== SEALION_ID || isAirType(unit.type)) return null;
  const start = displayPos(game, unit);
  if (unit.type === "fleet" || unit.embarkedOn) {
    const fleet = unit.type === "fleet" ? unit : unitById(game, unit.embarkedOn);
    if (!fleet) return null;
    const terr = terrainAt(game.map, tx, ty);
    const held = landUnitAt(game, tx, ty);
    const open = !held || held.side === fleet.side;
    const direct =
      open &&
      (terr === TERRAIN.SEA ||
        terr === TERRAIN.BEACH ||
        (isPort(game.map, tx, ty) && fleetMayEnter(game, fleet, tx, ty)));
    if (direct) {
      const orders = pathToOrders(game, fleet, tx, ty);
      if (orders.length) return orders;
    }
    const shore = nearestReachableShore(game, fleet, tx, ty);
    return shore && shore.orders && shore.orders.length ? shore.orders : null;
  }
  if (isAirborneType(unit.type)) return null;
  if (!(start.y >= ENGLAND_LAT && ty < ENGLAND_LAT)) return null;
  const fleets = transportFleets(game, unit.side);
  if (!fleets.length) return null;
  let best = null;
  for (const fleet of fleets) {
    const shore = nearestReachableShore(game, fleet, tx, ty);
    if (!shore || !shore.orders || !shore.orders.length) continue;
    for (const sea of seaBeside(game, fleet.x, fleet.y)) {
      const approach = landApproach(game, unit, sea.x, sea.y);
      if (!approach) continue;
      const orders = approach.concat(shore.orders).slice(0, MAX_ORDERS);
      if (orders.length <= approach.length) continue;
      const score = approach.length + shore.orders.length + Math.abs(shore.x - tx) + Math.abs(shore.y - ty);
      if (!best || score < best.score) best = { orders, score };
    }
  }
  return best ? best.orders : null;
}

function holdsLodgement(game) {
  const names = game.beachheads || SEALION_BEACHHEADS;
  let n = 0;
  for (const name of names) {
    const town = game.towns.find((t) => t.name === name);
    if (town && town.owner === "german") n += 1;
  }
  return n >= 2;
}

function germanArmyAlive(game) {
  return living(game).some((u) => u.side === "german" && isGroundType(u.type) && u.type !== "fleet");
}

function checkSealionVictory(game) {
  const london = game.towns.find((t) => t.name === "London");
  const londonHeld = london && london.owner === "german";
  let beach = 0;
  for (const name of game.beachheads || SEALION_BEACHHEADS) {
    const town = game.towns.find((t) => t.name === name);
    if (town && town.owner === "german") beach += 1;
  }
  game.score = sideScore(game, "german") + (londonHeld ? 25 : 0) + beach * 5;
  if (londonHeld) {
    game.winner = "german";
    game.outcome = "London has fallen. Operation Sea Lion is ashore, and the capital is in German hands.";
    return true;
  }
  if (game.turn > 0 && !germanArmyAlive(game)) {
    game.winner = "british";
    game.outcome = "The invasion army is gone. Britain holds the isle.";
    return true;
  }
  if (game.turn >= (game.maxTurns || SEALION_TURNS)) {
    const d = dateOf(game);
    if (holdsLodgement(game)) {
      game.winner = "german";
      game.outcome = `${d.label}. The beachhead still holds. The lodgement has survived the autumn.`;
    } else {
      game.winner = "british";
      game.outcome = `${d.label}. No lodgement remains. The Narrow Seas have closed, and Sea Lion is postponed.`;
    }
    return true;
  }
  return false;
}

function britishCallup(game) {
  if (!noteGermansLanded(game)) return;
  const call = SEALION_CALLUPS.find((c) => c.turn === game.turn);
  if (!call) return;
  const town = townByName({ towns: game.towns }, call.town);
  if (!town || town.owner !== "british") return;
  if (landUnitAt(game, town.x, town.y)) return;
  game.units.push({
    id: "hg" + game.turn,
    name: call.name,
    side: "british",
    type: "home_guard",
    x: town.x,
    y: town.y,
    muster: 11,
    combat: 36,
    maxMuster: 12,
    orders: [],
    progress: 0,
    broken: false,
    fatigue: 0,
    fought: false,
    embarkedOn: null,
    region: "south",
    home: town.name,
    role: "guard",
    flash: 0,
    alive: true,
    supplied: true,
    index: game.units.length,
  });
  log(game, `${call.name} musters at ${town.name}.`);
}

export function tileInfo(game, x, y) {
  const terr = TNAME[terrainAt(game.map, x, y)];
  const town = game.towns.find((t) => t.x === x && t.y === y);
  const stack = unitsAt(game, x, y);
  return { terr, town, stack };
}

export { inSupply };
