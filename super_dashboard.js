// 總控台：總積分、D2 / D3 大地遊戲、加分紀錄、工作人員名單、設定
import { watchCollection, commit, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, settingsRef, db } from "./firebase.js";
import {
    watchCamp, GAME, BONUS, createRecord, updateRecord, deleteRecord, restoreRecord,
    ensureStateDocs, fetchAudit, clearPracticeData, clearGame, clearBonus, clearStation
} from "./store.js";
import {
    GAME_IDS, GAME_LABELS, GAME_TYPES, AUDIT_LABELS, gameConfig, normalizeStation, stationLabel, scheduledTeams,
    validateRecord, recordPoints, resultText, computeCampTotals,
    parseLevels, formatLevels, parseNumberList, parseScheduleTeams, studentConfig
} from "./games.js";
import { campColumns, resolveBonusKey, teamList, UNCATEGORIZED } from "./scoring.js";
import { CAMP } from "./config.js";
import { $, esc, teamOptions, toast, toastCommit, connectionBadge, openModal, closeModal } from "./ui.js";
import { requireAdmin, logoutAdmin } from "./auth.js";
import { parseNames, rosterKey, sessionLabel } from "./roster.js";
import { recordFormHtml, readRecordForm } from "./record-form.js";

const ADMIN_NAME = "總控台";   // 寫在公開資料上的記錄者名稱（不放 email）
let settings = null, games = [], bonus = [], state = { active: {}, rounds: {} };
let lastTotals = null;
const view = { d2: { station: null, showDeleted: false }, d3: { station: null, showDeleted: false } };
const setOnline = connectionBadge();

const fmtTime = ts => ts ? new Date(ts).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
const fullTime = ts => ts ? new Date(ts).toLocaleString("zh-TW") : "";
const int = (el, fallback) => {
    const n = parseInt((typeof el === "string" ? $(el) : el).value, 10);
    return Number.isNaN(n) ? fallback : n;
};
const signed = n => (n > 0 ? `+${n}` : `${n}`);

async function run(promise, okText) {
    try {
        const result = await promise;
        if (okText) toastCommit(result, okText);
        return true;
    } catch (err) {
        console.error(err);
        toast(err.code === "permission-denied" ? "沒有權限，請確認這個帳號是管理員" : "操作失敗，請檢查網路後再試", "error");
        return false;
    }
}

// ---------- 登入與初始化 ----------

const admin = await requireAdmin();
$("adminWho").textContent = admin.email;
$("adminLogout").addEventListener("click", () => logoutAdmin());
const auditBy = admin.email;   // 修改紀錄只有管理員看得到，可以放 email 分辨是誰

// 新專案第一次使用：建立設定文件與狀態文件（關主更新自己那一關時，文件必須已經存在）
try {
    const first = await getDoc(settingsRef);
    if (!first.exists()) await setDoc(settingsRef, { createdAt: Date.now() }, { merge: true });
    await ensureStateDocs();
} catch (err) {
    console.error(err);
    toast("這個帳號沒有管理員權限，請確認安全規則裡有這個帳號的 UID", "error");
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".tab-panel").forEach(p => { p.hidden = p.id !== tab.dataset.tab; });
}));

watchCamp({
    settings(s, online, practice) {
        settings = s;
        setOnline(online);
        $("practiceBar").hidden = !practice;
        $("practiceOnBtn").hidden = practice;
        renderAll();
        renderRoster();
        renderSetup();
    },
    games(list) { games = list; renderAll(); },
    bonus(list) { bonus = list; renderAll(); },
    state(st) { state = st; GAME_IDS.forEach(renderGame); }
});

function renderAll() {
    if (!settings) return;
    renderTotals();
    GAME_IDS.forEach(renderGame);
    renderBonus();
}

// ---------- 總積分 ----------

