import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/interface',
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    reporter: 'list',
    outputDir: 'test-results/interface',
    use: {
        baseURL: 'http://localhost:3200',
        trace: 'off',
        screenshot: 'off',
        video: 'off',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'npm run dev -- --hostname localhost --port 3200',
        url: 'http://localhost:3200/login',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
            NEXT_PUBLIC_API_URL: 'http://localhost:3101/v2',
            NEXT_DIST_DIR: '.next-interface',
        },
    },
});
