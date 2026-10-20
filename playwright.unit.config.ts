import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/unit',
    outputDir: 'test-results/unit',
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: { trace: 'off', screenshot: 'off', video: 'off' },
});