function renderTotals() {
    const live = $("liveToggle").checked;
    const t = computeCampTotals(settings, games, bonus, { live });
    lastTotals = t;
    const hasUncat = t.uncategorizedRecords.length > 0;
    const gameKeys = Object.values(t.gameKeys);

    $("tableHead").innerHTML = `
        <tr>
            <th rowspan="2" class="sticky-1">隊伍</th>
            <th rowspan="2" class="sticky-2">總分</th>
            ${t.columns.map(d => `<th colspan="${d.cols.length || 1}" class="day-start">${esc(d.day)}</th>`).join("")}
            ${hasUncat ? `<th rowspan="2" class="day-start uncat">${UNCATEGORIZED}</th>` : ""}
        </tr>
        <tr>${t.columns.map(d => d.cols.length
            ? d.cols.map((c, i) => `<th class="${i === 0 ? "day-start" : ""}">${esc(c)}</th>`).join("")
            : `<th class="day-start"></th>`).join("")}</tr>`;

    $("tableBody").innerHTML = t.rows.map(row => `
        <tr>
            <td class="sticky-1">${esc(row.team)}</td>
            <td class="sticky-2 num">${row.total}</td>
            ${t.columns.map(d => d.keys.length
                ? d.keys.map((k, i) => {
                    const pending = row.pending[k];
                    const cls = [i === 0 ? "day-start" : "", gameKeys.includes(k) ? "game" : "", pending !== undefined ? "pending" : ""].join(" ").trim();
                    const text = pending !== undefined ? (pending ? `(${pending})` : "") : (row.cells[k] || "");
                    return `<td class="${cls}">${text}</td>`;
                }).join("")
                : `<td class="day-start"></td>`).join("")}
            ${hasUncat ? `<td class="day-start uncat">${row.uncategorized || ""}</td>` : ""}
        </tr>`).join("");

    const unpublished = GAME_IDS.filter(g => t.gameKeys[g] && !gameConfig(settings, g).published && games.some(r => r.game === g && !r.deleted));
    $("publishNotice").hidden = !unpublished.length || live;
    $("publishNotice").textContent = unpublished.length
        ? `${unpublished.map(g => GAME_LABELS[g]).join("、")} 的大地分數還沒公布，括號裡的數字目前沒有算進總分。確認無誤後，到該場的分頁按「公布分數」。`
        : "";
    $("uncatNotice").hidden = !hasUncat;
    $("uncatNotice").textContent = hasUncat
        ? `有 ${t.uncategorizedRecords.length} 筆加分對不上大表欄位，暫時放在「${UNCATEGORIZED}」（仍有算進總分）。到「加分紀錄」分頁按「改」選一個項目就能歸位。`
        : "";
}
$("liveToggle").addEventListener("change", renderTotals);

// ---------- D2 / D3 大地遊戲 ----------

