import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import type { ExpenseResult } from '../../src/features/finances/types/shared-expense';
import type { PersonalExpenseResult } from '../../src/features/finances/types/personal-expense';

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
        await register(member, 'Pessoa B cartão');
        const created = await post(owner, '/spaces', { name: 'Casa CARD 014' });
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

async function start(
    page: Page,
    context: BrowserContext,
    personal = true,
    amount = '200,00',
    assumed?: string,
) {
    await open(
        page,
        context,
        a,
        `/spaces/${personal ? a.personalId : sharedId}/expenses/new`,
    );
    await page
        .getByLabel('Descrição', { exact: true })
        .fill(`Compra ${randomUUID()}`);
    await page.getByLabel('Valor (R$)', { exact: true }).fill(amount);
    await page
        .getByLabel('Forma de pagamento', { exact: true })
        .selectOption('CREDIT_CARD');
    await expect(
        page.getByLabel('Valor assumido no cartão (R$)', { exact: true }),
    ).toBeEnabled();
    if (assumed)
        await page
            .getByLabel('Valor assumido no cartão (R$)', { exact: true })
            .fill(assumed);
}
async function saveCard(
    page: Page,
): Promise<ExpenseResult | PersonalExpenseResult> {
    const response = page.waitForResponse(
        (r) =>
            r.url().endsWith('/credit-card-purchases') &&
            r.request().method() === 'POST',
    );
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
    const http = await response;
    expect(http.status()).toBe(201);
    await expect(
        page.getByRole('heading', { name: 'Despesa registrada', exact: true }),
    ).toBeVisible();
    return http.json();
}
async function addCard(page: Page, amount: string, holder?: string) {
    const form = page.getByRole('region', {
        name: 'Nova compra no cartão',
        exact: true,
    });
    await form
        .getByLabel('Valor assumido no cartão (R$)', { exact: true })
        .fill(amount);
    if (holder)
        await form
            .getByLabel('De quem é o cartão?')
            .selectOption({ label: holder });
    await form
        .getByRole('button', { name: 'Revisar compra no cartão', exact: true })
        .click();
    await form
        .getByRole('button', {
            name: 'Confirmar compra no cartão',
            exact: true,
        })
        .click();
}
async function detail(page: Page) {
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await expect(
        page.getByRole('region', {
            name: /Histórico de (pagamentos|realizações)/,
        }),
    ).toBeVisible();
}

