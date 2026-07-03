import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyBo5iMRonG0rFu6ZuIBJFXzwnWF9xiAKgQ", authDomain: "awaken-c5fca.firebaseapp.com", projectId: "awaken-c5fca", storageBucket: "awaken-c5fca.firebasestorage.app" };
const app = initializeApp(firebaseConfig); const db = getFirestore(app);

let sysSettings = {}; let recordsD2 = []; let recordsD3 = []; let recordsBonus = [];

// ==========================================
// 📡 資料庫即時監聽 (拔除報錯的舊函數)
// ==========================================
onSnapshot(doc(db, "settings_global", "global"), (docSnap) => {
    if (docSnap.exists()) {
        sysSettings = { ...sysSettings, ...docSnap.data() };
        renderD2Monitor(); renderD3Monitor(); updateButtonStatus();
        window.updateScoreSummary(); // 🌟 確保更新大表
    }
});
onSnapshot(collection(db, "records_d2"), (snapshot) => {
    recordsD2 = []; snapshot.forEach(d => recordsD2.push({ id: d.id, ...d.data() })); 
    renderD2Monitor(); window.updateScoreSummary(); 
});
onSnapshot(collection(db, "records_d3"), (snapshot) => {
    recordsD3 = []; snapshot.forEach(d => recordsD3.push({ id: d.id, ...d.data() })); 
    renderD3Monitor(); window.updateScoreSummary(); 
});
onSnapshot(collection(db, "records_bonus"), (snapshot) => {
    recordsBonus = []; snapshot.forEach(d => recordsBonus.push({ id: d.id, ...d.data() })); 
    window.updateScoreSummary(); // 🌟 這裡修復了，只更新大表，不再報錯
});

// ==========================================
// 📊 D2 / D3 即時監控面板
// ==========================================
function renderD2Monitor() {
    const container = document.getElementById('d2_monitor'); container.innerHTML = "";
    for (let i = 1; i <= (sysSettings.numStations_d2 || 15); i++) {
        let status = (sysSettings.d2_status && sysSettings.d2_status[i]) || 'green';
        let conf = sysSettings.d2_configs ? sysSettings.d2_configs[i] : { type: 'time' };
        let maxVal = (conf.type === 'time') ? ((sysSettings.d2_maxMin || 59) * 60 + (sysSettings.d2_maxSec || 59)) : sysSettings.d2_maxScore;

        let stRecs = recordsD2.filter(r => r.station === i && !r.isLikeOnly && r.val >= 0 && r.val <= maxVal);
        
        // 🌟 1. 嚴格過濾各隊「生涯最佳成績」的那一筆紀錄物件
        let bestRecsMap = {};
        stRecs.forEach(r => {
            if (!bestRecsMap[r.team]) {
                bestRecsMap[r.team] = r;
            } else {
                if (conf.type === 'time' ? r.val < bestRecsMap[r.team].val : r.val > bestRecsMap[r.team].val) {
                    bestRecsMap[r.team] = r;
                }
            }
        });

        let recs = Object.values(bestRecsMap);
        recs.sort((a, b) => conf.type === 'time' ? a.val - b.val : b.val - a.val);

        // 🌟 2. 密集排名 (同分同名次，1,1,1,2,3...)
        let currRank = 1;
        recs.forEach((r, idx) => {
            if (idx > 0 && r.val !== recs[idx - 1].val) currRank++;
            r.rank = currRank;
        });

        // 取出名次為 1, 2, 3 的所有紀錄顯示在上方
        let topRecs = recs.filter(r => r.rank <= 3);
        let otherRecs = recs.filter(r => r.rank > 3);

        let topHtml = topRecs.map(r => {
            let badge = (r.rank === 1) ? '🥇' : ((r.rank === 2) ? '🥈' : '🥉');
            return `<li><span>${badge} ${r.team}</span><span>${r.val}</span><div><button class="btn btn-setting" style="padding:2px 5px;" onclick="window.editD2('${r.id}', ${r.station}, '${r.team}', ${r.val})">改</button><button class="del-btn" onclick="window.delD2('${r.id}')">刪</button></div></li>`;
        }).join('');

        let othersHtml = otherRecs.map(r => `<li><span>第${r.rank}名 ${r.team}</span><span>${r.val}</span><button class="del-btn" onclick="window.delD2('${r.id}')">刪</button></li>`).join('');
        let detailHtml = othersHtml ? `<details><summary>其他名次 ▼</summary><ul class="record-list">${othersHtml}</ul></details>` : '';

        container.innerHTML += `<div class="glass-card station-box"><div class="station-title"><span class="status-dot ${status === 'red' ? 'dot-red' : 'dot-green'}"></span>第 ${i} 關</div><ul class="record-list">${topHtml || '<li style="color:#aaa;">尚無成績</li>'}</ul>${detailHtml}</div>`;
    }
}

