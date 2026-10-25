import { DIRS, ENGLAND_LAT, TERRAIN, isAirType, terrainAt, townByName } from "./world.js";
import { displayPos, landUnitAt, living, pathToOrders, unitById } from "./engine.js";

function nearest(game, units, x, y) {
  let best = null;
  let bd = 1e9;
  for (const u of units) {
    const p = displayPos(game, u);
    const d = Math.abs(p.x - x) + Math.abs(p.y - y);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

function setToward(game, u, x, y) {
  u.orders = pathToOrders(game, u, x, y);
}

function holdTown(game, u, name) {
  const t = townByName({ towns: game.towns }, name);
  if (!t) return;
  if (u.x === t.x && u.y === t.y) {
    u.orders = [];
    return;
  }
  setToward(game, u, t.x, t.y);
}

function attackNearest(game, u, foes) {
  const p = displayPos(game, u);
  const t = nearest(game, foes, p.x, p.y);
  if (!t) return;
  const tp = displayPos(game, t);
  setToward(game, u, tp.x, tp.y);
}

// Same radius the southern fyrd already used once someone was "ashore".
const THREAT_RADIUS = 10;
// Harold passing through the shire. Three squares is a short march, not a campaign.
const HAROLD_JOIN = 3;

const FYRD_HOME = {
  "London Fyrd": "London",
  "Kent Fyrd": "Canterbury",
  "Wessex Fyrd": "Winchester",
  "East Anglian Fyrd": "Norwich",
  "Mercia Fyrd": "Nottingham",
  "Northumbrian Fyrd": "Durham",
  "Gloucester Fyrd": "Gloucester",
  "Oxford Fyrd": "Oxford",
  "Lindsey Fyrd": "Lincoln",
};

// A land unit on English ground. Row 33 is the Channel; y >= 33 is the Norman
// shore, and Eustace starts on its clear cell at 24,33. Ships, cargo, sea,
// and river do not count.
function onLandInEngland(game, u) {
  if (!u || u.type === "fleet" || u.embarkedOn) return false;
  const p = displayPos(game, u);
  if (p.y >= ENGLAND_LAT) return false;
  const terr = terrainAt(game.map, p.x, p.y);
  return terr !== TERRAIN.SEA && terr !== TERRAIN.RIVER && terr !== TERRAIN.OUT;
}

function onEnglishLand(game, u) {
  return !!u && u.side === "norman" && onLandInEngland(game, u);
}

// Home shire, unless a Norman or Norse land unit in England is inside the
// threat radius. After the Normans have actually landed, a fyrd also falls in
// if Harold passes within HAROLD_JOIN. Before that he is marching on York, and
// following him would empty London on the opening week.
function orderFyrd(game, u, williamLanded) {
  const p = displayPos(game, u);
  const foes = living(game).filter(
    (f) => (f.side === "norman" || f.side === "norse") && onLandInEngland(game, f),
  );
  const threat = nearest(game, foes, p.x, p.y);
  if (threat) {
    const tp = displayPos(game, threat);
    if (Math.abs(tp.x - p.x) + Math.abs(tp.y - p.y) <= THREAT_RADIUS) {
      setToward(game, u, tp.x, tp.y);
      return;
    }
  }
  if (williamLanded) {
    const harold = unitById(game, "harold");
    if (harold && harold.alive && harold.type !== "fleet" && !harold.embarkedOn) {
      const hp = displayPos(game, harold);
      const d = Math.abs(hp.x - p.x) + Math.abs(hp.y - p.y);
      if (d > 0 && d <= HAROLD_JOIN) {
        setToward(game, u, hp.x, hp.y);
        return;
      }
    }
  }
  const home = FYRD_HOME[u.name];
  if (home) holdTown(game, u, home);
}

// Sticky. Once any Norman has stood on English land, later embarking does not
// clear it. planAI and the fyrd-call both read this.
export function noteNormansLanded(game) {
  if (!game.flags) game.flags = {};
  if (game.flags.normansLanded) return true;
  if (living(game).some((u) => onEnglishLand(game, u))) game.flags.normansLanded = true;
  return !!game.flags.normansLanded;
}

export function noteGermansLanded(game) {
  if (!game.flags) game.flags = {};
  if (game.flags.germansLanded) return true;
  if (living(game).some((u) => u.side === "german" && !isAirType(u.type) && onLandInEngland(game, u))) {
    game.flags.germansLanded = true;
  }
  return !!game.flags.germansLanded;
}

function channelPatrol(game) {
  const found = [];
  for (let y = 29; y <= 32; y++) {
    for (let x = 18; x <= 24; x++) {
      if (terrainAt(game.map, x, y) === TERRAIN.SEA) found.push({ x, y });
    }
  }
  if (!found.length) return null;
  return found[Math.floor(found.length / 2)];
}

function adjacentDir(game, u, pred) {
  const p = displayPos(game, u);
  for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
    const occ = living(game).find((o) => {
      if (o.id === u.id || o.embarkedOn || o.side === u.side) return false;
      const op = displayPos(game, o);
      return op.x === p.x + dx && op.y === p.y + dy && pred(o);
    });
    if (occ) return dir;
  }
  return null;
}

function planSealion(game) {
  const british = living(game).filter((u) => u.side === "british");
  const germans = living(game).filter((u) => u.side === "german");
  const germanAir = germans.filter((u) => isAirType(u.type));
  const germanFleet = germans.filter((u) => u.type === "fleet");
  const germanLand = germans.filter((u) => onLandInEngland(game, u) && !isAirType(u.type));
  const landed = noteGermansLanded(game);
  const patrol = channelPatrol(game);

  for (const u of british) {
    if (u.type === "fighters") {
      if (germanAir.length) attackNearest(game, u, germanAir);
      else if (patrol) setToward(game, u, patrol.x, patrol.y);
      continue;
    }
    if (u.type === "bombers") {
      const targets = germanLand.length ? germanLand : germanFleet;
      if (targets.length) attackNearest(game, u, targets);
      continue;
    }
    if (u.type === "fleet") {
      // Stay on the patrol line while the barges are in port. Hunt them once
      // they are actually at sea, which is the turn after they sail.
      const sailing = germanFleet.filter((f) => terrainAt(game.map, f.x, f.y) === TERRAIN.SEA);
      if (sailing.length) attackNearest(game, u, sailing);
      else if (patrol) setToward(game, u, patrol.x, patrol.y);
      continue;
    }
    if (u.type === "home_guard" || u.role === "guard" || u.role === "crust") {
      const p = displayPos(game, u);
      const threat = nearest(game, germanLand, p.x, p.y);
      const radius = u.role === "crust" ? 8 : 6;
      if (threat) {
        const tp = displayPos(game, threat);
        if (Math.abs(tp.x - p.x) + Math.abs(tp.y - p.y) <= radius) {
          setToward(game, u, tp.x, tp.y);
          continue;
        }
      }
      if (u.home) holdTown(game, u, u.home);
      continue;
    }
    if (landed && germanLand.length) {
      attackNearest(game, u, germanLand);
      continue;
    }
    if (u.home) holdTown(game, u, u.home);
  }

  for (const u of british) {
    if (u.orders.length) continue;
    if (isAirType(u.type)) {
      const dir = adjacentDir(game, u, (o) => isAirType(o.type) || (u.type === "bombers" && !isAirType(o.type)));
      if (dir) u.orders = [dir];
      continue;
    }
    if (u.type === "fleet") {
      const dir = adjacentDir(game, u, (o) => o.type === "fleet");
      if (dir) u.orders = [dir];
      continue;
    }
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const occ = landUnitAt(game, u.x + dx, u.y + dy);
      if (occ && occ.side !== u.side) {
        u.orders = [dir];
        break;
      }
    }
  }
}

