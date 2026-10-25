// Hold the Isle: Operation Sea Lion- 1940.
// The player is Germany. Britain is the AI. The same Channel map is the board.
// Historical frame: 15 September 1940, the day Sea Lion was meant to be ready,
// through 10 November, when the autumn narrow seas close the season.
// Sides and names follow the real order of battle at game scale:
// Army Group A's 16th and 9th Armies, the barge flotillas, JG 26 and JG 2,
// KG 2, Student's 7th Flieger; Brooke's Home Forces, Montgomery's 3rd Division,
// Park's 11 Group, and Ramsay's Dover Command.

export const SEALION_ID = "1940";

export const SEALION_CALENDAR = { day: 15, month: 9, year: 1940, daysPerTurn: 4 };

// Fourteen turns of four days: 15 September through 10 November 1940.
export const SEALION_TURNS = 14;

export const SEALION_BEACHHEADS = ["Dover", "Canterbury", "Hastings", "Pevensey", "Chichester"];

export const SEALION_OWNERS = {
  York: "british",
  Durham: "british",
  Lincoln: "british",
  Nottingham: "british",
  Norwich: "british",
  Stamford: "british",
  Oxford: "british",
  London: "british",
  Winchester: "british",
  Canterbury: "british",
  Dover: "british",
  Hastings: "british",
  Pevensey: "british",
  Chichester: "british",
  Exeter: "british",
  Gloucester: "british",
  Wallingford: "british",
  Thetford: "british",
  "St-Valery": "german",
  Bayeux: "german",
  Caen: "german",
  Rouen: "german",
  Dives: "german",
};

// Fleets are listed first so they claim the port square.
export const SEALION_UNITS = [
  spec("flot-e", "Flotilla East", "german", "fleet", "St-Valery", 14, 32, { naval: true, capacity: 3 }),
  spec("flot-w", "Flotilla West", "german", "fleet", "Dives", 14, 32, { naval: true, capacity: 3 }),
  spec("destroyers", "Destroyer Flotilla", "german", "fleet", "Caen", 10, 52, { naval: true, capacity: 0 }),
  spec("army16", "16th Army", "german", "infantry", "St-Valery", 28, 130, { role: "assault" }),
  spec("army9", "9th Army", "german", "infantry", "Dives", 26, 120, { role: "assault" }),
  spec("xiii", "XIII Corps", "german", "infantry", "Caen", 18, 85, { role: "assault" }),
  spec("vii", "VII Corps", "german", "infantry", "Bayeux", 16, 78, { role: "assault" }),
  spec("panzer", "Panzer Group", "german", "panzers", "Rouen", 14, 100, { role: "assault" }),
  spec("student", "7th Flieger", "german", "fallschirm", "Rouen", 14, 90, { role: "assault" }),
  spec("div17", "17th Division", "german", "infantry", "St-Valery", 16, 72, { role: "assault" }),
  spec("div35", "35th Division", "german", "infantry", "Dives", 14, 64, { role: "assault" }),
  spec("jg26", "JG 26", "german", "fighters", "St-Valery", 16, 115),
  spec("jg2", "JG 2", "german", "fighters", "Rouen", 14, 100),
  spec("kg2", "KG 2", "german", "bombers", "Caen", 12, 80),

  spec("ramsay", "Ramsay", "british", "fleet", "Dover", 20, 115, { naval: true, capacity: 0 }),
  spec("portsmouth", "Portsmouth", "british", "fleet", "Chichester", 18, 105, { naval: true, capacity: 0 }),
  spec("brooke", "Brooke", "british", "infantry", "London", 26, 125, { role: "reserve" }),
  spec("montgomery", "Montgomery", "british", "infantry", "Pevensey", 18, 92, { role: "crust" }),
  spec("xiicorps", "XII Corps", "british", "infantry", "Canterbury", 18, 88, { role: "crust" }),
  spec("doverbde", "Dover Brigade", "british", "infantry", "Dover", 16, 76, { role: "crust" }),
  spec("vcorps", "V Corps", "british", "infantry", "Winchester", 16, 82, { role: "reserve" }),
  spec("armour", "1st Armoured", "british", "panzers", "Oxford", 12, 72, { role: "reserve" }),
  spec("hgkent", "Kent Home Guard", "british", "home_guard", "Dover", 12, 40, { role: "guard" }),
  spec("hgsussex", "Sussex Home Guard", "british", "home_guard", "Hastings", 12, 38, { role: "guard" }),
  spec("hglondon", "London Home Guard", "british", "home_guard", "London", 14, 42, { role: "guard" }),
  spec("group11", "11 Group", "british", "fighters", "London", 20, 135),
  spec("group10", "10 Group", "british", "fighters", "Exeter", 14, 82),
  spec("group12", "12 Group", "british", "fighters", "Nottingham", 14, 80),
  spec("bombercmd", "Bomber Command", "british", "bombers", "Lincoln", 12, 60),
];

export const SEALION_CALLUPS = [
  { turn: 3, town: "Gloucester", name: "Gloucester Home Guard" },
  { turn: 7, town: "Oxford", name: "Oxford Home Guard" },
];

export const SEALION_OPENING =
  "15 September 1940. The barges lie between the Somme and the Orne. Fighter Command still holds the sky. London waits.";

export const SEALION_HELP = [
  "Orders first, then all sides move at once.",
  "Arrows / WASD plot orders while a German unit is held.",
  "Enter picks up or puts down. N cycles your units. T runs the turn.",
  "Click a unit, then a beach or a town, to plot a path.",
  "Backspace undoes one order. Space clears them.",
  "March onto a flotilla, then across the sea onto a beach to land.",
  "7th Flieger can cross without barges. Gales ground the air and the sea.",
  "RAF superiority keeps the barges in port. Win the air, then sail.",
  "Bombers strike ships and troops. The Royal Navy hunts barges at sea.",
  "Take London, or hold two south-coast towns on 10 November.",
];

function spec(id, name, side, type, town, muster, combat, opts = {}) {
  return { id, name, side, type, town, muster, combat, ...opts };
}
