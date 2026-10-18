// 各頁共用的小工具
import { teamList } from "./scoring.js";

export const $ = id => document.getElementById(id);

// 使用者輸入的文字（NPC 名稱、欄位名稱）放進畫面前都要跳脫
export function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function teamOptions(n, selected) {
    return teamList(n).map(t => `<option value="${t}"${t === selected ? " selected" : ""}>${t}</option>`).join("");
}

// 重畫隊伍下拉選單，並保留原本選的值
export function fillTeamSelect(select, n) {
    const prev = select.value;
    select.innerHTML = teamOptions(n, prev);
}

let toastTimer;
export function toast(message, kind = "ok") {
    let el = $("toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "toast";
        el.setAttribute("role", "status");
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = `toast toast-${kind} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// 送出結果的提示
export function toastCommit(result, label = "已送出") {
    if (result === "queued") toast(`${label}（網路不穩，已存在手機，連線後自動上傳）`, "warn");
    else toast(label, "ok");
}

// 右下角的連線狀態
export function connectionBadge() {
    const el = document.createElement("div");
    el.className = "conn";
    document.body.appendChild(el);
    let serverOnline = true;
    const render = () => {
        const online = navigator.onLine && serverOnline;
        el.className = `conn ${online ? "conn-on" : "conn-off"}`;
        el.textContent = online ? "已連線" : "離線中・資料會先存在手機";
    };
    window.addEventListener("online", render);
    window.addEventListener("offline", render);
    render();
    return online => { serverOnline = online; render(); };
}

// 全螢幕遮罩（鎖定輸入、成績結算中）
export function overlay(html, className = "") {
    const el = document.createElement("div");
    el.className = `overlay ${className}`;
    el.innerHTML = html;
    el.hidden = true;
    document.body.appendChild(el);
    return show => { el.hidden = !show; };
}

export function openModal(id) { $(id).classList.add("open"); }
export function closeModal(id) { $(id).classList.remove("open"); }

// 有 data-close 屬性的按鈕會關掉所在的彈窗
document.addEventListener("click", e => {
    const btn = e.target.closest("[data-close]");
    if (btn) btn.closest(".modal, .map-modal")?.classList.remove("open");
    const mapBtn = e.target.closest("[data-open-map]");
    if (mapBtn) $("mapModal")?.classList.add("open");
});

export function stationFromUrl() {
    const n = parseInt(new URLSearchParams(location.search).get("station"), 10);
    return Number.isInteger(n) && n > 0 ? n : 1;
}