function renderD3Monitor() {
    const container = document.getElementById('d3_monitor'); container.innerHTML = "";
    for (let i = 1; i <= (sysSettings.numStations_d3 || 10); i++) {
        let status = (sysSettings.d3_status && sysSettings.d3_status[i]) || 'green';
        let recs = recordsD3.filter(r => r.station === i).sort((a, b) => b.createdAt - a.createdAt);

        let currentRound = (sysSettings.d3_currRounds && sysSettings.d3_currRounds[i]) ? sysSettings.d3_currRounds[i] : 1;
        let currentTeams = "尚未分配";
        if (sysSettings.schedule && sysSettings.schedule[currentRound] && sysSettings.schedule[currentRound][i]) {
            currentTeams = `${sysSettings.schedule[currentRound][i].a} VS ${sysSettings.schedule[currentRound][i].b}`;
        }

        let listHTML = recs.slice(0, 3).map(r => `<li style="flex-direction:column; align-items:flex-start;"><div style="width:100%; display:flex; justify-content:space-between;"><span style="font-size:0.9em;">[輪${r.round}] ${r.teamA} VS ${r.teamB}</span><div><button class="btn btn-setting" style="padding:2px 5px;" onclick="window.editD3('${r.id}', ${r.station}, ${r.round}, '${r.teamA}', '${r.teamB}', '${r.winner}')">改</button><button class="del-btn" onclick="window.delD3('${r.id}')">刪</button></div></div><div style="color:#e74c3c; font-weight:bold;">👉 ${r.winner} (勝)</div></li>`).join('');
        let others = recs.slice(3).map(r => `<li><span>[輪${r.round}] ${r.winner}(勝)</span><button class="del-btn" onclick="window.delD3('${r.id}')">刪</button></li>`).join('');
        let detailHtml = others ? `<details><summary>更早紀錄 ▼</summary><ul class="record-list">${others}</ul></details>` : '';

        container.innerHTML += `<div class="glass-card station-box"><div class="station-title"><span class="status-dot ${status === 'red' ? 'dot-red' : 'dot-green'}"></span>第 ${i} 關</div><div style="color:#f1c40f; margin-bottom:5px; font-size:0.8em;">當前: ${currentTeams}</div><ul class="record-list">${listHTML || '<li style="color:#aaa;">尚無成績</li>'}</ul>${detailHtml}</div>`;
    }
}

// ==========================================
// 🛠️ 按鈕事件與刪除功能
// ==========================================
window.delD2 = async (id) => { if (confirm("刪除？")) await deleteDoc(doc(db, "records_d2", id)); };
window.delD3 = async (id) => { if (confirm("刪除？")) await deleteDoc(doc(db, "records_d3", id)); };
window.clearBonus = async () => {
    if (prompt("輸入「確認」清空所有手動加分") === "確認") {
        recordsBonus.forEach(r => deleteDoc(doc(db, "records_bonus", r.id)));
        alert("✅ 手動加分已清空");
    }
};

