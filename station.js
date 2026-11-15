// 關主頁：station.html?game=d2&station=3
// 流程：選隊伍按「開始闖關」→ 這一關自動變闖關中 → 選結果送出 → 自動變回空關
import { watchCamp, GAME, createRecord, updateRecord, deleteRecord, restoreRecord, startStation, clearStation, setStationRound } from "./store.js";
import { GAME_IDS, GAME_LABELS, GAME_TYPES, gameConfig, scheduledTeams, validateRecord, recordPoints, resultText } from "./games.js";
import { teamList } from "./scoring.js";
import { $, esc, teamOptions, toast, toastCommit, failText, connectionBadge, overlay, openModal, closeModal, stationFromUrl } from "./ui.js";
import { requireStaff, logoutStaff } from "./auth.js";
import { recordFormHtml, readRecordForm } from "./record-form.js";

const params = new URLSearchParams(location.search);
const game = GAME_IDS.includes(params.get("game")) ? params.get("game") : "d2";
const station = stationFromUrl();

// 先登入：名字要在總控台的名單裡
const session = await requireStaff(game, station);
const me = session.name;
$("logoutBtn").addEventListener("click", () => { if (confirm("確定要登出？")) logoutStaff(); });

let settings = null, g = null, cfg = null, records = [];
let active = null, round = 1;
let result = null, likes = {};          // 闖關中正在輸入的結果
let pickedFor = null;                   // 隊伍選單是依哪一輪帶入的，避免每次更新都蓋掉關主自己選的

const setOnline = connectionBadge();
const showLock = overlay(`<div class="title">輸入已鎖定</div><div class="sub">等待總控台開放</div>`);
const signed = n => (n > 0 ? `+${n}` : `${n}`);
const timeText = ts => new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });

async function run(promise, okText) {
    try {
        const r = await promise;
        if (okText) toastCommit(r, okText);
        return true;
    } catch (err) {
        console.error(err);
        toast(failText(err), "error");
        return false;
    }
}

// ---------- 畫面 ----------

function render() {
    if (!settings) return;
    $("gameBig").textContent = GAME_LABELS[game];
    $("stationTitle").textContent = cfg.name ? `第 ${station} 關・${cfg.name}` : `第 ${station} 關`;
    $("stationSub").textContent = [GAME_TYPES[cfg.type].label, cfg.place, me].filter(Boolean).join("・");
    showLock(g.locked);

    $("roundCtrl").hidden = g.maxRounds <= 1 || !!active;
    $("roundNum").textContent = round;
    $("idleView").hidden = !!active;
    $("activeView").hidden = !active;
    if (active) renderActive(); else renderIdle();
    renderRecords();
}

function renderIdle() {
    const key = `${round}`;
    if (pickedFor === key && $("teamPickers").querySelectorAll("select").length === cfg.teamsPerMatch) return;
    pickedFor = key;
    const all = teamList(settings.numTeams);
    const planned = scheduledTeams(settings, game, round, station);
    const many = cfg.teamsPerMatch > 1;
    $("pickLabel").textContent = many ? "哪幾隊來了？" : "哪一隊來了？";
    $("teamPickers").innerHTML = Array.from({ length: cfg.teamsPerMatch }, (_, i) => `
        <div class="field"><select data-team="${i}" aria-label="隊伍 ${i + 1}">${teamOptions(settings.numTeams, planned?.[i] || all[i % all.length])}</select></div>`).join("")
        + (planned ? `<p class="hint">已依賽程表帶入這一輪的隊伍，不對的話可以自己改。</p>` : "");
}

