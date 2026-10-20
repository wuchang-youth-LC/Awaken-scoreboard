// D2 展示頁：各關前三名 + 各隊讚數
import { watchSettings, watchCollection } from "./firebase.js";
import { rankD2Station, d2StationConfig, d2Likes, formatD2Value } from "./scoring.js";
import { $, esc, overlay } from "./ui.js";

let settings = null, records = [];

const showHidden = overlay(`
    <img class="wordmark" src="assets/wordmark.jpg" alt="ALL IN">
    <div class="title">營會成績結算中</div>
    <div class="sub">敬請期待最高榮耀</div>`, "poster");

function render() {
    if (!settings) return;
    const cards = [];
    for (let st = 1; st <= settings.numStations_d2; st++) {
        const conf = d2StationConfig(settings, st);
        const ranked = rankD2Station(records, settings, st);
        const shown = ranked.slice(0, 3);
        const lines = shown.map(e => `
            <div class="rank-line">
                <span class="pip pip-${e.rank}">${e.rank}</span>
                <span>${esc(e.team)}</span>
                <span class="val num">${esc(formatD2Value(e.val, conf))}</span>
            </div>`);
        while (lines.length < 3) lines.push(`<div class="rank-line none"><span class="pip">${lines.length + 1}</span><span>尚未產生</span></div>`);

        // 同名次超過三隊時，提示還有幾隊並列
        const hiddenTies = ranked.slice(3).filter(e => e.rank <= 3).length;
        const tie = hiddenTies ? `<div class="tie-note">另有 ${hiddenTies} 隊並列前三</div>` : "";

        const busy = settings.d2_status[st] === "red";
        cards.push(`
            <article class="station-card">
                <div class="head">
                    <span class="st-no">${String(st).padStart(2, "0")}</span>
                    <div class="st-meta">
                        <span class="st-name">第 ${st} 關</span>
                        <span class="st-type">${conf.type === "time" ? "TIME 計時" : "SCORE 計分"}</span>
                    </div>
                    ${busy ? `<span class="tag">闖關中</span>` : `<span class="tag tag-free">空關</span>`}
                </div>
                ${lines.join("")}${tie}
            </article>`);
    }
    $("board").innerHTML = cards.join("");

    const likes = d2Likes(records, settings);
    $("likes").innerHTML = Object.entries(likes)
        .map(([team, n]) => `<div><span>${esc(team)}</span><span class="num">${n}</span></div>`)
        .join("");
}

watchSettings(s => {
    settings = s;
    showHidden(s.d2_hidden);
    render();
});
watchCollection("records_d2", list => { records = list; render(); });