export function planAI(game) {
  if (game.campaign === "1940") {
    planSealion(game);
    return;
  }
  const norse = living(game).filter((u) => u.side === "norse");
  const english = living(game).filter((u) => u.side === "english");
  const normanLand = living(game).filter((u) => onEnglishLand(game, u));
  const york = game.towns.find((t) => t.name === "York");
  const london = game.towns.find((t) => t.name === "London");
  const norseAlive = norse.some((u) => u.type !== "fleet");
  const williamLanded = noteNormansLanded(game);

  for (const u of norse) {
    if (!u.alive) continue;
    if (u.type === "fleet") {
      const army = norse.find((n) => n.type !== "fleet");
      if (army) setToward(game, u, army.x, army.y);
      continue;
    }
    if (york && york.owner !== "norse") {
      const blocker = landUnitAt(game, york.x, york.y);
      if (blocker && blocker.side !== "norse") setToward(game, u, york.x, york.y);
      else setToward(game, u, york.x, york.y);
    } else {
      const foes = english;
      if (foes.length) attackNearest(game, u, foes);
      else if (london) setToward(game, u, london.x, london.y);
    }
  }

  for (const u of english) {
    if (u.type === "fyrd") {
      orderFyrd(game, u, williamLanded);
      continue;
    }

    const north = u.region === "north" || u.id === "edwin" || u.id === "morcar";
    const royal = u.region === "royal" || u.id === "harold" || u.id === "gyrth" || u.id === "leofwine";

    // A real landing outranks the Norse chase for the royal house only.
    // Before that, Harold, Gyrth and Leofwine still march north.
    if (royal && williamLanded) {
      if (normanLand.length) attackNearest(game, u, normanLand);
      else if (london) setToward(game, u, london.x, london.y);
      continue;
    }

    if (norseAlive && (north || royal)) {
      attackNearest(game, u, norse.filter((n) => n.type !== "fleet"));
      continue;
    }

    if (williamLanded) {
      attackNearest(game, u, normanLand);
      continue;
    }

    if (north) holdTown(game, u, "York");
    else if (royal) holdTown(game, u, "London");
  }

  // If a unit sits on an enemy, issue a dummy bump so combat still fires next turn
  for (const u of [...norse, ...english]) {
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const occ = landUnitAt(game, u.x + dx, u.y + dy);
      if (occ && occ.side !== u.side && (!u.orders.length || u.orders[0] !== dir)) {
        if (Math.abs(occ.x - u.x) + Math.abs(occ.y - u.y) === 1 && u.orders.length === 0) {
          u.orders = [dir];
        }
      }
    }
  }
}
