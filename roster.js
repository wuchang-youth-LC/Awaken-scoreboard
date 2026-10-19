// 工作人員名單的共用邏輯（不連資料庫，可以測試）
// 名單存在 staff/{key}：D2 第 3 關是 "d2_3"、D3 第 2 關是 "d3_2"、NPC 是 "npc"

export const ROLES = {
    d2: { label: "D2 關主", page: "admin.html" },
    d3: { label: "D3 關主", page: "admin_2.html" },
    npc: { label: "NPC", page: "npc.html" }
};

export function rosterKey(role, station) {
    return role === "npc" ? "npc" : `${role}_${station}`;
}

// 名字比對前先整理：去掉前後空白、中間多餘空白
export function normalizeName(name) {
    return String(name ?? "").trim().replace(/\s+/g, " ");
}

// 總控台輸入的名單：逗號、頓號、換行都可以分隔，重複的只留一個
export function parseNames(text) {
    const names = String(text ?? "").split(/[,，、\n\r]+/).map(normalizeName).filter(Boolean);
    return [...new Set(names)];
}

export function sessionMatches(session, role, station) {
    if (!session || session.role !== role) return false;
    return role === "npc" || session.station === station;
}

export function sessionLabel(session) {
    if (!session) return "";
    const role = ROLES[session.role]?.label || session.role;
    return session.role === "npc" ? `${role}・${session.name}` : `${role}・第 ${session.station} 關・${session.name}`;
}
