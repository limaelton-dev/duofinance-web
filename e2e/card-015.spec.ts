import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import type { ExpenseResult } from '../src/features/finances/types/shared-expense';
import type { PersonalExpenseResult } from '../src/features/finances/types/personal-expense';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const setupUrl = 'http://127.0.0.1:3101/v2';
const origin = 'http://localhost:3100';
const password = 'uma-senha-forte-de-testes';
type Account = {
    id: string;
    personalId: string;
    email: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
let a: Account, b: Account, sharedId: string;

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
    const email = `${randomUUID()}@example.com`;
    const response = await post(api, '/auth/register', {
        displayName: name,
        email,
        password,
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    return {
        id: body.person.id,
        email,
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
        a = await register(owner, 'Pessoa A cartão');
        b = await register(member, 'Pessoa B cartão');
        const created = await post(owner, '/spaces', { name: 'Casa CARD 015' });
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

async function createCard(
    api: APIRequestContext,
    personal = true,
    description = `Compra ${randomUUID()}`,
) {
    const spaceId = personal ? a.personalId : sharedId;
    const options = await (
        await api.get(
            `${setupUrl}/spaces/${spaceId}/credit-card-purchase-options`,
        )
    ).json();
    const response = await post(
        api,
        `/spaces/${spaceId}/credit-card-purchases`,
        {
            description,
            amountInCents: 20000,
            factDate: '2026-01-01',
            externalLiability: personal
                ? {}
                : { holderMemberId: options.actorMemberId },
            ...(personal
                ? {}
                : {
                      expectedSpaceVersion: options.version,
                      responsibilitySplit: {
                          mode: 'AMOUNTS',
                          shares: options.members.map(
                              (m: { memberId: string }) => ({
                                  memberId: m.memberId,
                                  amountInCents: 10000,
                              }),
                          ),
                      },
                      expectedPayerMemberId: null,
                      settlement: { mode: 'NONE' },
                  }),
        },
    );
    expect(response.status()).toBe(201);
    return response.json() as Promise<PersonalExpenseResult | ExpenseResult>;
}
const history = (page: Page) =>
    page.getByRole('region', {
        name: 'Obrigações externas e liquidações',
        exact: true,
    });

test('A11: stale settlement options from A to B to A cannot replace the new context', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const value = await createCard(api);
    await api.dispose();
    await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (input, init) =>
            original(
                input,
                typeof input === 'string' &&
                    input.endsWith('/settlement-options')
                    ? { ...init, signal: undefined }
                    : init,
            );
    });
    let release!: () => void,
        captured!: () => void,
        delivered = false,
        count = 0;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const arrived = new Promise<void>((resolve) => {
        captured = resolve;
    });
    await page.route(
        `**/financial-commitments/${value.commitment.id}/external-liabilities/*/settlement-options`,
        async (route) => {
            if (++count > 1) return route.continue();
            const response = await route.fetch(),
                stale = await response.json();
            captured();
            await held;
            await route.fulfill({
                response,
                json: {
                    ...stale,
                    externalLiability: {
                        ...stale.externalLiability,
                        remainingAmountInCents: 1,
                    },
                    expectedCommitmentVersion: 999,
                },
            });
            delivered = true;
        },
    );
    try {
        await open(
            page,
            context,
            a,
            `/spaces/${a.personalId}/expenses/${value.commitment.id}`,
        );
        await history(page)
            .getByRole('button', { name: 'Registrar pagamento', exact: true })
            .click();
        await arrived;
        await expect(
            form(page).getByText('Carregando opções de pagamento…'),
        ).toBeVisible();
        await page
            .getByRole('combobox', { name: 'Espaço atual', exact: true })
            .selectOption(sharedId);
        await expect(
            page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
        ).toHaveValue(sharedId);
        await page
            .getByRole('combobox', { name: 'Espaço atual', exact: true })
            .selectOption(a.personalId);
        await page.goto(
            `/spaces/${a.personalId}/expenses/${value.commitment.id}`,
        );
        await review(page);
        release();
        await expect.poll(() => delivered).toBe(true);
        await expect(form(page)).toContainText(
            'Saldo externo aberto: R$ 200,00',
        );
        await form(page)
            .getByRole('button', {
                name: 'Confirmar pagamento externo',
                exact: true,
            })
            .click();
        await expect(history(page)).toContainText(
            'Saldo externo aberto: R$ 140,00',
        );
    } finally {
        release();
    }
});
const form = (page: Page) =>
    page.getByRole('region', {
        name: 'Pagamento da obrigação externa',
        exact: true,
    });
async function review(page: Page, amount = '60,00') {
    await history(page)
        .getByRole('button', { name: 'Registrar pagamento', exact: true })
        .click();
    await form(page)
        .getByLabel('Valor do pagamento (R$)', { exact: true })
        .fill(amount);
    await form(page).getByLabel('Data do pagamento externo').fill('2026-01-02');
    await form(page)
        .getByRole('button', { name: 'Revisar pagamento', exact: true })
        .click();
}
async function pay(page: Page, amount = '60,00') {
    await review(page, amount);
    await form(page)
        .getByRole('button', {
            name: 'Confirmar pagamento externo',
            exact: true,
        })
        .click();
    await expect(
        history(page).getByText('Pagamento externo registrado.', {
            exact: true,
        }),
    ).toBeVisible();
}

test('A01/A10: personal list navigates to origin, partial/full payments preserve expense and completed history', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const value = await createCard(api);
    await open(page, context, a, `/spaces/${a.personalId}/finances`);
    await page
        .getByRole('link', {
            name: 'Obrigações externas em meu nome',
            exact: true,
        })
        .click();
    await page
        .getByRole('link', {
            name: `Ver despesa: ${value.commitment.description}`,
            exact: true,
        })
        .click();
    await pay(page);
    await expect(history(page)).toContainText(
        'Saldo externo aberto: R$ 140,00',
    );
    await expect(history(page)).toContainText(
        'Pagamentos diretos da despesa: R$ 0,00',
    );
    await expect(history(page)).toContainText(
        'Pagamentos posteriores ao credor externo: R$ 60,00',
    );
    await expect(
        page.getByRole('region', { name: 'Resumo da despesa', exact: true }),
    ).toContainText(/Pago ao credor do cartão\s*R\$\s*60,00/);
    await pay(page, '140,00');
    await expect(history(page)).toContainText('Obrigação externa quitada.');
    await expect(
        page.getByRole('region', { name: 'Resumo da despesa', exact: true }),
    ).toContainText(/Pago ao credor do cartão\s*R\$\s*200,00/);
    await expect(
        history(page).getByRole('button', {
            name: 'Registrar pagamento',
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(history(page).locator('ol > li')).toHaveCount(2);
    await page.reload();
    await expect(history(page).locator('ol > li')).toHaveCount(2);
    const detail = await (
        await api.get(
            `${setupUrl}/spaces/${a.personalId}/financial-commitments/${value.commitment.id}`,
        )
    ).json();
    expect(detail).toMatchObject({
        paidAmountInCents: 0,
        assumedAmountInCents: 20000,
        supportedAmountInCents: 20000,
        externalSettledAmountInCents: 20000,
        externalOutstandingAmountInCents: 0,
    });
    await history(page)
        .getByRole('link', { name: 'Ver obrigações externas em meu nome' })
        .click();
    await expect(
        page.getByRole('link', {
            name: `Ver despesa: ${value.commitment.description}`,
            exact: true,
        }),
    ).toHaveCount(0);
    await api.dispose();
});

test('A02/A05: shared holder pays; other member only reads and internal obligation stays unchanged', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const value = (await createCard(api, false)) as ExpenseResult;
    await open(
        page,
        context,
        a,
        `/spaces/${sharedId}/expenses/${value.commitment.id}`,
    );
    await pay(page);
    const after = await (
        await api.get(
            `${setupUrl}/spaces/${sharedId}/financial-commitments/${value.commitment.id}`,
        )
    ).json();
    expect(after.obligations).toEqual(value.obligations);
    expect(after.supportedAmountInCents).toBe(value.supportedAmountInCents);
    await context.clearCookies();
    await open(
        page,
        context,
        b,
        `/spaces/${sharedId}/expenses/${value.commitment.id}`,
    );
    await expect(history(page)).toContainText(
        'Saldo externo aberto: R$ 140,00',
    );
    await expect(history(page).locator('ol > li')).toHaveCount(1);
    await expect(
        history(page).getByRole('button', {
            name: 'Registrar pagamento',
            exact: true,
        }),
    ).toHaveCount(0);
    await history(page)
        .getByRole('link', { name: 'Ver obrigações externas em meu nome' })
        .click();
    await expect(
        page.getByRole('link', {
            name: `Ver despesa: ${value.commitment.description}`,
            exact: true,
        }),
    ).toHaveCount(0);
    await api.dispose();
});

test('A06/A11: invalid amount/date blocked; stale version refresh requires new review and confirmation', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const value = await createCard(api);
    const liability = value.externalLiabilities![0];
    const endpoint = `/spaces/${a.personalId}/financial-commitments/${value.commitment.id}/external-liabilities/${liability.id}`;
    await open(
        page,
        context,
        a,
        `/spaces/${a.personalId}/expenses/${value.commitment.id}`,
    );
    await review(page, '201,00');
    await expect(form(page).getByRole('alert')).toContainText(
        'saldo externo aberto',
    );
    await form(page).getByLabel('Valor do pagamento (R$)').fill('60,00');
    await form(page).getByLabel('Data do pagamento externo').fill('2099-01-01');
    await form(page)
        .getByRole('button', { name: 'Revisar pagamento', exact: true })
        .click();
    await expect(form(page).getByRole('alert')).toContainText('até hoje');
    await form(page).getByLabel('Data do pagamento externo').fill('2026-01-02');
    await form(page)
        .getByRole('button', { name: 'Revisar pagamento', exact: true })
        .click();
    expect(
        (
            await post(api, `${endpoint}/settlements`, {
                amountInCents: 2000,
                factDate: '2026-01-02',
                expectedCommitmentVersion: value.commitment.version,
            })
        ).status(),
    ).toBe(201);
    await form(page)
        .getByRole('button', {
            name: 'Confirmar pagamento externo',
            exact: true,
        })
        .click();
    await expect(form(page).getByRole('alert')).toBeVisible();
    await form(page)
        .getByRole('button', { name: 'Atualizar saldo e revisar' })
        .click();
    await expect(form(page)).toContainText('Saldo externo aberto: R$ 180,00');
    await expect(
        form(page).getByRole('button', {
            name: 'Confirmar pagamento externo',
            exact: true,
        }),
    ).toHaveCount(0);
    await form(page)
        .getByRole('button', { name: 'Revisar pagamento', exact: true })
        .click();
    await form(page)
        .getByRole('button', {
            name: 'Confirmar pagamento externo',
            exact: true,
        })
        .click();
    await expect(history(page)).toContainText(
        'Saldo externo aberto: R$ 120,00',
    );
    await expect(history(page).locator('ol > li')).toHaveCount(2);
    await api.dispose();
});

test('A07/A11: double submission and lost response recover exactly the same payment', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const value = await createCard(api);
    await api.dispose();
    const attempts: {
        key: string;
        body: string | null;
        result: { replayed: boolean; settlement: { id: string } };
    }[] = [];
    await page.route(
        `**/financial-commitments/${value.commitment.id}/external-liabilities/*/settlements`,
        async (route) => {
            const response = await route.fetch();
            expect(response.status()).toBe(attempts.length === 0 ? 201 : 200);
            attempts.push({
                key: route.request().headers()['idempotency-key'],
                body: route.request().postData(),
                result: await response.json(),
            });
            if (attempts.length === 1) await route.abort('failed');
            else await route.fulfill({ response });
        },
    );
    await open(
        page,
        context,
        a,
        `/spaces/${a.personalId}/expenses/${value.commitment.id}`,
    );
    await review(page);
    await form(page)
        .getByRole('button', {
            name: 'Confirmar pagamento externo',
            exact: true,
        })
        .evaluate((button: HTMLButtonElement) => {
            button.click();
            button.click();
        });
    await expect(form(page).getByRole('alert')).toContainText(
        'confirmar o resultado',
    );
    await expect(
        form(page).getByLabel('Valor do pagamento (R$)'),
    ).toBeDisabled();
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toBeDisabled();
    expect(attempts).toHaveLength(1);
    await form(page)
        .getByRole('button', { name: 'Reenviar a mesma tentativa' })
        .click();
    await expect(history(page).locator('ol > li')).toHaveCount(1);
    await expect(history(page)).toContainText(
        'A tentativa original foi recuperada.',
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1].key).toBe(attempts[0].key);
    expect(attempts[1].body).toBe(attempts[0].body);
    expect(attempts[1].result.replayed).toBe(true);
    expect(attempts[1].result.settlement.id).toBe(
        attempts[0].result.settlement.id,
    );
});

