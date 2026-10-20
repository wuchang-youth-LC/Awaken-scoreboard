// 登入：關主 / NPC 用「名字」、總控台用「管理員帳號密碼」
// 關主：手機匿名登入 → 輸入名字 → 資料庫比對總控台的名單 → 建立 sessions/{uid}
// 同一支手機之後打開不用再輸入（除非被總控台移除）
import {
    getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { app, db, doc, getDoc, setDoc, deleteDoc, onSnapshot } from "./firebase.js";
import { ROLES, normalizeName, sessionMatches, sessionLabel } from "./roster.js";
import { esc } from "./ui.js";

export const auth = getAuth(app);

// 等 Firebase 從手機裡讀回上次的登入狀態
const authReady = new Promise(resolve => {
    const off = onAuthStateChanged(auth, user => { off(); resolve(user); });
});

const sessionRef = uid => doc(db, "sessions", uid);

const AUTH_ERRORS = {
    "auth/configuration-not-found": "後台還沒啟用登入功能（Authentication），請聯絡計分組",
    "auth/admin-restricted-operation": "後台還沒開啟「匿名」登入方式，請聯絡計分組",
    "auth/operation-not-allowed": "後台還沒開啟這種登入方式，請聯絡計分組",
    "auth/invalid-credential": "帳號或密碼錯誤",
    "auth/wrong-password": "帳號或密碼錯誤",
    "auth/user-not-found": "帳號或密碼錯誤",
    "auth/invalid-email": "Email 格式不對",
    "auth/too-many-requests": "嘗試太多次，請稍等一下再試",
    "auth/network-request-failed": "連不上網路，請確認訊號後再試",
    "permission-denied": "名單裡沒有這個名字，請確認有沒有打錯字，或聯絡計分組"
};
const errorText = err => AUTH_ERRORS[err?.code] || `登入失敗（${err?.code || err?.message || "未知錯誤"}）`;

function gate(innerHtml) {
    const el = document.createElement("div");
    el.className = "overlay gate";
    el.innerHTML = `<form class="login" novalidate>${innerHtml}<p class="gate-error" role="alert"></p></form>`;
    document.body.appendChild(el);
    const form = el.querySelector("form");
    const errorEl = el.querySelector(".gate-error");
    return {
        el, form,
        error(msg) { errorEl.textContent = msg || ""; },
        busy(on) { form.querySelectorAll("button, input").forEach(b => { b.disabled = on; }); },
        close() { el.remove(); }
    };
}

// ---------- 關主 / NPC ----------

// 回傳登入後的 session：{ role, station, name }
export async function requireStaff(role, station) {
    let user = await authReady;
    if (user) {
        try {
            const snap = await getDoc(sessionRef(user.uid));
            if (snap.exists() && sessionMatches(snap.data(), role, station)) {
                watchKick(user.uid);
                return snap.data();
            }
            if (snap.exists()) return await staffGate(role, station, snap.data());
        } catch (err) {
            console.warn("讀取登入狀態失敗", err);
        }
    }
    return staffGate(role, station, null);
}

function staffGate(role, station, otherSession) {
    const title = role === "npc" ? "NPC 加分站" : `${ROLES[role].label}・第 ${station} 關`;
    const g = gate(`
        <img class="wordmark" src="assets/wordmark.jpg" alt="ALL IN">
        <h1 class="gate-title">${esc(title)}</h1>
        <p>請輸入你的名字，要跟計分組登記的一樣</p>
        ${otherSession ? `<p class="gate-note">這支手機目前登入的是：${esc(sessionLabel(otherSession))}<br>登入新的身分後，舊的會自動登出</p>` : ""}
        <div class="field"><input type="text" name="name" placeholder="你的名字" autocomplete="name" required></div>
        <button class="btn btn-primary btn-block" type="submit">進入</button>
        <p class="hint"><a href="staff.html">不是這一關？回到入口</a></p>`);
    g.form.elements.name.focus();

    return new Promise(resolve => {
        g.form.addEventListener("submit", async e => {
            e.preventDefault();
            const name = normalizeName(g.form.elements.name.value);
            if (!name) return g.error("請輸入名字");
            g.error("");
            g.busy(true);
            try {
                const user = auth.currentUser || (await signInAnonymously(auth)).user;
                // 舊的身分要先刪掉，規則不允許直接改
                await deleteDoc(sessionRef(user.uid)).catch(() => {});
                const session = { role, station: role === "npc" ? 0 : station, name, createdAt: Date.now() };
                await setDoc(sessionRef(user.uid), session);
                g.close();
                watchKick(user.uid);
                resolve(session);
            } catch (err) {
                console.error(err);
                g.error(errorText(err));
                g.busy(false);
            }
        });
    });
}

// 被總控台移除時，回到登入畫面
function watchKick(uid) {
    let seen = false;
    onSnapshot(sessionRef(uid), snap => {
        if (snap.exists()) { seen = true; return; }
        if (seen) {
            alert("你已經被登出了，請重新輸入名字");
            location.reload();
        }
    }, () => {});
}

export async function logoutStaff() {
    const user = auth.currentUser;
    if (user) await deleteDoc(sessionRef(user.uid)).catch(() => {});
    location.reload();
}

// ---------- 管理員（總控台）----------

const ADMIN_EMAIL_KEY = "awaken_admin_email";

export async function requireAdmin() {
    const user = await authReady;
    if (user && !user.isAnonymous) return user;

    let savedEmail = "";
    try { savedEmail = localStorage.getItem(ADMIN_EMAIL_KEY) || ""; } catch { /* 無痕模式 */ }

    const g = gate(`
        <img class="wordmark" src="assets/wordmark.jpg" alt="ALL IN">
        <h1 class="gate-title">總控台</h1>
        <p>計分組管理員登入</p>
        <div class="field"><input type="email" name="email" placeholder="管理員 Email" autocomplete="username" value="${esc(savedEmail)}" required></div>
        <div class="field"><input type="password" name="password" placeholder="密碼" autocomplete="current-password" required></div>
        <button class="btn btn-primary btn-block" type="submit">登入</button>`);
    (savedEmail ? g.form.elements.password : g.form.elements.email).focus();

    return new Promise(resolve => {
        g.form.addEventListener("submit", async e => {
            e.preventDefault();
            const email = g.form.elements.email.value.trim(), password = g.form.elements.password.value;
            if (!email || !password) return g.error("請輸入 Email 和密碼");
            g.error("");
            g.busy(true);
            try {
                const cred = await signInWithEmailAndPassword(auth, email, password);
                try { localStorage.setItem(ADMIN_EMAIL_KEY, email); } catch { /* 無痕模式 */ }
                g.close();
                resolve(cred.user);
            } catch (err) {
                console.error(err);
                g.error(errorText(err));
                g.busy(false);
            }
        });
    });
}

export async function logoutAdmin() {
    await signOut(auth);
    location.reload();
}