function updateButtonStatus() {
    document.getElementById('d2_lockBtn').innerText = sysSettings.d2_locked ? "🔓 開放 D2 輸入" : "🔒 關閉 D2 輸入";
    document.getElementById('d2_lockBtn').style.background = sysSettings.d2_locked ? "#27ae60" : "#e74c3c";
    document.getElementById('d2_hideBtn').innerText = sysSettings.d2_hidden ? "📺 恢復 D2 展示" : "🙈 隱藏 D2 展示";
    document.getElementById('d3_lockBtn').innerText = sysSettings.d3_locked ? "🔓 開放 D3 輸入" : "🔒 關閉 D3 輸入";
    document.getElementById('d3_lockBtn').style.background = sysSettings.d3_locked ? "#27ae60" : "#e74c3c";
    document.getElementById('d3_hideBtn').innerText = sysSettings.d3_hidden ? "📺 恢復 D3 展示" : "🙈 隱藏 D3 展示";
}

document.getElementById('d2_lockBtn').addEventListener('click', async () => await setDoc(doc(db, "settings_global", "global"), { d2_locked: !sysSettings.d2_locked }, { merge: true }));
document.getElementById('d2_hideBtn').addEventListener('click', async () => await setDoc(doc(db, "settings_global", "global"), { d2_hidden: !sysSettings.d2_hidden }, { merge: true }));
document.getElementById('d2_clearBtn').addEventListener('click', async () => { if (prompt("輸入「確認」清空D2") === "確認") recordsD2.forEach(r => deleteDoc(doc(db, "records_d2", r.id))); });
document.getElementById('d3_lockBtn').addEventListener('click', async () => await setDoc(doc(db, "settings_global", "global"), { d3_locked: !sysSettings.d3_locked }, { merge: true }));
document.getElementById('d3_hideBtn').addEventListener('click', async () => await setDoc(doc(db, "settings_global", "global"), { d3_hidden: !sysSettings.d3_hidden }, { merge: true }));
document.getElementById('d3_clearBtn').addEventListener('click', async () => { if (prompt("輸入「確認」清空D3") === "確認") recordsD3.forEach(r => deleteDoc(doc(db, "records_d3", r.id))); });

// ==========================================
// ⚙️ 系統設定儲存與彈窗
// ==========================================
document.getElementById('d2_setBtn').addEventListener('click', () => {
    document.getElementById('set_d2_stations').value = sysSettings.numStations_d2 || 15;
    document.getElementById('set_d2_maxMin').value = sysSettings.d2_maxMin || 59;
    document.getElementById('set_d2_maxScore').value = sysSettings.d2_maxScore || 999;
    document.getElementById('set_d2_maxLikes').value = sysSettings.d2_maxLikes || 3;
    document.getElementById('set_d2_likePts').value = sysSettings.d2_likePts || 10;
    document.getElementById('set_d2_top1').value = sysSettings.d2_rules ? sysSettings.d2_rules.top1 : 300;
    document.getElementById('set_d2_top2').value = sysSettings.d2_rules ? sysSettings.d2_rules.top2 : 200;
    document.getElementById('set_d2_top3').value = sysSettings.d2_rules ? sysSettings.d2_rules.top3 : 100;
    document.getElementById('set_d2_base').value = sysSettings.d2_rules ? sysSettings.d2_rules.base : 50;

    let confHtml = '';
    for (let i = 1; i <= (sysSettings.numStations_d2 || 15); i++) {
        let conf = (sysSettings.d2_configs && sysSettings.d2_configs[i]) ? sysSettings.d2_configs[i] : { type: 'time', unit: '' };
        confHtml += `<div class="form-row" style="margin-bottom:10px; align-items:center;">
            <label style="width:60px; color:#f1c40f;">第 ${i} 關</label>
            <select id="st_type_${i}" style="flex:1;"><option value="time" ${conf.type === 'time' ? 'selected' : ''}>⏱️ 計時</option><option value="score" ${conf.type === 'score' ? 'selected' : ''}>🎯 計分</option></select>
            <input type="text" id="st_unit_${i}" placeholder="單位" value="${conf.unit}" style="flex:1;">
        </div>`;
    }
    document.getElementById('d2_station_configs_container').innerHTML = confHtml;
    document.getElementById('modal_d2_settings').style.display = 'flex';
});