test('A10: list loading/error recovery and pagination preserve navigable origins', async ({
    page,
    context,
}) => {
    let count = 0;
    await page.route(
        `**/spaces/${a.personalId}/external-liabilities*`,
        async (route) => {
            count++;
            if (count === 1)
                return route.fulfill({
                    status: 500,
                    json: { code: 'INTERNAL_ERROR', message: 'Indisponível' },
                });
            const second = route.request().url().includes('cursor=');
            await route.fulfill({
                json: {
                    spaceId: a.personalId,
                    spaceType: 'PERSONAL',
                    canSettle: true,
                    referenceDate: '2026-10-15',
                    items: second
                        ? []
                        : [
                              {
                                  commitmentId: randomUUID(),
                                  commitmentVersion: 1,
                                  description: 'Origem paginada',
                                  externalLiability: {
                                      id: randomUUID(),
                                      amountInCents: 20000,
                                      remainingAmountInCents: 14000,
                                      factDate: '2026-01-01',
                                  },
                              },
                          ],
                    nextCursor: second ? null : 'next +',
                },
            });
        },
    );
    await open(
        page,
        context,
        a,
        `/spaces/${a.personalId}/finances/external-liabilities`,
    );
    await expect(
        page
            .getByRole('alert')
            .filter({ hasText: 'consultar suas obrigações' }),
    ).toContainText('consultar suas obrigações');
    await page
        .getByRole('button', { name: 'Tentar novamente as obrigações' })
        .click();
    await expect(
        page.getByRole('link', { name: 'Ver despesa: Origem paginada' }),
    ).toHaveAttribute('href', /expenses\/.+#external-liability-/);
    await page
        .getByRole('button', { name: 'Próxima página de obrigações' })
        .click();
    await expect(
        page.getByText('Nenhuma obrigação externa aberta nesta página.'),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Atualizar / Voltar ao início' })
        .click();
    await expect(
        page.getByRole('link', { name: 'Ver despesa: Origem paginada' }),
    ).toBeVisible();
});

for (const status of [201, 401])
    test(`A11: external payment delayed ${status} after logout and same-person login cannot mutate the new session`, async ({
        page,
        context,
        playwright,
    }) => {
        const api = await playwright.request.newContext();
        const account = await register(api, `Sessão cartão ${status}`);
        const created = await post(
            api,
            `/spaces/${account.personalId}/credit-card-purchases`,
            {
                description: `Cartão na sessão anterior ${status}`,
                amountInCents: 10000,
                factDate: '2026-01-01',
                externalLiability: { amountInCents: 3000 },
            },
        );
        const body = await created.json();
        await api.dispose();
        await page.addInitScript(() => {
            const original = window.fetch;
            window.fetch = (input, init) =>
                original(
                    input,
                    typeof input === 'string' && input.endsWith('/settlements')
                        ? { ...init, signal: undefined }
                        : init,
                );
        });
        let release!: () => void,
            captured!: () => void,
            delivered = false;
        const held = new Promise<void>((resolve) => {
                release = resolve;
            }),
            arrived = new Promise<void>((resolve) => {
                captured = resolve;
            });
        await page.route(
            `**/financial-commitments/${body.commitment.id}/external-liabilities/*/settlements`,
            async (route) => {
                const response = await route.fetch();
                expect(response.status()).toBe(201);
                captured();
                await held;
                await route.fulfill(
                    status === 201
                        ? { response }
                        : {
                              status,
                              headers: {
                                  'Access-Control-Allow-Origin': origin,
                                  'Access-Control-Allow-Credentials': 'true',
                                  'Content-Type': 'application/json',
                              },
                              json: {
                                  code: 'UNAUTHENTICATED',
                                  message: 'Sessão anterior',
                              },
                          },
                );
                delivered = true;
            },
        );
        await open(
            page,
            context,
            account,
            `/spaces/${account.personalId}/expenses/${body.commitment.id}`,
        );
        const other = await context.newPage();
        try {
            await review(page, '20,00');
            await form(page)
                .getByRole('button', {
                    name: 'Confirmar pagamento externo',
                    exact: true,
                })
                .click();
            await arrived;
            await other.goto('/spaces');
            await other
                .getByRole('button', { name: 'Sair', exact: true })
                .click();
            await expect(other).toHaveURL('/login');
            await page.evaluate(() =>
                window.dispatchEvent(new Event('visibilitychange')),
            );
            await expect(page).toHaveURL('/login');
            await page
                .getByLabel('E-mail', { exact: true })
                .fill(account.email);
            await page.getByLabel('Senha', { exact: true }).fill(password);
            await page
                .getByRole('button', { name: 'Entrar', exact: true })
                .click();
            await page
                .getByRole('button', { name: 'Tentar novamente', exact: true })
                .click();
            await expect(
                page.getByRole('heading', { name: 'Hoje', exact: true }),
            ).toBeVisible();
            await page
                .getByRole('link', { name: 'Finanças', exact: true })
                .click();
            await expect(page).toHaveURL(
                `/spaces/${account.personalId}/finances`,
            );
            release();
            await expect.poll(() => delivered).toBe(true);
            await expect(
                page.getByText('Pagamento externo registrado.', {
                    exact: true,
                }),
            ).toHaveCount(0);
            await expect(
                page.getByRole('button', {
                    name: 'Reenviar a mesma tentativa',
                }),
            ).toHaveCount(0);
            await expect(page).toHaveURL(
                `/spaces/${account.personalId}/finances`,
            );
            await expect(
                page.getByRole('link', {
                    name: `Cartão na sessão anterior ${status}`,
                    exact: true,
                }),
            ).toHaveCount(1);
        } finally {
            release();
            await other.close();
        }
    });
