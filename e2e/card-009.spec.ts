import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import { businessToday } from '../src/features/finances/utils/expense-money';
import type { FinancialContext } from '../src/features/finances/types/shared-expense';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const setupUrl = 'http://127.0.0.1:3101/v2';
const browserApiUrl = 'http://localhost:3101/v2';
const origin = 'http://localhost:3100';
const password = 'uma-senha-forte-de-testes';

type Account = {
    id: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};

async function post(api: APIRequestContext, url: string, data: object) {
    const csrf = await api.get(`${setupUrl}/auth/csrf`);
    expect(csrf.status()).toBe(200);
    const { csrfToken } = await csrf.json();
    return api.post(`${setupUrl}${url}`, {
        headers: {
            Origin: origin,
            'X-CSRF-Token': csrfToken,
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
    return {
        id: (await response.json()).person.id,
        state: await api.storageState(),
    };
}

let a: Account;
let b: Account;
test.beforeAll(async ({ playwright }) => {
    const actor = await playwright.request.newContext();
    const member = await playwright.request.newContext();
    try {
        a = await register(actor, 'Membro A');
        b = await register(member, 'Membro B');
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

async function sharedSpace(
    owner: APIRequestContext,
    member: APIRequestContext,
) {
    const created = await post(owner, '/spaces', {
        name: 'Casa acerto manual',
    });
    expect(created.status()).toBe(201);
    const body = await created.json();
    const token = new URLSearchParams(
        new URL(body.inviteUrl).hash.slice(1),
    ).get('token');
    const accepted = await post(member, '/invitations/respond', {
        token,
        decision: 'ACCEPT',
        expectedVersion: 1,
    });
    expect(accepted.status()).toBe(200);
    return body.space.id as string;
}

async function expense(
    api: APIRequestContext,
    spaceId: string,
    debtor: string,
    payer: string,
    description: string,
    cents: number,
    settlement: { mode: 'NONE' } | { mode: 'DATE'; targetDate: string },
) {
    const contextResponse = await api.get(
        `${setupUrl}/spaces/${spaceId}/financial-entry-context`,
    );
    expect(contextResponse.status()).toBe(200);
    const financial = (await contextResponse.json()) as FinancialContext;
    const response = await post(
        api,
        `/spaces/${spaceId}/shared-cash-expenses`,
        {
            expectedSpaceVersion: financial.version,
            description,
            amountInCents: cents,
            factDate: businessToday(),
            expectedPayerMemberId: null,
            responsibilitySplit: {
                mode: 'AMOUNTS',
                shares: financial.members.map((m) => ({
                    memberId: m.memberId,
                    amountInCents: m.memberId === debtor ? cents : 0,
                })),
            },
            disbursement: { payerMemberId: payer, method: 'PIX' },
            settlement,
        },
    );
    expect(response.status()).toBe(201);
    return response.json();
}

async function open(
    page: Page,
    context: BrowserContext,
    spaceId: string,
    account: Account,
    path: string,
) {
    await context.addCookies(
        account.state.cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    );
    await page.goto(`/spaces/${spaceId}${path}`);
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(spaceId);
}

function deferred() {
    let resolve!: () => void;
    return {
        promise: new Promise<void>((done) => {
            resolve = done;
        }),
        resolve: () => resolve(),
    };
}

for (const status of [200, 401])
    test(`A21: resposta ${status} atrasada após A→B→A não publica dados nem expira sessão`, async ({
        playwright,
        page,
        context,
    }) => {
        const actor = await playwright.request.newContext({
            storageState: a.state,
        });
        const member = await playwright.request.newContext({
            storageState: b.state,
        });
        const started = deferred();
        const release = deferred();
        try {
            const first = await sharedSpace(actor, member);
            const second = await sharedSpace(actor, member);
            const financial = (await (
                await actor.get(
                    `${setupUrl}/spaces/${first}/financial-entry-context`,
                )
            ).json()) as FinancialContext;
            await expense(
                actor,
                first,
                financial.members.find((m) => m.personId === a.id)!.memberId,
                financial.members.find((m) => m.personId === b.id)!.memberId,
                'Origem atual',
                1000,
                { mode: 'NONE' },
            );
            const current = await actor.get(
                `${setupUrl}/spaces/${first}/settlement-transfers/options?direction=PAYABLE`,
            );
            expect(current.status()).toBe(200);
            const old = await current.json();
            old.items[0].origin.description = 'Origem atrasada';
            await page.addInitScript(() => {
                const original = window.fetch;
                window.fetch = (url, init) =>
                    original(
                        url,
                        typeof url === 'string' &&
                            url.includes('settlement-transfers/options')
                            ? { ...init, signal: undefined }
                            : init,
                    );
            });
            let reads = 0;
            let delivered = false;
            await page.route(
                `${browserApiUrl}/spaces/${first}/settlement-transfers/options**`,
                async (route) => {
                    if (++reads !== 1) return route.continue();
                    started.resolve();
                    await release.promise;
                    await route.fulfill({
                        status,
                        headers: {
                            'Access-Control-Allow-Origin': origin,
                            'Access-Control-Allow-Credentials': 'true',
                            'Content-Type': 'application/json',
                            'X-Test-Stale': 'true',
                        },
                        body: JSON.stringify(
                            status === 200
                                ? old
                                : {
                                      code: 'UNAUTHENTICATED',
                                      message: 'Sessão antiga',
                                  },
                        ),
                    });
                    delivered = true;
                },
            );
            await open(
                page,
                context,
                first,
                a,
                '/finances/settlements/transfers/new',
            );
            await started.promise;
            const switcher = page.getByRole('combobox', {
                name: 'Espaço atual',
                exact: true,
            });
            await switcher.selectOption(second);
            await expect(switcher).toHaveValue(second);
            await switcher.selectOption(first);
            await expect(switcher).toHaveValue(first);
            await expect(
                page.getByRole('checkbox', { name: /Origem atual/ }),
            ).toBeVisible();
            release.resolve();
            await expect.poll(() => delivered).toBe(true);
            await expect(page.getByText('Origem atrasada')).toHaveCount(0);
            await expect(
                page.getByRole('checkbox', { name: /Origem atual/ }),
            ).toBeVisible();
            await expect(switcher).toHaveValue(first);
        } finally {
            release.resolve();
            await actor.dispose();
            await member.dispose();
        }
    });

test('A01/A02/A08/A10/A22: registro parcial e total mantém origem e histórico após reload', async ({
    playwright,
    page,
    context,
}) => {
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    const member = await playwright.request.newContext({
        storageState: b.state,
    });
    try {
        const spaceId = await sharedSpace(actor, member);
        const financial = (await (
            await actor.get(
                `${setupUrl}/spaces/${spaceId}/financial-entry-context`,
            )
        ).json()) as FinancialContext;
        const memberA = financial.members.find(
            (m) => m.personId === a.id,
        )!.memberId;
        const memberB = financial.members.find(
            (m) => m.personId === b.id,
        )!.memberId;
        const original = await expense(
            actor,
            spaceId,
            memberA,
            memberB,
            'Mercado acerto',
            20000,
            { mode: 'DATE', targetDate: '2099-11-10' },
        );
        await open(page, context, spaceId, a, '/finances');
        await page
            .getByRole('link', { name: 'Registrar transferência' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Registrar transferência' }),
        ).toBeVisible();
        await page
            .getByRole('textbox', { name: 'Valor transferido (R$)' })
            .fill('70,00');
        await page.getByRole('checkbox', { name: /Mercado acerto/ }).check();
        await page
            .getByRole('textbox', { name: 'Aplicar em Mercado acerto (R$)' })
            .fill('70,00');
        await expect(page.getByText('Falta distribuir: R$ 0,00')).toBeVisible();
        await page
            .getByRole('button', { name: 'Confirmar transferência' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Transferência registrada' }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Ver transferência e alocações' })
            .click();
        await expect(page.getByText('Aplicado: R$ 70,00')).toBeVisible();
        await page.reload();
        await expect(page.getByText('Mercado acerto')).toBeVisible();
        await page.goto(
            `/spaces/${spaceId}/expenses/${original.commitment.id}`,
        );
        await expect(page.getByText(/Parcialmente acertada/)).toBeVisible();
        await page
            .getByRole('link', { name: 'Ver transferências desta pendência' })
            .click();
        await expect(
            page
                .getByRole('list', { name: 'Transferências registradas' })
                .getByRole('listitem'),
        ).toHaveCount(1);
        await page.goto(`/spaces/${spaceId}/finances`);
        await page
            .getByRole('link', { name: 'Registrar transferência' })
            .click();
        await page
            .getByRole('textbox', { name: 'Valor transferido (R$)' })
            .fill('130,00');
        await page.getByRole('checkbox', { name: /Mercado acerto/ }).check();
        await page
            .getByRole('textbox', { name: 'Aplicar em Mercado acerto (R$)' })
            .fill('130,00');
        await page
            .getByRole('button', { name: 'Confirmar transferência' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Transferência registrada' }),
        ).toBeVisible();
        await page.goto(
            `/spaces/${spaceId}/expenses/${original.commitment.id}`,
        );
        await expect(page.getByText(/Pendência: .*Acertada/)).toBeVisible();
        await page
            .getByRole('link', { name: 'Ver transferências desta pendência' })
            .click();
        await expect(
            page
                .getByRole('list', { name: 'Transferências registradas' })
                .getByRole('listitem'),
        ).toHaveCount(2);
        await page.goto(
            `/spaces/${spaceId}/finances/settlements/${original.settlementCycle.id}`,
        );
        await expect(
            page.getByText('Dinheiro transferido', { exact: true }),
        ).toBeVisible();
        await expect(
            page
                .getByText('Dinheiro transferido', { exact: true })
                .locator('..')
                .getByText('R$ 200,00', { exact: true }),
        ).toBeVisible();
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

test('A03/A06/A19: seleção entre páginas preserva aplicações em dois ciclos e uma avulsa', async ({
    playwright,
    page,
    context,
}) => {
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    const member = await playwright.request.newContext({
        storageState: b.state,
    });
    try {
        const spaceId = await sharedSpace(actor, member);
        const financial = (await (
            await actor.get(
                `${setupUrl}/spaces/${spaceId}/financial-entry-context`,
            )
        ).json()) as FinancialContext;
        const memberA = financial.members.find(
            (m) => m.personId === a.id,
        )!.memberId;
        const memberB = financial.members.find(
            (m) => m.personId === b.id,
        )!.memberId;
        for (let i = 0; i < 18; i++)
            await expense(
                actor,
                spaceId,
                memberA,
                memberB,
                `Filler ${String(i).padStart(2, '0')}`,
                100,
                { mode: 'NONE' },
            );
        await expense(
            actor,
            spaceId,
            memberA,
            memberB,
            'Primeiro ciclo',
            12000,
            { mode: 'DATE', targetDate: '2099-11-10' },
        );
        await expense(actor, spaceId, memberA, memberB, 'Segundo ciclo', 1500, {
            mode: 'DATE',
            targetDate: '2099-12-10',
        });
        await expense(
            actor,
            spaceId,
            memberA,
            memberB,
            'Pendência avulsa',
            1500,
            { mode: 'NONE' },
        );
        await open(
            page,
            context,
            spaceId,
            a,
            '/finances/settlements/transfers/new',
        );
        await page
            .getByRole('textbox', { name: 'Valor transferido (R$)' })
            .fill('151,00');
        const names = ['Primeiro ciclo', 'Segundo ciclo', 'Pendência avulsa'];
        for (const name of names)
            await page
                .getByRole('checkbox', { name: new RegExp(name) })
                .check();
        await page.getByRole('button', { name: 'Próximas pendências' }).click();
        await page.getByRole('checkbox', { name: /Filler 00/ }).check();
        await page
            .getByRole('textbox', { name: 'Aplicar em Primeiro ciclo (R$)' })
            .fill('120,00');
        await page
            .getByRole('textbox', { name: 'Aplicar em Segundo ciclo (R$)' })
            .fill('15,00');
        await page
            .getByRole('textbox', { name: 'Aplicar em Pendência avulsa (R$)' })
            .fill('15,00');
        await page
            .getByRole('textbox', { name: 'Aplicar em Filler 00 (R$)' })
            .fill('1,00');
        await page
            .getByRole('button', { name: 'Confirmar transferência' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Transferência registrada' }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Ver transferência e alocações' })
            .click();
        await expect(
            page
                .getByRole('list', { name: 'Alocações da transferência' })
                .getByRole('listitem'),
        ).toHaveCount(4);
        await expect(
            page.getByText('Sem acerto associado').first(),
        ).toBeVisible();
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

test('A04/A11/A23: outro membro é pagador, distribuição incompleta bloqueia envio e ambas as perspectivas consultam o fato', async ({
    playwright,
    page,
    context,
}) => {
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    const member = await playwright.request.newContext({
        storageState: b.state,
    });
    try {
        const spaceId = await sharedSpace(actor, member);
        const financial = (await (
            await actor.get(
                `${setupUrl}/spaces/${spaceId}/financial-entry-context`,
            )
        ).json()) as FinancialContext;
        const memberA = financial.members.find(
            (m) => m.personId === a.id,
        )!.memberId;
        const memberB = financial.members.find(
            (m) => m.personId === b.id,
        )!.memberId;
        await expense(actor, spaceId, memberB, memberA, 'Outro pagador', 5000, {
            mode: 'NONE',
        });
        await open(
            page,
            context,
            spaceId,
            a,
            '/finances/settlements/transfers/new',
        );
        await page
            .getByRole('combobox', { name: 'Quem transferiu' })
            .selectOption(memberB);
        await expect(
            page.getByRole('combobox', { name: 'Quem recebeu' }),
        ).toHaveValue(memberA);
        await page
            .getByRole('textbox', { name: 'Valor transferido (R$)' })
            .fill('50,00');
        await page.getByRole('checkbox', { name: /Outro pagador/ }).check();
        await page
            .getByRole('textbox', { name: 'Aplicar em Outro pagador (R$)' })
            .fill('40,00');
        await expect(
            page.getByText('Falta distribuir: R$ 10,00'),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Confirmar transferência' }),
        ).toBeDisabled();
        await page
            .getByRole('textbox', { name: 'Aplicar em Outro pagador (R$)' })
            .fill('50,00');
        await page
            .getByRole('button', { name: 'Confirmar transferência' })
            .click();
        await page
            .getByRole('link', { name: 'Ver transferência e alocações' })
            .click();
        await expect(page.getByText('Registrada por Membro A')).toBeVisible();
        await expect(
            page.getByText('Membro B transferiu R$ 50,00 para Membro A.'),
        ).toBeVisible();
        await context.clearCookies();
        await context.addCookies(
            b.state.cookies.map((cookie) => ({
                ...cookie,
                domain: 'localhost',
            })),
        );
        await page.reload();
        await expect(
            page.getByText('Membro B transferiu R$ 50,00 para Membro A.'),
        ).toBeVisible();
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

test('A20: duplo clique, 429, resultado incerto e CSRF repetem a mesma tentativa', async ({
    playwright,
    page,
    context,
}) => {
    await page.clock.install();
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    const member = await playwright.request.newContext({
        storageState: b.state,
    });
    try {
        const spaceId = await sharedSpace(actor, member);
        const financial = (await (
            await actor.get(
                `${setupUrl}/spaces/${spaceId}/financial-entry-context`,
            )
        ).json()) as FinancialContext;
        const memberA = financial.members.find(
            (m) => m.personId === a.id,
        )!.memberId;
        const memberB = financial.members.find(
            (m) => m.personId === b.id,
        )!.memberId;
        await expense(
            actor,
            spaceId,
            memberA,
            memberB,
            'Tentativa protegida',
            4000,
            { mode: 'NONE' },
        );
        const attempts: { key: string | null; body: string | null }[] = [];
        await page.route(
            `${browserApiUrl}/spaces/${spaceId}/settlement-transfers`,
            async (route) => {
                if (route.request().method() !== 'POST')
                    return route.continue();
                attempts.push({
                    key: route.request().headers()['idempotency-key'] ?? null,
                    body: route.request().postData(),
                });
                if (attempts.length === 4) return route.continue();
                const error =
                    attempts.length === 1
                        ? {
                              status: 429,
                              code: 'RATE_LIMITED',
                              message: 'Aguarde o prazo indicado.',
                          }
                        : attempts.length === 2
                          ? {
                                status: 503,
                                code: 'TEMPORARY_FAILURE',
                                message: 'Resultado incerto.',
                            }
                          : {
                                status: 403,
                                code: 'INVALID_CSRF_TOKEN',
                                message: 'Proteção expirada.',
                            };
                await route.fulfill({
                    status: error.status,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': origin,
                        'Access-Control-Allow-Credentials': 'true',
                        'Access-Control-Expose-Headers': 'Retry-After',
                        ...(error.status === 429
                            ? { 'Retry-After': '10' }
                            : {}),
                    },
                    body: JSON.stringify({
                        code: error.code,
                        message: error.message,
                    }),
                });
            },
        );
        await open(
            page,
            context,
            spaceId,
            a,
            '/finances/settlements/transfers/new',
        );
        await page
            .getByRole('textbox', { name: 'Valor transferido (R$)' })
            .fill('40,00');
        await page
            .getByRole('checkbox', { name: /Tentativa protegida/ })
            .check();
        await page
            .getByRole('textbox', {
                name: 'Aplicar em Tentativa protegida (R$)',
            })
            .fill('40,00');
        await page
            .getByRole('button', { name: 'Confirmar transferência' })
            .evaluate((button) => {
                (button as HTMLButtonElement).click();
                (button as HTMLButtonElement).click();
            });
        await expect(
            page.getByRole('button', { name: 'Reenviar a mesma tentativa' }),
        ).toBeVisible();
        expect(attempts).toHaveLength(1);
        await page
            .getByRole('button', { name: 'Reenviar a mesma tentativa' })
            .click();
        await expect(
            page.getByText(
                'Aguarde o prazo indicado antes de tentar novamente.',
            ),
        ).toBeVisible();
        expect(attempts).toHaveLength(1);
        await page.clock.fastForward(10100);
        await page
            .getByRole('button', { name: 'Reenviar a mesma tentativa' })
            .click();
        await expect.poll(() => attempts.length).toBe(2);
        await page
            .getByRole('button', { name: 'Reenviar a mesma tentativa' })
            .click();
        await expect.poll(() => attempts.length).toBe(3);
        await page
            .getByRole('button', { name: 'Reenviar a mesma tentativa' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Transferência registrada' }),
        ).toBeVisible();
        expect(attempts).toHaveLength(4);
        expect(new Set(attempts.map((attempt) => attempt.key)).size).toBe(1);
        expect(new Set(attempts.map((attempt) => attempt.body)).size).toBe(1);
        await page.goto(`/spaces/${spaceId}/finances/settlements/transfers`);
        await expect(
            page
                .getByRole('list', { name: 'Transferências registradas' })
                .getByRole('listitem'),
        ).toHaveCount(1);
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

test('A05/A20: conflito atualiza opções e nova confirmação usa outra chave', async ({
    playwright,
    page,
    context,
}) => {
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    const member = await playwright.request.newContext({
        storageState: b.state,
    });
    try {
        const spaceId = await sharedSpace(actor, member);
        const financial = (await (
            await actor.get(
                `${setupUrl}/spaces/${spaceId}/financial-entry-context`,
            )
        ).json()) as FinancialContext;
        const memberA = financial.members.find(
            (m) => m.personId === a.id,
        )!.memberId;
        const memberB = financial.members.find(
            (m) => m.personId === b.id,
        )!.memberId;
        await expense(
            actor,
            spaceId,
            memberA,
            memberB,
            'Conflito renovado',
            3000,
            { mode: 'NONE' },
        );
        const keys: (string | null)[] = [];
        await page.route(
            `${browserApiUrl}/spaces/${spaceId}/settlement-transfers`,
            async (route) => {
                if (route.request().method() !== 'POST')
                    return route.continue();
                keys.push(route.request().headers()['idempotency-key'] ?? null);
                if (keys.length > 1) return route.continue();
                await route.fulfill({
                    status: 409,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': origin,
                        'Access-Control-Allow-Credentials': 'true',
                    },
                    body: JSON.stringify({
                        code: 'CONCURRENT_MODIFICATION',
                        message: 'Pendência alterada.',
                    }),
                });
            },
        );
        await open(
            page,
            context,
            spaceId,
            a,
            '/finances/settlements/transfers/new',
        );
        await page
            .getByRole('textbox', { name: 'Valor transferido (R$)' })
            .fill('30,00');
        await page.getByRole('checkbox', { name: /Conflito renovado/ }).check();
        await page
            .getByRole('textbox', { name: 'Aplicar em Conflito renovado (R$)' })
            .fill('30,00');
        await page
            .getByRole('button', { name: 'Confirmar transferência' })
            .click();
        await expect(
            page.getByText(
                'As pendências mudaram. Confira os valores atuais e faça uma nova confirmação.',
            ),
        ).toBeVisible();
        await expect(
            page.getByRole('checkbox', { name: /Conflito renovado/ }),
        ).not.toBeChecked();
        await page.getByRole('checkbox', { name: /Conflito renovado/ }).check();
        await page
            .getByRole('textbox', { name: 'Aplicar em Conflito renovado (R$)' })
            .fill('30,00');
        await page
            .getByRole('button', { name: 'Confirmar transferência' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Transferência registrada' }),
        ).toBeVisible();
        expect(keys).toHaveLength(2);
        expect(keys[0]).not.toBe(keys[1]);
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

test('A23: vazio, erro, somente leitura e mobile distinguem estados sem escrita', async ({
    playwright,
    page,
    context,
}) => {
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    const member = await playwright.request.newContext({
        storageState: b.state,
    });
    try {
        const spaceId = await sharedSpace(actor, member);
        let failed = false;
        await page.route(
            `${browserApiUrl}/spaces/${spaceId}/settlement-transfers/options**`,
            async (route) => {
                if (!failed) {
                    failed = true;
                    await route.fulfill({
                        status: 503,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': origin,
                            'Access-Control-Allow-Credentials': 'true',
                        },
                        body: JSON.stringify({
                            code: 'TEMPORARY_FAILURE',
                            message: 'Indisponível.',
                        }),
                    });
                } else {
                    await route.continue();
                }
            },
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await open(
            page,
            context,
            spaceId,
            a,
            '/finances/settlements/transfers/new',
        );
        await expect(
            page.getByRole('alert').filter({
                hasText: 'Não foi possível consultar as pendências elegíveis.',
            }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Tentar novamente as pendências' })
            .click();
        await expect(
            page.getByText(
                'Nenhuma pendência elegível nesta direção e neste recorte.',
            ),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Prévia' }),
        ).toBeVisible();
        await page.unroute(
            `${browserApiUrl}/spaces/${spaceId}/settlement-transfers/options**`,
        );
        await page.route(
            `${browserApiUrl}/spaces/${spaceId}/settlement-transfers/options**`,
            async (route) => {
                const response = await route.fetch();
                const body = await response.json();
                await route.fulfill({
                    response,
                    json: { ...body, spaceStatus: 'CLOSED', canRecord: false },
                });
            },
        );
        await page
            .getByRole('button', {
                name: 'Atualizar pendências / Voltar ao início',
            })
            .click();
        await expect(
            page.getByText('Este espaço está somente para consulta.'),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Confirmar transferência' }),
        ).toBeDisabled();
        await expect(
            page.getByRole('link', { name: 'Histórico de transferências' }),
        ).toBeVisible();
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});