document.getElementById('d3_setBtn').addEventListener('click', () => {
    document.getElementById('set_d3_stations').value = sysSettings.numStations_d3 || 10;
    document.getElementById('set_d3_maxLikes').value = sysSettings.d3_maxLikes || 3;
    document.getElementById('set_d3_likePts').value = sysSettings.d3_likePts || 10;
    document.getElementById('set_d3_maxRounds').value = sysSettings.d3_maxRounds || 7;

    let rankHtml = '';
    for (let i = 1; i <= (sysSettings.numTeams || 15); i++) {
        let sc = (sysSettings.d3_rankScores && sysSettings.d3_rankScores[i]) ? sysSettings.d3_rankScores[i] : 0;
        rankHtml += `<div class="form-group"><label>第 ${i} 名</label><input type="number" id="d3_rank_${i}" value="${sc}"></div>`;
    }
    document.getElementById('d3_rank_scores_container').innerHTML = rankHtml;
    document.getElementById('modal_d3_settings').style.display = 'flex';
});

document.getElementById('d3_scheduleBtn').addEventListener('click', () => document.getElementById('modal_d3_schedule').style.display = 'flex');
document.getElementById('score_setBtn').addEventListener('click', () => {
    document.getElementById('set_global_teams').value = sysSettings.numTeams || 15;
    document.getElementById('set_cols_d1').value = sysSettings.cols_d1 || "開幕式,大破冰,小隊時間,晚會,講員額外,額外增減,生活秩序";
    document.getElementById('set_cols_d2').value = sysSettings.cols_d2 || "早場,大破冰,晚會,NPC,大地(D2),講員額外,額外增減,生活秩序";
    document.getElementById('set_cols_d3').value = sysSettings.cols_d3 || "早場,晚場,NPC,大地(D3),講員額外,額外增減,生活秩序";
    document.getElementById('set_cols_d4').value = sysSettings.cols_d4 || "早場,小隊任務,見證,講員,講員額外,額外增減,生活秩序";
    document.getElementById('modal_score_settings').style.display = 'flex';
});

document.getElementById('save_d2_settings').addEventListener('click', async () => {
    let stations = parseInt(document.getElementById('set_d2_stations').value);
    let configs = {};
    for (let i = 1; i <= stations; i++) configs[i] = { type: document.getElementById(`st_type_${i}`).value, unit: document.getElementById(`st_unit_${i}`).value };
    await setDoc(doc(db, "settings_global", "global"), {
        numStations_d2: stations, d2_maxMin: parseInt(document.getElementById('set_d2_maxMin').value), d2_maxScore: parseInt(document.getElementById('set_d2_maxScore').value),
        d2_maxLikes: parseInt(document.getElementById('set_d2_maxLikes').value), d2_likePts: parseInt(document.getElementById('set_d2_likePts').value),
        d2_rules: { top1: parseInt(document.getElementById('set_d2_top1').value), top2: parseInt(document.getElementById('set_d2_top2').value), top3: parseInt(document.getElementById('set_d2_top3').value), base: parseInt(document.getElementById('set_d2_base').value) },
        d2_configs: configs
    }, { merge: true });
    document.getElementById('modal_d2_settings').style.display = 'none';
});

document.getElementById('save_d3_settings').addEventListener('click', async () => {
    let rankScores = {};
    for (let i = 1; i <= (sysSettings.numTeams || 15); i++) rankScores[i] = parseInt(document.getElementById(`d3_rank_${i}`).value) || 0;
    await setDoc(doc(db, "settings_global", "global"), {
        numStations_d3: parseInt(document.getElementById('set_d3_stations').value),
        d3_maxRounds: parseInt(document.getElementById('set_d3_maxRounds').value), d3_maxLikes: parseInt(document.getElementById('set_d3_maxLikes').value), d3_likePts: parseInt(document.getElementById('set_d3_likePts').value), d3_rankScores: rankScores
    }, { merge: true });
    document.getElementById('modal_d3_settings').style.display = 'none';
});

