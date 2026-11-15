// 靜態檢查：每個檔案 import 的名稱，在來源檔裡是否真的有 export（不用開瀏覽器）
import fs from "node:fs";
const files = fs.readdirSync(".").filter(f => f.endsWith(".js"));
let bad = 0;
for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/([^"]+)"/g)) {
        const target = fs.readFileSync(m[2], "utf8");
        const exported = new Set();
        for (const e of target.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) exported.add(e[1]);
        for (const e of target.matchAll(/export\s*\{([^}]*)\}/g)) e[1].split(",").forEach(n => exported.add(n.trim().split(/\s+as\s+/).pop()));
        for (const name of m[1].split(",").map(s => s.trim()).filter(Boolean)) {
            if (!exported.has(name)) { console.log(`${file}: ${m[2]} 沒有 export「${name}」`); bad++; }
        }
    }
}
console.log(bad ? `${bad} 個問題` : "import 都對得上");
process.exit(bad ? 1 : 0);
