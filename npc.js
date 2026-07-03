import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyBo5iMRonG0rFu6ZuIBJFXzwnWF9xiAKgQ", authDomain: "awaken-c5fca.firebaseapp.com", projectId: "awaken-c5fca", storageBucket: "awaken-c5fca.firebasestorage.app" };
const app = initializeApp(firebaseConfig); const db = getFirestore(app);

let sysSettings = {}, recordsD2 = [], recordsD3 = [], recordsBonus = [], currentNpcName = "";

// 🌟 全新對齊的欄位設定
const eventsMap = {
    "7/2": ["開幕式", "大破冰", "小隊時間", "晚會", "講員額外", "額外增減", "生活秩序"],
    "7/3": ["早場", "大破冰", "晚會", "NPC", "講員額外", "額外增減", "生活秩序"],
    "7/4": ["早場", "晚場", "NPC", "講員額外", "額外增減", "生活秩序"],
    "7/5": ["早場", "小隊任務", "見證", "講員", "講員額外", "額外增減", "生活秩序"]
};
const daySel = document.getElementById('daySelect'), evtSel = document.getElementById('eventSelect');
Object.keys(eventsMap).forEach(d => daySel.innerHTML += `<option value="${d}">${d}</option>`);
daySel.addEventListener('change', () => {
    evtSel.innerHTML = "";
    eventsMap[daySel.value].forEach(e => evtSel.innerHTML += `<option value="${e}">${e}</option>`);
});
daySel.dispatchEvent(new Event('change'));

document.getElementById('loginBtn').addEventListener('click', () => {
    let name = document.getElementById('npcNameInput').value.trim();
    if (!name) return alert("請輸入名稱！");
    currentNpcName = name;
    document.getElementById('npcDisplay').innerText = `身分：${currentNpcName}`;
    document.getElementById('loginOverlay').style.display = "none";
    document.getElementById('mainContainer').style.display = "block";
    renderHistory();
});

onSnapshot(doc(db, "settings_global", "global"), (snap) => { if(snap.exists()) { sysSettings = snap.data(); calcAndRender(); } });
onSnapshot(collection(db, "records_d2"), (snap) => { recordsD2 = []; snap.forEach(d => recordsD2.push(d.data())); calcAndRender(); });
onSnapshot(collection(db, "records_d3"), (snap) => { recordsD3 = []; snap.forEach(d => recordsD3.push(d.data())); calcAndRender(); });
onSnapshot(collection(db, "records_bonus"), (snap) => { recordsBonus = []; snap.forEach(d => recordsBonus.push({id: d.id, ...d.data()})); calcAndRender(); renderHistory(); });