document.getElementById('save_global_settings').addEventListener('click', async () => {
    await setDoc(doc(db, "settings_global", "global"), { 
        numTeams: parseInt(document.getElementById('set_global_teams').value),
        cols_d1: document.getElementById('set_cols_d1').value.trim(),
        cols_d2: document.getElementById('set_cols_d2').value.trim(),
        cols_d3: document.getElementById('set_cols_d3').value.trim(),
        cols_d4: document.getElementById('set_cols_d4').value.trim(),
    }, { merge: true });
    document.getElementById('modal_score_settings').style.display = 'none';
});

document.getElementById('save_d3_schedule').addEventListener('click', async () => {
    let text = document.getElementById('scheduleInput').value.trim();
    let lines = text.split('\n').map(l => l.trimEnd());
    let newSchedule = {};
    let isMatrix = lines.some(l => l.startsWith('第') && l.includes('輪'));

    if (isMatrix) {
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (line.startsWith('第') && line.includes('輪')) {
                let roundMatch = line.split('\t')[0].match(/\d+/);
                if (!roundMatch) continue;
                let round = parseInt(roundMatch[0]);
                let teamA_cols = line.split('\t');
                let teamB_cols = (lines[i + 1] || "").split('\t');
                newSchedule[round] = {};
                for (let col = 1; col < teamA_cols.length; col++) {
                    let valA = teamA_cols[col] ? teamA_cols[col].trim() : "";
                    let valB = teamB_cols[col] ? teamB_cols[col].trim() : "";
                    if (valA && valB) {
                        let tA = /^\d+$/.test(valA) ? `第${valA}隊` : valA;
                        let tB = /^\d+$/.test(valB) ? `第${valB}隊` : valB;
                        newSchedule[round][col] = { a: tA, b: tB };
                    }
                }
            }
        }
    }
    await setDoc(doc(db, "settings_global", "global"), { schedule: newSchedule }, { merge: true });
    alert("✅ 賽程表匯入成功！"); document.getElementById('modal_d3_schedule').style.display = 'none';
});

// CSV 匯出
document.getElementById('d2_exportBtn').addEventListener('click', () => {
    let csv = "\uFEFF類別,關卡,隊伍,數值,按讚數,時間\n";
    recordsD2.forEach(r => csv += `${r.isLikeOnly ? '關主按讚' : '闖關紀錄'},第${r.station}關,${r.team},${r.val || '-'},${r.likes || 0},${new Date(r.createdAt).toLocaleString()}\n`);
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); link.download = "D2_紀錄.csv"; link.click();
});
document.getElementById('d3_exportBtn').addEventListener('click', () => {
    let csv = "\uFEFF類別,輪次,關卡,隊伍A,隊伍B,獲勝隊伍,A讚,B讚,時間\n";
    recordsD3.forEach(r => csv += `對戰紀錄,第${r.round}輪,第${r.station}關,${r.teamA},${r.teamB},${r.winner},${r.likesA || 0},${r.likesB || 0},${new Date(r.createdAt).toLocaleString()}\n`);
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); link.download = "D3_紀錄.csv"; link.click();
});

