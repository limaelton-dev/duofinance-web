import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route('**/v2/auth/csrf', (route) =>
        route.fulfill({ json: { csrfToken: 'synthetic-csrf' } }),
    );
});

test('acesso mobile: valida no envio, associa erro e permite revelar a senha sem enviar', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 740 });
    let submissions = 0;
    await page.route('**/v2/auth/login', async (route) => {
        submissions++;
        await route.fulfill({
            status: 401,
            json: {
                code: 'INVALID_CREDENTIALS',
                message: 'E-mail ou senha inválidos.',
            },
        });
    });
    await page.goto('/login');
    await expect(
        page.getByRole('heading', { name: 'Entre na sua conta' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByLabel('E-mail', { exact: true })).toBeFocused();
    await expect(page.getByLabel('E-mail', { exact: true })).toHaveAttribute(
        'aria-describedby',
        'email-error',
    );
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();
    expect(submissions).toBe(0);

    await page.getByLabel('E-mail', { exact: true }).fill('pessoa@example.com');
    await page.getByLabel('Senha', { exact: true }).fill('senha-sintetica');
    await page
        .getByRole('button', { name: 'Mostrar senha', exact: true })
        .click();
    await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute(
        'type',
        'text',
    );
    await page
        .getByRole('button', { name: 'Ocultar senha', exact: true })
        .click();
    await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute(
        'type',
        'password',
    );
    expect(submissions).toBe(0);

    await page.getByLabel('Senha', { exact: true }).press('Enter');
    const error = page.getByRole('main').getByRole('alert');
    await expect(error).toHaveText('E-mail ou senha inválidos.');
    await expect(error).toBeFocused();
    await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue(
        'pessoa@example.com',
    );
    await expect(page.getByLabel('Senha', { exact: true })).toHaveValue(
        'senha-sintetica',
    );
    expect(submissions).toBe(1);
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
});

test('acesso respeita Retry-After e só repete a tentativa por ação explícita', async ({
    page,
}) => {
    await page.clock.install();
    let submissions = 0;
    await page.route('**/v2/auth/login', async (route) => {
        submissions++;
        await route.fulfill({
            status: 429,
            headers: {
                'Retry-After': '3',
                'Access-Control-Expose-Headers': 'Retry-After',
            },
            json: {
                code: 'TOO_MANY_REQUESTS',
                message:
                    'Muitas tentativas. Aguarde antes de tentar novamente.',
            },
        });
    });
    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill('pessoa@example.com');
    await page.getByLabel('Senha', { exact: true }).fill('senha-sintetica');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Tentar novamente' }),
    ).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Aguarde');
    await page.getByLabel('Senha', { exact: true }).press('Enter');
    expect(submissions).toBe(1);
    await page.clock.fastForward(3000);
    await expect(
        page.getByRole('button', { name: 'Tentar novamente' }),
    ).toBeEnabled();
    expect(submissions).toBe(1);
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect.poll(() => submissions).toBe(2);
});

test('cadastro mantém os valores e focaliza a confirmação de senha divergente', async ({
    page,
}) => {
    await page.goto('/register');
    await page.getByLabel('Nome', { exact: true }).fill('Pessoa');
    await page.getByLabel('E-mail', { exact: true }).fill('pessoa@example.com');
    await page.getByLabel('Senha', { exact: true }).fill('senha-sintetica');
    await page
        .getByLabel('Confirmar senha', { exact: true })
        .fill('outra-senha');
    await page
        .getByRole('button', { name: 'Criar conta', exact: true })
        .click();
    await expect(
        page.getByLabel('Confirmar senha', { exact: true }),
    ).toBeFocused();
    await expect(
        page.getByLabel('Confirmar senha', { exact: true }),
    ).toHaveAttribute('aria-describedby', 'confirmPassword-error');
    await expect(page.getByText('As senhas não coincidem.')).toBeVisible();
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(
        'Pessoa',
    );
});
