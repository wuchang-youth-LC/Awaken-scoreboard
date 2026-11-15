// 學員頁：大地遊戲期間各隊用手機看的畫面
// 顯示哪一場、哪些區塊，由總控台「設定 → 學員頁」決定
import { watchCamp } from "./store.js";
import { GAME_LABELS, GAME_TYPES, gameConfig, gamePoints, studentConfig } from "./games.js";
import { teamNum } from "./scoring.js";
import { $, esc } from "./ui.js";

const MAPS = { d2: "map.jpg", d3: "map_2.jpg" };
let settings = null, games = [], state = { active: {}, rounds: {} };

function render() {
    if (!settings) return;
    const view = studentConfig(settings);
    const game = view.game, g = gameConfig(settings, game);
    $("gameBig").textContent = GAME_LABELS[game];

    $("block-map").hidden = !view.map;
    if (view.map && !$("mapImg").src.endsWith(MAPS[game])) $("mapImg").src = MAPS[game];

    $("block-stations").hidden = !view.stations;
    if (view.stations) {
        const active = state.active[game] || {};
        $("stations").innerHTML = Object.keys(g.stations).map(Number).map(st => {
            const cfg = g.stations[st], busy = active[st];
            return `
                <div class="st-tile ${busy ? "busy" : ""}">
                    <span class="st-no">${String(st).padStart(2, "0")}</span>
                    <span class="st-info">
                        <b>${esc(cfg.name || GAME_TYPES[cfg.type].label)}</b>
                        <small>${busy ? "闖關中" : "空關"}${cfg.place ? `・${esc(cfg.place)}` : ""}</small>
                    </span>
                </div>`;
        }).join("");
    }

    $("block-scores").hidden = !view.scores;
    if (view.scores) {
        const pts = gamePoints(games, settings, game);
        $("scores").innerHTML = Object.keys(pts).sort((a, b) => teamNum(a) - teamNum(b))
            .map(t => `<div><span>${esc(t)}</span><span class="num">${pts[t].total}</span></div>`).join("");
    }

    $("nothing").hidden = view.map || view.stations || view.scores;
}

watchCamp({
    settings(s) { settings = s; render(); },
    games(list) { games = list; render(); },
    state(st) { state = st; render(); }
});
