import { expect, test } from '@playwright/test';
import { ESLint } from 'eslint';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

for (const mode of ['directory', 'glob-array'] as const) {
    test(`preserva a regra de navegação do Next com rootDir ${mode}`, async ({}, testInfo) => {
        const apps = testInfo.outputPath('apps');
        const root = path.join(apps, 'web');
        const route = path.join(root, 'pages');
        await mkdir(route, { recursive: true });
        await writeFile(
            path.join(route, 'security-fixture.tsx'),
            'export default function Page() { return null; }',
        );

        const rootDir =
            mode === 'directory'
                ? root
                : [path.join(apps, '*').replace(/\\/g, '/')];
        const eslint = new ESLint({
            overrideConfig: { settings: { next: { rootDir } } },
        });
        const [internal] = await eslint.lintText(
            'export default function Page() { return <a href="/security-fixture">Abrir</a>; }',
            { filePath: 'src/security-fixture.tsx' },
        );
        expect(
            internal.messages.some(
                ({ ruleId }) => ruleId === '@next/next/no-html-link-for-pages',
            ),
        ).toBe(true);

        const [external] = await eslint.lintText(
            'export default function Page() { return <a href="https://example.com">Abrir</a>; }',
            { filePath: 'src/security-fixture.tsx' },
        );
        expect(external.errorCount).toBe(0);
    });
}