// ==========================================
// 📝 手動新增與編輯 
// ==========================================
window.editD2 = (id, st, team, val) => {
    document.getElementById('d2_modal_title').innerText = "📝 編輯 D2 紀錄";
    document.getElementById('d2_edit_id').value = id;
    let stSel = document.getElementById('add_d2_st'), tmSel = document.getElementById('add_d2_team');
    stSel.innerHTML = ""; tmSel.innerHTML = "";
    for (let i = 1; i <= (sysSettings.numStations_d2 || 15); i++) stSel.innerHTML += `<option value="${i}">第 ${i} 關</option>`;
    for (let i = 1; i <= (sysSettings.numTeams || 15); i++) tmSel.innerHTML += `<option value="第${i}隊">第 ${i} 隊</option>`;
    stSel.value = st; tmSel.value = team; document.getElementById('add_d2_val').value = val;
    document.getElementById('modal_add_d2').style.display = 'flex';
};
document.getElementById('d2_addBtn').addEventListener('click', () => {
    document.getElementById('d2_modal_title').innerText = "➕ 新增 D2 紀錄";
    document.getElementById('d2_edit_id').value = ""; document.getElementById('add_d2_val').value = "";
    window.editD2("", 1, "第1隊", "");
});
document.getElementById('save_d2_record').addEventListener('click', async () => {
    let id = document.getElementById('d2_edit_id').value;
    let data = { station: parseInt(document.getElementById('add_d2_st').value), team: document.getElementById('add_d2_team').value, val: parseInt(document.getElementById('add_d2_val').value) };
    if (isNaN(data.val)) return alert("請輸入數值！");
    if (id) await updateDoc(doc(db, "records_d2", id), data);
    else { data.createdAt = Date.now(); await addDoc(collection(db, "records_d2"), data); }
    document.getElementById('modal_add_d2').style.display = 'none';
});

window.editD3 = (id, st, round, teamA, teamB, winner) => {
    document.getElementById('d3_modal_title').innerText = "📝 編輯 D3 紀錄";
    document.getElementById('d3_edit_id').value = id;
    let stSel = document.getElementById('add_d3_st'), tmASel = document.getElementById('add_d3_teamA'), tmBSel = document.getElementById('add_d3_teamB'), winSel = document.getElementById('add_d3_winner');
    stSel.innerHTML = ""; tmASel.innerHTML = ""; tmBSel.innerHTML = "";
    for (let i = 1; i <= (sysSettings.numStations_d3 || 10); i++) stSel.innerHTML += `<option value="${i}">第 ${i} 關</option>`;
    for (let i = 1; i <= (sysSettings.numTeams || 15); i++) { let opt = `<option value="第${i}隊">第 ${i} 隊</option>`; tmASel.innerHTML += opt; tmBSel.innerHTML += opt; }
    stSel.value = st; document.getElementById('add_d3_round').value = round || 1; tmASel.value = teamA; tmBSel.value = teamB;
    winSel.innerHTML = `<option value="${teamA}">${teamA}</option><option value="${teamB}">${teamB}</option>`; winSel.value = winner;
    document.getElementById('modal_add_d3').style.display = 'flex';
};
function updateD3WinnerOpts() {
    let tA = document.getElementById('add_d3_teamA').value, tB = document.getElementById('add_d3_teamB').value, winSel = document.getElementById('add_d3_winner');
    let currWin = winSel.value; winSel.innerHTML = `<option value="${tA}">${tA}</option><option value="${tB}">${tB}</option>`;
    if (currWin === tA || currWin === tB) winSel.value = currWin;
}
document.getElementById('add_d3_teamA').addEventListener('change', updateD3WinnerOpts); document.getElementById('add_d3_teamB').addEventListener('change', updateD3WinnerOpts);
document.getElementById('d3_addBtn').addEventListener('click', () => {
    document.getElementById('d3_modal_title').innerText = "➕ 新增 D3 紀錄"; document.getElementById('d3_edit_id').value = "";
    window.editD3("", 1, 1, "第1隊", "第2隊", "第1隊");
});
document.getElementById('save_d3_record').addEventListener('click', async () => {
    let id = document.getElementById('d3_edit_id').value, teamA = document.getElementById('add_d3_teamA').value, teamB = document.getElementById('add_d3_teamB').value;
    if (teamA === teamB) return alert("❌ 兩支隊伍不能選一樣的！");
    let data = { station: parseInt(document.getElementById('add_d3_st').value), round: parseInt(document.getElementById('add_d3_round').value), teamA, teamB, winner: document.getElementById('add_d3_winner').value, loser: (document.getElementById('add_d3_winner').value === teamA) ? teamB : teamA };
    if (id) await updateDoc(doc(db, "records_d3", id), data);
    else { data.createdAt = Date.now(); data.likesA = 0; data.likesB = 0; await addDoc(collection(db, "records_d3"), data); }
    document.getElementById('modal_add_d3').style.display = 'none';
});

