// 2027 新版資料存取：大地遊戲紀錄、加分、即時狀態
// - 練習模式：總控台打開後，所有頁面改讀寫 practice_ 開頭的集合，不會碰到正式資料
// - 刪除只是標記 deleted，可以復原
// - 每次新增、修改、刪除、復原都會寫一筆修改紀錄（audit），匯出時當明細
import {
    db, watchSettings, watchCollection, commit,
    collection, doc, onSnapshot, getDocs, setDoc, updateDoc, deleteField, writeBatch
} from "./firebase.js";
import { auditEntry } from "./games.js";

export const GAME = "records_game";
export const BONUS = "records_bonus";
const AUDIT = "audit";

let practice = false;
export const isPractice = () => practice;
const col = base => (practice ? `practice_${base}` : base);
const stateRef = () => doc(db, "state", practice ? "practice" : "live");

// 一次監聽整個營會的資料；練習模式切換時會自動換成另一組資料
// handlers: { settings(s, online, practice), games(list), bonus(list), state({active, rounds}) }
export function watchCamp(handlers) {
    let unsubs = null;
    return watchSettings((settings, online) => {
        const next = settings.practiceMode === true;
        if (unsubs === null || next !== practice) {
            practice = next;
            (unsubs || []).forEach(off => off());
            unsubs = [];
            if (handlers.games) unsubs.push(watchCollection(col(GAME), handlers.games));
            if (handlers.bonus) unsubs.push(watchCollection(col(BONUS), handlers.bonus));
            if (handlers.state) {
                unsubs.push(onSnapshot(stateRef(), snap => {
                    const d = snap.exists() ? snap.data() : {};
                    handlers.state({ active: d.active || {}, rounds: d.rounds || {} });
                }, err => console.error("state", err)));
            }
        }
        handlers.settings?.(settings, online, practice);
    });
}

// ---------- 紀錄：新增、修改、刪除、復原 ----------

function withAudit(action, base, ref, before, after, by) {
    const batch = writeBatch(db);
    const auditRef = doc(collection(db, col(AUDIT)));
    batch.set(auditRef, auditEntry(action, base, ref.id, before, after, by));
    return batch;
}

const strip = ({ id, ...data }) => data;

export function createRecord(base, data, by) {
    const ref = doc(collection(db, col(base)));
    const batch = withAudit("create", base, ref, null, data, by);
    batch.set(ref, data);
    return commit(batch.commit());
}

export function updateRecord(base, record, changes, by) {
    const ref = doc(db, col(base), record.id);
    const after = { ...strip(record), ...changes, editedAt: Date.now(), editedBy: by };
    const batch = withAudit("update", base, ref, strip(record), after, by);
    batch.set(ref, after);
    return commit(batch.commit());
}

// 刪除只是標記起來，計分時會略過，之後可以復原
export function deleteRecord(base, record, by) {
    const ref = doc(db, col(base), record.id);
    const after = { ...strip(record), deleted: true, deletedAt: Date.now(), deletedBy: by };
    const batch = withAudit("delete", base, ref, strip(record), after, by);
    batch.set(ref, after);
    return commit(batch.commit());
}

export function restoreRecord(base, record, by) {
    const ref = doc(db, col(base), record.id);
    const { deleted, deletedAt, deletedBy, ...rest } = strip(record);
    const batch = withAudit("restore", base, ref, strip(record), rest, by);
    batch.set(ref, rest);
    return commit(batch.commit());
}

// ---------- 即時狀態 ----------

// 關主選好隊伍按「開始」：這一關變成闖關中，學員頁看得到是哪幾隊在玩
export function startStation(game, station, teams, by) {
    return commit(updateDoc(stateRef(), { [`active.${game}.${station}`]: { teams, by, startedAt: Date.now() } }));
}

// 送出成績或取消：這一關變回空關
export function clearStation(game, station) {
    return commit(updateDoc(stateRef(), { [`active.${game}.${station}`]: deleteField() }));
}

export function setStationRound(game, station, round) {
    return commit(updateDoc(stateRef(), { [`rounds.${game}.${station}`]: round }));
}

// ---------- 管理員 ----------

// 總控台第一次打開時建立狀態文件（關主更新自己那一關時，文件必須已經存在）
export async function ensureStateDocs() {
    for (const mode of ["live", "practice"]) {
        await setDoc(doc(db, "state", mode), { createdAt: Date.now() }, { merge: true });
    }
}

export async function fetchAudit() {
    const snap = await getDocs(collection(db, col(AUDIT)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function deleteAll(name) {
    const snap = await getDocs(collection(db, name));
    for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
    return snap.docs.length;
}

// 清空練習資料（關主訓結束後用）；不會碰到正式資料
export async function clearPracticeData() {
    let n = 0;
    for (const base of [GAME, BONUS, AUDIT]) n += await deleteAll(`practice_${base}`);
    await setDoc(doc(db, "state", "practice"), { createdAt: Date.now() });
    return n;
}

// 清空某一場大地遊戲的正式紀錄（營會前清掉測試資料用）
export async function clearGame(game) {
    const snap = await getDocs(collection(db, col(GAME)));
    const docs = snap.docs.filter(d => d.data().game === game);
    for (let i = 0; i < docs.length; i += 450) {
        const batch = writeBatch(db);
        docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
    await updateDoc(stateRef(), { [`active.${game}`]: deleteField(), [`rounds.${game}`]: deleteField() });
    return docs.length;
}

// 清空全部加分紀錄（營會前清掉測試資料用）
export function clearBonus() {
    return deleteAll(col(BONUS));
}
