// 總控台：D2 / D3 即時監控、參數設定、總積分大表
import {
    watchSettings, watchCollection, patchSettings, deleteRecords, commit,
    collection, doc, addDoc, updateDoc, setDoc, getDoc, deleteDoc, writeBatch, settingsRef, db
} from "./firebase.js";
import {
    rankD2Station, d2StationConfig, formatD2Value, d3Match, parseSchedule,
    campColumns, computeTotals, teamList, d3Loser, UNCATEGORIZED
} from "./scoring.js";
import { CAMP, D2_COLUMN, D3_COLUMN } from "./config.js";
import { $, esc, teamOptions, toast, toastCommit, connectionBadge, openModal, closeModal } from "./ui.js";
import { requireAdmin, logoutAdmin } from "./auth.js";
import { parseNames, rosterKey, sessionLabel } from "./roster.js";

let settings = null, recordsD2 = [], recordsD3 = [], recordsBonus = [];
let lastTotals = null;
const setOnline = connectionBadge();

// 先登入管理員帳號
const admin = await requireAdmin();
$("adminWho").textContent = admin.email;
$("adminLogout").addEventListener("click", () => logoutAdmin());

// 新專案第一次使用：先建立設定文件（關主切換燈號時需要它已經存在）
try {
    const first = await getDoc(settingsRef);
    if (!first.exists()) await setDoc(settingsRef, { createdAt: Date.now() }, { merge: true });
} catch (err) {
    console.error(err);
    toast("這個帳號沒有管理員權限，請確認安全規則裡有這個帳號的 UID", "error");
}

const fmtTime = ts => ts ? new Date(ts).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
const int = (id, fallback) => {
    const n = parseInt($(id).value, 10);
    return Number.isNaN(n) ? fallback : n;
};
const stationOptions = (n, selected) => Array.from({ length: n }, (_, i) => i + 1)
    .map(i => `<option value="${i}"${i === selected ? " selected" : ""}>第 ${i} 關</option>`).join("");

// ---------- 分頁 ----------

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".tab-panel").forEach(p => { p.hidden = p.id !== tab.dataset.tab; });
}));

// ---------- 即時監聽 ----------

watchSettings((s, online) => {
    settings = s;
    setOnline(online);
    renderToolbars();
    renderD2Monitor();
    renderD3Monitor();
    renderTotals();
    renderRoster();
});
watchCollection("records_d2", list => { recordsD2 = list; renderD2Monitor(); renderTotals(); });
watchCollection("records_d3", list => { recordsD3 = list; renderD3Monitor(); renderTotals(); });
watchCollection("records_bonus", list => { recordsBonus = list; renderTotals(); });

function renderToolbars() {
    for (const day of ["d2", "d3"]) {
        const locked = settings[`${day}_locked`], hidden = settings[`${day}_hidden`];
        $(`${day}_state`).innerHTML = `關主輸入：<b>${locked ? "已鎖定" : "開放中"}</b>　展示畫面：<b>${hidden ? "已隱藏" : "顯示中"}</b>`;
        $(`${day}_lockBtn`).textContent = locked ? "開放輸入" : "鎖定輸入";
        $(`${day}_hideBtn`).textContent = hidden ? "恢復展示" : "隱藏展示（結算用）";
    }
}

const statusChip = busy => `<span class="chip ${busy ? "chip-busy" : ""}"><span class="dot ${busy ? "dot-busy" : "dot-free"}"></span>${busy ? "闖關中" : "空關"}</span>`;
const actionBtns = (kind, id) => `<span class="actions"><button class="btn btn-ghost" data-edit-${kind}="${esc(id)}">改</button><button class="btn btn-ghost danger" data-del-${kind}="${esc(id)}">刪</button></span>`;

// ---------- D2 監控 ----------

