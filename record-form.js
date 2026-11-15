// 大地遊戲紀錄的表單欄位：依關卡類型產生「隊伍、結果、讚」
// 總控台的新增 / 編輯視窗在用
import { esc, teamOptions } from "./ui.js";
import { teamList } from "./scoring.js";

// cfg：這一關的設定；g：這一場的設定；rec：要編輯的紀錄（新增時不用給）
export function recordFormHtml(cfg, g, numTeams, rec = {}) {
    const all = teamList(numTeams);
    const teams = Array.from({ length: cfg.teamsPerMatch }, (_, i) => rec.teams?.[i] || all[i % all.length]);
    const many = cfg.teamsPerMatch > 1;

    const teamFields = teams.map((t, i) => `
        <div class="field">
            <label class="label">${many ? `隊伍 ${i + 1}` : "隊伍"}</label>
            <select data-team="${i}">${teamOptions(numTeams, t)}</select>
        </div>`).join("");

    let resultFields;
    if (cfg.type === "versus") {
        resultFields = teams.map((_, i) => `
            <div class="field">
                <label class="label">隊伍 ${i + 1} 名次</label>
                <select data-rank="${i}">${teams.map((__, r) =>
                    `<option value="${r + 1}"${(rec.result?.ranks?.[i] ?? i + 1) === r + 1 ? " selected" : ""}>第 ${r + 1} 名</option>`).join("")}</select>
            </div>`).join("");
    } else {
        const cur = rec.result?.level;
        const none = cfg.type === "solo" ? "未過關" : "未達成";
        resultFields = `
            <div class="field">
                <label class="label">結果</label>
                <select data-level>
                    ${cfg.levels.map((l, i) => `<option value="${i}"${cur === i ? " selected" : ""}>${esc(l.label)}（${l.pts} 分）</option>`).join("")}
                    <option value=""${cur === null ? " selected" : ""}>${none}（0 分）</option>
                </select>
            </div>`;
    }

    const likeFields = g.maxLikes > 0 ? teams.map((t, i) => `
        <div class="field">
            <label class="label">${many ? `隊伍 ${i + 1} 的讚` : "讚"}</label>
            <input type="number" min="0" max="${g.maxLikes}" data-like="${i}" value="${rec.likes?.[t] || 0}">
        </div>`).join("") : "";

    return `
        <div class="row">${teamFields}</div>
        <div class="row">${resultFields}</div>
        ${likeFields ? `<div class="row">${likeFields}</div>` : ""}
        ${cfg.type === "versus" ? `<p class="hint">平手就把並列的隊伍選成同一個名次。</p>` : ""}`;
}

export function readRecordForm(root, cfg, g) {
    const teams = [...root.querySelectorAll("[data-team]")].map(el => el.value);
    const result = cfg.type === "versus"
        ? { ranks: [...root.querySelectorAll("[data-rank]")].map(el => parseInt(el.value, 10)) }
        : { level: root.querySelector("[data-level]").value === "" ? null : parseInt(root.querySelector("[data-level]").value, 10) };
    const likes = {};
    root.querySelectorAll("[data-like]").forEach(el => {
        const n = Math.min(Math.max(parseInt(el.value, 10) || 0, 0), g.maxLikes);
        if (n > 0) likes[teams[el.dataset.like]] = n;
    });
    return { teams, result, likes };
}