// 🌟 100% 對齊總控台的算分邏輯
function calcAndRender() {
    let c1 = (sysSettings.cols_d1 || "開幕式,大破冰,小隊時間,晚會,講員額外,額外增減,生活秩序").split(',');
    let c2 = (sysSettings.cols_d2 || "早場,大破冰,晚會,NPC,大地(D2),講員額外,額外增減,生活秩序").split(',');
    let c3 = (sysSettings.cols_d3 || "早場,晚場,NPC,大地(D3),講員額外,額外增減,生活秩序").split(',');
    let c4 = (sysSettings.cols_d4 || "早場,小隊任務,見證,講員,講員額外,額外增減,生活秩序").split(',');

    let allCols = [
        ...c1.map(c => `7/2_${c}`), ...c2.map(c => `7/3_${c}`),
        ...c3.map(c => `7/4_${c}`), ...c4.map(c => `7/5_${c}`)
    ];

    let teams = sysSettings.numTeams || 15;
    let scores = {};
    for(let i=1; i<=teams; i++) {
        scores[`第${i}隊`] = { total: 0 };
        allCols.forEach(c => scores[`第${i}隊`][c] = 0);
    }

    // 1. 算 D2
    // 1. 算 D2
    let d2Rules = sysSettings.d2_rules || { top1:300, top2:200, top3:100, base:50 };
    let d2LikePts = sysSettings.d2_likePts || 10;
    for(let i=1; i<= (sysSettings.numStations_d2 || 15); i++) {
        let conf = sysSettings.d2_configs ? sysSettings.d2_configs[i] : { type:'time' };
        let maxVal = (conf.type === 'time') ? ((sysSettings.d2_maxMin||59) * 60 + (sysSettings.d2_maxSec||59)) : (sysSettings.d2_maxScore||999);
        let stRecs = recordsD2.filter(r => r.station === i && !r.isLikeOnly && r.val >= 0 && r.val <= maxVal);
        let teamBest = {};
        stRecs.forEach(r => {
            if (teamBest[r.team] === undefined) teamBest[r.team] = r.val;
            else teamBest[r.team] = (conf.type === 'time') ? Math.min(teamBest[r.team], r.val) : Math.max(teamBest[r.team], r.val);
        });
        let uniqueRecs = Object.keys(teamBest).map(t => ({ team: t, val: teamBest[t] })).sort((a,b) => conf.type === 'time' ? a.val - b.val : b.val - a.val);

        // 🌟 密集排名給分
        let currRank = 1;
        uniqueRecs.forEach((r, idx) => {
            if (idx > 0 && r.val !== uniqueRecs[idx - 1].val) currRank++;
            r.rank = currRank;

            if(!scores[r.team]) return;
            let pts = (r.rank === 1) ? d2Rules.top1 : ((r.rank === 2) ? d2Rules.top2 : ((r.rank === 3) ? d2Rules.top3 : d2Rules.base));
            if(scores[r.team]["7/3_大地(D2)"] !== undefined) scores[r.team]["7/3_大地(D2)"] += pts;
        });
    }
    recordsD2.forEach(r => { if(scores[r.team] && r.likes && scores[r.team]["7/3_大地(D2)"] !== undefined) scores[r.team]["7/3_大地(D2)"] += (r.likes * d2LikePts); });

    // 2. 算 D3
    let d3LikePts = sysSettings.d3_likePts || 10;
    let d3Stats = {};
    for(let i=1; i<=teams; i++) d3Stats[`第${i}隊`] = { wins: 0, losses: 0 };
    recordsD3.forEach(r => {
        if(d3Stats[r.winner]) d3Stats[r.winner].wins++;
        if(d3Stats[r.loser]) d3Stats[r.loser].losses++;
        if(scores[r.teamA] && r.likesA && scores[r.teamA]["7/4_大地(D3)"] !== undefined) scores[r.teamA]["7/4_大地(D3)"] += (r.likesA * d3LikePts);
        if(scores[r.teamB] && r.likesB && scores[r.teamB]["7/4_大地(D3)"] !== undefined) scores[r.teamB]["7/4_大地(D3)"] += (r.likesB * d3LikePts);
    });
    let d3Ranked = Object.keys(d3Stats).map(t => ({ team: t, ...d3Stats[t] })).sort((a,b) => b.wins !== a.wins ? b.wins - a.wins : a.losses - b.losses);
    let d3RankScores = sysSettings.d3_rankScores || {};
    
    // 🌟 同步 Dense Rank 邏輯
    let currRank = 1;
    d3Ranked.forEach((item, idx) => {
        if (idx > 0) {
            if (item.wins !== d3Ranked[idx-1].wins || item.losses !== d3Ranked[idx-1].losses) currRank++;
        }
        item.rank = currRank;
        if(scores[item.team] && scores[item.team]["7/4_大地(D3)"] !== undefined) {
            scores[item.team]["7/4_大地(D3)"] += (d3RankScores[item.rank] || 0);
        }
    });

    // 3. 填入加分 (嚴格過濾欄位)
    recordsBonus.forEach(r => { 
        if(scores[r.team] && scores[r.team][r.reason] !== undefined) {
            scores[r.team][r.reason] += r.val;
        } else if (scores[r.team] && r.npc && scores[r.team]["7/3_NPC"] !== undefined) {
            scores[r.team]["7/3_NPC"] += r.val; 
        }
    });

    // 4. 結算總分並排序
    let finalRanking = Object.keys(scores).map(t => {
        let s = scores[t];
        s.total = allCols.reduce((sum, c) => sum + s[c], 0);
        return { team: t, total: s.total };
    }).sort((a,b) => b.total - a.total); 

    // 5. 渲染到畫面
    const board = document.getElementById('simpleLeaderboard'); board.innerHTML = "";
    finalRanking.forEach((item) => {
        board.innerHTML += `<div class="score-item" style="font-size:1.1em; padding:10px 5px;">${item.team} <span style="color:#f1c40f;">${item.total} 分</span></div>`;
    });

    // 更新下拉選單
    const tSel = document.getElementById('teamSelect'); const curr = tSel.value; tSel.innerHTML = "";
    for(let i=1; i<=teams; i++) tSel.innerHTML += `<option value="第${i}隊">第 ${i} 隊</option>`;
    if(curr) tSel.value = curr;
}

function renderHistory() {
    if(!currentNpcName) return;
    const historyDiv = document.getElementById('npcHistory'); historyDiv.innerHTML = "";
    let myRecs = recordsBonus.filter(r => r.npc === currentNpcName).sort((a,b) => b.timestamp - a.timestamp);
    if(myRecs.length === 0) { historyDiv.innerHTML = "<p style='color:#888;'>尚無紀錄</p>"; return; }
    myRecs.forEach(r => {
        historyDiv.innerHTML += `<div class="history-item"><div><b>${r.team}</b> <small style="color:#aaa;">(${r.reason})</small><br><span style="color:#f1c40f;">${r.val > 0 ? '+'+r.val : r.val} 分</span></div><button class="btn btn-danger" style="padding:5px;" onclick="window.delNpcRec('${r.id}')">刪除</button></div>`;
    });
}
window.delNpcRec = async (id) => { if(confirm("刪除此紀錄？")) await deleteDoc(doc(db, "records_bonus", id)); };

document.getElementById('submitBtn').addEventListener('click', async () => {
    let team = document.getElementById('teamSelect').value;
    let reason = `${document.getElementById('daySelect').value}_${document.getElementById('eventSelect').value}`;
    let val = parseInt(document.getElementById('bonusScoreInput').value);
    if(isNaN(val)) return alert("請輸入分數！");
    try {
        await addDoc(collection(db, "records_bonus"), { team, reason, val, npc: currentNpcName, timestamp: Date.now() });
        document.getElementById('bonusScoreInput').value = ""; alert("✅ 送出成功！");
    } catch(e) { alert("發生錯誤！"); }
});