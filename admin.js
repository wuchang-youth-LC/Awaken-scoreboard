// D2 關主頁：網址帶 ?station=N
import { watchSettings, watchCollection, patchSettings, commit, collection, addDoc, deleteDoc, doc, db } from "./firebase.js";
import { d2StationConfig, formatD2Value, formatTime, clampInt, d2MaxVal } from "./scoring.js";
import { $, esc, fillTeamSelect, toast, toastCommit, connectionBadge, overlay, stationFromUrl, failText } from "./ui.js";
import { requireStaff, logoutStaff } from "./auth.js";

const station = stationFromUrl();

// 先登入：名字要在總控台的名單裡
const session = await requireStaff("d2", station);
$("whoami").textContent = session.name;
$("logoutBtn").addEventListener("click", () => { if (confirm("確定要登出？")) logoutStaff(); });
let settings = null, conf = { type: "time", unit: "" };
let busy = false, likes = 0, records = [];

const setOnline = connectionBadge();
const showLock = overlay(`<div class="title">輸入已鎖定</div><div class="sub">等待總控台開放</div>`);

function renderStatus() {
    const btn = $("statusBtn");
    btn.className = `status-toggle ${busy ? "busy" : ""}`;
    btn.innerHTML = busy
        ? `<span class="dot" style="background:#fff"></span>闖關中 <small>點一下改回空關</small>`
        : `<span class="dot dot-free"></span>目前空關 <small>隊伍到了點一下開始</small>`;
    renderLikes();
}

function renderLikes() {
    const max = settings ? settings.d2_maxLikes : 3;
    likes = Math.min(likes, max);
    $("likeCount").textContent = likes;
    $("likeMax").textContent = max;
    $("likeMinus").disabled = !busy || likes <= 0;
    $("likePlus").disabled = !busy || likes >= max;
}

function renderRecords() {
    const mine = records.filter(r => r.station === station && !r.isLikeOnly).sort((a, b) => b.createdAt - a.createdAt);
    $("records").innerHTML = mine.length
        ? mine.map(r => `
            <li>
                <div>
                    <div class="main">${esc(r.team)}　<span class="num">${esc(formatD2Value(r.val, conf))}</span></div>
                    <div class="meta">讚 ${r.likes || 0}・${new Date(r.createdAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
                <button class="btn btn-ghost danger" data-del="${esc(r.id)}">刪除</button>
            </li>`).join("")
        : `<li class="empty">尚無成績</li>`;
}

async function setBusy(next) {
    busy = next;
    if (busy) likes = 0;
    renderStatus();
    await patchSettings({ [`d2_status.${station}`]: busy ? "red" : "green" });
}

$("statusBtn").addEventListener("click", () => setBusy(!busy).catch(() => toast("燈號更新失敗，請再試一次", "error")));
$("likePlus").addEventListener("click", () => { likes++; renderLikes(); });
$("likeMinus").addEventListener("click", () => { likes--; renderLikes(); });

// 輸入上限防呆
$("minInput").addEventListener("input", e => {
    if (e.target.value !== "") e.target.value = clampInt(e.target.value, 0, settings.d2_maxMin);
});
$("secInput").addEventListener("input", e => {
    if (e.target.value !== "") e.target.value = clampInt(e.target.value, 0, 59);
});
$("scoreInput").addEventListener("input", e => {
    if (e.target.value !== "") e.target.value = clampInt(e.target.value, 0, settings.d2_maxScore);
});

$("records").addEventListener("click", async e => {
    const id = e.target.closest("[data-del]")?.dataset.del;
    if (id && confirm("確定刪除這筆成績？")) await deleteDoc(doc(db, "records_d2", id));
});

$("submitBtn").addEventListener("click", async () => {
    if (!busy) return toast("請先點上方按鈕切換為「闖關中」", "warn");
    const team = $("teamSelect").value;
    let val;
    if (conf.type === "time") {
        const min = parseInt($("minInput").value, 10) || 0;
        const sec = parseInt($("secInput").value, 10) || 0;
        val = min * 60 + sec;
        if (val === 0) return toast("請輸入時間", "warn");
    } else {
        val = parseInt($("scoreInput").value, 10);
        if (Number.isNaN(val)) return toast("請輸入數值", "warn");
    }
    if (val < 0 || val > d2MaxVal(settings, conf)) return toast("數值超過上限，請再確認", "warn");

    const shown = formatD2Value(val, conf);
    if (!confirm(`確認送出？\n${team}　${shown}　讚 ${likes}`)) return;

    $("submitBtn").disabled = true;
    try {
        const result = await commit(addDoc(collection(db, "records_d2"), {
            station, team, val, likes, createdAt: Date.now()
        }));
        $("minInput").value = ""; $("secInput").value = ""; $("scoreInput").value = "";
        await commit(setBusy(false));
        toastCommit(result, `${team} 成績已送出`);
    } catch (err) {
        console.error(err);
        toast(failText(err), "error");
    } finally {
        $("submitBtn").disabled = false;
    }
});

watchSettings((s, online) => {
    settings = s;
    setOnline(online);
    showLock(s.d2_locked);
    busy = s.d2_status[station] === "red";
    conf = d2StationConfig(s, station);

    $("stationTitle").textContent = `第 ${station} 關・${conf.type === "time" ? "計時" : "計分"}`;
    $("timeGroup").hidden = conf.type !== "time";
    $("scoreGroup").hidden = conf.type === "time";
    $("scoreLabel").textContent = conf.unit ? `獲得數值（${conf.unit}）` : "獲得數值";
    $("timeHint").textContent = `上限 ${formatTime(d2MaxVal(s, { type: "time" }))}`;
    $("scoreHint").textContent = `上限 ${s.d2_maxScore}`;
    fillTeamSelect($("teamSelect"), s.numTeams);

    renderStatus();
    renderRecords();
});

watchCollection("records_d2", list => { records = list; renderRecords(); });