test('A03/A24: personal card is economic fulfillment without cash or shared controls, survives refresh and history', async ({
    page,
    context,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, context);
    await expect(page.getByLabel('De quem é o cartão?')).toHaveCount(0);
    await expect(page.getByLabel('Divisão', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Acerto', { exact: true })).toHaveCount(0);
    await expect(
        page.getByRole('complementary', {
            name: 'Resumo da despesa',
            exact: true,
        }),
    ).toContainText('Saiu da conta agora: R$ 0,00');
    const result = await saveCard(page);
    expect(result.disbursement).toBeNull();
    expect(result.disbursements).toEqual([]);
    expect(result.paidAmountInCents).toBe(0);
    expect(result.assumedAmountInCents).toBe(20000);
    expect(result.externalOutstandingAmountInCents).toBe(20000);
    expect(result.supportedAmountInCents).toBe(20000);
    expect(result.fulfillmentStatus).toBe('FULFILLED');
    await detail(page);
    await expect(
        page.getByText('Realizada integralmente', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Registrar pagamento', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: /pagar fatura/i }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
        page
            .getByRole('region', {
                name: /Histórico de (pagamentos|realizações)/,
            })
            .getByRole('listitem'),
    ).toHaveCount(1);
    await page
        .getByRole('link', { name: 'Voltar às Finanças', exact: true })
        .click();
    await expect(
        page.getByRole('link', {
            name: result.commitment.description,
            exact: true,
        }),
    ).toBeVisible();
    const item = page.getByRole('listitem').filter({
        has: page.getByRole('link', {
            name: result.commitment.description,
            exact: true,
        }),
    });
    await expect(item).toContainText('No seu cartão');
    await expect(item).toContainText('R$ 0,00');
});

test('A01/A02/A13/A22: shared card holder is explicit, independent of author and expected payer; cycle and position link back', async ({
    page,
    context,
}) => {
    await start(page, context, false);
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
    await expect(page.locator('p[role="alert"]')).toHaveText(
        'Informe de quem é o cartão.',
    );
    await expect(
        page.getByLabel('De quem é o cartão?', { exact: true }),
    ).toBeFocused();
    await page
        .getByLabel('De quem é o cartão?', { exact: true })
        .selectOption({ label: 'Pessoa B cartão' });
    await page.getByLabel('Acerto', { exact: true }).selectOption('DATE');
    await page.getByLabel('Data do acerto', { exact: true }).fill('2027-05-15');
    await expect(
        page.getByRole('complementary', { name: 'Resumo vivo' }),
    ).toContainText('Saiu da conta agora: R$ 0,00');
    const result = (await saveCard(page)) as ExpenseResult;
    expect(result.commitment.expectedPayerMemberId).toBeNull();
    expect(result.disbursements).toEqual([]);
    expect(result.obligation?.remainingAmountInCents).toBe(10000);
    expect(result.obligation?.originExternalLiabilityId).toBe(
        result.externalLiability?.id,
    );
    expect(result.settlementCycle?.targetDate).toBe('2027-05-15');
    await expect(
        page.getByText('Falta acertar:', { exact: false }),
    ).toContainText('Pessoa A cartão deve R$ 100,00 a Pessoa B cartão');
    await detail(page);
    await expect(
        page.getByText('No cartão de Pessoa B cartão: R$ 200,00', {
            exact: true,
        }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByText('No cartão de Pessoa B cartão: R$ 200,00', {
            exact: true,
        }),
    ).toBeVisible();
    await page.goto(`/spaces/${sharedId}/finances`);
    const originLink = page.getByRole('link', {
        name: `Ver despesa: ${result.commitment.description}`,
        exact: true,
    });
    await expect(originLink).toHaveAttribute(
        'href',
        `/spaces/${sharedId}/expenses/${result.commitment.id}`,
    );
    await originLink.click();
    await expect(
        page.getByText('No cartão de Pessoa B cartão: R$ 200,00', {
            exact: true,
        }),
    ).toBeVisible();
    await page.goto(
        `/spaces/${sharedId}/finances/settlements/${result.settlementCycle!.id}`,
    );
    await expect(
        page.getByRole('link', {
            name: `Ver despesa: ${result.commitment.description}`,
            exact: true,
        }),
    ).toBeVisible();
});

test('A05/A06/A08/A12: partial card then cash then card preserves ordered facts, original total and open external amount', async ({
    page,
    context,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, context, true, '1.000,00', '300,00');
    await page.getByLabel('Data da compra', { exact: true }).fill('2020-01-01');
    const first = await saveCard(page);
    expect(first.remainingAmountInCents).toBe(70000);
    await detail(page);
    await page
        .getByLabel('Valor pago agora (R$)', { exact: true })
        .fill('200,00');
    await page
        .getByRole('button', { name: 'Revisar pagamento', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar pagamento', exact: true })
        .click();
    await expect(
        page
            .getByRole('region', {
                name: /Histórico de (pagamentos|realizações)/,
            })
            .getByRole('listitem'),
    ).toHaveCount(2);
    await addCard(page, '500,00');
    const history = page
        .getByRole('region', { name: /Histórico de (pagamentos|realizações)/ })
        .getByRole('listitem');
    await expect(history).toHaveCount(3);
    await expect(history.nth(0)).toContainText('R$ 300,00');
    await expect(history.nth(0)).toContainText('01/01/2020');
    await expect(history.nth(1)).toContainText('R$ 200,00');
    await expect(history.nth(2)).toContainText('R$ 500,00');
    const summary = page.getByRole('region', {
        name: 'Resumo da despesa',
        exact: true,
    });
    await expect(summary.getByRole('definition')).toContainText([
        'R$ 1.000,00',
        'R$ 200,00',
        'R$ 800,00',
        'R$ 0,00',
        'R$ 800,00',
        'R$ 1.000,00',
    ]);
    await expect(summary).toContainText(
        /Pago ao credor do cartão\s*R\$\s*0,00/,
    );
    await expect(summary.getByText('Restante a realizar')).toHaveCount(0);
    await expect(summary).toContainText('Realizada integralmente');
    await expect(
        page.getByRole('region', { name: 'Nova compra no cartão' }),
    ).toHaveCount(0);
    await page.reload();
    await expect(history).toHaveCount(3);
});

test('A07: existing cash expense accepts card support without creating another expense', async ({
    page,
    context,
}) => {
    await open(page, context, a, `/spaces/${a.personalId}/expenses/new`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill(`Caixa seguido de cartão ${randomUUID()}`);
    await page.getByLabel('Valor (R$)', { exact: true }).fill('200,00');
    await page
        .getByLabel('Forma de pagamento', { exact: true })
        .selectOption('PIX');
    await page
        .getByLabel('Valor pago agora (R$)', { exact: true })
        .fill('50,00');
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
    await detail(page);
    const path = page.url();
    await addCard(page, '150,00');
    await expect(page).toHaveURL(path);
    await expect(
        page.getByText('Realizada integralmente', { exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole('region', {
                name: /Histórico de (pagamentos|realizações)/,
            })
            .getByRole('listitem'),
    ).toHaveCount(2);
});

test('A15/A24: card validates partial values, dates and supports keyboard correction', async ({
    page,
    context,
}) => {
    await start(page, context, true, '200,00', '201,00');
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('p[role="alert"]')).toContainText(
        'valor assumido positivo',
    );
    await expect(
        page.getByLabel('Valor assumido no cartão (R$)', { exact: true }),
    ).toBeFocused();
    await page
        .getByLabel('Valor assumido no cartão (R$)', { exact: true })
        .fill('0');
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await page
        .getByLabel('Valor assumido no cartão (R$)', { exact: true })
        .fill('100,00');
    await page.getByLabel('Data da compra', { exact: true }).fill('2099-01-01');
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
    await expect(page.locator('p[role="alert"]')).toContainText(
        'compra já ocorrida',
    );
    await page.getByLabel('Data da compra', { exact: true }).fill('2020-01-01');
    await saveCard(page);
});

test('A16/A25: lost card response locks fields and switching, retries immutable key and body once', async ({
    page,
    context,
}) => {
    await start(page, context);
    const attempts: {
        key: string | null;
        body: string | null;
        result: PersonalExpenseResult;
    }[] = [];
    await page.route('**/credit-card-purchases', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const response = await route.fetch();
        attempts.push({
            key: route.request().headers()['idempotency-key'],
            body: route.request().postData(),
            result: await response.json(),
        });
        if (attempts.length === 1) await route.abort('failed');
        else await route.fulfill({ response });
    });
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .dblclick();
    await expect(
        page.getByRole('button', {
            name: 'Recuperar esta tentativa',
            exact: true,
        }),
    ).toBeVisible();
    await expect(page.getByLabel('Descrição', { exact: true })).toBeDisabled();
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toBeDisabled();
    await page
        .getByRole('button', { name: 'Recuperar esta tentativa', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Despesa registrada', exact: true }),
    ).toBeVisible();
    expect(attempts).toHaveLength(2);
    expect(attempts[1].key).toBe(attempts[0].key);
    expect(attempts[1].body).toBe(attempts[0].body);
    expect(attempts[1].result.replayed).toBe(true);
    expect(attempts[1].result.externalLiability?.id).toBe(
        attempts[0].result.externalLiability?.id,
    );
    expect(attempts[1].result.disbursement).toBeNull();
});

test('A24: failed card options preserve form and recover explicitly', async ({
    page,
    context,
}) => {
    await open(page, context, a, `/spaces/${a.personalId}/expenses/new`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill('Campos preservados');
    await page.route('**/credit-card-purchase-options', (route) =>
        route.fulfill({
            status: 503,
            json: { code: 'UNAVAILABLE', message: 'Indisponível', details: {} },
        }),
    );
    await page
        .getByLabel('Forma de pagamento', { exact: true })
        .selectOption('CREDIT_CARD');
    await expect(page.locator('p[role="alert"]')).toContainText(
        'opções da despesa',
    );
    await page.unroute('**/credit-card-purchase-options');
    await page
        .getByRole('button', {
            name: 'Tentar novamente as opções',
            exact: true,
        })
        .click();
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Campos preservados',
    );
    await expect(page.getByLabel('Descrição', { exact: true })).toBeEnabled();
});

test('A05/A06: successive shared card supports cross responsibility only after its exact share', async ({
    page,
    context,
}) => {
    await start(page, context, false, '500,00', '100,00');
    await page.getByLabel('Pessoa A cartão (%)', { exact: true }).fill('60');
    await page.getByLabel('Pessoa B cartão (%)', { exact: true }).fill('40');
    await page
        .getByLabel('De quem é o cartão?', { exact: true })
        .selectOption({ label: 'Pessoa A cartão' });
    await saveCard(page);
    await expect(
        page.getByText('Não há valor a acertar', { exact: true }),
    ).toBeVisible();
    await detail(page);
    await addCard(page, '200,00', 'Pessoa A cartão');
    await expect(
        page
            .getByRole('region', {
                name: /Histórico de (pagamentos|realizações)/,
            })
            .getByRole('listitem'),
    ).toHaveCount(2);
    await expect(
        page.getByText('Não há valor a acertar', { exact: true }),
    ).toBeVisible();
    await addCard(page, '100,00', 'Pessoa A cartão');
    await expect(
        page.getByText(
            'Falta acertar: Pessoa B cartão deve R$ 100,00 a Pessoa A cartão',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        page
            .getByRole('region', {
                name: /Histórico de (pagamentos|realizações)/,
            })
            .getByRole('listitem'),
    ).toHaveCount(3);
});

test('A09/A10/A22: transfer before card support preserves allocation and the same origin balance', async ({
    page,
    context,
    playwright,
}) => {
    await open(page, context, a, `/spaces/${sharedId}/expenses/new`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill(`Suporte após transferência ${randomUUID()}`);
    await page.getByLabel('Valor (R$)', { exact: true }).fill('500,00');
    await page
        .getByLabel('Forma de pagamento', { exact: true })
        .selectOption('DEBIT');
    await page
        .getByLabel('Valor pago agora (R$)', { exact: true })
        .fill('400,00');
    await page.getByLabel('Pessoa A cartão (%)', { exact: true }).fill('60');
    await page.getByLabel('Pessoa B cartão (%)', { exact: true }).fill('40');
    await page
        .getByLabel('Quem pagou?', { exact: true })
        .selectOption({ label: 'Pessoa A cartão' });
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
    await detail(page);
    const commitmentId = page.url().split('/').at(-1);
    const api = await playwright.request.newContext({ storageState: a.state });
    try {
        const response = await api.get(
            `${setupUrl}/spaces/${sharedId}/settlement-transfers/options?direction=RECEIVABLE`,
        );
        expect(response.status()).toBe(200);
        const options = await response.json();
        const obligation = options.items.find(
            (item: { origin: { commitmentId: string } }) =>
                item.origin.commitmentId === commitmentId,
        );
        expect(obligation).toBeTruthy();
        const responseTransfer = await post(
            api,
            `/spaces/${sharedId}/settlement-transfers`,
            {
                expectedSpaceVersion: options.spaceVersion,
                payerMemberId: obligation.debtorMemberId,
                recipientMemberId: obligation.creditorMemberId,
                amountInCents: 8000,
                factDate: options.referenceDate,
                allocations: [
                    {
                        obligationId: obligation.id,
                        expectedObligationVersion: obligation.version,
                        amountInCents: 8000,
                    },
                ],
            },
        );
        expect(responseTransfer.status()).toBe(201);
    } finally {
        await api.dispose();
    }
    await page.reload();
    await addCard(page, '100,00', 'Pessoa B cartão');
    await expect(
        page.getByText(
            'Falta acertar: Pessoa B cartão deve R$ 20,00 a Pessoa A cartão',
            { exact: true },
        ),
    ).toBeVisible();
    const history = page.getByRole('region', {
        name: 'Histórico de pendências',
    });
    await expect(history.getByRole('listitem')).toHaveCount(1);
    await expect(history).toContainText('R$ 80,00');
    await expect(
        page.getByText('No cartão de Pessoa B cartão: R$ 100,00', {
            exact: true,
        }),
    ).toBeVisible();
    await page.reload();
    await expect(history.getByRole('listitem')).toHaveCount(1);
});

test('A25/A26: card support rejects a foreign commitment response and recovers the same persisted fact with immutable retry', async ({
    page,
    context,
}) => {
    await start(page, context, true, '200,00', '100,00');
    const original = await saveCard(page);
    await detail(page);
    const attempts: {
        key: string;
        body: string | null;
        result: PersonalExpenseResult;
    }[] = [];
    await page.route('**/external-liabilities', async (route) => {
        const response = await route.fetch();
        const result = await response.json();
        attempts.push({
            key: route.request().headers()['idempotency-key'],
            body: route.request().postData(),
            result,
        });
        await route.fulfill({
            response,
            json:
                attempts.length === 1
                    ? {
                          ...result,
                          commitment: {
                              ...result.commitment,
                              id: 'foreign-commitment',
                          },
                      }
                    : result,
        });
    });
    const form = page.getByRole('region', { name: 'Nova compra no cartão' });
    await form
        .getByLabel('Valor assumido no cartão (R$)', { exact: true })
        .fill('50,00');
    await form
        .getByRole('button', { name: 'Revisar compra no cartão', exact: true })
        .click();
    await form
        .getByRole('button', {
            name: 'Confirmar compra no cartão',
            exact: true,
        })
        .evaluate((button: HTMLButtonElement) => {
            button.click();
            button.click();
        });
    await expect(form.getByRole('alert')).toContainText(
        'Reenvie a mesma tentativa para recuperar o resultado.',
    );
    await expect(
        form.getByLabel('Valor assumido no cartão (R$)', { exact: true }),
    ).toBeDisabled();
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toBeDisabled();
    expect(attempts).toHaveLength(1);
    await form
        .getByRole('button', {
            name: 'Reenviar a mesma tentativa',
            exact: true,
        })
        .click();
    await expect(
        page
            .getByRole('region', {
                name: /Histórico de (pagamentos|realizações)/,
            })
            .getByRole('listitem'),
    ).toHaveCount(2);
    expect(attempts).toHaveLength(2);
    expect(attempts[1].key).toBe(attempts[0].key);
    expect(attempts[1].body).toBe(attempts[0].body);
    expect(attempts[1].result.commitment.id).toBe(original.commitment.id);
    expect(attempts[1].result.replayed).toBe(true);
    expect(attempts[1].result.externalLiability?.id).toBe(
        attempts[0].result.externalLiability?.id,
    );
});

for (const status of [201, 401])
    test(`A26: card support delayed ${status} after logout and same-person login cannot mutate the new session`, async ({
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
                    typeof input === 'string' &&
                        input.endsWith('/external-liabilities')
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
            `**/financial-commitments/${body.commitment.id}/external-liabilities`,
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
            await addCard(page, '20,00');
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
                page.getByText('Compra no cartão registrada.', { exact: true }),
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

test('A26: external liability options from A to B to A cannot replace the new context generation', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const created = await post(
        api,
        `/spaces/${a.personalId}/credit-card-purchases`,
        {
            description: 'Opções com resposta tardia',
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
                typeof input === 'string' &&
                    input.endsWith('/external-liability-options')
                    ? { ...init, signal: undefined }
                    : init,
            );
    });
    let release!: () => void,
        captured!: () => void,
        completed!: () => void,
        count = 0;
    const held = new Promise<void>((resolve) => {
            release = resolve;
        }),
        arrived = new Promise<void>((resolve) => {
            captured = resolve;
        }),
        done = new Promise<void>((resolve) => {
            completed = resolve;
        });
    await page.route(
        `**/financial-commitments/${body.commitment.id}/external-liability-options`,
        async (route) => {
            if (++count > 1) return route.continue();
            const response = await route.fetch(),
                stale = await response.json();
            captured();
            await held;
            try {
                await route.fulfill({
                    response,
                    json: {
                        ...stale,
                        remainingAmountInCents: 1,
                        expectedCommitmentVersion: 999,
                    },
                });
            } finally {
                completed();
            }
        },
    );
    await open(
        page,
        context,
        a,
        `/spaces/${a.personalId}/expenses/${body.commitment.id}`,
    );
    await arrived;
    await page
        .getByRole('combobox', { name: 'Espaço atual', exact: true })
        .selectOption(sharedId);
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(sharedId);
    await page
        .getByRole('combobox', { name: 'Espaço atual', exact: true })
        .selectOption(a.personalId);
    await page.goto(`/spaces/${a.personalId}/expenses/${body.commitment.id}`);
    await expect(
        page.getByRole('region', { name: 'Nova compra no cartão' }),
    ).toContainText('R$ 70,00');
    release();
    await done;
    await expect(
        page.getByRole('region', { name: 'Nova compra no cartão' }),
    ).toContainText('R$ 70,00');
    await addCard(page, '70,00');
    await expect(
        page.getByText('Realizada integralmente', { exact: true }),
    ).toBeVisible();
});