function renderGame(game) {
    if (!settings) return;
    const panel = $(`${game}-panel`);
    const g = gameConfig(settings, game);
    const v = view[game];
    const mine = games.filter(r => r.game === game);
    const active = state.active[game] || {};
    const rounds = state.rounds[game] || {};

    const tiles = Object.keys(g.stations).map(Number).map(st => {
        const cfg = g.stations[st];
        const busy = active[st];
        const count = mine.filter(r => r.station === st && !r.deleted).length;
        const round = rounds[st] || 1;
        const next = scheduledTeams(settings, game, round, st);
        return `
            <button class="st-tile ${busy ? "busy" : ""} ${v.station === st ? "picked" : ""}" data-pick="${st}">
                <span class="st-no">${String(st).padStart(2, "0")}</span>
                <span class="st-info">
                    <b>${esc(cfg.name || GAME_TYPES[cfg.type].label)}</b>
                    <small>${busy ? `闖關中：${esc((busy.teams || []).join("、"))}` : "空關"}${g.maxRounds > 1 ? `・第 ${round} 輪${next ? `（${esc(next.join(" vs "))}）` : ""}` : ""}</small>
                </span>
                <span class="st-count num">${count}</span>
            </button>`;
    }).join("");

    const shown = mine
        .filter(r => (v.showDeleted || !r.deleted) && (v.station === null || r.station === v.station))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const rows = shown.map(r => {
        const cfg = g.stations[r.station];
        const error = cfg ? validateRecord(r, cfg, settings.numTeams) : "這一關已經不存在";
        const pts = error ? {} : recordPoints(r, cfg);
        const teams = (r.teams || []).map(t => `${esc(t)}${error ? "" : ` <span class="num">${signed(pts[t])}</span>`}`).join("、");
        const likes = Object.entries(r.likes || {}).map(([t, n]) => `${esc(t)} ${n}`).join("、");
        return `
            <tr class="${r.deleted ? "deleted" : ""}">
                <td>${r.station}</td>
                ${g.maxRounds > 1 ? `<td>${r.round || 1}</td>` : ""}
                <td class="wrap">${teams}</td>
                <td class="wrap">${error ? `<span class="warn">無效：${esc(error)}</span>` : esc(resultText(r, cfg))}</td>
                <td class="wrap">${likes}</td>
                <td>${esc(r.by || "")}</td>
                <td>${fmtTime(r.createdAt)}${r.editedAt ? "（已修改）" : ""}</td>
                <td class="actions">${r.deleted
                    ? `<button class="btn btn-ghost" data-restore="${esc(r.id)}">復原</button>`
                    : `<button class="btn btn-ghost" data-edit="${esc(r.id)}">改</button><button class="btn btn-ghost danger" data-del="${esc(r.id)}">刪</button>`}</td>
            </tr>`;
    }).join("");

    const busyHere = v.station !== null && active[v.station];
    panel.innerHTML = `
        <div class="toolbar">
            <button class="btn btn-outline" data-act="settings">關卡設定</button>
            <button class="btn btn-outline" data-act="schedule">賽程表</button>
            <button class="btn btn-outline" data-act="add">新增紀錄</button>
            <button class="btn btn-outline" data-act="export">匯出</button>
            <span class="spacer"></span>
            <span class="state">關主輸入：<b>${g.locked ? "已鎖定" : "開放中"}</b>　分數：<b>${g.published ? "已公布" : "未公布"}</b></span>
            <button class="btn btn-outline" data-act="lock">${g.locked ? "開放輸入" : "鎖定輸入"}</button>
            <button class="btn ${g.published ? "btn-outline" : "btn-primary"}" data-act="publish">${g.published ? "取消公布" : "公布分數"}</button>
            <button class="btn btn-danger" data-act="clear">清空</button>
        </div>
        <div class="st-tiles">${tiles}</div>
        <div class="toolbar">
            <b>${v.station === null ? "全部關卡的紀錄" : esc(stationLabel(v.station, g.stations[v.station]))}</b>
            ${v.station !== null ? `<button class="btn btn-ghost" data-pick="all">看全部</button>` : ""}
            ${busyHere ? `<button class="btn btn-ghost" data-act="free">把這一關改回空關</button>` : ""}
            <span class="spacer"></span>
            <label class="check"><input type="checkbox" data-act="showDeleted" ${v.showDeleted ? "checked" : ""}> 顯示已刪除</label>
        </div>
        <div class="table-wrap">
            <table class="rec-table">
                <thead><tr><th>關</th>${g.maxRounds > 1 ? "<th>輪</th>" : ""}<th>隊伍與得分</th><th>結果</th><th>讚</th><th>記錄者</th><th>時間</th><th></th></tr></thead>
                <tbody>${rows || `<tr><td colspan="8" class="empty">還沒有紀錄</td></tr>`}</tbody>
            </table>
        </div>`;
}

for (const game of GAME_IDS) {
    const panel = $(`${game}-panel`);
    const find = id => games.find(r => r.id === id);

    panel.addEventListener("change", e => {
        if (e.target.dataset.act === "showDeleted") { view[game].showDeleted = e.target.checked; renderGame(game); }
    });

    panel.addEventListener("click", async e => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const d = btn.dataset, g = gameConfig(settings, game), label = GAME_LABELS[game];

        if (d.pick) { view[game].station = d.pick === "all" ? null : Number(d.pick); return renderGame(game); }
        if (d.edit) return openRecord(game, find(d.edit));
        if (d.del && confirm("確定刪除這筆紀錄？之後可以在「顯示已刪除」裡復原。")) return run(deleteRecord(GAME, find(d.del), auditBy), "已刪除");
        if (d.restore) return run(restoreRecord(GAME, find(d.restore), auditBy), "已復原");

        switch (d.act) {
            case "settings": return openGameSettings(game);
            case "schedule": return openSchedule(game);
            case "add": return openRecord(game, null);
            case "export": return exportGame(game);
            case "free": return run(clearStation(game, view[game].station), "已改回空關");
            case "lock": return run(commit(updateDoc(settingsRef, { [`games.${game}.locked`]: !g.locked })));
            case "publish":
                if (!g.published && !confirm(`確定公布 ${label} 的大地分數？公布後會算進各隊的正式總分。`)) return;
                return run(commit(updateDoc(settingsRef, { [`games.${game}.published`]: !g.published })), g.published ? "已取消公布" : "已公布");
            case "clear":
                if (prompt(`這會永久刪除 ${label} 的全部紀錄（包含已刪除的），無法復原。\n請輸入「確認」繼續`) !== "確認") return;
                return run(clearGame(game).then(n => { toast(`已清空 ${n} 筆`); }));
        }
    });
}