function renderD2Monitor() {
    if (!settings) return;
    const cards = [];
    for (let st = 1; st <= settings.numStations_d2; st++) {
        const conf = d2StationConfig(settings, st);
        const ranked = rankD2Station(recordsD2, settings, st);
        const all = recordsD2.filter(r => r.station === st && !r.isLikeOnly).sort((a, b) => b.createdAt - a.createdAt);
        const line = e => `<li><span><span class="pip pip-${e.rank}">${e.rank}</span> ${esc(e.team)}</span><span class="num">${esc(formatD2Value(e.val, conf))}</span>${actionBtns("d2", e.record.id)}</li>`;
        const top = ranked.filter(e => e.rank <= 3), rest = ranked.filter(e => e.rank > 3);

        cards.push(`
            <article class="panel monitor-card">
                <div class="head"><span class="st-name">第 ${st} 關</span><span class="hint" style="margin:0">${conf.type === "time" ? "計時" : "計分"}</span>${statusChip(settings.d2_status[st] === "red")}</div>
                <ul class="record-list">${top.map(line).join("") || `<li class="empty">尚無成績</li>`}</ul>
                ${rest.length ? `<details><summary>其他名次（${rest.length}）</summary><ul class="record-list">${rest.map(line).join("")}</ul></details>` : ""}
                ${all.length ? `<details><summary>所有送出紀錄（${all.length}）</summary><ul class="record-list">${all.map(r => `
                    <li><div><div class="main">${esc(r.team)}　<span class="num">${esc(formatD2Value(r.val, conf))}</span></div><div class="meta">讚 ${r.likes || 0}・${fmtTime(r.createdAt)}</div></div>${actionBtns("d2", r.id)}</li>`).join("")}</ul></details>` : ""}
            </article>`);
    }
    $("d2_monitor").innerHTML = cards.join("");
}

// ---------- D3 監控 ----------

function renderD3Monitor() {
    if (!settings) return;
    const cards = [];
    for (let st = 1; st <= settings.numStations_d3; st++) {
        const round = settings.d3_currRounds[st] || 1;
        const m = d3Match(settings, round, st);
        const recs = recordsD3.filter(r => r.station === st).sort((a, b) => b.createdAt - a.createdAt);
        const busy = settings.d3_status[st] === "red";
        cards.push(`
            <article class="panel monitor-card">
                <div class="head"><span class="st-name">第 ${st} 關</span>${statusChip(busy)}</div>
                <div class="current">第 <b>${round}</b> 輪　${m ? `${esc(m.a)} vs ${esc(m.b)}` : "賽程表沒有這一場"}</div>
                <ul class="record-list">${recs.map(r => `
                    <li><div><div class="main">第 ${r.round} 輪　${esc(r.teamA)} vs ${esc(r.teamB)}</div><div class="meta">勝：${esc(r.winner)}・讚 ${r.likesA || 0} : ${r.likesB || 0}</div></div>${actionBtns("d3", r.id)}</li>`).join("") || `<li class="empty">尚無紀錄</li>`}</ul>
            </article>`);
    }
    $("d3_monitor").innerHTML = cards.join("");
}

// 改 / 刪 按鈕（事件委派）
document.addEventListener("click", async e => {
    const t = e.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (d.delD2 && confirm("確定刪除這筆 D2 紀錄？")) await commit(deleteDocById("records_d2", d.delD2));
    if (d.delD3 && confirm("確定刪除這筆 D3 紀錄？")) await commit(deleteDocById("records_d3", d.delD3));
    if (d.editD2) openD2Record(recordsD2.find(r => r.id === d.editD2));
    if (d.editD3) openD3Record(recordsD3.find(r => r.id === d.editD3));
});

function deleteDocById(col, id) {
    return deleteRecords(col, [{ id }]);
}

// ---------- 鎖定、隱藏、清空 ----------

