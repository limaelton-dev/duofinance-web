import { expect, test, type Page } from '@playwright/test';

async function faviconBackground(page: Page) {
    return page.evaluate(async () => {
        const link =
            document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!link) throw new Error('Favicon ausente');
        const image = new Image();
        image.src = link.href;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0, 32, 32);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    });
}

test('marca e favicon acompanham sistema, escolha manual, navegação e recarga', async ({
    page,
}) => {
    await page.route('**/v2/auth/csrf', (route) =>
        route.fulfill({ json: { csrfToken: 'synthetic-csrf' } }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login');
    const logo = page.getByRole('img', { name: 'Junelo', exact: true });
    const icon = page.locator('head link[rel="icon"]');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(icon).toHaveCount(1);
    await expect.poll(() => faviconBackground(page)).toEqual([0, 0, 0, 255]);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(logo).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect
        .poll(() => faviconBackground(page))
        .toEqual([255, 255, 255, 255]);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.getByRole('button', { name: 'Aparência', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Aparência do Junelo' });
    await dialog.getByRole('radio', { name: 'Claro', exact: true }).check();
    await dialog.getByRole('button', { name: 'Concluir' }).click();
    await expect(logo).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect
        .poll(() => faviconBackground(page))
        .toEqual([255, 255, 255, 255]);
    await page.screenshot({
        path: test.info().outputPath('login-light-390.png'),
        fullPage: true,
        animations: 'disabled',
    });
    await page.getByRole('link', { name: /Criar conta/ }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(icon).toHaveCount(1);
    await expect
        .poll(() => faviconBackground(page))
        .toEqual([255, 255, 255, 255]);
    await page.reload();
    await expect(logo).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect
        .poll(() => faviconBackground(page))
        .toEqual([255, 255, 255, 255]);
    await page.getByRole('button', { name: 'Aparência', exact: true }).click();
    await dialog.getByRole('radio', { name: 'Escuro', exact: true }).check();
    await dialog.getByRole('button', { name: 'Concluir' }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(logo).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect.poll(() => faviconBackground(page)).toEqual([0, 0, 0, 255]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
        path: test.info().outputPath('register-dark-1440.png'),
        fullPage: true,
        animations: 'disabled',
    });
});

test('ícones de instalação e fallback são servidos com dimensões corretas', async ({
    page,
    request,
}) => {
    await page.goto('/login');
    const manifestUrl = await page
        .locator('head link[rel="manifest"]')
        .getAttribute('href');
    const response = await request.get(manifestUrl!);
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.name).toBe('Junelo');
    expect(manifest.short_name).toBe('Ju');
    expect(
        manifest.icons.filter(
            (icon: { purpose: string }) => icon.purpose === 'maskable',
        ),
    ).toHaveLength(2);
    const apple = await page
        .locator('head link[rel="apple-touch-icon"]')
        .getAttribute('href');
    for (const icon of [...manifest.icons, { src: apple, sizes: '180x180' }]) {
        const asset = await request.get(icon.src);
        expect(asset.ok()).toBe(true);
        expect(asset.headers()['content-type']).toContain('image/png');
        const buffer = await asset.body();
        expect(`${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`).toBe(
            icon.sizes,
        );
    }
    expect((await request.get('/favicon.ico')).ok()).toBe(true);
});
