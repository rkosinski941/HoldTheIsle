import { loadMap } from "./world.js";
import { createGame } from "./engine.js";
import { GameView, loadBoardImage } from "./view.js";
import { allowTitleTheme, armAudio, startTitleTheme, stopTitleTheme } from "./sound.js";

const title = document.getElementById("title");
const howto = document.getElementById("howto");
const gameRoot = document.getElementById("game");
const canvas = document.getElementById("map");
const hud = document.getElementById("hud");
const endScreen = document.getElementById("end");
const endText = document.getElementById("end-text");
const endScore = document.getElementById("end-score");

let view = null;
let mapData = null;

loadMap()
  .then((data) => {
    mapData = data;
    loadBoardImage(data);
    document.getElementById("play").disabled = false;
    syncCampaign();
  })
  .catch((err) => {
    document.getElementById("play").textContent = "Map failed to load";
    console.error(err);
  });

let leavingTitle = false;
document.getElementById("play").addEventListener("pointerdown", () => {
  leavingTitle = true;
});
document.getElementById("play").addEventListener("click", () => start());
document.addEventListener("pointerdown", onFirstGesture);
document.addEventListener("keydown", onFirstGesture);

function onFirstGesture() {
  armAudio();
  const skipTheme = leavingTitle;
  leavingTitle = false;
  if (!title.hidden && !skipTheme) startTitleTheme();
}
document.getElementById("open-help").addEventListener("click", () => {
  howto.hidden = false;
});
document.getElementById("close-help").addEventListener("click", () => {
  howto.hidden = true;
});
document.getElementById("again").addEventListener("click", () => {
  endScreen.hidden = true;
  title.hidden = false;
  allowTitleTheme();
});

const campaignSelect = document.getElementById("campaign");
const titleKicker = document.getElementById("title-kicker");
const titleSub = document.getElementById("title-sub");
const titleTag = document.getElementById("title-tag");
const cometCaption = document.getElementById("comet-caption");
const playButton = document.getElementById("play");
const diffSelect = document.getElementById("diff");
const help1066 = document.getElementById("help-1066");
const help1940 = document.getElementById("help-1940");
const savedDifficulty = [...diffSelect.options].map((o) => o.textContent);

const SEALION_COPY = {
  kicker: "September 1940",
  sub: "Operation Sea Lion- 1940",
  tag: "Win the air, then put the barges across. The Royal Navy is the obstacle that matters.",
  button: "Launch Sea Lion",
  title: "Hold the Isle: Operation Sea Lion- 1940",
  difficulty: ["Easy — a kinder sky", "Normal — September as it was", "Hard — Fighter Command holds"],
};

function syncCampaign() {
  const sealion = campaignSelect.value === "1940";
  title.classList.toggle("sealion", sealion);
  help1066.hidden = sealion;
  help1940.hidden = !sealion;
  if (!sealion) {
    titleKicker.textContent = "Anno Domini MLXVI";
    titleSub.textContent = "The Year of Three Kings- 1066";
    titleTag.textContent = "A scrolling campaign in the manner of Chris Crawford’s Eastern Front";
    cometCaption.textContent = "Halley's star, seen over England, April 1066";
    playButton.textContent = mapData ? "Cross the Channel" : playButton.textContent;
    document.title = "Hold the Isle: The Year of Three Kings- 1066";
    savedDifficulty.forEach((text, i) => {
      diffSelect.options[i].textContent = text;
    });
    return;
  }
  titleKicker.textContent = SEALION_COPY.kicker;
  titleSub.textContent = SEALION_COPY.sub;
  titleTag.textContent = SEALION_COPY.tag;
  playButton.textContent = mapData ? SEALION_COPY.button : playButton.textContent;
  document.title = SEALION_COPY.title;
  SEALION_COPY.difficulty.forEach((text, i) => {
    diffSelect.options[i].textContent = text;
  });
}

campaignSelect.addEventListener("change", syncCampaign);

function start() {
  if (!mapData) return;
  armAudio();
  stopTitleTheme();
  const difficulty = diffSelect.value;
  const campaign = campaignSelect.value === "1940" ? "1940" : "1066";
  const seed = (Date.now() ^ (campaign === "1940" ? 1940 : 1066)) >>> 0;
  const game = createGame(mapData, difficulty, seed, campaign);
  title.hidden = true;
  howto.hidden = true;
  endScreen.hidden = true;
  gameRoot.hidden = false;
  if (view) view.destroy();
  view = new GameView(canvas, hud, game, showEnd);
}

function showEnd(game) {
  endScreen.hidden = false;
  endText.textContent = game.outcome || "The campaign is over.";
  const london = game.towns.find((t) => t.name === "London")?.owner || "unknown";
  if (game.campaign === "1940") {
    endScore.textContent = `German score ${game.score}. London is held by the ${london}. ${game.air ? game.air.label + "." : ""}`;
    return;
  }
  endScore.textContent = `Norman score ${game.score}. London is held by the ${london}.`;
}