function renderActive() {
    const teams = active.teams || [];
    $("activeTeams").textContent = teams.join(cfg.type === "versus" ? " vs " : "、");

    if (cfg.type === "versus" && teams.length === 2) {
        // 兩隊對抗：三個大按鈕
        const picked = result?.ranks ? (result.ranks[0] === result.ranks[1] ? "tie" : result.ranks[0] === 1 ? "a" : "b") : null;
        const btn = (key, text) => `<button data-win="${key}" class="${picked === key ? "picked" : ""}">${esc(text)}</button>`;
        $("resultInput").innerHTML = `<div class="choice-grid three">${btn("a", `${teams[0]} 勝`)}${btn("tie", "平手")}${btn("b", `${teams[1]} 勝`)}</div>`;
    } else if (cfg.type === "versus") {
        // 三、四隊對抗：每隊選名次
        const ranks = result?.ranks || teams.map((_, i) => i + 1);
        result = { ranks };
        $("resultInput").innerHTML = teams.map((t, i) => `
            <div class="rank-row"><b>${esc(t)}</b><select data-rank="${i}">${teams.map((_, r) =>
                `<option value="${r + 1}"${ranks[i] === r + 1 ? " selected" : ""}>第 ${r + 1} 名</option>`).join("")}</select></div>`).join("")
            + `<p class="hint">平手就把並列的隊伍選成同一個名次。</p>`;
    } else {
        const none = cfg.type === "solo" ? "未過關" : "未達成";
        const picked = result ? (result.level === null ? "none" : String(result.level)) : null;
        $("resultInput").innerHTML = `<div class="choice-grid">${cfg.levels.map((l, i) =>
            `<button data-level="${i}" class="${picked === String(i) ? "picked" : ""}">${esc(l.label)}<small>${signed(l.pts)} 分</small></button>`).join("")}
            <button data-level="none" class="${picked === "none" ? "picked" : ""}">${none}<small>0 分</small></button></div>`;
    }

    $("likesInput").innerHTML = g.maxLikes > 0 ? teams.map((t, i) => `
        <div class="like-row">
            <span>${teams.length > 1 ? `給 ${esc(t)} 的讚` : "給這隊的讚"}</span>
            <div class="stepper">
                <button data-like="${i}" data-step="-1" ${(likes[t] || 0) <= 0 ? "disabled" : ""} aria-label="減少讚">−</button>
                <span class="count"><span class="num">${likes[t] || 0}</span> / ${g.maxLikes}</span>
                <button data-like="${i}" data-step="1" ${(likes[t] || 0) >= g.maxLikes ? "disabled" : ""} aria-label="增加讚">+</button>
            </div>
        </div>`).join("") : "";
}

function renderRecords() {
    const mine = records.filter(r => r.game === game && r.station === station).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    $("records").innerHTML = mine.length ? mine.map(r => {
        const error = validateRecord(r, cfg, settings.numTeams);
        const pts = error ? {} : recordPoints(r, cfg);
        const teams = (r.teams || []).map(t => `${esc(t)}${error ? "" : ` <span class="num">${signed(pts[t])}</span>`}`).join("、");
        const likeText = Object.entries(r.likes || {}).map(([t, n]) => `${r.teams.length > 1 ? `${t} ` : ""}讚 ${n}`).join("、");
        return `
            <li class="${r.deleted ? "deleted" : ""}">
                <div>
                    <div class="main">${teams}</div>
                    <div class="meta">${g.maxRounds > 1 ? `第 ${r.round || 1} 輪・` : ""}${error ? `無效：${esc(error)}` : esc(resultText(r, cfg))}${likeText ? `・${esc(likeText)}` : ""}・${timeText(r.createdAt)}${r.deleted ? "・已刪除" : ""}</div>
                </div>
                <span class="actions">${r.deleted
                    ? `<button class="btn btn-ghost" data-restore="${esc(r.id)}">復原</button>`
                    : `<button class="btn btn-ghost" data-edit="${esc(r.id)}">改</button><button class="btn btn-ghost danger" data-del="${esc(r.id)}">刪</button>`}</span>
            </li>`;
    }).join("") : `<li class="empty">還沒有紀錄</li>`;
}

// ---------- 操作 ----------

$("prevRound").addEventListener("click", () => changeRound(round - 1));
$("nextRound").addEventListener("click", () => changeRound(round + 1));
function changeRound(next) {
    if (next < 1 || next > g.maxRounds) return;
    run(setStationRound(game, station, next));
}

$("startBtn").addEventListener("click", async () => {
    const teams = [...document.querySelectorAll("#teamPickers [data-team]")].map(el => el.value);
    if (new Set(teams).size !== teams.length) return toast("隊伍不能重複", "warn");
    result = null;
    likes = {};
    $("startBtn").disabled = true;
    await run(startStation(game, station, teams, me));
    $("startBtn").disabled = false;
});

$("cancelBtn").addEventListener("click", () => {
    if (confirm("取消這一次闖關，改回空關？")) run(clearStation(game, station));
});