document.getElementById('score_addBonusBtn').addEventListener('click', () => {
    let tSel = document.getElementById('add_bonus_team'); tSel.innerHTML = "";
    for(let i=1; i<=(sysSettings.numTeams||15); i++) tSel.innerHTML += `<option value="第${i}隊">第 ${i} 隊</option>`;
    document.getElementById('add_bonus_reason').value = "";
    document.getElementById('add_bonus_val').value = "";
    document.getElementById('modal_add_bonus').style.display = 'flex';
});

document.getElementById('save_bonus_record').addEventListener('click', async () => {
    let team = document.getElementById('add_bonus_team').value;
    let reason = document.getElementById('add_bonus_reason').value.trim() || "手動調整";
    let val = parseInt(document.getElementById('add_bonus_val').value);
    if(isNaN(val)) return alert("請輸入正確數值！");
    await addDoc(collection(db, "records_bonus"), { team, reason, val, timestamp: Date.now() });
    document.getElementById('modal_add_bonus').style.display = 'none';
    alert("✅ 給分成功！");
});

// ==========================================
// 🏆 計算總分並動態渲染 Excel 矩陣大表
// ==========================================
window.updateScoreSummary = function() {
    const thead = document.getElementById('tableHead'); // 🌟 抓取表頭
    const tbody = document.getElementById('tableBody');
    if(!tbody || !thead) return;
    
    // 1. 動態建立欄位對應
    let c1 = (sysSettings.cols_d1 || "開幕式,大破冰,小隊時間,晚會,講員額外,額外增減,生活秩序").split(',');
    let c2 = (sysSettings.cols_d2 || "早場,大破冰,晚會,NPC,大地(D2),講員額外,額外增減,生活秩序").split(',');
    let c3 = (sysSettings.cols_d3 || "早場,晚場,NPC,大地(D3),講員額外,額外增減,生活秩序").split(',');
    let c4 = (sysSettings.cols_d4 || "早場,小隊任務,見證,講員,講員額外,額外增減,生活秩序").split(',');

    // 🌟 2. 這裡就是消失的標題！把動態生成的表頭塞進 HTML
    thead.innerHTML = `
        <tr>
            <th rowspan="2" class="col-fixed-1">隊伍</th>
            <th rowspan="2" class="col-fixed-2">總合</th>
            <th colspan="${c1.length}">7/2 得分</th>
            <th colspan="${c2.length}">7/3 得分</th>
            <th colspan="${c3.length}">7/4 得分</th>
            <th colspan="${c4.length}">7/5 得分</th>
        </tr>
        <tr>
            ${c1.map(c=>`<th>${c}</th>`).join('')}
            ${c2.map(c=>`<th>${c}</th>`).join('')}
            ${c3.map(c=>`<th>${c}</th>`).join('')}
            ${c4.map(c=>`<th>${c}</th>`).join('')}
        </tr>
    `;

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

    // 3. 算 D2 (自動塞入 "7/3_大地(D2)")
    // 4. 算 D2 (嚴格去重 + 密集排名給分)
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

        // 🌟 密集排名並發送對應積分
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

    // 4. 算 D3 (自動塞入 "7/4_大地(D3)")
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
    
    // 🌟 完全修復 D3 密集排名邏輯 (1,1,1,2,3)
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

    // 5. 填入各項手動加分
    recordsBonus.forEach(r => { 
        if(scores[r.team] && scores[r.team][r.reason] !== undefined) {
            scores[r.team][r.reason] += r.val;
        } else if (scores[r.team] && r.npc && scores[r.team]["7/3_NPC"] !== undefined) {
            scores[r.team]["7/3_NPC"] += r.val; 
        }
    });

    // 6. 計算總和 & 根據隊伍數字排序
    tbody.innerHTML = "";
    let finalRanking = Object.keys(scores).map(t => {
        let s = scores[t];
        s.total = allCols.reduce((sum, c) => sum + s[c], 0);
        return { team: t, ...s };
    }).sort((a,b) => parseInt(a.team.replace(/[^0-9]/g, '')) - parseInt(b.team.replace(/[^0-9]/g, ''))); 

    // 7. 渲染 Table
    finalRanking.forEach(s => {
        let rowHtml = `<tr><td class="col-fixed-1">${s.team}</td><td class="col-fixed-2">${s.total}</td>`;
        allCols.forEach(c => {
            let val = s[c] === 0 ? "" : s[c];
            let cls = (c === '7/3_大地(D2)' || c === '7/4_大地(D3)') ? 'class="col-d2d3"' : '';
            rowHtml += `<td ${cls}>${val}</td>`;
        });
        rowHtml += `</tr>`;
        tbody.innerHTML += rowHtml;
    });
};