for (const day of ["d2", "d3"]) {
    $(`${day}_lockBtn`).addEventListener("click", () => patchSettings({ [`${day}_locked`]: !settings[`${day}_locked`] }));
    $(`${day}_hideBtn`).addEventListener("click", () => patchSettings({ [`${day}_hidden`]: !settings[`${day}_hidden`] }));
}

async function clearAll(label, col, records, extraReset) {
    if (prompt(`這會刪除全部 ${records.length} 筆${label}紀錄，無法復原。\n請輸入「確認」繼續`) !== "確認") return;
    try {
        await deleteRecords(col, records);
        if (extraReset) await patchSettings(extraReset);
        toast(`${label}已清空`);
    } catch (err) {
        console.error(err);
        toast("清空途中失敗，請檢查網路後再按一次", "error");
    }
}
$("d2_clearBtn").addEventListener("click", () => clearAll("D2 ", "records_d2", recordsD2, { d2_status: {} }));
$("d3_clearBtn").addEventListener("click", () => clearAll("D3 ", "records_d3", recordsD3, { d3_status: {}, d3_currRounds: {} }));
$("clearBonusBtn").addEventListener("click", () => clearAll("加分（含 NPC）", "records_bonus", recordsBonus));

// ---------- D2 參數設定 ----------

function renderD2StationConfigs(n) {
    // 保留畫面上已經改過、還沒儲存的值
    const current = {};
    document.querySelectorAll("[data-st-type]").forEach(el => {
        const st = el.dataset.stType;
        current[st] = { type: el.value, unit: $(`st_unit_${st}`).value };
    });
    let html = "";
    for (let st = 1; st <= n; st++) {
        const conf = current[st] || d2StationConfig(settings, st);
        html += `<div class="station-config-row">
            <label>第 ${st} 關</label>
            <select data-st-type="${st}"><option value="time"${conf.type === "time" ? " selected" : ""}>計時（越快越好）</option><option value="score"${conf.type === "score" ? " selected" : ""}>計分（越多越好）</option></select>
            <input type="text" id="st_unit_${st}" placeholder="單位（例：顆）" value="${esc(conf.unit)}">
        </div>`;
    }
    $("d2_station_configs").innerHTML = html;
}

$("d2_setBtn").addEventListener("click", () => {
    const s = settings;
    $("set_d2_stations").value = s.numStations_d2;
    $("set_d2_maxMin").value = s.d2_maxMin;
    $("set_d2_maxSec").value = s.d2_maxSec;
    $("set_d2_maxScore").value = s.d2_maxScore;
    $("set_d2_maxLikes").value = s.d2_maxLikes;
    $("set_d2_likePts").value = s.d2_likePts;
    $("set_d2_top1").value = s.d2_rules.top1;
    $("set_d2_top2").value = s.d2_rules.top2;
    $("set_d2_top3").value = s.d2_rules.top3;
    $("set_d2_base").value = s.d2_rules.base;
    $("d2_station_configs").innerHTML = "";
    renderD2StationConfigs(s.numStations_d2);
    openModal("modal_d2_settings");
});
$("set_d2_stations").addEventListener("input", () => {
    const n = int("set_d2_stations", 0);
    if (n > 0 && n <= 60) renderD2StationConfigs(n);
});

$("save_d2_settings").addEventListener("click", async () => {
    const s = settings;
    const stations = int("set_d2_stations", s.numStations_d2);
    if (stations < 1) return toast("關卡數至少要 1", "warn");
    const configs = { ...s.d2_configs };
    for (let st = 1; st <= stations; st++) {
        const typeEl = document.querySelector(`[data-st-type="${st}"]`);
        if (typeEl) configs[st] = { type: typeEl.value, unit: $(`st_unit_${st}`).value.trim() };
    }
    await setDoc(settingsRef, {
        numStations_d2: stations,
        d2_maxMin: Math.max(0, int("set_d2_maxMin", s.d2_maxMin)),
        d2_maxSec: Math.min(59, Math.max(0, int("set_d2_maxSec", s.d2_maxSec))),
        d2_maxScore: int("set_d2_maxScore", s.d2_maxScore),
        d2_maxLikes: Math.max(0, int("set_d2_maxLikes", s.d2_maxLikes)),
        d2_likePts: int("set_d2_likePts", s.d2_likePts),
        d2_rules: {
            top1: int("set_d2_top1", s.d2_rules.top1), top2: int("set_d2_top2", s.d2_rules.top2),
            top3: int("set_d2_top3", s.d2_rules.top3), base: int("set_d2_base", s.d2_rules.base)
        },
        d2_configs: configs
    }, { merge: true });
    closeModal("modal_d2_settings");
    toast("D2 設定已儲存");
});

