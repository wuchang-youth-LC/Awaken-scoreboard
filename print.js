// 列印關卡牌：print.html?game=d2
// 一關一張 A4 橫式，最後可以加一張工作人員入口的 QR code（關主訓時掃描用）
import { watchSettings } from "./firebase.js";
import { GAME_IDS, GAME_LABELS, GAME_TYPES, gameConfig } from "./games.js";
import { CAMP } from "./config.js";
import { $, esc } from "./ui.js";

const params = new URLSearchParams(location.search);
let game = GAME_IDS.includes(params.get("game")) ? params.get("game") : "d2";
let settings = null;
const staffUrl = new URL("staff.html", location.href).href;

$("gameSelect").value = game;
$("gameSelect").addEventListener("change", e => {
    game = e.target.value;
    history.replaceState(null, "", `?game=${game}`);
    render();
});
$("staffPage").addEventListener("change", render);
$("printBtn").addEventListener("click", () => window.print());

const typeText = cfg => {
    const t = GAME_TYPES[cfg.type].label;
    return cfg.type === "solo" ? t : `${t}・${cfg.teamsPerMatch} 隊`;
};

function render() {
    if (!settings) return;
    const g = gameConfig(settings, game);
    const signs = Object.keys(g.stations).map(Number).map(st => {
        const cfg = g.stations[st];
        return `
            <section class="sign">
                <header>
                    <img src="assets/logo-awaken.png" alt="AWAKEN">
                    <span class="game">${GAME_LABELS[game]} 大地遊戲</span>
                </header>
                <div class="body">
                    <div class="no"><small>第</small>${st}<small>關</small></div>
                    <div class="info">
                        <h2>${esc(cfg.name || typeText(cfg))}</h2>
                        ${cfg.place ? `<p class="place">${esc(cfg.place)}</p>` : ""}
                        ${cfg.name ? `<p class="type">${esc(typeText(cfg))}</p>` : ""}
                    </div>
                </div>
                <footer>${CAMP.year} ${esc(CAMP.title)}</footer>
            </section>`;
    });

    if ($("staffPage").checked) {
        signs.push(`
            <section class="sign staff-sign">
                <header>
                    <img src="assets/logo-awaken.png" alt="AWAKEN">
                    <span class="game">工作人員入口</span>
                </header>
                <div class="body">
                    <div class="qr" id="qr"></div>
                    <div class="info">
                        <h2>關主、計分組、牧者</h2>
                        <p class="place">用手機相機掃描 QR code<br>選自己的關卡，輸入名字就能開始</p>
                        <p class="url">${esc(staffUrl)}</p>
                    </div>
                </div>
                <footer>${CAMP.year} ${esc(CAMP.title)}</footer>
            </section>`);
    }

    $("signs").innerHTML = signs.join("");
    drawQr();
}

// QR code 的套件是另外載入的；載入失敗（例如沒網路）時，還有網址可以看
function drawQr() {
    const box = $("qr");
    if (!box) return;
    if (!window.QRCode) {
        box.innerHTML = `<p class="qr-missing">QR code 載入中…</p>`;
        setTimeout(drawQr, 500);
        return;
    }
    box.innerHTML = "";
    new window.QRCode(box, { text: staffUrl, width: 512, height: 512, correctLevel: window.QRCode.CorrectLevel.M });
}

watchSettings(s => { settings = s; render(); });
