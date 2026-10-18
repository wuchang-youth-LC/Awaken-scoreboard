// D3 展示頁：勝負排名 + 每隊下一關
import { watchSettings, watchCollection } from "./firebase.js";
import { d3Standings, d3NextStation } from "./scoring.js";
import { $, esc, overlay } from "./ui.js";

let settings = null, records = [];

const showHidden = overlay(`
    <div class="big">ALL IN</div>
    <div class="title">營會成績結算中</div>
    <div class="sub">敬請期待最高榮耀</div>`, "poster");

function render() {
    if (!settings) return;
    $("leaderboard").innerHTML = d3Standings(records, settings).map(e => {
        const next = d3NextStation(records, settings, e.team);
        const nextHtml = next.done
            ? `<span class="next done">已完賽</span>`
            : next.station
                ? `<span class="next">第 ${next.round} 輪・第 <span class="num">${next.station}</span> 關</span>`
                : `<span class="next done">等待賽程</span>`;
        return `
            <div class="standing ${e.rank <= 3 ? "top" : ""}">
                <span class="pip pip-${e.rank}">${e.rank}</span>
                <span>${esc(e.team)}</span>
                ${nextHtml}
                <span class="wl"><span class="num">${e.wins}</span> 勝 <span class="num">${e.losses}</span> 敗</span>
                <span class="likes">讚 <span class="num">${e.likes}</span></span>
            </div>`;
    }).join("");
}

watchSettings(s => {
    settings = s;
    showHidden(s.d3_hidden);
    render();
});
watchCollection("records_d3", list => { records = list; render(); });