// ---------- D3 參數設定 ----------

$("d3_setBtn").addEventListener("click", () => {
    const s = settings;
    $("set_d3_stations").value = s.numStations_d3;
    $("set_d3_maxRounds").value = s.d3_maxRounds;
    $("set_d3_maxLikes").value = s.d3_maxLikes;
    $("set_d3_likePts").value = s.d3_likePts;
    $("d3_rank_scores").innerHTML = teamList(s.numTeams).map((_, i) => `
        <div class="field"><label class="label">第 ${i + 1} 名</label><input type="number" id="d3_rank_${i + 1}" value="${Number(s.d3_rankScores[i + 1]) || 0}"></div>`).join("");
    openModal("modal_d3_settings");
});

$("save_d3_settings").addEventListener("click", async () => {
    const s = settings;
    const rankScores = {};
    for (let i = 1; i <= s.numTeams; i++) rankScores[i] = int(`d3_rank_${i}`, 0);
    await setDoc(settingsRef, {
        numStations_d3: Math.max(1, int("set_d3_stations", s.numStations_d3)),
        d3_maxRounds: Math.max(1, int("set_d3_maxRounds", s.d3_maxRounds)),
        d3_maxLikes: Math.max(0, int("set_d3_maxLikes", s.d3_maxLikes)),
        d3_likePts: int("set_d3_likePts", s.d3_likePts),
        d3_rankScores: rankScores
    }, { merge: true });
    closeModal("modal_d3_settings");
    toast("D3 設定已儲存");
});

// ---------- D3 賽程表 ----------

$("d3_scheduleBtn").addEventListener("click", () => {
    const rounds = Object.keys(settings.schedule).length;
    $("scheduleCurrent").textContent = rounds ? `目前已匯入 ${rounds} 輪的賽程。重新匯入會整份覆蓋。` : "目前還沒有賽程表。";
    $("scheduleInput").value = "";
    openModal("modal_d3_schedule");
});

$("save_d3_schedule").addEventListener("click", async () => {
    const schedule = parseSchedule($("scheduleInput").value);
    const rounds = Object.keys(schedule);
    // 格式錯誤時不要覆蓋掉原本的賽程表
    if (!rounds.length) return toast("看不懂這份賽程表，請確認每輪開頭有「第1輪」並用 Tab 分隔", "error");
    const matches = rounds.reduce((n, r) => n + Object.keys(schedule[r]).length, 0);
    if (!confirm(`解析出 ${rounds.length} 輪、共 ${matches} 場對戰，確定覆蓋目前的賽程表？`)) return;
    // 用 updateDoc 整份取代 schedule（setDoc merge 會把舊的輪次混在一起）
    await updateDoc(settingsRef, { schedule });
    closeModal("modal_d3_schedule");
    toast("賽程表已匯入");
});

// ---------- 隊伍與計分項目 ----------

$("score_setBtn").addEventListener("click", () => {
    $("set_global_teams").value = settings.numTeams;
    $("score_cols_fields").innerHTML = campColumns(settings).map((d, i) => `
        <div class="field"><label class="label">${esc(d.day)}</label><input type="text" id="set_cols_d${i + 1}" value="${esc(d.cols.join(","))}"></div>`).join("");
    openModal("modal_score_settings");
});

