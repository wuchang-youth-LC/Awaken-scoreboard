// D3 關主頁：網址帶 ?station=N
// 目前輪次存在資料庫（d3_currRounds），重新整理頁面不會跳回第 1 輪
import { watchSettings, watchCollection, patchSettings, commit, collection, addDoc, deleteDoc, doc, db } from "./firebase.js";
import { d3Match } from "./scoring.js";
import { $, esc, fillTeamSelect, toast, toastCommit, connectionBadge, overlay, stationFromUrl } from "./ui.js";

const station = stationFromUrl();
let settings = null, records = [];
let busy = false, round = null, likesA = 0, likesB = 0, winner = null;

const setOnline = connectionBadge();
const showLock = overlay(`<div class="title">輸入已鎖定</div><div class="sub">等待總控台開放</div>`);

const teamA = () => $("teamA").value;
const teamB = () => $("teamB").value;

function renderStatus() {
    const btn = $("statusBtn");
    btn.className = `status-toggle ${busy ? "busy" : ""}`;
    btn.innerHTML = busy
        ? `<span class="dot" style="background:#fff"></span>對戰中 <small>點一下改回空關</small>`
        : `<span class="dot dot-free"></span>目前空關 <small>隊伍到了點一下開始</small>`;
    renderLikes();
}

function renderLikes() {
    const max = settings ? settings.d3_maxLikes : 3;
    const full = likesA + likesB >= max;
    $("likesA").textContent = likesA;
    $("likesB").textContent = likesB;
    $("likesTotal").textContent = `${likesA + likesB} / ${max}`;
    $("plusA").disabled = $("plusB").disabled = !busy || full;
    $("minusA").disabled = !busy || likesA <= 0;
    $("minusB").disabled = !busy || likesB <= 0;
}

function renderWinner() {
    if (winner !== teamA() && winner !== teamB()) winner = null;
    $("winA").textContent = teamA();
    $("winB").textContent = teamB();
    $("winA").classList.toggle("picked", winner !== null && winner === teamA());
    $("winB").classList.toggle("picked", winner !== null && winner === teamB());
}

// 換輪時：依賽程表帶入兩隊、清空讚數與勝方
function enterRound(next) {
    round = next;
    likesA = likesB = 0;
    winner = null;
    $("roundNum").textContent = round;
    const m = d3Match(settings, round, station);
    if (m) { $("teamA").value = m.a; $("teamB").value = m.b; }
    renderLikes();
    renderWinner();
}

function renderRecords() {
    const mine = records.filter(r => r.station === station).sort((a, b) => b.createdAt - a.createdAt);
    $("records").innerHTML = mine.length
        ? mine.map(r => `
            <li>
                <div>
                    <div class="main">第 ${r.round} 輪　${esc(r.teamA)} vs ${esc(r.teamB)}</div>
                    <div class="meta">勝：${esc(r.winner)}・讚 ${r.likesA || 0} : ${r.likesB || 0}</div>
                </div>
                <button class="btn btn-ghost danger" data-del="${esc(r.id)}">刪除</button>
            </li>`).join("")
        : `<li class="empty">尚無紀錄</li>`;
}

function changeRound(next) {
    if (next < 1 || next > settings.d3_maxRounds) return;
    enterRound(next);
    patchSettings({ [`d3_currRounds.${station}`]: next }).catch(() => toast("輪次同步失敗", "error"));
}

async function setBusy(next) {
    busy = next;
    if (busy) { likesA = likesB = 0; }
    renderStatus();
    await patchSettings({ [`d3_status.${station}`]: busy ? "red" : "green" });
}

$("statusBtn").addEventListener("click", () => setBusy(!busy).catch(() => toast("燈號更新失敗，請再試一次", "error")));
$("prevRound").addEventListener("click", () => changeRound(round - 1));
$("nextRound").addEventListener("click", () => changeRound(round + 1));
$("plusA").addEventListener("click", () => { likesA++; renderLikes(); });
$("plusB").addEventListener("click", () => { likesB++; renderLikes(); });
$("minusA").addEventListener("click", () => { likesA--; renderLikes(); });
$("minusB").addEventListener("click", () => { likesB--; renderLikes(); });
$("teamA").addEventListener("change", renderWinner);
$("teamB").addEventListener("change", renderWinner);
$("winA").addEventListener("click", () => { winner = teamA(); renderWinner(); });
$("winB").addEventListener("click", () => { winner = teamB(); renderWinner(); });

$("records").addEventListener("click", async e => {
    const id = e.target.closest("[data-del]")?.dataset.del;
    if (id && confirm("確定刪除這筆對戰紀錄？")) await deleteDoc(doc(db, "records_d3", id));
});

$("submitBtn").addEventListener("click", async () => {
    if (!busy) return toast("請先點上方按鈕切換為「對戰中」", "warn");
    const a = teamA(), b = teamB();
    if (a === b) return toast("兩隊不能是同一隊", "warn");
    if (!winner) return toast("請選擇獲勝隊伍", "warn");

    const dup = records.some(r => r.station === station && r.round === round);
    const msg = `${dup ? "注意：這一輪已經有紀錄了！\n\n" : ""}確認送出第 ${round} 輪？\n${a}（讚 ${likesA}） vs ${b}（讚 ${likesB}）\n勝：${winner}`;
    if (!confirm(msg)) return;

    $("submitBtn").disabled = true;
    try {
        const result = await commit(addDoc(collection(db, "records_d3"), {
            station, round, teamA: a, teamB: b, winner, loser: winner === a ? b : a,
            likesA, likesB, createdAt: Date.now()
        }));
        // 送出後：燈號改回空關，自動跳下一輪
        const nextRound = Math.min(round + 1, settings.d3_maxRounds);
        busy = false;
        await commit(patchSettings({ [`d3_status.${station}`]: "green", [`d3_currRounds.${station}`]: nextRound }));
        const last = nextRound === round;
        enterRound(nextRound);
        renderStatus();
        toastCommit(result, last ? "已送出，這是最後一輪" : `已送出，進入第 ${nextRound} 輪`);
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
    showLock(s.d3_locked);
    busy = s.d3_status[station] === "red";
    $("stationTitle").textContent = `第 ${station} 關・PK 對抗`;

    const firstLoad = $("teamA").options.length === 0;
    fillTeamSelect($("teamA"), s.numTeams);
    fillTeamSelect($("teamB"), s.numTeams);
    if (firstLoad) $("teamB").selectedIndex = Math.min(1, s.numTeams - 1);

    // 輪次以資料庫為準（同一關有兩支手機時也會同步）
    const serverRound = Math.min(s.d3_currRounds[station] || 1, s.d3_maxRounds);
    if (serverRound !== round) enterRound(serverRound);

    renderStatus();
    renderWinner();
    renderRecords();
});

watchCollection("records_d3", list => { records = list; renderRecords(); });