// ---------- 大地遊戲設定 ----------

let editingGame = null;

function stationRowHtml(st, cfg) {
    const versus = cfg.type === "versus";
    const points = versus ? cfg.rankPts.join(", ") : formatLevels(cfg.levels);
    return `
        <div class="cfg-row" data-st="${st}">
            <b class="num">${st}</b>
            <input data-f="name" placeholder="關卡名稱" value="${esc(cfg.name)}">
            <input data-f="place" placeholder="位置" value="${esc(cfg.place)}">
            <select data-f="type">${Object.entries(GAME_TYPES).map(([k, t]) => `<option value="${k}"${k === cfg.type ? " selected" : ""}>${t.label}</option>`).join("")}</select>
            <input type="number" data-f="teams" title="每場幾隊" min="${GAME_TYPES[cfg.type].minTeams}" max="${GAME_TYPES[cfg.type].maxTeams}" value="${cfg.teamsPerMatch}" ${cfg.type === "solo" ? "disabled" : ""}>
            <input data-f="points" placeholder="${versus ? "100, 50" : "過關=100"}" value="${esc(points)}">
            <input type="number" data-f="tie" placeholder="平手" title="全部平手時每隊幾分（可不填）" value="${versus && cfg.tiePts !== null ? cfg.tiePts : ""}" ${versus ? "" : "disabled"}>
        </div>`;
}

function readStationRow(row) {
    const f = name => row.querySelector(`[data-f="${name}"]`);
    const type = f("type").value;
    const raw = { name: f("name").value, place: f("place").value, type, teamsPerMatch: int(f("teams"), undefined) };
    if (type === "versus") {
        raw.rankPts = parseNumberList(f("points").value);
        raw.tiePts = f("tie").value === "" ? null : int(f("tie"), null);
    } else {
        raw.levels = parseLevels(f("points").value);
    }
    return normalizeStation(raw);
}

function renderStationRows(n, source) {
    const rows = [];
    for (let st = 1; st <= n; st++) rows.push(stationRowHtml(st, source[st] || normalizeStation()));
    $("game_station_rows").innerHTML = `
        <div class="cfg-row cfg-head"><span></span><span>名稱</span><span>位置</span><span>類型</span><span>隊數</span><span>分數</span><span>平手</span></div>
        ${rows.join("")}`;
}

const currentRows = () => Object.fromEntries([...document.querySelectorAll("#game_station_rows [data-st]")].map(row => [row.dataset.st, readStationRow(row)]));

function openGameSettings(game) {
    editingGame = game;
    const g = gameConfig(settings, game);
    $("game_title").textContent = `${GAME_LABELS[game]} 大地遊戲設定`;
    $("game_stations").value = g.numStations;
    $("game_rounds").value = g.maxRounds;
    $("game_maxLikes").value = g.maxLikes;
    $("game_likePts").value = g.likePts;
    renderStationRows(g.numStations, g.stations);
    openModal("modal_game");
}

$("game_stations").addEventListener("input", () => {
    const n = int("game_stations", 0);
    if (n >= 1 && n <= 40) renderStationRows(n, currentRows());
});

// 換類型時，隊數和分數欄位換成那個類型的預設值
$("game_station_rows").addEventListener("change", e => {
    if (e.target.dataset.f !== "type") return;
    const row = e.target.closest("[data-st]");
    const f = name => row.querySelector(`[data-f="${name}"]`);
    row.outerHTML = stationRowHtml(row.dataset.st, normalizeStation({ name: f("name").value, place: f("place").value, type: e.target.value }));
});

$("game_copyFirst").addEventListener("click", () => {
    const rows = currentRows();
    const first = rows[1];
    if (!first) return;
    for (const st of Object.keys(rows)) rows[st] = { ...first, name: rows[st].name, place: rows[st].place };
    renderStationRows(Object.keys(rows).length, rows);
});