$("save_global_settings").addEventListener("click", async () => {
    const teams = int("set_global_teams", settings.numTeams);
    if (teams < 2) return toast("隊伍數至少要 2", "warn");
    const fields = { numTeams: teams };
    CAMP.days.forEach((_, i) => { fields[`cols_d${i + 1}`] = $(`set_cols_d${i + 1}`).value.trim(); });
    await setDoc(settingsRef, fields, { merge: true });
    closeModal("modal_score_settings");
    toast("已儲存");
});

// ---------- D2 紀錄新增 / 編輯 ----------

function syncD2RecordInputs() {
    const conf = d2StationConfig(settings, parseInt($("d2_rec_station").value, 10));
    $("d2_rec_timeGroup").hidden = conf.type !== "time";
    $("d2_rec_scoreGroup").hidden = conf.type === "time";
}

function openD2Record(r) {
    const rec = r || { station: 1, team: teamList(settings.numTeams)[0], val: "", likes: 0 };
    $("d2_record_title").textContent = r ? "編輯 D2 紀錄" : "新增 D2 紀錄";
    $("d2_edit_id").value = r ? r.id : "";
    $("d2_rec_station").innerHTML = stationOptions(settings.numStations_d2, rec.station);
    $("d2_rec_team").innerHTML = teamOptions(settings.numTeams, rec.team);
    const val = Number.isFinite(rec.val) ? rec.val : "";
    $("d2_rec_min").value = val === "" ? "" : Math.floor(val / 60);
    $("d2_rec_sec").value = val === "" ? "" : val % 60;
    $("d2_rec_val").value = val;
    $("d2_rec_likes").value = rec.likes || 0;
    syncD2RecordInputs();
    openModal("modal_d2_record");
}
$("d2_addBtn").addEventListener("click", () => openD2Record(null));
$("d2_rec_station").addEventListener("change", syncD2RecordInputs);

$("save_d2_record").addEventListener("click", async () => {
    const id = $("d2_edit_id").value;
    const station = parseInt($("d2_rec_station").value, 10);
    const conf = d2StationConfig(settings, station);
    const val = conf.type === "time"
        ? int("d2_rec_min", 0) * 60 + int("d2_rec_sec", 0)
        : int("d2_rec_val", NaN);
    if (Number.isNaN(val) || val < 0) return toast("請輸入數值", "warn");
    const data = { station, team: $("d2_rec_team").value, val, likes: Math.max(0, int("d2_rec_likes", 0)) };
    const result = await commit(id
        ? updateDoc(doc(db, "records_d2", id), data)
        : addDoc(collection(db, "records_d2"), { ...data, createdAt: Date.now() }));
    closeModal("modal_d2_record");
    toastCommit(result, "已儲存");
});

// ---------- D3 紀錄新增 / 編輯 ----------

function syncD3Winner() {
    const a = $("d3_rec_teamA").value, b = $("d3_rec_teamB").value, prev = $("d3_rec_winner").value;
    $("d3_rec_winner").innerHTML = `<option value="${esc(a)}">${esc(a)}</option><option value="${esc(b)}">${esc(b)}</option>`;
    if (prev === a || prev === b) $("d3_rec_winner").value = prev;
}

