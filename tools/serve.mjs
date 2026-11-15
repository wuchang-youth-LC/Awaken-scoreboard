// 本機預覽用的小伺服器（ES module 不能直接雙擊 html 開啟）
// 用法：node tools/serve.mjs  →  http://localhost:5179
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 5179);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(data);
    });
}).listen(port, () => console.log(`http://localhost:${port}`));
