import { defineConfig, devices } from '@playwright/test';
import { apiDirectory, testDatabaseUrl } from './tests/support/environment';

const webUrl = 'http://localhost:3100';
const apiUrl = 'http://localhost:3101/v2';
const prebuilt = process.env.E2E_PREBUILT === '1';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    reporter: 'list',
    outputDir: 'test-results',
    use: {
        baseURL: webUrl,
        // Creator and recipient journeys both handle invitation secrets.
        trace: 'off',
        screenshot: 'off',
        video: 'off',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: [
        {
            command: prebuilt
                ? 'npm run migration:run && npm run start:prod'
                : 'npm run build && npm run migration:run && npm run start:prod',
            cwd: apiDirectory,
            url: `${apiUrl}/auth/me`,
            reuseExistingServer: false,
            timeout: 180_000,
            env: {
                NODE_ENV: 'test',
                PORT: '3101',
                DATABASE_URL: testDatabaseUrl,
                WEB_ORIGIN: webUrl,
                CSRF_SECRET: 'csrf-secret-exclusivo-dos-testes-web',
                SESSION_TTL_SECONDS: '604800',
            },
        },
        {
            command: prebuilt
                ? 'npm run start -- --hostname localhost --port 3100'
                : 'npm run build && npm run start -- --hostname localhost --port 3100',
            url: `${webUrl}/login`,
            reuseExistingServer: false,
            timeout: 180_000,
            env: {
                NODE_ENV: 'production',
                NEXT_PUBLIC_API_URL: apiUrl,
                NEXT_DIST_DIR: '.next-e2e',
            },
        },
    ],
});