function openD3Record(r) {
    const teams = teamList(settings.numTeams);
    const rec = r || { station: 1, round: 1, teamA: teams[0], teamB: teams[1], winner: teams[0], likesA: 0, likesB: 0 };
    $("d3_record_title").textContent = r ? "編輯 D3 紀錄" : "新增 D3 紀錄";
    $("d3_edit_id").value = r ? r.id : "";
    $("d3_rec_station").innerHTML = stationOptions(settings.numStations_d3, rec.station);
    $("d3_rec_round").value = rec.round || 1;
    $("d3_rec_teamA").innerHTML = teamOptions(settings.numTeams, rec.teamA);
    $("d3_rec_teamB").innerHTML = teamOptions(settings.numTeams, rec.teamB);
    $("d3_rec_likesA").value = rec.likesA || 0;
    $("d3_rec_likesB").value = rec.likesB || 0;
    $("d3_rec_winner").innerHTML = "";
    syncD3Winner();
    $("d3_rec_winner").value = rec.winner;
    openModal("modal_d3_record");
}
$("d3_addBtn").addEventListener("click", () => openD3Record(null));
$("d3_rec_teamA").addEventListener("change", syncD3Winner);
$("d3_rec_teamB").addEventListener("change", syncD3Winner);

$("save_d3_record").addEventListener("click", async () => {
    const id = $("d3_edit_id").value;
    const teamA = $("d3_rec_teamA").value, teamB = $("d3_rec_teamB").value, winner = $("d3_rec_winner").value;
    if (teamA === teamB) return toast("兩隊不能是同一隊", "warn");
    const data = {
        station: parseInt($("d3_rec_station").value, 10),
        round: Math.max(1, int("d3_rec_round", 1)),
        teamA, teamB, winner, loser: winner === teamA ? teamB : teamA,
        likesA: Math.max(0, int("d3_rec_likesA", 0)),
        likesB: Math.max(0, int("d3_rec_likesB", 0))
    };
    const result = await commit(id
        ? updateDoc(doc(db, "records_d3", id), data)
        : addDoc(collection(db, "records_d3"), { ...data, createdAt: Date.now() }));
    closeModal("modal_d3_record");
    toastCommit(result, "已儲存");
});

// ---------- 手動加 / 扣分 ----------

function reasonOptions(selected) {
    return campColumns(settings).map(d => `<optgroup label="${esc(d.day)}">${d.cols.map((c, i) =>
        `<option value="${esc(d.keys[i])}"${d.keys[i] === selected ? " selected" : ""}>${esc(c)}${c === D2_COLUMN || c === D3_COLUMN ? "（調整遊戲分）" : ""}</option>`).join("")}</optgroup>`).join("");
}

$("score_addBonusBtn").addEventListener("click", () => {
    $("bonus_team").innerHTML = teamOptions(settings.numTeams, $("bonus_team").value);
    $("bonus_reason").innerHTML = reasonOptions($("bonus_reason").value);
    $("bonus_val").value = "";
    openModal("modal_bonus");
});

$("save_bonus").addEventListener("click", async () => {
    const team = $("bonus_team").value, reason = $("bonus_reason").value, val = int("bonus_val", NaN);
    if (!reason) return toast("請選擇計分項目", "warn");
    if (Number.isNaN(val) || val === 0) return toast("請輸入分數", "warn");
    const result = await commit(addDoc(collection(db, "records_bonus"), { team, reason, val, timestamp: Date.now() }));
    closeModal("modal_bonus");
    toastCommit(result, `${team} ${val > 0 ? "+" : ""}${val} 已記錄`);
});

// ---------- 總積分大表 ----------

