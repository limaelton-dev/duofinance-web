import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const setupUrl = 'http://127.0.0.1:3101/v2';
const origin = 'http://localhost:3100';
const password = 'uma-senha-forte-de-testes';
type Account = {
    id: string;
    personalId: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
let a: Account, sharedId: string;

async function post(api: APIRequestContext, path: string, data: object) {
    const csrf = await api.get(`${setupUrl}/auth/csrf`);
    expect(csrf.status()).toBe(200);
    return api.post(`${setupUrl}${path}`, {
        headers: {
            Origin: origin,
            'X-CSRF-Token': (await csrf.json()).csrfToken,
            'Idempotency-Key': randomUUID(),
        },
        data,
    });
}
async function register(
    api: APIRequestContext,
    name: string,
): Promise<Account> {
    const response = await post(api, '/auth/register', {
        displayName: name,
        email: `${randomUUID()}@example.com`,
        password,
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    return {
        id: body.person.id,
        personalId: body.personalSpace.id,
        state: await api.storageState(),
    };
}
async function open(
    page: Page,
    context: BrowserContext,
    account: Account,
    path: string,
) {
    await context.addCookies(
        account.state.cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    );
    await page.goto(`/spaces/${account.personalId}`);
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(account.personalId);
    const destination = path.split('/')[2];
    if (destination !== account.personalId) {
        await page
            .getByRole('combobox', { name: 'Espaço atual', exact: true })
            .selectOption(destination);
        await expect(
            page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
        ).toHaveValue(destination);
    }
    await page.goto(path);
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(path.split('/')[2]);
}

test.beforeAll(async ({ playwright }) => {
    const owner = await playwright.request.newContext(),
        member = await playwright.request.newContext();
    try {
        a = await register(owner, 'Pessoa A receita');
        await register(member, 'Pessoa B receita');
        const created = await post(owner, '/spaces', { name: 'Casa CARD 012' });
        expect(created.status()).toBe(201);
        const value = await created.json();
        sharedId = value.space.id;
        const token = new URLSearchParams(
            new URL(value.inviteUrl).hash.slice(1),
        ).get('token');
        expect(
            (
                await post(member, '/invitations/respond', {
                    token,
                    decision: 'ACCEPT',
                    expectedVersion: value.space.version,
                })
            ).status(),
        ).toBe(200);
    } finally {
        await owner.dispose();
        await member.dispose();
    }
});

test('personal forecast, later receipt, refresh and Today', async ({
    page,
    context,
}) => {
    await open(page, context, a, `/spaces/${a.personalId}/incomes/new`);
    await expect(
        page.getByRole('heading', { name: 'Adicionar receita' }),
    ).toBeVisible();
    await page.getByLabel('Descrição').fill('Salário futuro');
    await page.getByLabel('Valor total (R$)').fill('1.000,00');
    await page.getByLabel('Ainda não').check();
    await page.getByRole('button', { name: 'Revisar receita' }).click();
    await page.getByRole('button', { name: 'Confirmar receita' }).click();
    await expect(
        page.getByRole('heading', { name: 'Receita registrada' }),
    ).toBeVisible();
    await page.goto('/');
    await expect(
        page.getByRole('heading', { name: 'Próximos compromissos' }),
    ).toBeVisible();
    await expect(
        page.getByRole('link', { name: 'Salário futuro' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Salário futuro' }).click();
    await expect(page).toHaveURL(
        new RegExp(`/spaces/${a.personalId}/incomes/[a-f0-9-]+$`),
    );
    await expect(
        page.getByRole('heading', { name: 'Salário futuro' }),
    ).toBeVisible();
    await expect(page.getByText('Recebimento pendente.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Recebimento pendente.')).toBeVisible();
    await page.getByRole('button', { name: 'Revisar recebimento' }).click();
    await page.getByRole('button', { name: 'Confirmar recebimento' }).click();
    await expect(
        page.getByText('Receita recebida integralmente.'),
    ).toBeVisible();
    await page.goto('/');
    await expect(
        page.getByRole('heading', { name: 'Próximos compromissos' }),
    ).toBeVisible();
    await expect(
        page.getByRole('link', { name: 'Salário futuro' }),
    ).toHaveCount(0);
    await page.goto(`/spaces/${a.personalId}/incomes`);
    await expect(page.getByText('Salário futuro')).toBeVisible();
    await expect(page.getByText('Recebido: R$ 1.000,00')).toBeVisible();
});

test('shared receipt shows correctly directed repass and income origin', async ({
    page,
    context,
}) => {
    await open(page, context, a, `/spaces/${sharedId}/incomes/new`);
    await page.getByLabel('Descrição').fill('Venda conjunta');
    await page.getByLabel('Valor total (R$)').fill('1.000,00');
    await page.getByLabel('Pessoa A receita (%)').fill('60');
    await page.getByLabel('Pessoa B receita (%)').fill('40');
    await page
        .getByLabel('Quem deve receber, se previsto')
        .selectOption({ label: 'Pessoa A receita' });
    await page.getByLabel('Sim, integralmente').check();
    await page
        .getByLabel('Quem recebeu de fato')
        .selectOption({ label: 'Pessoa B receita' });
    await page.getByRole('button', { name: 'Revisar receita' }).click();
    await page.getByRole('button', { name: 'Confirmar receita' }).click();
    await expect(
        page.getByText('Repasse de receita: R$ 600,00.'),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Ver receita', exact: true }).click();
    await expect(page.getByText(/deve repassar R\$ 600,00/)).toBeVisible();
    await page.goto(`/spaces/${sharedId}/finances`);
    await expect(
        page.getByRole('link', { name: 'Ver receita: Venda conjunta' }),
    ).toBeVisible();
    await page
        .getByRole('link', { name: 'Ver receita: Venda conjunta' })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Venda conjunta' }),
    ).toBeVisible();
});
