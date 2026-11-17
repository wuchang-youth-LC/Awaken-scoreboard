// 總控台
import { test, expect, seedBase, setDocument, getDocument, listDocuments, adminLogin, expectNoErrors, NAMES } from "../helpers.js";

test.beforeEach(async () => { await seedBase(); });

const teamRow = (page, team) => page.locator("#tableBody tr").filter({ has: page.locator(".sticky-1", { hasText: new RegExp(`^${team}$`) }) });

test("密碼錯誤進不去", async ({ page }) => {
    await page.goto("/super_dashboard.html");
    await page.locator(".gate input[name=email]").fill("admin@e2e.test");
    await page.locator(".gate input[name=password]").fill("wrong-password");
    await page.locator(".gate button[type=submit]").click();
    await expect(page.locator(".gate .gate-error")).toContainText("帳號或密碼錯誤");
});

test("大地分數要按「公布」才算進正式總分", async ({ page }) => {
    await setDocument("records_game/r1", { game: "d2", station: 1, round: 1, teams: ["第1隊"], result: { level: 0 }, likes: { "第1隊": 2 }, by: NAMES.d2, createdAt: Date.now() });
    await setDocument("records_bonus/b1", { team: "第1隊", reason: "7/2_晚會", val: 30, npc: NAMES.npc, timestamp: Date.now() });
    await adminLogin(page);

    const row = teamRow(page, "第1隊");
    await expect(row.locator(".sticky-2")).toHaveText("30");
    await expect(row.locator("td.pending", { hasText: "(120)" })).toBeVisible();
    await expect(page.locator("#publishNotice")).toBeVisible();

    await page.locator('.tab[data-tab="d2-panel"]').click();
    await page.locator('#d2-panel [data-act="publish"]').click();
    await expect(page.locator('#d2-panel [data-act="publish"]')).toHaveText("取消公布");

    await page.locator('.tab[data-tab="score-panel"]').click();
    await expect(row.locator(".sticky-2")).toHaveText("150");
    expect((await getDocument("settings_global/global")).games.d2.published).toBe(true);
    expectNoErrors(page);
});

test("各關狀態總覽顯示哪一關有人", async ({ page }) => {
    await setDocument("state/live", { active: { d2: { 3: { teams: ["第4隊"], by: "某關主" } } } });
    await adminLogin(page);
    await page.locator('.tab[data-tab="d2-panel"]').click();
    const tile = page.locator('#d2-panel .st-tile[data-pick="3"]');
    await expect(tile).toHaveClass(/busy/);
    await expect(tile).toContainText("第4隊");
    await expect(page.locator("#d2-panel .st-tile.busy")).toHaveCount(1);
});

test("設定關卡：名稱、類型、分數", async ({ page }) => {
    await adminLogin(page);
    await page.locator('.tab[data-tab="d2-panel"]').click();
    await page.locator('#d2-panel [data-act="settings"]').click();

    const row = () => page.locator('#game_station_rows [data-st="2"]');
    await row().locator('[data-f="type"]').selectOption("versus");
    await row().locator('[data-f="name"]').fill("拔河");
    await row().locator('[data-f="teams"]').fill("4");
    await row().locator('[data-f="points"]').fill("120, 80, 40, 10");
    await page.locator("#game_save").click();
    await expect(page.locator("#modal_game")).toBeHidden();

    const st = (await getDocument("settings_global/global")).games.d2.stations["2"];
    expect(st).toMatchObject({ name: "拔河", type: "versus", teamsPerMatch: 4, rankPts: [120, 80, 40, 10] });
    // 第 1 關原本的設定沒有被蓋掉
    expect((await getDocument("settings_global/global")).games.d2.stations["1"].name).toBe("接力投球");
});

test("新增、修改、刪除、復原大地紀錄", async ({ page }) => {
    await adminLogin(page);
    await page.locator('.tab[data-tab="d2-panel"]').click();
    await page.locator('#d2-panel [data-act="add"]').click();
    await page.locator('#record_fields select[data-team="0"]').selectOption("第6隊");
    await page.locator('#record_fields select[data-level]').selectOption("0");
    await page.locator("#record_save").click();
    await expect(page.locator("#d2-panel .rec-table tbody tr")).toHaveCount(1);
    await expect(page.locator("#d2-panel .rec-table tbody")).toContainText("第6隊");

    await page.locator("#d2-panel [data-del]").click();
    await expect(page.locator("#d2-panel .rec-table tbody")).toContainText("還沒有紀錄");
    await page.locator('#d2-panel [data-act="showDeleted"]').check();
    await page.locator("#d2-panel [data-restore]").click();
    await page.locator('#d2-panel [data-act="showDeleted"]').uncheck();
    await expect(page.locator("#d2-panel .rec-table tbody")).toContainText("第6隊");

    // 新增、刪除、復原都有修改紀錄
    expect(await listDocuments("audit")).toHaveLength(3);
});

test("儲存工作人員名單後，新名字可以登入", async ({ page, browser }) => {
    await adminLogin(page);
    await page.locator('.tab[data-tab="staff-panel"]').click();
    await page.locator('[data-roster="d2_2"]').fill("新關主");
    await page.locator("#saveRosterBtn").click();
    await expect.poll(async () => (await getDocument("staff/d2_2"))?.names).toEqual(["新關主"]);

    const other = await (await browser.newContext(test.info().project.use)).newPage();
    await other.goto("/station.html?game=d2&station=2");
    await other.locator(".gate input[name=name]").fill("新關主");
    await other.locator(".gate button[type=submit]").click();
    await expect(other.locator(".gate")).toHaveCount(0);

    // 總控台看得到他登入了
    await expect(page.locator("#sessionList")).toContainText("新關主");
    await other.close();
});

test("練習模式開關與清空練習資料", async ({ page }) => {
    await setDocument("practice_records_game/p1", { game: "d2", station: 1, round: 1, teams: ["第1隊"], result: { level: 0 }, likes: {}, by: NAMES.d2, createdAt: Date.now() });
    await adminLogin(page);
    await page.locator('.tab[data-tab="setup-panel"]').click();
    await page.locator("#practiceOnBtn").click();
    await expect(page.locator("#practiceBar")).toBeVisible();

    await page.locator('.tab[data-tab="d2-panel"]').click();
    await expect(page.locator("#d2-panel .rec-table tbody")).toContainText("第1隊");

    await page.locator("#clearPracticeBtn").click();
    await expect(page.locator("#d2-panel .rec-table tbody")).toContainText("還沒有紀錄");
    await page.locator("#practiceOffBtn").click();
    await expect(page.locator("#practiceBar")).toBeHidden();
    await expect.poll(async () => (await getDocument("settings_global/global")).practiceMode).toBe(false);
});

test("學員頁的區塊開關", async ({ page, browser }) => {
    await adminLogin(page);
    await page.locator('.tab[data-tab="setup-panel"]').click();
    await page.locator("#student_stations").uncheck();
    await page.locator("#student_scores").uncheck();
    await page.locator("#saveStudentBtn").click();
    await expect.poll(async () => (await getDocument("settings_global/global")).student.scores).toBe(false);

    const student = await (await browser.newContext(test.info().project.use)).newPage();
    await student.goto("/");
    await expect(student.locator("#block-map")).toBeVisible();
    await expect(student.locator("#block-stations")).toBeHidden();
    await expect(student.locator("#block-scores")).toBeHidden();
    await student.close();
});