$("resultInput").addEventListener("click", e => {
    const d = e.target.closest("button")?.dataset;
    if (!d) return;
    if (d.win) result = { ranks: d.win === "tie" ? [1, 1] : d.win === "a" ? [1, 2] : [2, 1] };
    if (d.level) result = { level: d.level === "none" ? null : Number(d.level) };
    renderActive();
});
$("resultInput").addEventListener("change", e => {
    if (e.target.dataset.rank === undefined) return;
    result = { ranks: [...document.querySelectorAll("#resultInput [data-rank]")].map(el => Number(el.value)) };
});

$("likesInput").addEventListener("click", e => {
    const d = e.target.closest("button")?.dataset;
    if (!d?.step) return;
    const team = active.teams[d.like];
    likes[team] = Math.min(Math.max((likes[team] || 0) + Number(d.step), 0), g.maxLikes);
    renderActive();
});

$("submitBtn").addEventListener("click", async () => {
    if (!result) return toast("請先選擇結果", "warn");
    const cleanLikes = Object.fromEntries(Object.entries(likes).filter(([, n]) => n > 0));
    const data = { game, station, round, teams: active.teams, result, likes: cleanLikes, by: me, createdAt: Date.now() };
    const error = validateRecord(data, cfg, settings.numTeams);
    if (error) return toast(error, "warn");

    const pts = recordPoints(data, cfg);
    const lines = data.teams.map(t => `${t}　${signed(pts[t])} 分${cleanLikes[t] ? `　讚 ${cleanLikes[t]}` : ""}`);
    const dup = g.maxRounds > 1 && records.some(r => !r.deleted && r.game === game && r.station === station && (r.round || 1) === round);
    if (!confirm(`${dup ? "注意：這一輪已經有紀錄了！\n\n" : ""}確認送出？\n${resultText(data, cfg)}\n${lines.join("\n")}`)) return;

    $("submitBtn").disabled = true;
    if (await run(createRecord(GAME, data, me), "成績已送出")) {
        await run(clearStation(game, station));
        // 有分輪次的話，送出後自動跳到下一輪
        if (g.maxRounds > 1 && round < g.maxRounds) await run(setStationRound(game, station, round + 1));
    }
    $("submitBtn").disabled = false;
});

// ---------- 本關紀錄：修改、刪除、復原 ----------

let editing = null;
$("records").addEventListener("click", e => {
    const d = e.target.closest("button")?.dataset;
    if (!d) return;
    const find = id => records.find(r => r.id === id);
    if (d.del && confirm("確定刪除這筆成績？刪除後還可以按「復原」。")) run(deleteRecord(GAME, find(d.del), me), "已刪除");
    if (d.restore) run(restoreRecord(GAME, find(d.restore), me), "已復原");
    if (d.edit) {
        editing = find(d.edit);
        $("record_roundField").hidden = g.maxRounds <= 1;
        $("record_round").value = editing.round || 1;
        $("record_fields").innerHTML = recordFormHtml(cfg, g, settings.numTeams, editing);
        $("record_error").textContent = "";
        openModal("modal_record");
    }
});

$("record_save").addEventListener("click", async () => {
    const data = { round: Math.max(1, parseInt($("record_round").value, 10) || 1), ...readRecordForm($("record_fields"), cfg, g) };
    const error = validateRecord(data, cfg, settings.numTeams);
    if (error) { $("record_error").textContent = error; return; }
    if (await run(updateRecord(GAME, editing, data, me), "已修改")) closeModal("modal_record");
});

// ---------- 資料 ----------

watchCamp({
    settings(s, online, practice) {
        settings = s;
        g = gameConfig(s, game);
        cfg = g.stations[station] || g.stations[1];
        setOnline(online);
        $("practiceBar").hidden = !practice;
        pickedFor = null;
        render();
    },
    games(list) { records = list; if (settings) renderRecords(); },
    state(st) {
        const next = st.active[game]?.[station] || null;
        if (!next || !active) { result = null; likes = {}; }   // 換了一組隊伍：清掉上一次還沒送出的輸入
        active = next;
        round = Math.min(st.rounds[game]?.[station] || 1, g ? g.maxRounds : 1);
        if (settings) render();
    }
});
