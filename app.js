// 學員頁：大地遊戲期間各隊用手機看的畫面
// 顯示哪一場、哪些區塊，由總控台「設定 → 學員頁」決定
import { watchCamp } from "./store.js";
import { GAME_LABELS, GAME_TYPES, gameConfig, gamePoints, studentConfig, teamProgress } from "./games.js";
import { teamList, teamNum } from "./scoring.js";
import { $, esc, teamOptions } from "./ui.js";

const MAPS = { d2: "map.jpg", d3: "map_2.jpg" };
const MY_TEAM_KEY = "awaken_my_team";
let settings = null, games = [], state = { active: {}, rounds: {} };

// 「我的隊伍」選過一次就記在這支手機上
let myTeam = (() => { try { return localStorage.getItem(MY_TEAM_KEY) || ""; } catch { return ""; } })();
$("myTeamSelect").addEventListener("change", e => {
    myTeam = e.target.value;
    try { localStorage.setItem(MY_TEAM_KEY, myTeam); } catch { /* 無痕模式 */ }
    render();
});

const stationTitle = cfg => esc(cfg.name || GAME_TYPES[cfg.type].label);

function render() {
    if (!settings) return;
    const view = studentConfig(settings);
    const game = view.game, g = gameConfig(settings, game);
    $("gameBig").textContent = GAME_LABELS[game];

    $("block-map").hidden = !view.map;
    if (view.map && !$("mapImg").src.endsWith(MAPS[game])) $("mapImg").src = MAPS[game];

    $("block-myteam").hidden = !view.myTeam;
    if (view.myTeam) renderMyTeam(game, g);

    $("block-stations").hidden = !view.stations;
    if (view.stations) {
        const active = state.active[game] || {};
        $("stations").innerHTML = Object.keys(g.stations).map(Number).map(st => {
            const cfg = g.stations[st], busy = active[st];
            return `
                <div class="st-tile ${busy ? "busy" : ""}">
                    <span class="st-no">${String(st).padStart(2, "0")}</span>
                    <span class="st-info">
                        <b>${stationTitle(cfg)}</b>
                        <small>${busy ? "闖關中" : "空關"}${cfg.place ? `・${esc(cfg.place)}` : ""}</small>
                    </span>
                </div>`;
        }).join("");
    }

    $("block-desc").hidden = !view.desc;
    if (view.desc) {
        $("descList").innerHTML = Object.keys(g.stations).map(Number).map(st => {
            const cfg = g.stations[st];
            return `
                <div class="desc-item">
                    <span class="st-no">${String(st).padStart(2, "0")}</span>
                    <div>
                        <b>${stationTitle(cfg)}</b>${cfg.place ? `<small>${esc(cfg.place)}</small>` : ""}
                        ${cfg.desc ? `<p>${esc(cfg.desc)}</p>` : ""}
                    </div>
                </div>`;
        }).join("");
    }

    $("block-scores").hidden = !view.scores;
    if (view.scores) {
        const pts = gamePoints(games, settings, game);
        $("scores").innerHTML = Object.keys(pts).sort((a, b) => teamNum(a) - teamNum(b))
            .map(t => `<div class="${t === myTeam ? "mine" : ""}"><span>${esc(t)}</span><span class="num">${pts[t].total}</span></div>`).join("");
    }

    $("nothing").hidden = view.map || view.stations || view.scores || view.desc || view.myTeam;
}

function renderMyTeam(game, g) {
    const teams = teamList(settings.numTeams);
    if (!teams.includes(myTeam)) myTeam = "";
    $("myTeamSelect").innerHTML = `<option value="">選擇你的隊伍</option>${teamOptions(settings.numTeams, myTeam)}`;
    if (!myTeam) {
        $("myTeam").innerHTML = `<p class="empty">先在右上方選你是第幾隊，之後這支手機會記住。</p>`;
        return;
    }
    const p = teamProgress(games, settings, game, myTeam);
    $("myTeam").innerHTML = `
        <div class="my-summary">
            <div><span class="num big">${p.total}</span><small>${GAME_LABELS[game]} 大地得分</small></div>
            <div><span class="num big">${p.played}<small> / ${p.stations.length}</small></span><small>已經玩過的關卡</small></div>
        </div>
        <div class="my-stations">${p.stations.map(s => `
            <span class="${s.played ? "done" : ""}" title="${stationTitle(g.stations[s.station])}">
                <b class="num">${s.station}</b>${s.played ? "✓" : ""}
            </span>`).join("")}
        </div>`;
}

watchCamp({
    settings(s) { settings = s; render(); },
    games(list) { games = list; render(); },
    state(st) { state = st; render(); }
});