$("game_save").addEventListener("click", async () => {
    const game = editingGame, old = gameConfig(settings, game);
    const stations = currentRows();
    const data = {
        numStations: Object.keys(stations).length,
        maxRounds: Math.max(1, int("game_rounds", old.maxRounds)),
        maxLikes: Math.max(0, int("game_maxLikes", old.maxLikes)),
        likePts: int("game_likePts", old.likePts),
        published: old.published,
        locked: old.locked,
        stations
    };
    if (await run(commit(updateDoc(settingsRef, { [`games.${game}`]: data })), "設定已儲存")) closeModal("modal_game");
});

// ---------- 賽程表 ----------

function openSchedule(game) {
    editingGame = game;
    const rounds = Object.keys(settings.schedule?.[game] || {}).length;
    $("schedule_title").textContent = `${GAME_LABELS[game]} 賽程表`;
    $("schedule_current").textContent = rounds ? `目前已匯入 ${rounds} 輪的賽程。重新匯入會整份覆蓋。` : "目前還沒有賽程表（沒有賽程表也可以玩，關主自己選隊伍）。";
    $("schedule_input").value = "";
    openModal("modal_schedule");
}

$("schedule_save").addEventListener("click", async () => {
    const schedule = parseScheduleTeams($("schedule_input").value);
    const rounds = Object.keys(schedule);
    // 格式錯誤時不要覆蓋掉原本的賽程表
    if (!rounds.length) return toast("看不懂這份賽程表，請確認每輪開頭有「第1輪」並用 Tab 分隔", "error");
    const matches = rounds.reduce((n, r) => n + Object.keys(schedule[r]).length, 0);
    if (!confirm(`解析出 ${rounds.length} 輪、共 ${matches} 場，確定覆蓋目前的賽程表？`)) return;
    if (await run(commit(updateDoc(settingsRef, { [`schedule.${editingGame}`]: schedule })), "賽程表已匯入")) closeModal("modal_schedule");
});

// ---------- 大地紀錄新增 / 編輯 ----------

let editingRecord = null;

function renderRecordFields() {
    const g = gameConfig(settings, editingGame);
    const st = Number($("record_station").value);
    const rec = editingRecord && editingRecord.station === st ? editingRecord : {};
    $("record_fields").innerHTML = recordFormHtml(g.stations[st], g, settings.numTeams, rec);
    $("record_error").textContent = "";
}

function openRecord(game, rec) {
    editingGame = game;
    editingRecord = rec;
    const g = gameConfig(settings, game);
    const st = rec ? rec.station : (view[game].station || 1);
    $("record_title").textContent = `${GAME_LABELS[game]}：${rec ? "編輯紀錄" : "新增紀錄"}`;
    $("record_station").innerHTML = Object.keys(g.stations).map(Number)
        .map(n => `<option value="${n}"${n === st ? " selected" : ""}>${esc(stationLabel(n, g.stations[n]))}</option>`).join("");
    $("record_roundField").hidden = g.maxRounds <= 1;
    $("record_round").value = rec?.round || 1;
    renderRecordFields();
    openModal("modal_record");
}
$("record_station").addEventListener("change", renderRecordFields);

$("record_save").addEventListener("click", async () => {
    const game = editingGame, g = gameConfig(settings, game);
    const station = Number($("record_station").value), cfg = g.stations[station];
    const data = { station, round: Math.max(1, int("record_round", 1)), ...readRecordForm($("record_fields"), cfg, g) };
    const error = validateRecord(data, cfg, settings.numTeams);
    if (error) { $("record_error").textContent = error; return; }
    const job = editingRecord
        ? updateRecord(GAME, editingRecord, data, auditBy)
        : createRecord(GAME, { game, ...data, by: ADMIN_NAME, createdAt: Date.now() }, auditBy);
    if (await run(job, "已儲存")) closeModal("modal_record");
});

// ---------- 加分紀錄 ----------

function reasonOptions(selected) {
    return campColumns(settings).map(d => `<optgroup label="${esc(d.day)}">${d.cols.map((c, i) =>
        `<option value="${esc(d.keys[i])}"${d.keys[i] === selected ? " selected" : ""}>${esc(c)}</option>`).join("")}</optgroup>`).join("");
}

