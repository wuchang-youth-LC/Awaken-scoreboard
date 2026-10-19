// Firebase 連線與共用的資料庫操作
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, doc, onSnapshot, getDoc, addDoc, updateDoc, setDoc, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";
import { withDefaults } from "./scoring.js";

export const app = initializeApp(firebaseConfig);

// 離線快取：營地訊號不好時，資料先存在手機，恢復連線後自動上傳
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const settingsRef = doc(db, "settings_global", "global");
export { collection, doc, onSnapshot, getDoc, addDoc, updateDoc, setDoc, deleteDoc, writeBatch };

// 監聽全域設定；callback 收到的設定已補好預設值
// 第二個參數 online：false 代表目前讀的是手機快取（離線中）
export function watchSettings(callback) {
    return onSnapshot(settingsRef, { includeMetadataChanges: true }, snap => {
        callback(withDefaults(snap.exists() ? snap.data() : {}), !snap.metadata.fromCache);
    });
}

export function watchCollection(name, callback, onError = err => console.error(name, err)) {
    return onSnapshot(collection(db, name), snap => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, onError);
}

// 只更新設定裡的某幾個欄位（例如 "d2_status.3"），不會蓋掉其他關主同時寫入的資料
export function patchSettings(fields) {
    return updateDoc(settingsRef, fields).catch(err => {
        // 設定文件還不存在時，改用 setDoc 建立
        if (err.code === "not-found") return setDoc(settingsRef, unflatten(fields), { merge: true });
        throw err;
    });
}

function unflatten(fields) {
    const out = {};
    for (const [path, value] of Object.entries(fields)) {
        const parts = path.split(".");
        let cur = out;
        parts.slice(0, -1).forEach(p => { cur = cur[p] = cur[p] || {}; });
        cur[parts.at(-1)] = value;
    }
    return out;
}

// 等待寫入完成；網路太慢時不卡住畫面，回傳 "queued"（已存在手機，等連線自動上傳）
export async function commit(promise, timeoutMs = 4000) {
    let timer;
    promise.catch(err => console.error("寫入失敗", err));
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve("queued"), timeoutMs); });
    try {
        return await Promise.race([promise.then(() => "synced"), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

// 批次刪除整個集合的資料（每批最多 450 筆），全部完成才回傳
export async function deleteRecords(collectionName, records) {
    for (let i = 0; i < records.length; i += 450) {
        const batch = writeBatch(db);
        records.slice(i, i + 450).forEach(r => batch.delete(doc(db, collectionName, r.id)));
        await batch.commit();
    }
}
