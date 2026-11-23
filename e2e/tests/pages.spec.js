// 每一頁都能打開、沒有錯誤、沒有超出螢幕，並存一張截圖
import { test, expect, seedBase, setDocument, staffLogin, adminLogin, expectNoOverflow, expectNoErrors, snap, NAMES } from "../helpers.js";

test.beforeEach(async () => {
    await seedBase();
    await setDocument("records_game/r1", { game: "d2", station: 1, round: 1, teams: ["第1隊"], result: { level: 0 }, likes: { "第1隊": 2 }, by: NAMES.d2, createdAt: Date.now() });
    await setDocument("records_bonus/b1", { team: "第2隊", reason: "7/2_晚會", val: 30, npc: NAMES.npc, timestamp: Date.now() });
    await setDocument("state/live", { active: { d2: { 2: { teams: ["第3隊"], by: "某關主" } } } });
});

test("學員頁", async ({ page }, info) => {
    await page.goto("/");
    await expect(page.locator("#mapImg")).toBeVisible();
    await expect(page.locator("#stations .st-tile")).toHaveCount(4);
    await expect(page.locator("#stations .st-tile.busy")).toHaveCount(1);
    await expect(page.locator("#scores")).toContainText("第1隊");
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "學員頁");
});

test("工作人員入口", async ({ page }, info) => {
    await page.goto("/staff.html");
    await expect(page.locator("#d2 .entry")).toHaveCount(4);
    await expect(page.locator("#d3 .entry")).toHaveCount(3);
    await expect(page.locator("#d2 .entry").first()).toContainText("接力投球");
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "工作人員入口");
});

test("關主頁：登入畫面、空關、闖關中", async ({ page }, info) => {
    await page.goto("/station.html?game=d2&station=1");
    await expect(page.locator(".gate")).toBeVisible();
    await expectNoOverflow(page);
    await snap(page, info, "關主頁-登入");

    await staffLogin(page, "/station.html?game=d2&station=1", NAMES.d2);
    await expect(page.locator("#idleView")).toBeVisible();
    await expect(page.locator("#stationTitle")).toContainText("接力投球");
    await expectNoOverflow(page);
    await snap(page, info, "關主頁-空關");

    await page.locator("#startBtn").click();
    await expect(page.locator("#activeView")).toBeVisible();
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "關主頁-闖關中");
});

test("關主頁：兩隊對抗", async ({ page }, info) => {
    await staffLogin(page, "/station.html?game=d3&station=1", NAMES.d3);
    await page.locator("#startBtn").click();
    await expect(page.locator("#resultInput button[data-win]")).toHaveCount(3);
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "關主頁-對抗");
});

test("場內加分頁", async ({ page }, info) => {
    await staffLogin(page, "/npc.html", NAMES.npc);
    await expect(page.locator("#teamGrid button")).toHaveCount(6);
    await expect(page.locator("#history")).toContainText("第2隊");
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "場內加分");
});

test("總控台：每個分頁", async ({ page }, info) => {
    await adminLogin(page);
    for (const [tab, name] of [["score-panel", "總積分"], ["d2-panel", "D2"], ["d3-panel", "D3"], ["bonus-panel", "加分紀錄"], ["staff-panel", "工作人員"], ["setup-panel", "設定"]]) {
        await page.locator(`.tab[data-tab="${tab}"]`).click();
        await expect(page.locator(`#${tab}`)).toBeVisible();
        await expectNoOverflow(page);
        await snap(page, info, `總控台-${name}`);
    }
    await page.locator('.tab[data-tab="d2-panel"]').click();
    await page.locator('#d2-panel [data-act="settings"]').click();
    await expect(page.locator("#modal_game")).toBeVisible();
    await snap(page, info, "總控台-關卡設定");
    expectNoErrors(page);
});

test("學員頁：我的隊伍、關卡說明", async ({ page }, info) => {
    await setDocument("settings_global/global", {
        numTeams: 6,
        games: { d2: { numStations: 4, stations: { 1: { name: "接力投球", place: "籃球場", desc: "四人接力，最後一人投進籃框才算過關", type: "solo", levels: [{ label: "過關", pts: 100 }] } } } },
        student: { game: "d2", map: false, stations: false, scores: true, desc: true, myTeam: true }
    });
    await page.goto("/");
    await expect(page.locator("#block-map")).toBeHidden();
    await expect(page.locator("#myTeam")).toContainText("先在右上方選你是第幾隊");
    await page.locator("#myTeamSelect").selectOption("第1隊");
    await expect(page.locator("#myTeam .my-summary")).toContainText("120");
    await expect(page.locator("#myTeam .my-stations span.done")).toHaveCount(1);
    await expect(page.locator("#scores .mine")).toContainText("第1隊");
    await expect(page.locator("#descList")).toContainText("四人接力");

    // 重新整理後手機還記得是哪一隊
    await page.reload();
    await expect(page.locator("#myTeamSelect")).toHaveValue("第1隊");
    await expectNoOverflow(page);
    expectNoErrors(page);
    await snap(page, info, "學員頁-我的隊伍與說明");
});

test("列印關卡牌", async ({ page }, info) => {
    await page.goto("/print.html?game=d2");
    await expect(page.locator("#signs .sign")).toHaveCount(5);   // 4 關 + 工作人員入口
    await expect(page.locator("#signs .sign").first()).toContainText("接力投球");
    await expect(page.locator("#signs .sign").first()).toContainText("籃球場");
    await expect(page.locator("#qr img, #qr canvas").first()).toBeAttached();

    await page.locator("#staffPage").uncheck();
    await expect(page.locator("#signs .sign")).toHaveCount(4);
    await page.locator("#gameSelect").selectOption("d3");
    await expect(page.locator("#signs .sign")).toHaveCount(3);
    await expect(page.locator("#signs .sign").first()).toContainText("多隊對抗・2 隊");
    expectNoErrors(page);

    // 列印時的版面：一關一頁，控制列不會印出來
    await page.locator("#gameSelect").selectOption("d2");
    await page.locator("#staffPage").check();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".controls")).toBeHidden();
    await snap(page, info, "列印關卡牌");
});

test("總控台有列印關卡牌的入口", async ({ page }) => {
    await adminLogin(page);
    await page.locator('.tab[data-tab="d3-panel"]').click();
    await expect(page.locator('#d3-panel a[href="print.html?game=d3"]')).toBeVisible();
});
