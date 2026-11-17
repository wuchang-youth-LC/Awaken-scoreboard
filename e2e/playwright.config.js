// 每個測試都在三種裝置各跑一次：電腦、iPhone（WebKit）、Android
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    workers: 1,               // 共用同一個模擬器資料庫，一次只跑一個
    fullyParallel: false,
    timeout: 45_000,
    expect: { timeout: 8_000 },
    reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
    outputDir: "test-results",
    use: {
        baseURL: "http://localhost:5190",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        locale: "zh-TW",
        timezoneId: "Asia/Taipei"
    },
    projects: [
        { name: "電腦", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 800 } } },
        { name: "iPhone", use: { ...devices["iPhone 13"] } },
        { name: "Android", use: { ...devices["Pixel 7"] } }
    ],
    webServer: {
        command: "node ../tools/serve.mjs 5190",
        url: "http://localhost:5190/staff.html",
        reuseExistingServer: true
    }
});
