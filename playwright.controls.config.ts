import { defineConfig, devices } from '@playwright/test';
import interfaceConfig from './playwright.interface.config';

export default defineConfig({
    ...interfaceConfig,
    grep: /controles personalizados|seletor de mês personalizado/,
    outputDir: 'test-results/controls',
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
});
