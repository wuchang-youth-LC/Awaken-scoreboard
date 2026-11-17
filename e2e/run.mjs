// 一鍵執行：啟動 Firebase 模擬器 → 跑全部瀏覽器測試 → 關掉模擬器
// 用法（在 e2e 資料夾）：npm test
//       只跑電腦版：npm test -- --project=電腦
//       只跑某個檔案：npm test -- tests/station.spec.js
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// Firebase 模擬器需要 Java；沒有設定 JAVA_HOME 時，自動找 winget 裝的 Microsoft OpenJDK
const env = { ...process.env };
if (!env.JAVA_HOME) {
    const base = "C:\\Program Files\\Microsoft";
    const jdk = fs.existsSync(base) && fs.readdirSync(base).find(d => d.startsWith("jdk-"));
    if (jdk) env.JAVA_HOME = path.join(base, jdk);
}
if (env.JAVA_HOME) env.PATH = `${path.join(env.JAVA_HOME, "bin")}${path.delimiter}${env.PATH}`;

fs.rmSync(path.join(here, "screenshots"), { recursive: true, force: true });

const extra = process.argv.slice(2).map(a => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
const inner = `cd e2e && npx playwright test ${extra}`.trim();
const command = `firebase emulators:exec --only auth,firestore --project demo-awaken "${inner.replace(/"/g, '\\"')}"`;
const result = spawnSync(command, { cwd: root, env, stdio: "inherit", shell: true });

console.log(result.status === 0
    ? "\n全部通過。截圖在 e2e/screenshots/，詳細報告：npm run report"
    : "\n有測試沒通過。詳細報告（含失敗時的截圖與操作錄影）：npm run report");
process.exit(result.status ?? 1);
