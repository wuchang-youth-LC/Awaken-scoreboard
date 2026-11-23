// 自動化測試共用工具：操作 Firebase 模擬器、登入、檢查畫面
// 所有資料都在本機模擬器（專案 demo-awaken），不會碰到真的資料庫
import { test as base, expect } from "@playwright/test";

const PROJECT = "demo-awaken";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

// 測試專用的管理員帳號，只存在模擬器裡。UID 要跟 firestore.rules 的 adminUids() 一致
export const ADMIN = { uid: "iViyXdvj0oeS1GCwMytDFMphsg82", email: "admin@e2e.test", password: "e2e-only-pass" };
export const NAMES = { d2: "測試關主", d3: "測試對抗", npc: "測試加分" };

// ---------- Firestore REST 格式轉換 ----------

function toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === "string") return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

function fromValue(v) {
    if ("nullValue" in v) return null;
    if ("booleanValue" in v) return v.booleanValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return v.doubleValue;
    if ("stringValue" in v) return v.stringValue;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
    if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
    return undefined;
}

// ---------- 模擬器資料 ----------

export async function resetEmulator() {
    await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
    await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
    const res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`, {
        method: "POST", headers: OWNER,
        body: JSON.stringify({ localId: ADMIN.uid, email: ADMIN.email, password: ADMIN.password })
    });
    if (!res.ok) throw new Error(`建立測試管理員失敗：${await res.text()}`);
}

// 不經過安全規則直接寫入（準備測試資料用）
export async function setDocument(path, data) {
    const res = await fetch(`${FS}/${path}`, { method: "PATCH", headers: OWNER, body: JSON.stringify(toValue(data).mapValue) });
    if (!res.ok) throw new Error(`寫入 ${path} 失敗：${await res.text()}`);
}

export async function getDocument(path) {
    const res = await fetch(`${FS}/${path}`, { headers: OWNER });
    if (res.status === 404) return null;
    return fromValue({ mapValue: await res.json() });
}

export async function listDocuments(collection) {
    const res = await fetch(`${FS}/${collection}?pageSize=300`, { headers: OWNER });
    const json = await res.json();
    return (json.documents || []).map(d => ({ id: d.name.split("/").pop(), ...fromValue({ mapValue: d }) }));
}

// 每個測試開始前的基本資料：6 隊；D2 四關（第 1 關單隊闖關）；D3 三關（第 1 關兩隊對抗）
export async function seedBase(extra = {}) {
    await resetEmulator();
    await setDocument("settings_global/global", {
        numTeams: 6,
        games: {
            d2: { numStations: 4, maxLikes: 3, likePts: 10, stations: { 1: { name: "接力投球", place: "籃球場", type: "solo", levels: [{ label: "過關", pts: 100 }] } } },
            d3: { numStations: 3, maxLikes: 3, likePts: 10, stations: { 1: { type: "versus", teamsPerMatch: 2, rankPts: [100, 50] } } }
        },
        student: { game: "d2", map: true, stations: true, scores: true },
        ...extra
    });
    await setDocument("state/live", { createdAt: 1 });
    await setDocument("state/practice", { createdAt: 1 });
    await setDocument("staff/d2_1", { names: [NAMES.d2] });
    await setDocument("staff/d3_1", { names: [NAMES.d3] });
    await setDocument("staff/npc", { names: [NAMES.npc] });
}

// ---------- 頁面 ----------

// 測試環境特有、不影響使用的訊息（只限 Firebase 的即時連線，其他錯誤照樣會被抓出來）
function ignorable(text) {
    // Windows 版 WebKit（模擬 iPhone）和 Firebase 長連線之間的已知網路問題，Firebase 會自動重試；
    // 真的 iPhone 用的是不同的網路底層，不會出現
    if (text.includes("rewinding of the data stream failed")) return true;
    // 重新整理或離開頁面時，WebKit 會把被中斷的 Firebase 即時連線記成錯誤（Linux 版才會出現）
    if (text.includes("Firestore/Listen/channel") && text.includes("access control checks")) return true;
    return false;
}

// 每個測試：自動按「確定」、清空輸入要打「確認」的視窗，並收集錯誤訊息
export const test = base.extend({
    page: async ({ page }, use) => {
        const errors = [];
        page.on("pageerror", err => { if (!ignorable(err.message)) errors.push(`頁面錯誤：${err.message}`); });
        page.on("console", msg => {
            if (msg.type() === "error" && !ignorable(msg.text())) errors.push(`console：${msg.text()}`);
        });
        page.on("dialog", d => (d.type() === "prompt" ? d.accept("確認") : d.accept()));
        page.errors = errors;
        await use(page);
    }
});
export { expect };

export async function staffLogin(page, url, name) {
    await page.goto(url);
    await page.locator(".gate input[name=name]").fill(name);
    await page.locator(".gate button[type=submit]").click();
    await expect(page.locator(".gate")).toHaveCount(0);
}

export async function adminLogin(page) {
    await page.goto("/super_dashboard.html");
    await page.locator(".gate input[name=email]").fill(ADMIN.email);
    await page.locator(".gate input[name=password]").fill(ADMIN.password);
    await page.locator(".gate button[type=submit]").click();
    await expect(page.locator("#adminWho")).toHaveText(ADMIN.email);
    // 等總控台的資料載入完成（不然勾選框這類操作可能在畫面出現前就被跳過）
    await expect(page.locator(".dash")).not.toHaveAttribute("data-loading", "");
}

// 畫面沒有左右超出螢幕（手機最常見的跑版）
export async function expectNoOverflow(page) {
    const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
    expect(scroll, `畫面寬度 ${scroll}px 超出螢幕 ${width}px`).toBeLessThanOrEqual(width + 1);
}

export function expectNoErrors(page) {
    expect(page.errors, page.errors.join("\n")).toEqual([]);
}

export async function snap(page, testInfo, name) {
    await page.waitForTimeout(300);   // 等字型、動畫穩定
    await page.screenshot({ path: `screenshots/${testInfo.project.name}/${name}.png`, fullPage: true });
}
