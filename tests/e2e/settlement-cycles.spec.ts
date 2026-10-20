import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { apiDirectory, testDatabaseUrl } from '../support/environment';
import {
    expect,
    test as base,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import type {
    ExpenseResult,
    FinancialContext,
} from '../../src/features/finances/types/shared-expense';
import type {
    SettlementCycle,
    SettlementCycles,
    SettlementCycleDetail,
} from '../../src/features/finances/types/settlement-cycle';
import { businessToday } from '../../src/features/finances/utils/expense-money';

const test = base.extend({
    request: async ({ playwright }, provide) => {
        const actor = await playwright.request.newContext({
            storageState: {
                ...a.state,
                cookies: a.state.cookies.map((cookie) => ({
                    ...cookie,
                    domain: '127.0.0.1',
                })),
            },
        });
        try {
            await provide(actor);
        } finally {
            await actor.dispose();
        }
    },
});
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const apiUrl = 'http://localhost:3101/v2';
const setupUrl = 'http://127.0.0.1:3101/v2';
const origin = 'http://localhost:3100';
const password = 'uma-senha-forte-de-testes';
type Account = {
    email: string;
    id: string;
    personalId: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
let a: Account;
let b: Account;
let shared: string;
let alone: string;
let other: string;
let financial: FinancialContext;
const path = (space = shared) => `/spaces/${space}/finances/settlements`;
const endpoint = (space = shared) =>
    `${apiUrl}/spaces/${space}/settlement-cycles**`;
const trigger = (page: Page) =>
    page.getByRole('combobox', { name: 'Espaço atual', exact: true });
const list = (page: Page) =>
    page.getByRole('list', { name: 'Ciclos de acerto' });
const totals = (page: Page) => page.locator('dl[aria-label="Totais do ciclo"]');
async function expectCycleTotals(page: Page, amounts: Record<string, string>) {
    const summary = totals(page);
    await expect(summary).toHaveCount(1);
    for (const [label, amount] of Object.entries(amounts)) {
        await expect(
            summary
                .getByRole('term')
                .filter({ hasText: new RegExp(`^${label}$`) })
                .locator('xpath=following-sibling::dd[1]'),
        ).toHaveText(amount);
    }
}
const csrfTokens = new WeakMap<
    APIRequestContext,
    { session: string | undefined; token: string }
>();
async function post(api: APIRequestContext, url: string, data: object) {
    const session = (await api.storageState()).cookies.find(
        (cookie) => cookie.name === 'session',
    )?.value;
    let csrf = csrfTokens.get(api);
    if (!csrf || csrf.session !== session) {
        const response = await api.get(`${setupUrl}/auth/csrf`);
        expect(response.status()).toBe(200);
        csrf = { session, token: (await response.json()).csrfToken };
        csrfTokens.set(api, csrf);
    }
    return api.post(`${setupUrl}${url}`, {
        headers: {
            Origin: origin,
            'X-CSRF-Token': csrf.token,
            'Idempotency-Key': randomUUID(),
        },
        data,
    });
}
async function state(api: APIRequestContext) {
    const value = await api.storageState();
    return {
        ...value,
        cookies: value.cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    };
}
async function register(
    api: APIRequestContext,
    displayName: string,
): Promise<Account> {
    const email = `${randomUUID()}@example.com`;
    const response = await post(api, '/auth/register', {
        displayName,
        email,
        password,
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    return {
        email,
        id: body.person.id,
        personalId: body.personalSpace.id,
        state: await state(api),
    };
}
async function create(
    api: APIRequestContext,
    name: string,
    member?: APIRequestContext,
) {
    const response = await post(api, '/spaces', { name });
    expect(response.status()).toBe(201);
    const body = await response.json();
    if (member) {
        const accepted = await post(member, '/invitations/respond', {
            token: new URLSearchParams(
                new URL(body.inviteUrl).hash.slice(1),
            ).get('token'),
            decision: 'ACCEPT',
            expectedVersion: 1,
        });
        expect(accepted.status()).toBe(200);
    }
    return body.space.id as string;
}
async function dbQuery(sql: string) {
    const requireApi = createRequire(resolve(apiDirectory, 'package.json'));
    const { Client } = requireApi('pg') as {
        Client: new (options: { connectionString: string }) => {
            connect(): Promise<void>;
            query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
            end(): Promise<void>;
        };
    };
    const db = new Client({
        connectionString: testDatabaseUrl,
    });
    await db.connect();
    try {
        expect(
            (await db.query('SELECT current_database() AS database')).rows[0]
                .database,
        ).toBe('prospera_mais_test');
        return await db.query(sql);
    } finally {
        await db.end();
    }
}
async function record(
    api: APIRequestContext,
    description: string,
    amount: number,
    payer: 'A' | 'B',
    partA: number,
    expected: string | null = null,
    space = shared,
) {
    const ctx: FinancialContext = await (
        await api.get(`${setupUrl}/spaces/${space}/financial-entry-context`)
    ).json();
    const memberA = ctx.members.find((m) => m.personId === a.id)!.memberId;
    const memberB = ctx.members.find((m) => m.personId === b.id)?.memberId;
    const response = await post(api, `/spaces/${space}/shared-cash-expenses`, {
        expectedSpaceVersion: ctx.version,
        description,
        amountInCents: amount,
        factDate: businessToday(),
        expectedPayerMemberId: expected,
        responsibilitySplit: {
            mode: 'AMOUNTS',
            shares: ctx.members.map((m) => ({
                memberId: m.memberId,
                amountInCents: m.memberId === memberA ? partA : amount - partA,
            })),
        },
        disbursement: {
            payerMemberId: payer === 'A' ? memberA : memberB,
            method: 'PIX',
        },
        settlement: { mode: 'DATE', targetDate: '2099-11-10' },
    });
    expect(response.status()).toBe(201);
    return (await response.json()) as ExpenseResult;
}
async function open(
    page: Page,
    context: BrowserContext,
    space = shared,
    account = a,
) {
    await context.addCookies(account.state.cookies);
    await page.goto(path(space));
    await expect(trigger(page)).toHaveValue(space);
    await expect(
        page.getByRole('heading', { name: 'Acertos', exact: true }),
    ).toBeVisible();
}
async function realPair(api: APIRequestContext) {
    return [
        await record(api, 'Origem a pagar', 35000, 'B', 35000),
        await record(api, 'Origem a receber', 8000, 'A', 0),
    ];
}
function deferred() {
    let done!: () => void;
    return {
        promise: new Promise<void>((resolve) => {
            done = resolve;
        }),
        resolve: () => done(),
    };
}
async function ignoreCycleAbort(page: Page) {
    await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (url, init) =>
            original(
                url,
                typeof url === 'string' && url.includes('settlement-cycles')
                    ? { ...init, signal: undefined }
                    : init,
            );
    });
}
test.beforeAll(async ({ playwright }) => {
    const actor = await playwright.request.newContext();
    const member = await playwright.request.newContext();
    try {
        a = await register(actor, 'Posição A');
        b = await register(member, 'Posição B');
        shared = await create(actor, 'Casa posição', member);
        alone = await create(actor, 'Casa sozinho posição');
        other = await create(actor, 'Casa outra posição');
        financial = await (
            await actor.get(
                `${setupUrl}/spaces/${shared}/financial-entry-context`,
            )
        ).json();
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});
test.beforeEach(async () => {
    await dbQuery(
        'TRUNCATE financial_expense_command_receipts,inter_member_obligation_changes,inter_member_obligations,financial_disbursements,financial_commitment_shares,financial_commitment_versions,financial_commitments,settlement_cycles CASCADE',
    );
});

function fakeCycle(overrides: Partial<SettlementCycle> = {}): SettlementCycle {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        version: 1,
        targetDate: '2099-11-10',
        status: 'OPEN',
        isOverdue: false,
        obligationCount: 0,
        openObligationCount: 0,
        totals: {
            originalAmountInCents: '0',
            recognizedAmountInCents: '0',
            resolvedAmountInCents: '0',
            transferredAmountInCents: '0',
            remainingAmountInCents: '0',
        },
        position: {
            payableAmountInCents: '0',
            receivableAmountInCents: '0',
            net: { direction: 'BALANCED', amountInCents: '0' },
        },
        ...overrides,
    };
}
function fakeList(items: SettlementCycles['items'] = []): SettlementCycles {
    return {
        spaceId: shared,
        spaceStatus: 'ACTIVE',
        actorMemberId: financial.actorMemberId,
        members: financial.members,
        referenceDate: '2026-10-11',
        items,
        page: { view: 'OPEN', pageSize: 20, nextCursor: null },
    };
}
function fakeDetail(cycle = fakeCycle()): SettlementCycleDetail {
    const context = fakeList();
    return {
        ...context,
        cycle: { ...cycle, finalizedAt: null },
        items: [],
        page: { direction: 'ALL', pageSize: 20, nextCursor: null },
    };
}
const detailList = (page: Page) =>
    page.getByRole('list', { name: 'Composição do acerto' });

test('A01/A02/A22: real expenses preserve cycle totals, origin and authorized return', async ({
    page,
    context,
    request,
}) => {
    const pair = await realPair(request);
    const cycleId = pair[0].settlementCycle!.id;
    expect(pair[1].settlementCycle!.id).toBe(cycleId);
    await open(page, context);
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 430,00',
        'Valor reconhecido': 'R$ 430,00',
        'Valor reconhecido já acertado': 'R$ 0,00',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 430,00',
        'Bruto a pagar': 'R$ 350,00',
        'Bruto a receber': 'R$ 80,00',
        'Posição líquida informativa': 'Você paga R$ 270,00',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
    await list(page)
        .getByRole('link', { name: 'Abrir acerto de 10/11/2099' })
        .click();
    await expect(page).toHaveURL(`${path()}/${cycleId}`);
    await expect(detailList(page).getByRole('listitem')).toHaveCount(2);
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 430,00',
        'Valor reconhecido': 'R$ 430,00',
        'Valor reconhecido já acertado': 'R$ 0,00',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 430,00',
        'Bruto a pagar': 'R$ 350,00',
        'Bruto a receber': 'R$ 80,00',
        'Posição líquida informativa': 'Você paga R$ 270,00',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
    await page
        .getByRole('link', { name: 'Ver despesa: Origem a pagar', exact: true })
        .click();
    await expect(page).toHaveURL(
        `/spaces/${shared}/expenses/${pair[0].commitment.id}?returnCycle=${cycleId}`,
    );
    await expect(
        page.getByRole('heading', { name: 'Despesa', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('link', { name: 'Voltar ao acerto', exact: true })
        .click();
    await expect(detailList(page).getByRole('listitem')).toHaveCount(2);
    await page
        .getByLabel('Mostrar composição', { exact: true })
        .selectOption('PAYABLE');
    await expect(detailList(page).getByRole('listitem')).toHaveCount(1);
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 430,00',
        'Valor reconhecido': 'R$ 430,00',
        'Valor reconhecido já acertado': 'R$ 0,00',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 430,00',
        'Bruto a pagar': 'R$ 350,00',
        'Bruto a receber': 'R$ 80,00',
        'Posição líquida informativa': 'Você paga R$ 270,00',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
    await context.clearCookies();
    await context.addCookies(b.state.cookies);
    await page.goto(`${path()}/${cycleId}`);
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 430,00',
        'Valor reconhecido': 'R$ 430,00',
        'Valor reconhecido já acertado': 'R$ 0,00',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 430,00',
        'Bruto a pagar': 'R$ 80,00',
        'Bruto a receber': 'R$ 350,00',
        'Posição líquida informativa': 'Você recebe R$ 270,00',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
});

test('A03: explicit financial fixture preserves balanced obligations in an overdue cycle', async ({
    page,
    context,
    request,
}) => {
    await record(request, 'Equilíbrio A', 8000, 'B', 8000);
    await record(request, 'Equilíbrio B', 8000, 'A', 0);
    await dbQuery("UPDATE settlement_cycles SET target_date='2000-01-01'");
    await open(page, context);
    await expect(list(page)).toContainText('Vencido');
    await expect(list(page)).toContainText(
        'Os valores se equilibram, mas ainda existem pendências abertas.',
    );
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 160,00',
        'Valor reconhecido': 'R$ 160,00',
        'Valor reconhecido já acertado': 'R$ 0,00',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 160,00',
        'Bruto a pagar': 'R$ 80,00',
        'Bruto a receber': 'R$ 80,00',
        'Posição líquida informativa': 'R$ 0,00',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
    await page
        .getByLabel('Mostrar acertos', { exact: true })
        .selectOption('UPCOMING');
    await expect(
        page.getByText('Nenhum acerto em aberto para hoje ou datas futuras.', {
            exact: true,
        }),
    ).toBeVisible();
});

test('A04/A05: partial and zero reduction fixtures preserve original amounts and composition', async ({
    page,
    context,
    request,
}) => {
    const result = await record(request, 'Redução fixture', 50000, 'B', 50000);
    await dbQuery(
        "UPDATE inter_member_obligations SET remaining_amount_in_cents=25000,status='PARTIALLY_SETTLED'",
    );
    await open(page, context);
    await list(page).getByRole('link').click();
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 500,00',
        'Valor reconhecido': 'R$ 500,00',
        'Valor reconhecido já acertado': 'R$ 250,00',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 250,00',
        'Bruto a pagar': 'R$ 250,00',
        'Bruto a receber': 'R$ 0,00',
        'Posição líquida informativa': 'Você paga R$ 250,00',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
    await expect(detailList(page)).toContainText(
        'Valor reconhecido já acertado: R$ 250,00',
    );
    await dbQuery(
        "UPDATE inter_member_obligations SET remaining_amount_in_cents=0,status='SETTLED'",
    );
    await page
        .getByRole('button', {
            name: 'Atualizar / Voltar ao início',
            exact: true,
        })
        .click();
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 500,00',
        'Valor reconhecido': 'R$ 500,00',
        'Valor reconhecido já acertado': 'R$ 500,00',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 0,00',
        'Bruto a pagar': 'R$ 0,00',
        'Bruto a receber': 'R$ 0,00',
        'Posição líquida informativa': 'R$ 0,00',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
    await expect(detailList(page).getByRole('listitem')).toHaveCount(1);
    await expect(
        page.getByText('Sem valor em aberto. Este ciclo continua em aberto.', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('checkbox', {
            name: 'Conferi os valores e quero finalizar este ciclo.',
            exact: true,
        }),
    ).not.toBeChecked();
    await expect(
        page.getByRole('button', {
            name: 'Finalizar ciclo de acerto',
            exact: true,
        }),
    ).toBeDisabled();
    expect(result.settlementCycle).not.toBeNull();
});

test('A05: sole creator without cycles sees a precise empty state', async ({
    page,
    context,
}) => {
    await open(page, context, alone);
    await expect(
        page.getByText('Nenhum ciclo de acerto em aberto neste espaço.', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText(
            'Pendências sem ciclo continuam disponíveis no resumo entre vocês.',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(totals(page)).toHaveCount(0);
});

test('A05/A14: empty cycles preserve composition and finalized cycles remain read only', async ({
    page,
    context,
}) => {
    const value = fakeDetail();
    await page.route(endpoint(), (route) => route.fulfill({ json: value }));
    await context.addCookies(a.state.cookies);
    await page.goto(`${path()}/${value.cycle.id}`);
    await expect(
        page.getByText('Este ciclo não possui pendências na composição.', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText('Sem valor em aberto. Este ciclo continua em aberto.', {
            exact: true,
        }),
    ).toBeVisible();
    value.cycle.status = 'FINALIZED';
    value.cycle.finalizedAt = '2026-10-10T12:00:00.000Z';
    value.spaceStatus = 'CLOSED';
    await page
        .getByRole('button', {
            name: 'Atualizar / Voltar ao início',
            exact: true,
        })
        .click();
    await expect(page.getByText('Finalizado', { exact: true })).toBeVisible();
    await expect(
        page.getByText('Finalizado em:', { exact: false }),
    ).toContainText('10/10/2026');
    await expect(
        page.getByRole('button', { name: /transferir|finalizar|compensar/i }),
    ).toHaveCount(0);
});

test('A08: 21 real cycles use ordered replacement pages and restart', async ({
    page,
    context,
    request,
}) => {
    for (let index = 0; index < 21; index++) {
        const ctx = await (
            await request.get(
                `${setupUrl}/spaces/${shared}/financial-entry-context`,
            )
        ).json();
        const payer = ctx.members.find(
            (member: { personId: string }) => member.personId === b.id,
        ).memberId;
        const debtor = ctx.members.find(
            (member: { personId: string }) => member.personId === a.id,
        ).memberId;
        const response = await post(
            request,
            `/spaces/${shared}/shared-cash-expenses`,
            {
                expectedSpaceVersion: ctx.version,
                description: `Ciclo real ${index}`,
                amountInCents: 100,
                factDate: businessToday(),
                expectedPayerMemberId: null,
                responsibilitySplit: {
                    mode: 'AMOUNTS',
                    shares: [
                        { memberId: debtor, amountInCents: 100 },
                        { memberId: payer, amountInCents: 0 },
                    ],
                },
                disbursement: { payerMemberId: payer, method: 'PIX' },
                settlement: {
                    mode: 'DATE',
                    targetDate: `2099-12-${String(index + 1).padStart(2, '0')}`,
                },
            },
        );
        expect(response.status()).toBe(201);
    }
    await open(page, context);
    await expect(list(page).getByRole('listitem')).toHaveCount(20);
    const first = await list(page)
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    await page
        .getByRole('button', { name: 'Próximos acertos', exact: true })
        .click();
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    expect(first).not.toContain(
        await list(page).getByRole('link').getAttribute('href'),
    );
    await page
        .getByRole('button', {
            name: 'Atualizar / Voltar ao início',
            exact: true,
        })
        .click();
    await expect(list(page).getByRole('listitem')).toHaveCount(20);
    await page
        .getByLabel('Mostrar acertos', { exact: true })
        .selectOption('UPCOMING');
    await expect(list(page).getByRole('listitem')).toHaveCount(20);
});

test('A09: 21 real origins preserve timestamp ties, replacement pages and full totals', async ({
    page,
    context,
    request,
}) => {
    const ids: string[] = [];
    for (let index = 0; index < 21; index++)
        ids.push(
            (await record(request, `Origem ciclo ${index}`, 100, 'B', 100))
                .commitment.id,
        );
    await dbQuery(
        "UPDATE inter_member_obligations SET registered_at='2099-01-01T00:00:00.123456Z'",
    );
    await open(page, context);
    await list(page).getByRole('link').click();
    await expect(detailList(page).getByRole('listitem')).toHaveCount(20);
    const first = await detailList(page)
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    await page
        .getByRole('button', {
            name: 'Próximas pendências do acerto',
            exact: true,
        })
        .click();
    await expect(detailList(page).getByRole('listitem')).toHaveCount(1);
    const last = await detailList(page).getByRole('link').getAttribute('href');
    expect(new Set([...first, last]).size).toBe(21);
    expect(
        [...first, last]
            .map((href) => new URL(href!, origin).pathname.split('/').at(-1))
            .sort(),
    ).toEqual(ids.sort());
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 21,00',
        'Valor reconhecido': 'R$ 21,00',
        'Valor reconhecido já acertado': 'R$ 0,00',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 21,00',
        'Bruto a pagar': 'R$ 21,00',
        'Bruto a receber': 'R$ 0,00',
        'Posição líquida informativa': 'Você paga R$ 21,00',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
    await page
        .getByLabel('Mostrar composição', { exact: true })
        .selectOption('RECEIVABLE');
    await expect(
        page.getByText(
            'Nenhuma pendência nesta página para o filtro escolhido.',
            { exact: true },
        ),
    ).toBeVisible();
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 21,00',
        'Valor reconhecido': 'R$ 21,00',
        'Valor reconhecido já acertado': 'R$ 0,00',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 21,00',
        'Bruto a pagar': 'R$ 21,00',
        'Bruto a receber': 'R$ 0,00',
        'Posição líquida informativa': 'Você paga R$ 21,00',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
});

test('A10: HTTP fake totals above the safe integer retain exact cents', async ({
    page,
    context,
}) => {
    const value = fakeDetail();
    value.cycle.totals = {
        originalAmountInCents: '18014398509481983',
        recognizedAmountInCents: '18014398509481983',
        resolvedAmountInCents: '9007199254740992',
        transferredAmountInCents: '0',
        remainingAmountInCents: '9007199254740991',
    };
    value.cycle.position = {
        payableAmountInCents: '9007199254740991',
        receivableAmountInCents: '0',
        net: { direction: 'PAYABLE', amountInCents: '9007199254740991' },
    };
    await page.route(endpoint(), (route) => route.fulfill({ json: value }));
    await context.addCookies(a.state.cookies);
    await page.goto(`${path()}/${value.cycle.id}`);
    await expectCycleTotals(page, {
        'Valor original bruto': 'R$ 180.143.985.094.819,83',
        'Valor reconhecido': 'R$ 180.143.985.094.819,83',
        'Valor reconhecido já acertado': 'R$ 90.071.992.547.409,92',
        'Dinheiro transferido': 'R$ 0,00',
        'Valor em aberto bruto': 'R$ 90.071.992.547.409,91',
        'Bruto a pagar': 'R$ 90.071.992.547.409,91',
        'Bruto a receber': 'R$ 0,00',
        'Posição líquida informativa': 'Você paga R$ 90.071.992.547.409,91',
        Compensado: 'R$ 0,00',
        Dispensado: 'R$ 0,00',
    });
});

test('A12: HTTP fake expired UPCOMING cursor offers restart without stale pages', async ({
    page,
    context,
}) => {
    const value = fakeList([{ ...fakeCycle(), status: 'OPEN' }]);
    value.page.nextCursor = 'cursor-controlado';
    await page.route(endpoint(), (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('cursor'))
            return route.fulfill({
                status: 400,
                json: {
                    code: 'VALIDATION_ERROR',
                    message: 'Cursor expirado',
                    details: { fields: [{ field: 'cursor' }] },
                },
            });
        return route.fulfill({
            json: {
                ...value,
                page: { ...value.page, view: url.searchParams.get('view') },
            },
        });
    });
    await open(page, context);
    await page
        .getByLabel('Mostrar acertos', { exact: true })
        .selectOption('UPCOMING');
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await page
        .getByRole('button', { name: 'Próximos acertos', exact: true })
        .click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Reinicie a consulta dos acertos.',
    );
    await expect(list(page)).toHaveCount(0);
    await page
        .getByRole('button', {
            name: 'Reiniciar lista de acertos',
            exact: true,
        })
        .click();
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await expect(
        page.getByLabel('Mostrar acertos', { exact: true }),
    ).toHaveValue('UPCOMING');
});

test('A13/A22: cross-space real origin and tampered return are rejected', async ({
    page,
    context,
    request,
}) => {
    const result = await record(
        request,
        'Origem ciclo protegida',
        100,
        'B',
        100,
    );
    await open(page, context, other);
    await page.goto(
        `/spaces/${other}/expenses/${result.commitment.id}?returnCycle=${result.settlementCycle!.id}`,
    );
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Não foi possível consultar esta despesa.',
    );
    await expect(
        page.getByText('Origem ciclo protegida', { exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('link', { name: 'Voltar ao acerto', exact: true }),
    ).toHaveCount(0);
    await page.goto(
        `/spaces/${shared}/expenses/${result.commitment.id}?returnCycle=https://example.com`,
    );
    await expect(
        page.getByRole('heading', { name: 'Despesa', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('link', { name: 'Voltar ao acerto', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('link', { name: 'Voltar às Finanças', exact: true }),
    ).toHaveAttribute('href', `/spaces/${shared}/finances`);
    await page.goto(`${path(other)}/${result.settlementCycle!.id}`);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Este acerto não está disponível.',
    );
});

for (const failure of ['network', '500'] as const)
    test(`A20 HTTP fake ${failure}: loading, failure and retry hide stale amounts`, async ({
        page,
        context,
    }) => {
        const started = deferred(),
            release = deferred();
        let reads = 0;
        await page.route(endpoint(), async (route) => {
            if (++reads === 1) {
                started.resolve();
                await release.promise;
                if (failure === 'network') await route.abort('failed');
                else
                    await route.fulfill({
                        status: 500,
                        json: {
                            code: 'INTERNAL_ERROR',
                            message: 'Falha fake',
                            details: {},
                        },
                    });
            } else await route.continue();
        });
        await open(page, context);
        await started.promise;
        await expect(
            page.getByText('Carregando acertos…', { exact: true }),
        ).toBeVisible();
        await expect(totals(page)).toHaveCount(0);
        release.resolve();
        await expect(page.getByRole('main').getByRole('alert')).toContainText(
            'Não foi possível consultar os acertos.',
        );
        await expect(
            page.getByText('Nenhum ciclo de acerto em aberto neste espaço.', {
                exact: true,
            }),
        ).toHaveCount(0);
        await page
            .getByRole('button', {
                name: 'Tentar novamente os acertos',
                exact: true,
            })
            .click();
        await expect(
            page.getByText('Nenhum ciclo de acerto em aberto neste espaço.', {
                exact: true,
            }),
        ).toBeVisible();
    });

test('A20 HTTP fake access loss revalidates context and returns to personal space', async ({
    page,
    context,
}) => {
    await page.route(endpoint(), (route) =>
        route.fulfill({
            status: 404,
            json: {
                code: 'SPACE_NOT_FOUND',
                message: 'Espaço indisponível',
                details: {},
            },
        }),
    );
    await context.addCookies(a.state.cookies);
    await page.goto(path());
    await expect(page).toHaveURL(`/spaces/${a.personalId}`);
    await expect(trigger(page)).toHaveValue(a.personalId);
    await expect(
        page.getByRole('heading', { name: 'Acertos', exact: true }),
    ).toHaveCount(0);
});

test('A20: explicit refresh HTTP fake hides cached amounts during loading and failure', async ({
    page,
    context,
}) => {
    const started = deferred(),
        release = deferred();
    let reads = 0;
    const value = fakeList([{ ...fakeCycle(), status: 'OPEN' }]);
    value.items[0].totals.originalAmountInCents = '12345';
    await page.route(endpoint(), async (route) => {
        if (++reads === 2) {
            started.resolve();
            await release.promise;
            await route.fulfill({
                status: 500,
                json: {
                    code: 'INTERNAL_ERROR',
                    message: 'Falha de refresh fake',
                    details: {},
                },
            });
        } else await route.fulfill({ json: value });
    });
    await open(page, context);
    await expect(page.getByText('R$ 123,45', { exact: true })).toBeVisible();
    await page
        .getByRole('button', {
            name: 'Atualizar / Voltar ao início',
            exact: true,
        })
        .click();
    await started.promise;
    await expect(
        page.getByText('Carregando acertos…', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('R$ 123,45', { exact: true })).toHaveCount(0);
    release.resolve();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Não foi possível consultar os acertos.',
    );
    await expect(totals(page)).toHaveCount(0);
    await page
        .getByRole('button', {
            name: 'Tentar novamente os acertos',
            exact: true,
        })
        .click();
    await expect(page.getByText('R$ 123,45', { exact: true })).toBeVisible();
});

for (const status of [200, 401])
    for (const change of [
        'space',
        'view',
        'page',
        'cycle',
        'direction',
    ] as const)
        test(`A19 delayed HTTP fake ${status} after ${change} selection cannot publish or expire current session`, async ({
            page,
            context,
        }) => {
            await ignoreCycleAbort(page);
            const started = deferred(),
                release = deferred();
            let reads = 0;
            const cycle = fakeCycle(),
                second = fakeCycle({
                    id: '22222222-2222-4222-8222-222222222222',
                });
            const lists = fakeList([
                { ...cycle, status: 'OPEN' },
                { ...second, status: 'OPEN' },
            ]);
            lists.page.nextCursor = 'pagina-fake';
            await page.route(endpoint(), async (route) => {
                const url = new URL(route.request().url()),
                    isDetail =
                        url.pathname.endsWith(cycle.id) ||
                        url.pathname.endsWith(second.id);
                const hold =
                    change === 'direction' || change === 'cycle'
                        ? isDetail
                        : change === 'page'
                          ? url.searchParams.has('cursor')
                          : !isDetail;
                if (hold && ++reads === 1) {
                    started.resolve();
                    await release.promise;
                    const stale = isDetail
                        ? fakeDetail(cycle)
                        : fakeList([{ ...cycle, status: 'OPEN' }]);
                    const target =
                        'cycle' in stale ? stale.cycle : stale.items[0];
                    target.totals = {
                        ...target.totals,
                        originalAmountInCents: '99900',
                    };
                    await route.fulfill({
                        status,
                        headers: { 'X-Test-Stale': 'true' },
                        json:
                            status === 200
                                ? stale
                                : {
                                      code: 'UNAUTHENTICATED',
                                      message: 'Sessão fake antiga',
                                      details: {},
                                  },
                    });
                } else if (isDetail) {
                    const value = fakeDetail(
                        url.pathname.endsWith(second.id) ? second : cycle,
                    );
                    value.page.direction = (url.searchParams.get('direction') ??
                        'ALL') as 'ALL';
                    await route.fulfill({ json: value });
                } else
                    await route.fulfill({
                        json: {
                            ...lists,
                            spaceId: url.pathname.includes(other)
                                ? other
                                : shared,
                            page: {
                                ...lists.page,
                                view: url.searchParams.get('view') ?? 'OPEN',
                            },
                        },
                    });
            });
            await open(page, context);
            if (change === 'direction' || change === 'cycle')
                await list(page).getByRole('link').first().click();
            if (change === 'page')
                await page
                    .getByRole('button', {
                        name: 'Próximos acertos',
                        exact: true,
                    })
                    .click();
            await started.promise;
            if (change === 'space') {
                await trigger(page).selectOption(other);
                await expect(page).toHaveURL(path(other));
                await trigger(page).selectOption(shared);
                await expect(page).toHaveURL(path());
            }
            if (change === 'view') {
                await page
                    .getByLabel('Mostrar acertos', { exact: true })
                    .selectOption('UPCOMING');
                await expect(list(page).getByRole('listitem')).toHaveCount(2);
                await page
                    .getByLabel('Mostrar acertos', { exact: true })
                    .selectOption('OPEN');
            }
            if (change === 'page') {
                await page
                    .getByLabel('Mostrar acertos', { exact: true })
                    .selectOption('UPCOMING');
                await expect(list(page).getByRole('listitem')).toHaveCount(2);
                await page
                    .getByLabel('Mostrar acertos', { exact: true })
                    .selectOption('OPEN');
            }
            if (change === 'cycle') {
                await page
                    .getByRole('link', {
                        name: 'Voltar aos Acertos',
                        exact: true,
                    })
                    .click();
                await expect(list(page).getByRole('listitem')).toHaveCount(2);
                await list(page).getByRole('link').last().click();
                await expect(page).toHaveURL(`${path()}/${second.id}`);
            }
            if (change === 'direction') {
                await page
                    .getByLabel('Mostrar composição', { exact: true })
                    .selectOption('PAYABLE');
                await expect(totals(page)).toHaveCount(1);
                await page
                    .getByLabel('Mostrar composição', { exact: true })
                    .selectOption('ALL');
            }
            const late = page.waitForResponse(
                (response) =>
                    response.url().includes('/settlement-cycles') &&
                    response.headers()['x-test-stale'] === 'true',
            );
            release.resolve();
            await (await late).finished();
            await expect(page.getByText(/999,00/)).toHaveCount(0);
            await expect(
                page.getByRole('heading', {
                    name:
                        change === 'cycle' || change === 'direction'
                            ? 'Detalhe do acerto'
                            : 'Acertos',
                    exact: true,
                }),
            ).toBeVisible();
            await page
                .getByRole('button', {
                    name: 'Atualizar / Voltar ao início',
                    exact: true,
                })
                .click();
            await expect(totals(page)).toHaveCount(
                change === 'cycle' || change === 'direction' ? 1 : 2,
            );
            await expect(page.getByText(/999,00/)).toHaveCount(0);
            await expect(trigger(page)).toHaveValue(shared);
        });

for (const status of [200, 401])
    test(`A19 old HTTP fake ${status} after logout and login by the same person`, async ({
        page,
        context,
        request,
    }) => {
        expect(
            (
                await post(request, '/auth/login', { email: a.email, password })
            ).status(),
        ).toBe(200);
        a.state = await state(request);
        await ignoreCycleAbort(page);
        const started = deferred(),
            release = deferred();
        let reads = 0;
        await page.route(endpoint(), async (route) => {
            if (++reads === 1) {
                started.resolve();
                await release.promise;
                const value = fakeList([{ ...fakeCycle(), status: 'OPEN' }]);
                value.items[0].totals.originalAmountInCents = '99900';
                await route.fulfill({
                    status,
                    headers: { 'X-Test-Stale': 'true' },
                    json:
                        status === 200
                            ? value
                            : {
                                  code: 'UNAUTHENTICATED',
                                  message: 'Sessão antiga fake',
                                  details: {},
                              },
                });
            } else await route.continue();
        });
        await open(page, context);
        await started.promise;
        await page.getByRole('button', { name: 'Sair', exact: true }).click();
        await expect(page).toHaveURL('/login');
        await page.getByLabel('E-mail', { exact: true }).fill(a.email);
        await page.getByLabel('Senha', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Entrar', exact: true }).click();
        await expect(trigger(page)).toHaveValue(a.personalId);
        const late = page.waitForResponse(
            (response) =>
                response.url().includes('/settlement-cycles') &&
                response.headers()['x-test-stale'] === 'true',
        );
        release.resolve();
        await (await late).finished();
        await page.goto(path());
        await expect(
            page.getByText('Nenhum ciclo de acerto em aberto neste espaço.', {
                exact: true,
            }),
        ).toBeVisible();
        await expect(page.getByText(/999,00/)).toHaveCount(0);
        a.state = await context.storageState();
    });

for (const status of [200, 401])
    test(`A19 delayed HTTP fake ${status} across cycle to origin to cycle keeps the current read`, async ({
        page,
        context,
        request,
    }) => {
        const pair = await realPair(request),
            cycleId = pair[0].settlementCycle!.id;
        await ignoreCycleAbort(page);
        const started = deferred(),
            release = deferred();
        let holdNext = false,
            held = false;
        await page.route(
            `${apiUrl}/spaces/${shared}/settlement-cycles/${cycleId}*`,
            async (route) => {
                if (holdNext && !held) {
                    held = true;
                    started.resolve();
                    await release.promise;
                    const value = fakeDetail(fakeCycle({ id: cycleId }));
                    value.cycle.totals.originalAmountInCents = '99900';
                    await route.fulfill({
                        status,
                        headers: { 'X-Test-Stale': 'true' },
                        json:
                            status === 200
                                ? value
                                : {
                                      code: 'UNAUTHENTICATED',
                                      message: 'Leitura antiga fake',
                                      details: {},
                                  },
                    });
                } else await route.continue();
            },
        );
        await open(page, context);
        await list(page).getByRole('link').click();
        await expect(detailList(page).getByRole('listitem')).toHaveCount(2);
        await page
            .getByRole('link', {
                name: 'Ver despesa: Origem a pagar',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Despesa', exact: true }),
        ).toBeVisible();
        holdNext = true;
        await page
            .getByRole('link', { name: 'Voltar ao acerto', exact: true })
            .click();
        await started.promise;
        await page.goBack();
        await expect(
            page.getByRole('heading', { name: 'Despesa', exact: true }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Voltar ao acerto', exact: true })
            .click();
        await expect(detailList(page).getByRole('listitem')).toHaveCount(2);
        const late = page.waitForResponse(
            (response) =>
                response.url().includes('/settlement-cycles/') &&
                response.headers()['x-test-stale'] === 'true',
        );
        release.resolve();
        await (await late).finished();
        await expectCycleTotals(page, {
            'Valor original bruto': 'R$ 430,00',
            'Valor reconhecido': 'R$ 430,00',
            'Valor reconhecido já acertado': 'R$ 0,00',
            'Dinheiro transferido': 'R$ 0,00',
            'Valor em aberto bruto': 'R$ 430,00',
            'Bruto a pagar': 'R$ 350,00',
            'Bruto a receber': 'R$ 80,00',
            'Posição líquida informativa': 'Você paga R$ 270,00',
            Compensado: 'R$ 0,00',
            Dispensado: 'R$ 0,00',
        });
        await expect(page.getByText(/999,00/)).toHaveCount(0);
        await expect(trigger(page)).toHaveValue(shared);
    });

for (const width of [390, 1280])
    test(`A23: ${width}px keyboard controls preserve focus on refresh`, async ({
        page,
        context,
        request,
    }) => {
        await realPair(request);
        await page.setViewportSize({ width, height: 844 });
        await open(page, context);
        await expect(list(page).getByRole('listitem')).toHaveCount(1);
        await page.getByLabel('Mostrar acertos', { exact: true }).focus();
        await page.keyboard.press('Tab');
        const refresh = page.getByRole('button', {
            name: 'Atualizar / Voltar ao início',
            exact: true,
        });
        await expect(refresh).toBeFocused();
        const response = page.waitForResponse(
            (response) =>
                response.url() ===
                    `${apiUrl}/spaces/${shared}/settlement-cycles?view=OPEN` &&
                response.status() === 200,
        );
        await page.keyboard.press('Enter');
        await (await response).finished();
        await expect(refresh).toHaveAttribute('aria-disabled', 'false');
        await expect(refresh).toBeFocused();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
        await page.keyboard.press('Tab');
        await expect(list(page).getByRole('link')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(detailList(page).getByRole('listitem')).toHaveCount(2);
        await page.getByLabel('Mostrar composição', { exact: true }).focus();
        await page.keyboard.press('Tab');
        await expect(refresh).toBeFocused();
        const detailResponse = page.waitForResponse(
            (response) =>
                response.url().includes('/settlement-cycles/') &&
                response.url().endsWith('?direction=ALL') &&
                response.status() === 200,
        );
        await page.keyboard.press('Enter');
        await (await detailResponse).finished();
        await expect(refresh).toHaveAttribute('aria-disabled', 'false');
        await expect(refresh).toBeFocused();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
    });

test('A21: real UI expense invalidates cycles and return reads current composition', async ({
    page,
    context,
    request,
}) => {
    const result = await record(request, 'Inicial ciclo', 100, 'B', 100);
    await open(page, context);
    await list(page).getByRole('link').click();
    await expect(detailList(page).getByRole('listitem')).toHaveCount(1);
    await page.getByRole('link', { name: 'Resumo', exact: true }).click();
    await page
        .getByRole('link', { name: 'Adicionar despesa', exact: true })
        .click();
    await page.getByLabel('Descrição', { exact: true }).fill('Nova no ciclo');
    await page.getByLabel('Valor (R$)', { exact: true }).fill('100,00');
    await page.getByLabel('Forma de pagamento').selectOption('DEBIT');
    await page.getByLabel('Posição A (%)', { exact: true }).fill('0');
    await page.getByLabel('Posição B (%)', { exact: true }).fill('100');
    await page.getByLabel('Acerto', { exact: true }).selectOption('CYCLE');
    await page
        .getByLabel('Acerto aberto', { exact: true })
        .selectOption(result.settlementCycle!.id);
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Despesa registrada', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await page
        .getByRole('link', { name: 'Voltar às Finanças', exact: true })
        .click();
    await page.getByRole('link', { name: 'Ver acertos', exact: true }).click();
    await expect(list(page)).toContainText('2 pendências na composição');
    await list(page).getByRole('link').click();
    await expect(detailList(page).getByRole('listitem')).toHaveCount(2);
    await expect(detailList(page)).toContainText('Nova no ciclo');
});

for (const status of ['CLOSING', 'CLOSED'] as const)
    test(`A14: explicit lifecycle HTTP fake ${status} preserves authorized cycle reading`, async ({
        page,
        context,
    }) => {
        const value = fakeList([{ ...fakeCycle(), status: 'OPEN' }]);
        value.spaceStatus = status;
        await page.route(endpoint(), (route) => route.fulfill({ json: value }));
        await open(page, context);
        await expect(list(page).getByRole('listitem')).toHaveCount(1);
        await expect(
            page.getByRole('button', {
                name: 'Atualizar / Voltar ao início',
                exact: true,
            }),
        ).toBeEnabled();
        await expect(
            page.getByRole('button', {
                name: /transferir|finalizar|compensar/i,
            }),
        ).toHaveCount(0);
    });

test('A13: direct unauthenticated and personal-space entries expose no financial data', async ({
    page,
    context,
}) => {
    await page.goto(path());
    await expect(page).toHaveURL('/login');
    await context.addCookies(a.state.cookies);
    await page.goto(path(a.personalId));
    await expect(
        page.getByText('Acertos se aplicam somente a espaços compartilhados.', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(list(page)).toHaveCount(0);
    await expect(totals(page)).toHaveCount(0);
});