function renderTotals() {
    if (!settings) return;
    const t = computeTotals(settings, recordsD2, recordsD3, recordsBonus);
    lastTotals = t;
    const hasUncat = t.uncategorizedRecords.length > 0;

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
                    const cls = [i === 0 ? "day-start" : "", k === t.d2Key || k === t.d3Key ? "game" : ""].join(" ").trim();
                    return `<td class="${cls}">${row.cells[k] || ""}</td>`;
                }).join("")
                : `<td class="day-start"></td>`).join("")}
            ${hasUncat ? `<td class="day-start uncat">${row.uncategorized || ""}</td>` : ""}
        </tr>`).join("");

    $("uncatNotice").hidden = !hasUncat;
    if (hasUncat) {
        $("uncatNotice").innerHTML = `有 ${t.uncategorizedRecords.length} 筆加分對不上大表欄位，暫時放在「${UNCATEGORIZED}」（仍有算進總分）。<button class="btn btn-ghost" id="openUncat">查看並歸類</button>`;
        $("openUncat").addEventListener("click", openUncat);
    }
    if ($("modal_uncat").classList.contains("open")) renderUncatList();
}

function renderUncatList() {
    const recs = lastTotals.uncategorizedRecords;
    $("uncat_list").innerHTML = recs.length ? recs.map(r => `
        <li>
            <div>
                <div class="main">${esc(r.team)}　<span class="num">${esc(r.val)}</span></div>
                <div class="meta">原項目：${esc(r.reason || "（空白）")}${r.npc ? `・NPC ${esc(r.npc)}` : ""}</div>
            </div>
            <select data-reassign="${esc(r.id)}" style="width:auto; max-width:50%;"><option value="">移到…</option>${reasonOptions("")}</select>
        </li>`).join("") : `<li class="empty">都歸類好了</li>`;
}
function openUncat() { renderUncatList(); openModal("modal_uncat"); }

$("uncat_list").addEventListener("change", async e => {
    const id = e.target.dataset.reassign;
    if (!id || !e.target.value) return;
    await commit(updateDoc(doc(db, "records_bonus", id), { reason: e.target.value }));
    toast("已歸類");
});

// ---------- 匯出 CSV ----------

function downloadCsv(filename, rows) {
    const cell = v => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "﻿" + rows.map(r => r.map(cell).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
const fullTime = ts => ts ? new Date(ts).toLocaleString("zh-TW") : "";

$("d2_exportBtn").addEventListener("click", () => {
    downloadCsv("D2_紀錄.csv", [
        ["關卡", "隊伍", "數值", "顯示", "讚數", "時間"],
        ...recordsD2.filter(r => !r.isLikeOnly).sort((a, b) => a.station - b.station || a.createdAt - b.createdAt)
            .map(r => [`第${r.station}關`, r.team, r.val, formatD2Value(r.val, d2StationConfig(settings, r.station)), r.likes || 0, fullTime(r.createdAt)])
    ]);
});

$("d3_exportBtn").addEventListener("click", () => {
    downloadCsv("D3_紀錄.csv", [
        ["輪次", "關卡", "隊伍A", "隊伍B", "獲勝", "落敗", "A讚", "B讚", "時間"],
        ...[...recordsD3].sort((a, b) => a.round - b.round || a.station - b.station)
            .map(r => [`第${r.round}輪`, `第${r.station}關`, r.teamA, r.teamB, r.winner, d3Loser(r), r.likesA || 0, r.likesB || 0, fullTime(r.createdAt)])
    ]);
});

$("exportTableBtn").addEventListener("click", () => {
    const t = lastTotals;
    const hasUncat = t.uncategorizedRecords.length > 0;
    downloadCsv("總積分大表.csv", [
        ["隊伍", "總分", ...t.columns.flatMap(d => d.cols.map(c => `${d.day} ${c}`)), ...(hasUncat ? [UNCATEGORIZED] : [])],
        ...t.rows.map(row => [row.team, row.total, ...t.keys.map(k => row.cells[k]), ...(hasUncat ? [row.uncategorized] : [])])
    ]);
});

$("exportAllBtn").addEventListener("click", () => {
    downloadCsv("全部明細.csv", [
        ["類別", "項目", "關卡/輪次", "隊伍", "結果", "讚數", "紀錄者", "時間"],
        ...recordsD2.filter(r => !r.isLikeOnly).map(r => ["D2", "", `第${r.station}關`, r.team, formatD2Value(r.val, d2StationConfig(settings, r.station)), r.likes || 0, "關主", fullTime(r.createdAt)]),
        ...recordsD3.map(r => ["D3", `第${r.round}輪`, `第${r.station}關`, `${r.teamA} vs ${r.teamB}`, `${r.winner} 勝`, `${r.likesA || 0}:${r.likesB || 0}`, "關主", fullTime(r.createdAt)]),
        ...recordsBonus.map(r => ["加分", r.reason, "", r.team, r.val, "", r.npc || "總控台", fullTime(r.timestamp)])
    ]);
});

// ---------- 營前演練用：在 console 輸入 runCornerTest() 灌入假資料（會寫進真的資料庫） ----------

window.runCornerTest = async () => {
    if (prompt("這會在真實資料庫灌入大量測試資料，請輸入「確認」") !== "確認") return;
    const s = settings, teams = teamList(s.numTeams), jobs = [];
    for (let st = 1; st <= s.numStations_d2; st++) {
        for (const team of teams) {
            jobs.push(addDoc(collection(db, "records_d2"), { station: st, team, val: Math.floor(Math.random() * 300 + 60), likes: Math.floor(Math.random() * (s.d2_maxLikes + 1)), createdAt: Date.now() }));
        }
    }
    for (let round = 1; round <= s.d3_maxRounds; round++) {
        for (let st = 1; st <= s.numStations_d3; st++) {
            const m = d3Match(s, round, st) || { a: teams[(st * 2 - 2) % teams.length], b: teams[(st * 2 - 1) % teams.length] };
            const winner = Math.random() > 0.5 ? m.a : m.b;
            const likesA = Math.floor(Math.random() * (s.d3_maxLikes + 1));
            jobs.push(addDoc(collection(db, "records_d3"), { station: st, round, teamA: m.a, teamB: m.b, winner, loser: winner === m.a ? m.b : m.a, likesA, likesB: Math.floor(Math.random() * (s.d3_maxLikes - likesA + 1)), createdAt: Date.now() }));
        }
    }
    const keys = campColumns(s).flatMap(d => d.keys);
    for (const team of teams) {
        jobs.push(addDoc(collection(db, "records_bonus"), { team, reason: keys[Math.floor(Math.random() * keys.length)], val: Math.floor(Math.random() * 200), timestamp: Date.now() }));
    }
    await Promise.all(jobs);
    toast(`已灌入 ${jobs.length} 筆測試資料`);
};

// ---------- 工作人員名單與登入中的人 ----------

let roster = {}, sessions = [], rosterDirty = false;

const rosterInput = (role, st) => `
    <div class="roster-row">
        <label for="roster_${role}_${st}">第 ${st} 關</label>
        <input type="text" id="roster_${role}_${st}" data-roster="${rosterKey(role, st)}" value="${esc((roster[rosterKey(role, st)] || []).join(", "))}" placeholder="關主名字">
    </div>`;

function renderRoster() {
    if (!settings || rosterDirty) return;
    $("roster_d2").innerHTML = Array.from({ length: settings.numStations_d2 }, (_, i) => rosterInput("d2", i + 1)).join("");
    $("roster_d3").innerHTML = Array.from({ length: settings.numStations_d3 }, (_, i) => rosterInput("d3", i + 1)).join("");
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
    document.querySelectorAll("[data-roster]").forEach(el => {
        batch.set(doc(db, "staff", el.dataset.roster), { names: parseNames(el.value) });
    });
    batch.set(doc(db, "staff", "npc"), { names: parseNames($("roster_npc").value) });
    try {
        const result = await commit(batch.commit());
        rosterDirty = false;
        renderRoster();
        toastCommit(result, "名單已儲存");
    } catch (err) {
        console.error(err);
        toast("儲存失敗，請確認網路與管理員權限", "error");
    }
});

$("sessionList").addEventListener("click", async e => {
    const id = e.target.closest("[data-kick]")?.dataset.kick;
    if (id && confirm("確定要強制登出？對方需要重新輸入名字才能繼續。")) {
        await commit(deleteDoc(doc(db, "sessions", id)));
    }
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
