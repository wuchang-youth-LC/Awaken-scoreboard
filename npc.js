// NPC 加分頁：項目選單直接讀總控台設定的大表欄位，兩邊不會再對不上
import { watchSettings, watchCollection, commit, collection, addDoc, deleteDoc, doc, db } from "./firebase.js";
import { computeTotals, campColumns } from "./scoring.js";
import { D2_COLUMN, D3_COLUMN } from "./config.js";
import { $, esc, fillTeamSelect, toast, toastCommit, connectionBadge } from "./ui.js";

const NAME_KEY = "awaken_npc_name";
let settings = null, recordsD2 = [], recordsD3 = [], recordsBonus = [];
let npcName = "";

const setOnline = connectionBadge();

function readSavedName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}
function saveName(name) {
    try { name ? localStorage.setItem(NAME_KEY, name) : localStorage.removeItem(NAME_KEY); } catch { /* 無痕模式 */ }
}

function login(name) {
    npcName = name;
    saveName(name);
    $("whoami").textContent = name;
    $("login").hidden = true;
    $("main").hidden = false;
    renderHistory();
}

$("loginBtn").addEventListener("click", () => {
    const name = $("nameInput").value.trim();
    if (!name) return toast("請輸入名字", "warn");
    login(name);
});
$("nameInput").addEventListener("keydown", e => { if (e.key === "Enter") $("loginBtn").click(); });
$("logoutBtn").addEventListener("click", () => {
    saveName("");
    npcName = "";
    $("nameInput").value = "";
    $("main").hidden = true;
    $("login").hidden = false;
});

// 日期 / 項目選單（大地成績由系統自動計算，不給手動選）
function renderOptions() {
    const days = campColumns(settings);
    const prevDay = $("daySelect").value, prevEvt = $("eventSelect").value;
    $("daySelect").innerHTML = days.map(d => `<option value="${esc(d.day)}">${esc(d.day)}</option>`).join("");
    if (days.some(d => d.day === prevDay)) $("daySelect").value = prevDay;
    renderEvents();
    if ([...$("eventSelect").options].some(o => o.value === prevEvt)) $("eventSelect").value = prevEvt;
}
function renderEvents() {
    const day = campColumns(settings).find(d => d.day === $("daySelect").value);
    const cols = day ? day.cols.filter(c => c !== D2_COLUMN && c !== D3_COLUMN) : [];
    $("eventSelect").innerHTML = cols.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
}
$("daySelect").addEventListener("change", renderEvents);

function renderBoard() {
    if (!settings) return;
    const { rows } = computeTotals(settings, recordsD2, recordsD3, recordsBonus);
    $("board").innerHTML = [...rows].sort((a, b) => b.total - a.total)
        .map(r => `<div><span>${esc(r.team)}</span><span class="num">${r.total}</span></div>`).join("");
}

function renderHistory() {
    if (!npcName) return;
    const mine = recordsBonus.filter(r => r.npc === npcName).sort((a, b) => b.timestamp - a.timestamp);
    $("history").innerHTML = mine.length
        ? mine.map(r => `
            <li>
                <div>
                    <div class="main">${esc(r.team)}　<span class="num">${r.val > 0 ? "+" : ""}${esc(r.val)}</span></div>
                    <div class="meta">${esc(r.reason)}</div>
                </div>
                <button class="btn btn-ghost danger" data-del="${esc(r.id)}">刪除</button>
            </li>`).join("")
        : `<li class="empty">尚無紀錄</li>`;
}

$("history").addEventListener("click", async e => {
    const id = e.target.closest("[data-del]")?.dataset.del;
    if (id && confirm("確定刪除這筆加分？")) await deleteDoc(doc(db, "records_bonus", id));
});

$("submitBtn").addEventListener("click", async () => {
    const team = $("teamSelect").value;
    const event = $("eventSelect").value;
    const val = parseInt($("scoreInput").value, 10);
    if (!event) return toast("請選擇項目", "warn");
    if (Number.isNaN(val) || val === 0) return toast("請輸入分數", "warn");
    const reason = `${$("daySelect").value}_${event}`;
    if (!confirm(`確認送出？\n${team}　${reason}　${val > 0 ? "+" : ""}${val} 分`)) return;

    $("submitBtn").disabled = true;
    try {
        const result = await commit(addDoc(collection(db, "records_bonus"), { team, reason, val, npc: npcName, timestamp: Date.now() }));
        $("scoreInput").value = "";
        toastCommit(result, `${team} ${val > 0 ? "+" : ""}${val} 已送出`);
    } catch (err) {
        console.error(err);
        toast("送出失敗，請檢查網路後再試", "error");
    } finally {
        $("submitBtn").disabled = false;
    }
});

watchSettings((s, online) => {
    settings = s;
    setOnline(online);
    fillTeamSelect($("teamSelect"), s.numTeams);
    renderOptions();
    renderBoard();
});
watchCollection("records_d2", list => { recordsD2 = list; renderBoard(); });
watchCollection("records_d3", list => { recordsD3 = list; renderBoard(); });
watchCollection("records_bonus", list => { recordsBonus = list; renderBoard(); renderHistory(); });

const saved = readSavedName();
if (saved) login(saved);