function renderBonus() {
    const showDeleted = $("bonusShowDeleted").checked;
    const columns = campColumns(settings);
    const rows = bonus.filter(r => showDeleted || !r.deleted).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).map(r => {
        const uncat = resolveBonusKey(r, columns) === UNCATEGORIZED;
        return `
            <tr class="${r.deleted ? "deleted" : ""}">
                <td>${fmtTime(r.timestamp)}${r.editedAt ? "（已修改）" : ""}</td>
                <td>${esc(r.team)}</td>
                <td class="wrap">${esc(String(r.reason || "").replace("_", " "))}${uncat ? ` <span class="warn">對不上欄位</span>` : ""}</td>
                <td class="num">${signed(Number(r.val) || 0)}</td>
                <td>${esc(r.npc || ADMIN_NAME)}</td>
                <td class="actions">${r.deleted
                    ? `<button class="btn btn-ghost" data-restore="${esc(r.id)}">復原</button>`
                    : `<button class="btn btn-ghost" data-edit="${esc(r.id)}">改</button><button class="btn btn-ghost danger" data-del="${esc(r.id)}">刪</button>`}</td>
            </tr>`;
    }).join("");
    $("bonusTable").innerHTML = `
        <thead><tr><th>時間</th><th>隊伍</th><th>項目</th><th>分數</th><th>記錄者</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty">還沒有加分紀錄</td></tr>`}</tbody>`;
}
$("bonusShowDeleted").addEventListener("change", renderBonus);

$("clearBonusBtn").addEventListener("click", () => {
    if (prompt("這會永久刪除全部加分紀錄（包含已刪除的），無法復原。\n請輸入「確認」繼續") !== "確認") return;
    run(clearBonus().then(n => { toast(`已清空 ${n} 筆`); }));
});

let editingBonus = null;
function openBonus(rec) {
    editingBonus = rec;
    $("bonus_title").textContent = rec ? "編輯加分" : "手動加 / 扣分";
    $("bonus_team").innerHTML = teamOptions(settings.numTeams, rec ? rec.team : $("bonus_team").value);
    $("bonus_reason").innerHTML = reasonOptions(rec ? rec.reason : $("bonus_reason").value);
    $("bonus_val").value = rec ? rec.val : "";
    openModal("modal_bonus");
}
document.addEventListener("click", e => { if (e.target.closest("[data-add-bonus]")) openBonus(null); });

$("bonusTable").addEventListener("click", e => {
    const d = e.target.closest("button")?.dataset;
    if (!d) return;
    const find = id => bonus.find(r => r.id === id);
    if (d.edit) openBonus(find(d.edit));
    if (d.del && confirm("確定刪除這筆加分？之後可以在「顯示已刪除」裡復原。")) run(deleteRecord(BONUS, find(d.del), auditBy), "已刪除");
    if (d.restore) run(restoreRecord(BONUS, find(d.restore), auditBy), "已復原");
});

$("bonus_save").addEventListener("click", async () => {
    const team = $("bonus_team").value, reason = $("bonus_reason").value, val = int("bonus_val", NaN);
    if (!reason) return toast("請選擇計分項目", "warn");
    if (Number.isNaN(val) || val === 0) return toast("請輸入分數", "warn");
    const job = editingBonus
        ? updateRecord(BONUS, editingBonus, { team, reason, val }, auditBy)
        : createRecord(BONUS, { team, reason, val, timestamp: Date.now() }, auditBy);
    if (await run(job, `${team} ${signed(val)} 已儲存`)) closeModal("modal_bonus");
});

// ---------- 工作人員名單與登入中的人 ----------

let roster = {}, sessions = [], rosterDirty = false;

const rosterInput = (role, st, cfg) => `
    <div class="roster-row">
        <label for="roster_${role}_${st}">第 ${st} 關${cfg.name ? `<small>${esc(cfg.name)}</small>` : ""}</label>
        <input type="text" id="roster_${role}_${st}" data-roster="${rosterKey(role, st)}" value="${esc((roster[rosterKey(role, st)] || []).join(", "))}" placeholder="關主名字">
    </div>`;

function renderRoster() {
    if (!settings || rosterDirty) return;
    for (const game of GAME_IDS) {
        const g = gameConfig(settings, game);
        $(`roster_${game}`).innerHTML = Object.keys(g.stations).map(Number).map(st => rosterInput(game, st, g.stations[st])).join("");
    }
    $("roster_npc").value = (roster.npc || []).join(", ");
    $("staffUrl").textContent = new URL("staff.html", location.href).href;
}

function renderSessions() {
    const inRoster = s => (roster[rosterKey(s.role, s.station)] || []).includes(s.name);
    const order = { d2: 1, d3: 2, npc: 3 };
    const list = [...sessions].sort((a, b) => order[a.role] - order[b.role] || a.station - b.station || a.createdAt - b.createdAt);
    $("sessionList").innerHTML = list.length ? list.map(s => `
        <li>
            <div>
                <div class="who">${esc(sessionLabel(s))}</div>
                <div class="meta">${fmtTime(s.createdAt)} 登入${inRoster(s) ? "" : "・已不在名單中，無法再送出資料"}</div>
            </div>
            <button class="btn btn-ghost danger" data-kick="${esc(s.id)}">強制登出</button>
        </li>`).join("") : `<li class="empty">目前沒有人登入</li>`;
}

document.addEventListener("input", e => { if (e.target.closest("#staff-panel input")) rosterDirty = true; });

$("saveRosterBtn").addEventListener("click", async () => {
    const batch = writeBatch(db);
    document.querySelectorAll("[data-roster]").forEach(el => batch.set(doc(db, "staff", el.dataset.roster), { names: parseNames(el.value) }));
    batch.set(doc(db, "staff", "npc"), { names: parseNames($("roster_npc").value) });
    if (await run(commit(batch.commit()), "名單已儲存")) { rosterDirty = false; renderRoster(); }
});

$("sessionList").addEventListener("click", e => {
    const id = e.target.closest("[data-kick]")?.dataset.kick;
    if (id && confirm("確定要強制登出？對方需要重新輸入名字才能繼續。")) run(commit(deleteDoc(doc(db, "sessions", id))));
});

const permissionHint = err => {
    console.error(err);
    if (err.code === "permission-denied") toast("讀不到工作人員資料：這個帳號沒有管理員權限", "error");
};
watchCollection("staff", list => {
    roster = Object.fromEntries(list.map(d => [d.id, d.names || []]));
    renderRoster();
    renderSessions();
}, permissionHint);
watchCollection("sessions", list => { sessions = list; renderSessions(); }, permissionHint);

// ---------- 設定 ----------

let setupDirty = false;
function renderSetup() {
    if (!settings || setupDirty) return;
    $("set_teams").value = settings.numTeams;
    $("colsFields").innerHTML = campColumns(settings).map((d, i) => `
        <div class="field"><label class="label">${esc(d.day)}</label><input type="text" id="set_cols_d${i + 1}" value="${esc(d.cols.join(","))}"></div>`).join("");
    $("set_quick").value = (settings.bonusQuick || []).join(", ");
    const view = studentConfig(settings);
    $("student_game").value = view.game;
    $("student_map").checked = view.map;
    $("student_stations").checked = view.stations;
    $("student_scores").checked = view.scores;
    $("studentUrl").textContent = new URL("index.html", location.href).href;
}

$("saveStudentBtn").addEventListener("click", async () => {
    const student = {
        game: $("student_game").value,
        map: $("student_map").checked,
        stations: $("student_stations").checked,
        scores: $("student_scores").checked
    };
    if (await run(commit(updateDoc(settingsRef, { student })), "學員頁設定已儲存")) { setupDirty = false; renderSetup(); }
});
$("setup-panel").addEventListener("input", () => { setupDirty = true; });

$("saveCampBtn").addEventListener("click", async () => {
    const teams = int("set_teams", settings.numTeams);
    if (teams < 2) return toast("隊伍數至少要 2", "warn");
    const fields = { numTeams: teams, bonusQuick: parseNumberList($("set_quick").value).filter(n => Number.isInteger(n) && n !== 0) };
    CAMP.days.forEach((_, i) => { fields[`cols_d${i + 1}`] = $(`set_cols_d${i + 1}`).value.trim(); });
    if (await run(commit(setDoc(settingsRef, fields, { merge: true })), "已儲存")) { setupDirty = false; renderSetup(); }
});

$("practiceOnBtn").addEventListener("click", () => {
    if (confirm("開啟練習模式？\n開啟後所有人輸入的都是練習資料，正式資料不會被動到。")) run(commit(updateDoc(settingsRef, { practiceMode: true })), "已開啟練習模式");
});
$("practiceOffBtn").addEventListener("click", () => {
    if (confirm("結束練習模式，回到正式資料？")) run(commit(updateDoc(settingsRef, { practiceMode: false })), "已回到正式資料");
});
$("clearPracticeBtn").addEventListener("click", () => {
    if (confirm("清空全部練習資料？正式資料不受影響。")) run(clearPracticeData().then(n => { toast(`已清空 ${n} 筆練習資料`); }));
});

// ---------- 匯出 CSV ----------

function downloadCsv(filename, rows) {
    const cell = v => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["﻿" + rows.map(r => r.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" }));
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// 一隊一列，方便用 Excel 分析
function gameRows(game) {
    const g = gameConfig(settings, game);
    return games.filter(r => r.game === game).sort((a, b) => a.station - b.station || (a.createdAt || 0) - (b.createdAt || 0)).flatMap(r => {
        const cfg = g.stations[r.station];
        const error = cfg ? validateRecord(r, cfg, settings.numTeams) : "關卡不存在";
        const pts = error ? {} : recordPoints(r, cfg);
        const status = r.deleted ? "已刪除" : error ? `無效：${error}` : "有效";
        return (r.teams || []).map(t => [
            GAME_LABELS[game], r.station, cfg?.name || "", r.round || 1, t,
            error ? "" : resultText(r, cfg), error ? "" : pts[t], r.likes?.[t] || 0, r.by || "", fullTime(r.createdAt), status
        ]);
    });
}
const GAME_HEAD = ["場次", "關卡", "關卡名稱", "輪次", "隊伍", "結果", "得分", "讚", "記錄者", "時間", "狀態"];
const bonusRows = () => [...bonus].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .map(r => [r.team, r.reason, r.val, r.npc || ADMIN_NAME, fullTime(r.timestamp), r.deleted ? "已刪除" : "有效"]);
const BONUS_HEAD = ["隊伍", "項目", "分數", "記錄者", "時間", "狀態"];

const exportGame = game => downloadCsv(`${GAME_LABELS[game]}_大地紀錄.csv`, [GAME_HEAD, ...gameRows(game)]);
$("exportBonusBtn").addEventListener("click", () => downloadCsv("加分紀錄.csv", [BONUS_HEAD, ...bonusRows()]));

$("exportTableBtn").addEventListener("click", () => {
    const t = lastTotals, hasUncat = t.uncategorizedRecords.length > 0;
    downloadCsv("總積分大表.csv", [
        ["隊伍", "總分", ...t.columns.flatMap(d => d.cols.map(c => `${d.day} ${c}`)), ...(hasUncat ? [UNCATEGORIZED] : [])],
        ...t.rows.map(row => [row.team, row.total, ...t.keys.map(k => row.cells[k]), ...(hasUncat ? [row.uncategorized] : [])])
    ]);
});

$("exportAllBtn").addEventListener("click", () => {
    downloadCsv("全部明細.csv", [
        ["類別", ...GAME_HEAD],
        ...GAME_IDS.flatMap(g => gameRows(g).map(r => ["大地", ...r])),
        [],
        ["類別", ...BONUS_HEAD],
        ...bonusRows().map(r => ["加分", ...r])
    ]);
});

$("exportAuditBtn").addEventListener("click", async () => {
    try {
        const list = (await fetchAudit()).sort((a, b) => a.at - b.at);
        downloadCsv("修改紀錄.csv", [
            ["時間", "動作", "資料", "紀錄編號", "操作者", "修改前", "修改後"],
            ...list.map(a => [fullTime(a.at), AUDIT_LABELS[a.action] || a.action, a.collection === GAME ? "大地紀錄" : "加分", a.recordId, a.by,
                a.before ? JSON.stringify(a.before) : "", a.after ? JSON.stringify(a.after) : ""])
        ]);
    } catch (err) {
        console.error(err);
        toast("讀不到修改紀錄，請確認網路與管理員權限", "error");
    }
});
