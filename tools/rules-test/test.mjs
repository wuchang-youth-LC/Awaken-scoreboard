// 對 awaken-2027 實測安全規則（只用匿名身分，測完會清掉自己寫的資料）
// 先在這個資料夾執行一次 npm install
//   node test.mjs              → 測「不在名單上的人」什麼都不能寫
//   node test.mjs 測試關主      → 另外測「D2 第 1 關名單上的人」只能寫自己那一關
//                               （要先在總控台把這個名字填進 D2 第 1 關的名單）
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signOut } from "firebase/auth";
import { getFirestore, setLogLevel, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, deleteField, collection } from "firebase/firestore";

const app = initializeApp({
    apiKey: "AIzaSyAV8VfWE6kInFbsoB9shrbcDm9dfJYrOno",
    authDomain: "awaken-2027.firebaseapp.com",
    projectId: "awaken-2027"
});
const auth = getAuth(app);
const db = getFirestore(app);
setLogLevel("silent");
const rosterName = process.argv[2];

let pass = 0, fail = 0;
async function expect(label, shouldAllow, fn) {
    let allowed;
    try { await fn(); allowed = true; } catch (e) {
        if (e.code !== "permission-denied" && e.code !== "not-found") { console.log(`  ?  ${label}: ${e.code || e.message}`); fail++; return; }
        allowed = false;
    }
    const ok = allowed === shouldAllow;
    ok ? pass++ : fail++;
    console.log(`${ok ? "  ✔" : "  ✘"} ${label}（${allowed ? "允許" : "拒絕"}）`);
}

const rec = (station, by = "x", game = "d2") => ({ game, station, round: 1, teams: ["第1隊"], result: { level: 0 }, likes: {}, by, createdAt: Date.now() });
const bonus = name => ({ team: "第1隊", reason: "7/2_晚會", val: 100, npc: name, timestamp: Date.now() });
const state = doc(db, "state", "practice");

console.log("— 沒登入");
await expect("讀設定", true, () => getDoc(doc(db, "settings_global", "global")));
await expect("讀即時狀態", true, () => getDoc(doc(db, "state", "live")));
await expect("寫大地紀錄", false, () => addDoc(collection(db, "records_game"), rec(1)));
await expect("寫練習用的大地紀錄", false, () => addDoc(collection(db, "practice_records_game"), rec(1)));

const user = (await signInAnonymously(auth)).user;
const me = doc(db, "sessions", user.uid);
console.log("— 匿名登入、沒有通過名單");
await expect("寫大地紀錄", false, () => addDoc(collection(db, "records_game"), rec(1)));
await expect("寫加分", false, () => addDoc(collection(db, "records_bonus"), bonus("x")));
await expect("寫練習用的加分", false, () => addDoc(collection(db, "practice_records_bonus"), bonus("x")));
await expect("改設定", false, () => updateDoc(doc(db, "settings_global", "global"), { practiceMode: true }));
await expect("改即時狀態", false, () => updateDoc(state, { "active.d2.1": { teams: ["第1隊"] } }));
await expect("寫修改紀錄", false, () => addDoc(collection(db, "audit"), { by: "x", action: "create" }));
await expect("讀修改紀錄", false, () => getDoc(doc(db, "audit", "x")));
await expect("讀工作人員名單", false, () => getDoc(doc(db, "staff", "d2_1")));
await expect("自己寫名單", false, () => setDoc(doc(db, "staff", "d2_1"), { names: ["駭客"] }));
await expect("用亂打的名字登入 D2 第 1 關", false, () => setDoc(me, { role: "d2", station: 1, name: "不在名單的人", createdAt: 1 }));

if (rosterName) {
    console.log(`— 用名單上的名字「${rosterName}」登入 D2 第 1 關（以下都寫在練習資料）`);
    await expect("建立登入", true, () => setDoc(me, { role: "d2", station: 1, name: rosterName, createdAt: Date.now() }));
    let created;
    const games = collection(db, "practice_records_game");
    await expect("寫第 1 關紀錄", true, async () => { created = await addDoc(games, rec(1, rosterName)); });
    await expect("寫第 2 關紀錄", false, () => addDoc(games, rec(2, rosterName)));
    await expect("寫 D3 的紀錄", false, () => addDoc(games, rec(1, rosterName, "d3")));
    await expect("冒用別人的名字", false, () => addDoc(games, rec(1, "別人")));
    await expect("修改自己那一關的紀錄", true, () => updateDoc(created, { result: { level: null } }));
    await expect("把紀錄改到別關", false, () => updateDoc(created, { station: 2 }));
    await expect("標記刪除（可復原）", true, () => updateDoc(created, { deleted: true }));
    await expect("真的刪掉紀錄", false, () => deleteDoc(created));
    await expect("第 1 關開始闖關", true, () => updateDoc(state, { "active.d2.1": { teams: ["第1隊"], by: rosterName } }));
    await expect("動到第 2 關的狀態", false, () => updateDoc(state, { "active.d2.2": { teams: ["第1隊"] } }));
    await expect("動到 D3 的狀態", false, () => updateDoc(state, { "active.d3.1": { teams: ["第1隊"] } }));
    await expect("第 1 關變回空關", true, () => updateDoc(state, { "active.d2.1": deleteField() }));
    await expect("寫修改紀錄", true, () => addDoc(collection(db, "practice_audit"), { by: rosterName, action: "create" }));
    await expect("冒名寫修改紀錄", false, () => addDoc(collection(db, "practice_audit"), { by: "別人", action: "create" }));
    await expect("改設定", false, () => updateDoc(doc(db, "settings_global", "global"), { practiceMode: false }));
    await expect("寫加分（不是 NPC）", false, () => addDoc(collection(db, "practice_records_bonus"), bonus(rosterName)));
    await expect("讀名單", false, () => getDoc(doc(db, "staff", "d2_1")));
    await expect("登出", true, () => deleteDoc(me));
    console.log("  （練習資料裡留下 1 筆測試紀錄，在總控台按「清空練習資料」就會清掉）");
}

await signOut(auth);
console.log(`\n${pass} 項正確、${fail} 項不符合預期`);
process.exit(fail ? 1 : 0);