window.runCornerTest = async () => {
    if(prompt("請輸入「確認」開始灌入測試資料 (這會寫入真實資料庫)") !== "確認") return;
    console.log("🚀 開始灌入真實 Corner Test 測試資料...");

    for(let st=1; st<=14; st++) {
        for(let t=1; t<=15; t++) {
            await addDoc(collection(db, "records_d2"), {
                station: st, team: `第${t}隊`, val: Math.floor(Math.random()*300 + 60),
                likes: Math.floor(Math.random()*4), createdAt: Date.now()
            });
        }
    }
    console.log("✅ D2 資料灌入完成");

    for(let round=1; round<=7; round++) {
        for(let st=1; st<=7; st++) {
            let tA = `第${st*2 - 1}隊`, tB = `第${st*2}隊`;
            let winner = Math.random() > 0.5 ? tA : tB;
            let lA = Math.floor(Math.random()*3);
            let lB = Math.floor(Math.random()*(4 - lA));
            await addDoc(collection(db, "records_d3"), {
                station: st, round: round, teamA: tA, teamB: tB, winner: winner, loser: winner === tA ? tB : tA,
                likesA: lA, likesB: lB, createdAt: Date.now()
            });
        }
    }
    console.log("✅ D3 資料灌入完成");

    const reasons = ["7/2_晚會", "7/3_NPC加分", "7/4_下午場", "7/5_小隊任務", "7/5_講員額外"];
    for(let t=1; t<=15; t++) {
        for(let i=0; i<2; i++) {
            await addDoc(collection(db, "records_bonus"), {
                team: `第${t}隊`, reason: reasons[Math.floor(Math.random()*reasons.length)], 
                val: Math.floor(Math.random()*500), timestamp: Date.now()
            });
        }
    }
    const npcReasons = ["7/3_NPC加分", "7/4_NPC"];
    for(let t=1; t<=5; t++) {
        await addDoc(collection(db, "records_bonus"), {
            team: `第${t}隊`, reason: npcReasons[Math.floor(Math.random()*npcReasons.length)], 
            val: Math.floor(Math.random()*150 + 50), npc: "主悅", timestamp: Date.now()
        });
    }
    alert("✅ 測試資料灌入完畢！畫面將自動更新。");
};

document.getElementById('exportAllBtn').addEventListener('click', () => {
    let csv = "\uFEFF大類別,子項目,關卡/輪次,對戰隊伍,結果數值,紀錄者,時間\n";
    recordsD2.forEach(r => {
        csv += `D2闖關紀錄,-,第${r.station}關,${r.team},${r.val} (👍x${r.likes||0}),關主,${new Date(r.createdAt).toLocaleString()}\n`;
    });
    recordsD3.forEach(r => {
        csv += `D3對戰紀錄,第${r.round}輪,第${r.station}關,${r.teamA} vs ${r.teamB},${r.winner} 勝,關主,${new Date(r.createdAt).toLocaleString()}\n`;
    });
    recordsBonus.forEach(r => {
        csv += `額外加分,${r.reason},-,${r.team},${r.val},${r.npc||'總控台'},${new Date(r.timestamp).toLocaleString()}\n`;
    });
    const link = document.createElement("a"); 
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); 
    link.download = "全場營會_所有詳細紀錄.csv"; link.click();
});