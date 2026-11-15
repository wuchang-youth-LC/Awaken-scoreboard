// 場內加分頁（計分組、牧者共用）
// 操作：選隊伍 → 按常用分數就直接送出；按錯可以在下面馬上復原
import { watchCamp, BONUS, createRecord, deleteRecord, restoreRecord } from "./store.js";
import { computeCampTotals, GAME_COLUMNS } from "./games.js";
import { campColumns, teamList, teamNum } from "./scoring.js";
import { $, esc, toast, failText, connectionBadge } from "./ui.js";
import { requireStaff, logoutStaff } from "./auth.js";

const DEFAULT_QUICK = [10, 20, 30, 50, 100, -10];
const LAST_EVENT_KEY = "awaken_bonus_last_event";

let settings = null, games = [], bonus = [];
let team = null;

// 先登入：名字要在總控台的加分人員名單裡
const session = await requireStaff("npc", 0);
const me = session.name;
$("whoami").textContent = me;
$("main").hidden = false;
$("logoutBtn").addEventListener("click", () => { if (confirm("確定要登出？")) logoutStaff(); });

const setOnline = connectionBadge();
const signed = n => (n > 0 ? `+${n}` : `${n}`);
const timeText = ts => new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });

const lastEvents = (() => { try { return JSON.parse(localStorage.getItem(LAST_EVENT_KEY)) || {}; } catch { return {}; } })();
function rememberEvent(day, event) {
    lastEvents[day] = event;
    try { localStorage.setItem(LAST_EVENT_KEY, JSON.stringify(lastEvents)); } catch { /* 無痕模式 */ }
}

// ---------- 項目 ----------

// 大地遊戲的分數由關主頁自動計算，不給手動選
const gameCols = Object.values(GAME_COLUMNS);
const eventsOf = day => (campColumns(settings).find(d => d.day === day)?.cols || []).filter(c => !gameCols.includes(c));

function renderDays() {
    const days = campColumns(settings).map(d => d.day);
    const now = new Date();
    const today = `${now.getMonth() + 1}/${now.getDate()}`;
    const current = days.includes($("daySelect").value) ? $("daySelect").value : (days.includes(today) ? today : days[0]);
    $("daySelect").innerHTML = days.map(d => `<option value="${esc(d)}"${d === current ? " selected" : ""}>${esc(d)}${d === today ? "（今天）" : ""}</option>`).join("");
    renderEvents();
}

function renderEvents() {
    const day = $("daySelect").value, events = eventsOf(day);
    const current = events.includes($("eventSelect").value) ? $("eventSelect").value : (events.includes(lastEvents[day]) ? lastEvents[day] : events[0]);
    $("eventSelect").innerHTML = events.map(e => `<option value="${esc(e)}"${e === current ? " selected" : ""}>${esc(e)}</option>`).join("");
}
$("daySelect").addEventListener("change", renderEvents);
$("eventSelect").addEventListener("change", () => rememberEvent($("daySelect").value, $("eventSelect").value));

// ---------- 隊伍與分數 ----------

function renderTeams() {
    // 即時總分：大地遊戲的分數不用等公布就算進去
    const totals = Object.fromEntries(computeCampTotals(settings, games, bonus, { live: true }).rows.map(r => [r.team, r.total]));
    $("teamGrid").innerHTML = teamList(settings.numTeams).map(t => `
        <button data-team="${esc(t)}" class="${t === team ? "picked" : ""}">
            <span class="num">${teamNum(t)}</span><small>${totals[t]}</small>
        </button>`).join("");
}

function renderQuick() {
    const quick = Array.isArray(settings.bonusQuick) && settings.bonusQuick.length ? settings.bonusQuick : DEFAULT_QUICK;
    $("quickGrid").innerHTML = quick.map(n => `<button data-val="${n}" class="${n < 0 ? "minus" : ""}" ${team ? "" : "disabled"}>${signed(n)}</button>`).join("");
    $("pointsLabel").textContent = team ? `給 ${team} 的分數（按了就送出）` : "分數（先選隊伍）";
    $("submitBtn").disabled = !team;
}

$("teamGrid").addEventListener("click", e => {
    const t = e.target.closest("button")?.dataset.team;
    if (!t) return;
    team = t === team ? null : t;
    renderTeams();
    renderQuick();
});

async function send(val) {
    const day = $("daySelect").value, event = $("eventSelect").value;
    if (!team) return toast("請先選隊伍", "warn");
    if (!event) return toast("請選擇項目", "warn");
    if (!Number.isInteger(val) || val === 0) return toast("請輸入分數", "warn");
    rememberEvent(day, event);
    const target = team;
    try {
        const result = await createRecord(BONUS, { team: target, reason: `${day}_${event}`, val, npc: me, timestamp: Date.now() }, me);
        toast(`${target} ${signed(val)}（${event}）${result === "queued" ? "・網路不穩，連線後自動上傳" : ""}`, result === "queued" ? "warn" : "ok");
        // 送出後取消選取，避免下一筆不小心加到同一隊
        team = null;
        $("scoreInput").value = "";
        renderTeams();
        renderQuick();
    } catch (err) {
        console.error(err);
        toast(failText(err), "error");
    }
}

$("quickGrid").addEventListener("click", e => {
    const v = e.target.closest("button")?.dataset.val;
    if (v !== undefined) send(Number(v));
});
$("submitBtn").addEventListener("click", () => send(parseInt($("scoreInput").value, 10)));

// ---------- 我剛剛送出的 ----------

function renderHistory() {
    const mine = bonus.filter(r => r.npc === me).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 15);
    $("history").innerHTML = mine.length ? mine.map(r => `
        <li class="${r.deleted ? "deleted" : ""}">
            <div>
                <div class="main">${esc(r.team)}　<span class="num">${signed(Number(r.val) || 0)}</span></div>
                <div class="meta">${esc(String(r.reason || "").replace("_", " "))}・${timeText(r.timestamp)}${r.deleted ? "・已刪除" : ""}</div>
            </div>
            ${r.deleted
                ? `<button class="btn btn-ghost" data-restore="${esc(r.id)}">復原</button>`
                : `<button class="btn btn-ghost danger" data-del="${esc(r.id)}">刪除</button>`}
        </li>`).join("") : `<li class="empty">還沒有紀錄</li>`;
}

$("history").addEventListener("click", async e => {
    const d = e.target.closest("button")?.dataset;
    if (!d) return;
    const find = id => bonus.find(r => r.id === id);
    try {
        if (d.del) await deleteRecord(BONUS, find(d.del), me);
        if (d.restore) await restoreRecord(BONUS, find(d.restore), me);
    } catch (err) {
        console.error(err);
        toast(failText(err), "error");
    }
});

// ---------- 資料 ----------

function renderAll() {
    if (!settings) return;
    renderTeams();
    renderQuick();
    renderHistory();
}

watchCamp({
    settings(s, online, practice) {
        settings = s;
        setOnline(online);
        $("practiceBar").hidden = !practice;
        renderDays();
        renderAll();
    },
    games(list) { games = list; renderAll(); },
    bonus(list) { bonus = list; renderAll(); }
});
