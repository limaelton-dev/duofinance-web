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
import type { InterMemberPosition } from '../../src/features/finances/types/inter-member-position';
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
const path = (space = shared) => `/spaces/${space}/finances`;
const endpoint = (space = shared) =>
    `${apiUrl}/spaces/${space}/inter-member-position*`;
const trigger = (page: Page) =>
    page.getByRole('combobox', { name: 'Espaço atual', exact: true });
const list = (page: Page) =>
    page.getByRole('list', { name: 'Pendências abertas' });
const totals = (page: Page) =>
    page
        .getByLabel('Posição entre vocês', { exact: true })
        .getByRole('definition')
        .filter({ hasText: 'R$' });
async function post(api: APIRequestContext, url: string, data: object) {
    const csrf = await api.get(`${setupUrl}/auth/csrf`);
    expect(csrf.status()).toBe(200);
    return api.post(`${setupUrl}${url}`, {
        headers: {
            Origin: origin,
            'X-CSRF-Token': (await csrf.json()).csrfToken,
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
        settlement: { mode: 'NONE' },
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
        page.getByRole('heading', { name: 'Finanças', exact: true }),
    ).toBeVisible();
}
async function realPair(api: APIRequestContext) {
    return [
        await record(api, 'Origem a pagar', 35000, 'B', 35000),
        await record(api, 'Origem a receber', 8000, 'A', 0),
    ];
}
function fakePosition(space = shared): InterMemberPosition {
    return {
        spaceId: space,
        spaceStatus: 'ACTIVE',
        actorMemberId: financial.actorMemberId,
        members: financial.members,
        scope: 'OPEN_OBLIGATIONS',
        summary: {
            payableAmountInCents: '0',
            receivableAmountInCents: '0',
            net: { direction: 'BALANCED', amountInCents: '0' },
        },
        items: [],
        page: { direction: 'ALL', pageSize: 20, nextCursor: null },
    };
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
async function ignorePositionAbort(page: Page) {
    await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (url, init) =>
            original(
                url,
                typeof url === 'string' && url.includes('inter-member-position')
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

for (const payer of ['A', 'B'] as const)
    test(`A01/A14/A19: POST real Mercado 40/60, ${payer} paga, posição e origem após refresh`, async ({
        page,
        context,
        request,
    }) => {
        const result = await record(
            request,
            'Mercado',
            50000,
            payer,
            20000,
            payer === 'A' ? financial.actorMemberId : null,
        );
        await open(page, context);
        await expect(totals(page)).toHaveText(
            payer === 'A'
                ? ['R$ 0,00', 'R$ 300,00', 'Você recebe R$ 300,00']
                : ['R$ 200,00', 'R$ 0,00', 'Você paga R$ 200,00'],
        );
        await page
            .getByRole('link', { name: 'Ver despesa: Mercado', exact: true })
            .click();
        await expect(page).toHaveURL(
            `/spaces/${shared}/expenses/${result.commitment.id}`,
        );
        await expect(
            page.getByRole('heading', { name: 'Mercado', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('region', {
                name: 'Resumo da despesa',
                exact: true,
            }),
        ).toContainText('R$ 500,00');
        await page.reload();
        await expect(
            page.getByText('Sua parte: R$ 200,00', { exact: true }),
        ).toBeVisible();
        await page
            .getByText('Identificação do registro', { exact: true })
            .click();
        await expect(
            page.getByText(`Registro: ${result.commitment.id}`, {
                exact: true,
            }),
        ).toBeVisible();
        await expect(page.getByText(/^Responsável previsto:/)).toHaveCount(
            payer === 'A' ? 1 : 0,
        );
        await page
            .getByRole('link', { name: 'Voltar às Finanças', exact: true })
            .click();
        await expect(list(page).getByRole('listitem')).toHaveCount(1);
    });

test('A02/A09: POSTs reais brutos 350/80, líquido 270, filtro e perspectiva inversa', async ({
    page,
    context,
    request,
    browser,
}) => {
    const results = await realPair(request);
    await open(page, context);
    await expect(totals(page)).toHaveText([
        'R$ 350,00',
        'R$ 80,00',
        'Você paga R$ 270,00',
    ]);
    await expect(list(page).getByRole('listitem')).toHaveCount(2);
    await page
        .getByLabel('Mostrar pendências', { exact: true })
        .selectOption('PAYABLE');
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await expect(list(page)).toContainText('Origem a pagar');
    await expect(totals(page)).toHaveText([
        'R$ 350,00',
        'R$ 80,00',
        'Você paga R$ 270,00',
    ]);
    await page
        .getByLabel('Mostrar pendências', { exact: true })
        .selectOption('RECEIVABLE');
    await expect(list(page)).toContainText('Origem a receber');
    const recipient = await browser.newContext({ storageState: b.state });
    try {
        const member = await recipient.newPage();
        await member.goto(path());
        await expect(totals(member)).toHaveText([
            'R$ 80,00',
            'R$ 350,00',
            'Você recebe R$ 270,00',
        ]);
        const links = await list(member)
            .getByRole('link')
            .evaluateAll((elements) =>
                elements.map((element) => element.getAttribute('href')),
            );
        expect(links.sort()).toEqual(
            results
                .map(
                    (result) =>
                        `/spaces/${shared}/expenses/${result.commitment.id}`,
                )
                .sort(),
        );
    } finally {
        await recipient.close();
    }
});

test('A03: equilíbrio real preserva duas pendências e explica que não estão resolvidas', async ({
    page,
    context,
    request,
}) => {
    await record(request, 'Primeira origem', 8000, 'B', 8000);
    await record(request, 'Segunda origem', 8000, 'A', 0);
    await open(page, context);
    await expect(totals(page)).toHaveText(['R$ 80,00', 'R$ 80,00', 'R$ 0,00']);
    await expect(
        page.getByText(
            'Os valores se equilibram, mas ainda existem pendências abertas.',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(list(page).getByRole('listitem')).toHaveCount(2);
    await page.reload();
    await expect(list(page).getByRole('listitem')).toHaveCount(2);
});

test('A04/A11/A17: vazio real, criador sozinho e pessoal sem seção entre membros', async ({
    page,
    context,
    request,
}) => {
    await record(request, 'Só o pagador', 50000, 'A', 50000, null, alone);
    await open(page, context, alone);
    await expect(
        page.getByText('Não há valores a acertar.', { exact: true }),
    ).toBeVisible();
    await expect(totals(page)).toHaveText(['R$ 0,00', 'R$ 0,00', 'R$ 0,00']);
    await trigger(page).selectOption(shared);
    await expect(page).toHaveURL(path());
    await expect(
        page.getByText('Não há valores a acertar.', { exact: true }),
    ).toBeVisible();
    await trigger(page).selectOption(a.personalId);
    await expect(page).toHaveURL(path(a.personalId));
    await page.goto(path(a.personalId));
    await expect(
        page.getByRole('heading', { name: 'Entre vocês', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('heading', {
            name: 'Histórico de despesas',
            exact: true,
        }),
    ).toBeVisible();
});

test('A08/A16: 21 origens reais, página substituída, filtros e atualizar descartam cursor', async ({
    page,
    context,
    request,
}) => {
    const ids: string[] = [];
    for (let index = 0; index < 21; index++)
        ids.push(
            (await record(request, `Origem ${index}`, 100, 'B', 100)).commitment
                .id,
        );
    await dbQuery(
        "UPDATE inter_member_obligations SET registered_at='2099-01-01T00:00:00.123456Z'",
    );
    await open(page, context);
    await expect(list(page).getByRole('listitem')).toHaveCount(20);
    const first = await list(page)
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    await page
        .getByRole('button', { name: 'Próximas pendências', exact: true })
        .click();
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    const last = await list(page).getByRole('link').getAttribute('href');
    expect(first).not.toContain(last);
    expect([...first, last].sort()).toEqual(
        ids.map((id) => `/spaces/${shared}/expenses/${id}`).sort(),
    );
    await expect(totals(page)).toHaveText([
        'R$ 21,00',
        'R$ 0,00',
        'Você paga R$ 21,00',
    ]);
    await expect(
        page.getByText('Fim das pendências para este filtro.', { exact: true }),
    ).toBeVisible();
    await page
        .getByLabel('Mostrar pendências', { exact: true })
        .selectOption('RECEIVABLE');
    await expect(
        page.getByText(
            'Nenhuma pendência nesta página para o filtro escolhido.',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(totals(page)).toHaveText([
        'R$ 21,00',
        'R$ 0,00',
        'Você paga R$ 21,00',
    ]);
    await page
        .getByLabel('Mostrar pendências', { exact: true })
        .selectOption('ALL');
    await expect(list(page).getByRole('listitem')).toHaveCount(20);
    await page
        .getByRole('button', { name: 'Próximas pendências', exact: true })
        .click();
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await page
        .getByRole('button', {
            name: 'Atualizar / Voltar ao início',
            exact: true,
        })
        .click();
    await expect(list(page).getByRole('listitem')).toHaveCount(20);
});

test('A16/A19: nova despesa pela interface retorna à posição atual com outra origem', async ({
    page,
    context,
}) => {
    await open(page, context);
    await expect(
        page.getByText('Não há valores a acertar.', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('link', { name: 'Adicionar despesa', exact: true })
        .click();
    await page
        .getByLabel('Descrição', { exact: true })
        .fill('Despesa pela interface');
    await page.getByLabel('Valor (R$)', { exact: true }).fill('500,00');
    await page.getByLabel('Forma de pagamento').selectOption('DEBIT');
    await page.getByLabel('Posição A (%)', { exact: true }).fill('40');
    await page.getByLabel('Posição B (%)', { exact: true }).fill('60');
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
    await expect(totals(page)).toHaveText([
        'R$ 0,00',
        'R$ 300,00',
        'Você recebe R$ 300,00',
    ]);
    await expect(list(page)).toContainText('Despesa pela interface');
});

for (const failure of ['network', '500'] as const)
    test(`A17: fake HTTP ${failure}, loading sem zeros, erro e retry explícito`, async ({
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
                            message: 'Falha controlada',
                            details: {},
                        },
                    });
            } else await route.continue();
        });
        await open(page, context);
        await started.promise;
        await expect(
            page.getByText('Carregando posição entre vocês…', { exact: true }),
        ).toBeVisible();
        await expect(totals(page)).toHaveCount(0);
        release.resolve();
        await expect(
            page.getByRole('alert').filter({
                hasText: 'Não foi possível consultar a posição entre vocês.',
            }),
        ).toContainText('Não foi possível consultar a posição entre vocês.');
        await expect(
            page.getByText('Não há valores a acertar.', { exact: true }),
        ).toHaveCount(0);
        await expect(totals(page)).toHaveCount(0);
        expect(reads).toBe(1);
        await page
            .getByRole('button', {
                name: 'Tentar novamente a posição',
                exact: true,
            })
            .click();
        await expect(
            page.getByText('Não há valores a acertar.', { exact: true }),
        ).toBeVisible();
        expect(reads).toBe(2);
    });

test('A06: fake HTTP total maior que inteiro seguro é formatado exatamente', async ({
    page,
    context,
}) => {
    const value = fakePosition();
    value.summary = {
        payableAmountInCents: '18014398509481983',
        receivableAmountInCents: '0',
        net: { direction: 'PAYABLE', amountInCents: '18014398509481983' },
    };
    await page.route(endpoint(), (route) => route.fulfill({ json: value }));
    await open(page, context);
    await expect(totals(page)).toHaveText([
        'R$ 180.143.985.094.819,83',
        'R$ 0,00',
        'Você paga R$ 180.143.985.094.819,83',
    ]);
});

for (const status of [200, 401])
    test(`A15: fake HTTP ${status} atrasado A→B→A não publica nem expira sessão atual`, async ({
        page,
        context,
    }) => {
        await ignorePositionAbort(page);
        const started = deferred(),
            release = deferred();
        let reads = 0;
        await page.route(endpoint(), async (route) => {
            if (++reads === 1) {
                started.resolve();
                await release.promise;
                const value = fakePosition();
                value.summary = {
                    payableAmountInCents: '99900',
                    receivableAmountInCents: '0',
                    net: { direction: 'PAYABLE', amountInCents: '99900' },
                };
                await route.fulfill({
                    status,
                    headers: { 'X-Test-Stale': 'true' },
                    json:
                        status === 200
                            ? value
                            : {
                                  code: 'UNAUTHENTICATED',
                                  message: 'Sessão antiga',
                                  details: {},
                              },
                });
            } else await route.continue();
        });
        await open(page, context);
        await started.promise;
        await trigger(page).selectOption(other);
        await expect(page).toHaveURL(path(other));
        await expect(
            page.getByText('Não há valores a acertar.', { exact: true }),
        ).toBeVisible();
        await trigger(page).selectOption(shared);
        await expect(page).toHaveURL(path());
        await expect(
            page.getByText('Não há valores a acertar.', { exact: true }),
        ).toBeVisible();
        const late = page.waitForResponse(
            (response) =>
                response.url().includes('/inter-member-position') &&
                response.status() === status &&
                response.headers()['x-test-stale'] === 'true',
        );
        release.resolve();
        await (await late).finished();
        await trigger(page).selectOption(other);
        await expect(page).toHaveURL(path(other));
        await trigger(page).selectOption(shared);
        await expect(page).toHaveURL(path());
        await expect(totals(page)).toHaveText([
            'R$ 0,00',
            'R$ 0,00',
            'R$ 0,00',
        ]);
        await expect(page.getByText(/999,00/)).toHaveCount(0);
    });

for (const status of [200, 401])
    test(`A15/A16: fake HTTP ${status} de filtro antigo ALL→PAYABLE→ALL não publica nem expira sessão`, async ({
        page,
        context,
        request,
    }) => {
        await realPair(request);
        await ignorePositionAbort(page);
        const started = deferred(),
            release = deferred();
        let reads = 0;
        await page.route(endpoint(), async (route) => {
            if (++reads === 1) {
                started.resolve();
                await release.promise;
                const value = fakePosition();
                value.summary = {
                    payableAmountInCents: '99900',
                    receivableAmountInCents: '0',
                    net: { direction: 'PAYABLE', amountInCents: '99900' },
                };
                await route.fulfill({
                    status,
                    headers: { 'X-Test-Stale': 'true' },
                    json:
                        status === 200
                            ? value
                            : {
                                  code: 'UNAUTHENTICATED',
                                  message: 'Filtro antigo',
                                  details: {},
                              },
                });
            } else await route.continue();
        });
        await open(page, context);
        await started.promise;
        await page
            .getByLabel('Mostrar pendências', { exact: true })
            .selectOption('PAYABLE');
        await expect(list(page).getByRole('listitem')).toHaveCount(1);
        await page
            .getByLabel('Mostrar pendências', { exact: true })
            .selectOption('ALL');
        const late = page.waitForResponse(
            (response) =>
                response.url().includes('/inter-member-position') &&
                response.status() === status &&
                response.headers()['x-test-stale'] === 'true',
        );
        release.resolve();
        await (await late).finished();
        await page
            .getByRole('button', {
                name: 'Atualizar / Voltar ao início',
                exact: true,
            })
            .click();
        await expect(list(page).getByRole('listitem')).toHaveCount(2);
        await expect(totals(page)).toHaveText([
            'R$ 350,00',
            'R$ 80,00',
            'Você paga R$ 270,00',
        ]);
        await expect(page.getByText(/999,00/)).toHaveCount(0);
        await expect(trigger(page)).toHaveValue(shared);
    });

test('A11: origem real de outro espaço não expõe detalhe', async ({
    page,
    context,
    request,
}) => {
    const result = await record(request, 'Origem protegida', 100, 'B', 100);
    await open(page, context, other);
    await page.goto(`/spaces/${other}/expenses/${result.commitment.id}`);
    await expect(
        page
            .getByRole('alert')
            .filter({ hasText: 'Não foi possível consultar esta despesa.' }),
    ).toContainText('Não foi possível consultar esta despesa.');
    await expect(page.getByText(/Origem protegida/)).toHaveCount(0);
});

test('A11/A17: fake HTTP acesso perdido remove resumo e volta ao pessoal', async ({
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
        page.getByRole('heading', { name: 'Entre vocês', exact: true }),
    ).toHaveCount(0);
});

for (const width of [390, 1280])
    test(`A18: ${width}px, teclado, labels, foco e ausência de overflow`, async ({
        page,
        context,
        request,
    }) => {
        await realPair(request);
        await page.setViewportSize({ width, height: 844 });
        await open(page, context);
        await expect(list(page).getByRole('listitem')).toHaveCount(2);
        await page.getByLabel('Mostrar pendências', { exact: true }).focus();
        await page.keyboard.press('Tab');
        const refreshButton = page.getByRole('button', {
            name: 'Atualizar / Voltar ao início',
            exact: true,
        });
        await expect(refreshButton).toBeFocused();
        const refreshResponse = page.waitForResponse(
            (response) =>
                response.request().method() === 'GET' &&
                response.url() ===
                    `${apiUrl}/spaces/${shared}/inter-member-position?direction=ALL` &&
                response.status() === 200,
        );
        await page.keyboard.press('Enter');
        expect(await (await refreshResponse).finished()).toBeNull();
        await expect(refreshButton).toHaveAttribute('aria-disabled', 'false');
        await expect(
            page.getByText('Carregando posição entre vocês…', { exact: true }),
        ).toHaveCount(0);
        await expect(list(page).getByRole('listitem')).toHaveCount(2);
        await expect(refreshButton).toBeFocused();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
        await expect(
            page.getByRole('navigation', {
                name: 'Navegação financeira',
                exact: true,
            }),
        ).toBeVisible();
        await page.keyboard.press('Tab');
        await expect(
            page.getByRole('link', { name: 'Registrar transferência' }),
        ).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(list(page).getByRole('link').first()).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(
            page.getByRole('heading', { name: 'Despesa', exact: true }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Voltar ao espaço', exact: true })
            .click();
        await expect(page).toHaveURL(`/spaces/${shared}`);
        const financesLink = page
            .getByRole('main')
            .getByRole('link', { name: 'Finanças', exact: true });
        await financesLink.focus();
        await expect(financesLink).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(path());
        await expect(list(page).getByRole('listitem')).toHaveCount(2);
    });

for (const status of ['CLOSING', 'CLOSED'] as const)
    test(`A12: fake de lifecycle ${status} mantém leitura e vazio sem ação de escrita`, async ({
        page,
        context,
    }) => {
        const value = fakePosition();
        value.spaceStatus = status;
        await page.route(endpoint(), (route) => route.fulfill({ json: value }));
        await open(page, context);
        await expect(
            page.getByText('Não há valores a acertar.', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Adicionar despesa', exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('button', {
                name: 'Atualizar / Voltar ao início',
                exact: true,
            }),
        ).toBeEnabled();
    });

for (const status of [200, 401])
    test(`A15: fake HTTP ${status} de sessão anterior mesma pessoa após logout/login`, async ({
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
        await ignorePositionAbort(page);
        const started = deferred(),
            release = deferred();
        let reads = 0;
        await page.route(endpoint(), async (route) => {
            if (++reads === 1) {
                started.resolve();
                await release.promise;
                const value = fakePosition();
                value.summary.payableAmountInCents = '99900';
                value.summary.net = {
                    direction: 'PAYABLE',
                    amountInCents: '99900',
                };
                await route.fulfill({
                    status,
                    headers: { 'X-Test-Stale': 'true' },
                    json:
                        status === 200
                            ? value
                            : {
                                  code: 'UNAUTHENTICATED',
                                  message: 'Sessão antiga',
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
                response.url().includes('/inter-member-position') &&
                response.status() === status &&
                response.headers()['x-test-stale'] === 'true',
        );
        release.resolve();
        await (await late).finished();
        await page.goto(path());
        await expect(totals(page)).toHaveText([
            'R$ 0,00',
            'R$ 0,00',
            'R$ 0,00',
        ]);
        await expect(page.getByText(/999,00/)).toHaveCount(0);
        a.state = await context.storageState();
    });
