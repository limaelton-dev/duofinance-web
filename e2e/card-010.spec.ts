import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import { businessToday } from '../src/features/finances/utils/expense-money';
import type { FinancialContext } from '../src/features/finances/types/shared-expense';
import type { Today } from '../src/features/today/types/today';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const setupUrl = 'http://127.0.0.1:3101/v2';
const browserApiUrl = 'http://localhost:3101/v2';
const origin = 'http://localhost:3100';
const password = 'uma-senha-forte-de-testes';
const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
};

type Account = {
    id: string;
    email: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};

async function post(api: APIRequestContext, path: string, data: object) {
    const csrf = await api.get(`${setupUrl}/auth/csrf`);
    expect(csrf.status()).toBe(200);
    const { csrfToken } = await csrf.json();
    return api.post(`${setupUrl}${path}`, {
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
    displayName: string,
): Promise<Account> {
    const email = `${randomUUID()}@example.com`;
    const response = await post(api, '/auth/register', {
        displayName,
        email,
        password,
    });
    expect(response.status()).toBe(201);
    return {
        id: (await response.json()).person.id,
        email,
        state: await api.storageState(),
    };
}

async function sharedSpace(
    owner: APIRequestContext,
    member?: APIRequestContext,
) {
    const created = await post(owner, '/spaces', { name: 'Casa Hoje' });
    expect(created.status()).toBe(201);
    const body = await created.json();
    if (member) {
        const token = new URLSearchParams(
            new URL(body.inviteUrl).hash.slice(1),
        ).get('token');
        const accepted = await post(member, '/invitations/respond', {
            token,
            decision: 'ACCEPT',
            expectedVersion: 1,
        });
        expect(accepted.status()).toBe(200);
    }
    return body.space.id as string;
}

async function financialContext(
    api: APIRequestContext,
    spaceId: string,
): Promise<FinancialContext> {
    const response = await api.get(
        `${setupUrl}/spaces/${spaceId}/financial-entry-context`,
    );
    expect(response.status()).toBe(200);
    return response.json();
}

async function cycleFixture(sql: string, values: string[]) {
    const requireApi = createRequire(
        resolve(__dirname, '../../prospera-mais-api/package.json'),
    );
    const { Client } = requireApi('pg') as {
        Client: new (options: { connectionString: string }) => {
            connect(): Promise<void>;
            query(
                sql: string,
                values: string[],
            ): Promise<{ rows: { id: string }[] }>;
            end(): Promise<void>;
        };
    };
    const db = new Client({
        connectionString:
            'postgresql://test:test@127.0.0.1:55432/prospera_mais_test',
    });
    await db.connect();
    try {
        return (await db.query(sql, values)).rows;
    } finally {
        await db.end();
    }
}

async function expense(
    api: APIRequestContext,
    spaceId: string,
    debtorPersonId: string,
    payerPersonId: string,
    description: string,
    amountInCents: number,
    targetDate: string | null,
) {
    const financial = await financialContext(api, spaceId);
    const debtor = financial.members.find(
        (m) => m.personId === debtorPersonId,
    )!.memberId;
    const payer = financial.members.find(
        (m) => m.personId === payerPersonId,
    )!.memberId;
    const pastTargetDate =
        targetDate && targetDate < businessToday() ? targetDate : null;
    const cycles = pastTargetDate
        ? await cycleFixture(
              "SELECT id FROM settlement_cycles WHERE space_id=$1 AND target_date=$2 AND status='OPEN'",
              [spaceId, pastTargetDate],
          )
        : [];
    const fixtureCycleId = cycles[0]?.id;
    const response = await post(
        api,
        `/spaces/${spaceId}/shared-cash-expenses`,
        {
            expectedSpaceVersion: financial.version,
            description,
            amountInCents,
            factDate: businessToday(),
            expectedPayerMemberId: null,
            responsibilitySplit: {
                mode: 'AMOUNTS',
                shares: financial.members.map((m) => ({
                    memberId: m.memberId,
                    amountInCents: m.memberId === debtor ? amountInCents : 0,
                })),
            },
            disbursement: { payerMemberId: payer, method: 'PIX' },
            settlement: fixtureCycleId
                ? { mode: 'CYCLE', cycleId: fixtureCycleId }
                : targetDate
                  ? {
                        mode: 'DATE',
                        targetDate: pastTargetDate ? '2098-12-30' : targetDate,
                    }
                  : { mode: 'NONE' },
        },
    );
    expect(response.status()).toBe(201);
    const result = await response.json();
    if (pastTargetDate && !fixtureCycleId)
        await cycleFixture(
            'UPDATE settlement_cycles SET target_date=$1 WHERE id=$2 AND space_id=$3',
            [pastTargetDate, result.settlementCycle.id, spaceId],
        );
    return result;
}

async function readToday(
    api: APIRequestContext,
    spaceId: string,
): Promise<Today> {
    const response = await api.get(`${setupUrl}/spaces/${spaceId}/today`);
    expect(response.status()).toBe(200);
    return response.json();
}

function unavailableFinance(body: Today): Today {
    return {
        ...body,
        finance: {
            status: 'UNAVAILABLE',
            error: {
                code: 'FINANCE_TODAY_UNAVAILABLE',
                message:
                    'Não foi possível carregar as finanças. Tente novamente.',
            },
        },
        blocks: body.blocks.map((block) => {
            if (block.kind === 'ATTENTION' || block.kind === 'TODAY') {
                const items = block.items.filter(
                    (item) =>
                        item.type === 'TASK' || item.type === 'SPACE_CLOSURE',
                );
                return {
                    ...block,
                    status: 'PARTIAL',
                    items,
                    totalCount: null,
                    knownTotalCount: items.length,
                    hasMore: null,
                };
            }
            if (block.kind === 'UPCOMING' || block.kind === 'NEXT_SETTLEMENT')
                return {
                    ...block,
                    status: 'UNAVAILABLE',
                    items: [],
                    totalCount: null,
                    knownTotalCount: 0,
                    hasMore: null,
                };
            return block;
        }),
    };
}

async function openHome(
    page: Page,
    context: BrowserContext,
    account: Account,
    spaceId?: string,
) {
    await context.addCookies(
        account.state.cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    );
    await page.goto('/');
    await expect(
        page.getByRole('heading', { name: 'Hoje', exact: true }),
    ).toBeVisible();
    if (spaceId)
        await page
            .getByRole('combobox', { name: 'Espaço atual', exact: true })
            .selectOption(spaceId);
    if (spaceId)
        await expect(
            page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
        ).toHaveValue(spaceId);
}

async function login(page: Page, account: Account) {
    await page.getByLabel('E-mail', { exact: true }).fill(account.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Hoje', exact: true }),
    ).toBeVisible();
}

async function transfer(
    page: Page,
    spaceId: string,
    description: string,
    amount: string,
    recoverLostResponse = false,
) {
    const attempts: { key: string; replayed: boolean; id: string }[] = [];
    if (recoverLostResponse)
        await page.route(
            `${browserApiUrl}/spaces/${spaceId}/settlement-transfers`,
            async (route) => {
                if (route.request().method() !== 'POST')
                    return route.continue();
                const response = await route.fetch();
                const result = await response.json();
                expect(response.status()).toBe(result.replayed ? 200 : 201);
                attempts.push({
                    key: route.request().headers()['idempotency-key'],
                    replayed: result.replayed,
                    id: result.transfer.id,
                });
                if (attempts.length === 1) await route.abort('failed');
                else await route.fulfill({ response });
            },
        );
    await page.goto(`/spaces/${spaceId}/finances/settlements/transfers/new`);
    await page
        .getByRole('textbox', { name: 'Valor transferido (R$)' })
        .fill(amount);
    await page.getByRole('checkbox', { name: new RegExp(description) }).check();
    await page
        .getByRole('textbox', { name: `Aplicar em ${description} (R$)` })
        .fill(amount);
    await page.getByRole('button', { name: 'Confirmar transferência' }).click();
    if (recoverLostResponse) {
        await page
            .getByRole('button', {
                name: 'Reenviar a mesma tentativa',
                exact: true,
            })
            .click();
        await expect.poll(() => attempts.length).toBe(2);
        expect(attempts[0].replayed).toBe(false);
        expect(attempts[1].replayed).toBe(true);
        expect(attempts[1].key).toBe(attempts[0].key);
        expect(attempts[1].id).toBe(attempts[0].id);
        await page.unroute(
            `${browserApiUrl}/spaces/${spaceId}/settlement-transfers`,
        );
    }
    await expect(
        page.getByRole('heading', {
            name: 'Transferência registrada',
            exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Hoje', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Hoje', exact: true }),
    ).toBeVisible();
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve: () => resolve() };
}

let a: Account;
let b: Account;
let readSpaceId: string;
test.beforeAll(async ({ playwright }) => {
    const actor = await playwright.request.newContext();
    const member = await playwright.request.newContext();
    try {
        a = await register(actor, 'Pessoa A');
        b = await register(member, 'Pessoa B');
        readSpaceId = await sharedSpace(actor, member);
        await expense(
            actor,
            readSpaceId,
            a.id,
            b.id,
            'Leitura preservada',
            1000,
            '2099-11-10',
        );
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

test('A01/A07/A12/A18/A21/A24: jornada por comandos reais e tempo passado por fixture, com transferência parcial/replay/total, Hoje e origem', async ({
    playwright,
    page,
}) => {
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    const member = await playwright.request.newContext({
        storageState: b.state,
    });
    try {
        await page.goto('/login');
        await login(page, a);
        const spaceId = await sharedSpace(actor, member);
        const past = await expense(
            actor,
            spaceId,
            a.id,
            b.id,
            'Mercado vencido',
            20000,
            '2001-02-03',
        );
        const future = await expense(
            actor,
            spaceId,
            a.id,
            b.id,
            'Mercado futuro',
            30000,
            '2099-11-10',
        );
        await page.reload();
        await page
            .getByRole('combobox', { name: 'Espaço atual', exact: true })
            .selectOption(spaceId);
        const attention = page.getByRole('region', {
            name: 'Precisa de atenção',
        });
        await expect(attention.getByLabel('1 item no total')).toBeVisible();
        await expect(
            attention.getByText('Data-alvo vencida', { exact: false }),
        ).toBeVisible();
        await expect(
            attention.getByText('R$ 200,00', { exact: true }).first(),
        ).toBeVisible();
        await expect(
            page
                .getByRole('region', { name: 'Próximo acerto' })
                .getByRole('heading', { name: 'Acerto de 10/11/2099' }),
        ).toBeVisible();
        await expect(
            page.getByText('Nenhum compromisso próximo para exibir.'),
        ).toBeVisible();
        await page.getByRole('link', { name: 'Finanças', exact: true }).click();
        await expect(
            page
                .getByText('Pendências a pagar', { exact: true })
                .locator('..')
                .getByText('R$ 500,00', { exact: true }),
        ).toBeVisible();
        await page.getByRole('link', { name: 'Hoje', exact: true }).click();
        await attention
            .getByRole('link', { name: 'Ver acerto', exact: true })
            .click();
        await expect(page).toHaveURL(
            `${origin}/spaces/${spaceId}/finances/settlements/${past.settlementCycle.id}`,
        );
        await page
            .getByRole('link', {
                name: 'Ver despesa: Mercado vencido',
                exact: true,
            })
            .click();
        await expect(page).toHaveURL(
            new RegExp(`/spaces/${spaceId}/expenses/${past.commitment.id}`),
        );
        await page.reload();
        await expect(
            page.getByRole('heading', { name: 'Despesa', exact: true }),
        ).toBeVisible();
        await page.goBack();
        await expect(
            page.getByRole('heading', { name: /Acerto de/ }),
        ).toBeVisible();
        await transfer(page, spaceId, 'Mercado vencido', '70,00', true);
        await expect(
            attention
                .getByText('Falta acertar', { exact: true })
                .locator('..')
                .getByText('R$ 130,00', { exact: true }),
        ).toBeVisible();
        await transfer(page, spaceId, 'Mercado vencido', '130,00');
        await expect(attention).toHaveCount(0);
        await expect(
            page
                .getByRole('region', { name: 'Próximo acerto' })
                .getByText('Falta acertar', { exact: true })
                .locator('..')
                .getByText('R$ 300,00', { exact: true }),
        ).toBeVisible();
        await transfer(page, spaceId, 'Mercado futuro', '300,00');
        await expect(
            page.getByText(
                'Sem valor em aberto. Este ciclo continua em aberto.',
            ),
        ).toBeVisible();
        const body = await readToday(actor, spaceId);
        expect(body.finance.status).toBe('AVAILABLE');
        if (body.finance.status !== 'AVAILABLE')
            throw new Error('Finanças indisponíveis');
        expect(body.finance.data.upcomingCommitments).toEqual({
            items: [],
            totalCount: 0,
        });
        expect(body.finance.data.settlements!.nextCycle!.id).toBe(
            future.settlementCycle.id,
        );
        expect(body.finance.data.settlements!.nextCycle!.status).toBe('OPEN');
        expect(body.finance.data.settlements!.overdueCycles).toEqual({
            items: [],
            totalCount: 0,
        });
        await page.goto(`/spaces/${spaceId}/expenses/${past.commitment.id}`);
        await expect(page.getByText(/Pendência: .*Acertada/)).toBeVisible();
        await expect(
            page
                .getByRole('region', { name: 'Resumo da despesa' })
                .getByRole('heading', { name: 'Mercado vencido', exact: true }),
        ).toBeVisible();
        await expect(
            page
                .getByRole('region', { name: 'Resumo da despesa' })
                .getByText('R$ 200,00', { exact: true })
                .first(),
        ).toBeVisible();
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

for (const width of [1280, 390])
    test(`A13/A14/A22: pessoal e criador sozinho têm vazio honesto, CTA e teclado em ${width}px`, async ({
        playwright,
        page,
        context,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        const actor = await playwright.request.newContext({
            storageState: a.state,
        });
        try {
            const spaceId = await sharedSpace(actor);
            await openHome(page, context, a);
            await expect(
                page.getByRole('heading', { name: 'Próximo acerto' }),
            ).toHaveCount(0);
            await expect(
                page.getByRole('heading', { name: 'Precisa de atenção' }),
            ).toHaveCount(0);
            const add = page.getByRole('button', {
                name: 'Adicionar',
                exact: true,
            });
            await expect(add).toBeEnabled();
            await add.focus();
            await page.keyboard.press('Enter');
            await expect(
                page.getByRole('menuitem', {
                    name: 'Adicionar despesa',
                    exact: true,
                }),
            ).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(add).toBeFocused();
            await page
                .getByRole('button', { name: 'Gerenciar espaços' })
                .click();
            await expect(
                page.getByRole('menuitem', {
                    name: 'Criar espaço compartilhado',
                    exact: true,
                }),
            ).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(
                page.getByText('Nenhum compromisso próximo para exibir.'),
            ).toBeVisible();
            await page
                .getByRole('combobox', { name: 'Espaço atual', exact: true })
                .selectOption(spaceId);
            await expect(
                page.getByText('Aguardando outra pessoa entrar no espaço.'),
            ).toBeVisible();
            await page
                .getByRole('button', { name: 'Adicionar', exact: true })
                .click();
            await expect(
                page.getByRole('menuitem', {
                    name: 'Adicionar despesa',
                    exact: true,
                }),
            ).toHaveCount(0);
            await expect(
                page.getByRole('menuitem', {
                    name: 'Adicionar receita',
                    exact: true,
                }),
            ).toBeVisible();
            await page.keyboard.press('Escape');
            const invitation = page.getByRole('link', {
                name: 'Ver espaço e convite',
                exact: true,
            });
            await invitation.focus();
            await expect(invitation).toBeFocused();
            await page.keyboard.press('Enter');
            await expect(page).toHaveURL(`${origin}/spaces/${spaceId}`);
            await page.getByRole('link', { name: 'Hoje', exact: true }).click();
            await expect(
                page.getByText('Nenhum acerto para hoje ou datas futuras.'),
            ).toBeVisible();
            expect(
                await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth,
                ),
            ).toBe(true);
        } finally {
            await actor.dispose();
        }
    });

test('A05/A06: quatro vencidos mostram três e contagem completa; líquido zero mantém alerta e duas perspectivas', async ({
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
        await expense(
            actor,
            spaceId,
            a.id,
            b.id,
            'Duas direções A',
            4000,
            '2001-01-01',
        );
        await expense(
            member,
            spaceId,
            b.id,
            a.id,
            'Duas direções B',
            4000,
            '2001-01-01',
        );
        for (const day of ['02', '03', '04'])
            await expense(
                actor,
                spaceId,
                a.id,
                b.id,
                `Vencido ${day}`,
                1000,
                `2001-01-${day}`,
            );
        await openHome(page, context, a, spaceId);
        const attention = page.getByRole('region', {
            name: 'Precisa de atenção',
        });
        const list = attention.getByRole('list');
        await expect(list.getByRole('listitem')).toHaveCount(3);
        await expect(attention.getByLabel('4 itens no total')).toBeVisible();
        await expect(
            attention.getByText('Exibindo 3 de 4 itens.'),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Ver todos os acertos' }),
        ).toHaveAttribute('href', `/spaces/${spaceId}/finances/settlements`);
        const balanced = list.getByRole('listitem').first();
        await expect(
            balanced.getByText(
                'Os valores se equilibram, mas ainda existem pendências abertas.',
            ),
        ).toBeVisible();
        await expect(
            balanced
                .getByText('Falta acertar', { exact: true })
                .locator('..')
                .getByText('R$ 80,00', { exact: true }),
        ).toBeVisible();
        await expect(
            balanced.getByText('Você precisa acertar com Pessoa B: R$ 40,00'),
        ).toBeVisible();
        await expect(
            balanced.getByText('Pessoa B precisa acertar com você: R$ 40,00'),
        ).toBeVisible();
        await expect(
            list
                .getByRole('listitem')
                .nth(1)
                .getByText('Você precisa acertar com Pessoa B: R$ 10,00'),
        ).toBeVisible();
        await context.clearCookies();
        await openHome(page, context, b, spaceId);
        await expect(
            list
                .getByRole('listitem')
                .nth(1)
                .getByText('Pessoa A precisa acertar com você: R$ 10,00'),
        ).toBeVisible();
        await expect(
            list
                .getByRole('listitem')
                .first()
                .getByText(
                    'Os valores se equilibram, mas ainda existem pendências abertas.',
                ),
        ).toBeVisible();
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

for (const status of ['CLOSING', 'CLOSED'] as const)
    test(`A15 fixture de leitura: Hoje ${status} prevalece sobre detalhes ACTIVE sem oferecer nova despesa`, async ({
        playwright,
        page,
        context,
    }) => {
        const actor = await playwright.request.newContext({
            storageState: a.state,
        });
        try {
            const spaceId = readSpaceId;
            const body = await readToday(actor, spaceId);
            body.spaceStatus = status;
            await page.route(
                `${browserApiUrl}/spaces/${spaceId}/today`,
                (route) =>
                    route.fulfill({ status: 200, headers: cors, json: body }),
            );
            await openHome(page, context, a, spaceId);
            await expect(
                page.getByText(
                    `Espaço ${status === 'CLOSING' ? 'em encerramento' : 'encerrado'}`,
                ),
            ).toBeVisible();
            await expect(
                page.getByRole('button', {
                    name: 'Adicionar',
                    exact: true,
                }),
            ).toBeDisabled();
            await expect(
                page
                    .getByRole('region', { name: 'Próximo acerto' })
                    .getByRole('link', { name: 'Ver acerto' }),
            ).toBeVisible();
            await expect(
                page.getByRole('link', { name: 'Finanças', exact: true }),
            ).toBeVisible();
        } finally {
            await actor.dispose();
        }
    });

for (const status of [200, 500])
    test(`A19/A22 controlled response ${status}: indisponibilidade preserva shell, retry e nunca vira vazio`, async ({
        playwright,
        page,
        context,
    }) => {
        const actor = await playwright.request.newContext({
            storageState: a.state,
        });
        const started = deferred();
        const release = deferred();
        try {
            const spaceId = readSpaceId;
            const body = await readToday(actor, spaceId);
            let reads = 0;
            await page.route(
                `${browserApiUrl}/spaces/${spaceId}/today`,
                async (route) => {
                    if (++reads > 1)
                        return route.fulfill({
                            status: 200,
                            headers: cors,
                            json: body,
                        });
                    started.resolve();
                    await release.promise;
                    await route.fulfill({
                        status,
                        headers: cors,
                        json:
                            status === 200
                                ? unavailableFinance(body)
                                : {
                                      code: 'CONTROLLED_FAILURE',
                                      message: 'Falha controlada',
                                  },
                    });
                },
            );
            await openHome(page, context, a, spaceId);
            await started.promise;
            await expect(
                page.getByRole('status', { name: 'Carregando Hoje' }),
            ).toBeVisible();
            await expect(
                page.getByRole('combobox', {
                    name: 'Espaço atual',
                    exact: true,
                }),
            ).toBeVisible();
            release.resolve();
            await expect(
                page.getByText(
                    status === 200
                        ? 'Não foi possível carregar próximo acerto.'
                        : 'Não foi possível carregar Hoje.',
                ),
            ).toBeVisible();
            if (status === 200) {
                await expect(
                    page.getByRole('region', { name: 'Tarefas', exact: true }),
                ).toContainText('Nenhuma tarefa pendente para exibir.');
                await expect(
                    page.getByRole('region', { name: 'Compras', exact: true }),
                ).toContainText('Nenhuma compra pendente para exibir.');
                await expect(
                    page
                        .getByRole('region', { name: 'Precisa de atenção' })
                        .getByLabel(/itens? no total/),
                ).toHaveCount(0);
            }
            await expect(
                page.getByText('Nenhum compromisso próximo para exibir.'),
            ).toHaveCount(0);
            const retry = (
                status === 200
                    ? page.getByRole('region', { name: 'Próximo acerto' })
                    : page
            ).getByRole('button', {
                name: 'Tentar novamente',
                exact: true,
            });
            await retry.focus();
            await expect(retry).toBeFocused();
            await page.keyboard.press('Enter');
            await expect(
                page
                    .getByRole('region', { name: 'Próximo acerto' })
                    .getByText('Acerto de 10/11/2099'),
            ).toBeVisible();
        } finally {
            release.resolve();
            await actor.dispose();
        }
    });

for (const status of [200, 401])
    test(`A20 controlled response ${status}: A→B→A rejects delayed Today before publication or session expiry`, async ({
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
            await expense(
                actor,
                first,
                a.id,
                b.id,
                'Atual',
                1000,
                '2099-11-10',
            );
            const old = await readToday(actor, first);
            old.referenceDate = '2000-01-01';
            await page.addInitScript(() => {
                const original = window.fetch;
                window.fetch = (url, init) =>
                    original(
                        url,
                        typeof url === 'string' && url.endsWith('/today')
                            ? { ...init, signal: undefined }
                            : init,
                    );
            });
            let reads = 0;
            let delivered = false;
            await page.route(
                `${browserApiUrl}/spaces/${first}/today`,
                async (route) => {
                    if (++reads !== 1) return route.continue();
                    started.resolve();
                    await release.promise;
                    await route.fulfill({
                        status,
                        headers: cors,
                        json:
                            status === 200
                                ? old
                                : {
                                      code: 'UNAUTHENTICATED',
                                      message: 'Sessão antiga',
                                  },
                    });
                    delivered = true;
                },
            );
            await openHome(page, context, a, first);
            await started.promise;
            const switcher = page.getByRole('combobox', {
                name: 'Espaço atual',
                exact: true,
            });
            await switcher.selectOption(second);
            await expect(switcher).toHaveValue(second);
            await expect(page.getByText('Acerto de 10/11/2099')).toHaveCount(0);
            await switcher.selectOption(first);
            await expect(page.getByText('Acerto de 10/11/2099')).toBeVisible();
            release.resolve();
            await expect.poll(() => delivered).toBe(true);
            await expect(
                page.locator('time[datetime="2000-01-01"]'),
            ).toHaveCount(0);
            await expect(switcher).toHaveValue(first);
            await expect(page.getByText('Acerto de 10/11/2099')).toBeVisible();
        } finally {
            release.resolve();
            await actor.dispose();
            await member.dispose();
        }
    });

for (const status of [200, 401])
    test(`A20 controlled response ${status}: logout/login same person preserves new session`, async ({
        playwright,
        page,
    }) => {
        const mobile = status === 200;
        await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
        const actor = await playwright.request.newContext({
            storageState: a.state,
        });
        const started = deferred();
        const release = deferred();
        try {
            const spaceId = readSpaceId;
            const old = await readToday(actor, spaceId);
            old.referenceDate = '2000-01-01';
            await page.addInitScript(() => {
                const original = window.fetch;
                window.fetch = (url, init) =>
                    original(
                        url,
                        typeof url === 'string' && url.endsWith('/today')
                            ? { ...init, signal: undefined }
                            : init,
                    );
            });
            let reads = 0;
            let delivered = false;
            await page.route(
                `${browserApiUrl}/spaces/${spaceId}/today`,
                async (route) => {
                    if (++reads !== 1) return route.continue();
                    started.resolve();
                    await release.promise;
                    await route.fulfill({
                        status,
                        headers: cors,
                        json:
                            status === 200
                                ? old
                                : {
                                      code: 'UNAUTHENTICATED',
                                      message: 'Sessão anterior',
                                  },
                    });
                    delivered = true;
                },
            );
            await page.goto('/login');
            await login(page, a);
            await page
                .getByRole('combobox', { name: 'Espaço atual', exact: true })
                .selectOption(spaceId);
            await started.promise;
            if (mobile) {
                await page
                    .getByRole('button', {
                        name: 'Conta e espaços',
                        exact: true,
                    })
                    .click();
                await page
                    .getByRole('menuitem', { name: 'Sair', exact: true })
                    .click();
            } else {
                await page
                    .getByRole('button', { name: 'Sair', exact: true })
                    .click();
            }
            await expect(page).toHaveURL(`${origin}/login`);
            await login(page, a);
            await page
                .getByRole('combobox', { name: 'Espaço atual', exact: true })
                .selectOption(spaceId);
            await expect(page.getByText('Acerto de 10/11/2099')).toBeVisible();
            release.resolve();
            await expect.poll(() => delivered).toBe(true);
            await expect(
                page.locator('time[datetime="2000-01-01"]'),
            ).toHaveCount(0);
            await expect(
                page.getByRole('heading', { name: 'Hoje', exact: true }),
            ).toBeVisible();
            await expect(page.getByText('Acerto de 10/11/2099')).toBeVisible();
        } finally {
            release.resolve();
            await actor.dispose();
        }
    });

test('A10 controlled clock/server date: virada São Paulo refaz leitura em browser Asia/Tokyo', async ({
    playwright,
    browser,
}) => {
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    const context = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage();
    try {
        const spaceId = readSpaceId;
        const body = await readToday(actor, spaceId);
        if (body.finance.status !== 'AVAILABLE')
            throw new Error('Finanças indisponíveis');
        body.referenceDate = '2026-10-13';
        body.finance.data.settlements!.nextCycle!.targetDate = '2026-10-13';
        const nextBlock = body.blocks.find(
            (block) => block.kind === 'NEXT_SETTLEMENT',
        )!;
        const nextItem = nextBlock.items[0];
        if (nextItem.type !== 'SETTLEMENT_CYCLE')
            throw new Error('Acerto esperado');
        nextItem.date = '2026-10-13';
        nextItem.details.targetDate = '2026-10-13';
        let reads = 0;
        await page.route(
            `${browserApiUrl}/spaces/${spaceId}/today`,
            (route) => {
                const current = structuredClone(body);
                if (++reads > 1 && current.finance.status === 'AVAILABLE') {
                    current.referenceDate = '2026-10-14';
                    const cycle = current.finance.data.settlements!.nextCycle!;
                    cycle.isOverdue = true;
                    current.finance.data.settlements!.nextCycle = null;
                    current.finance.data.settlements!.overdueCycles = {
                        items: [cycle],
                        totalCount: 1,
                    };
                    current.blocks = current.blocks.map((block) =>
                        block.kind === 'ATTENTION'
                            ? {
                                  ...block,
                                  items: [
                                      {
                                          type: 'SETTLEMENT_CYCLE',
                                          reference: {
                                              type: 'SETTLEMENT_CYCLE',
                                              cycleId: cycle.id,
                                          },
                                          label: 'Acerto',
                                          date: cycle.targetDate,
                                          details: cycle,
                                      },
                                  ],
                                  totalCount: 1,
                                  knownTotalCount: 1,
                                  hasMore: false,
                              }
                            : block.kind === 'NEXT_SETTLEMENT'
                              ? {
                                    ...block,
                                    items: [],
                                    totalCount: 0,
                                    knownTotalCount: 0,
                                    hasMore: false,
                                }
                              : block,
                    );
                }
                return route.fulfill({
                    status: 200,
                    headers: cors,
                    json: current,
                });
            },
        );
        const before = new Date('2026-10-14T02:59:59.500Z');
        await page.clock.install({
            time: new Date('2026-10-14T02:59:00.000Z'),
        });
        await openHome(page, context, a, spaceId);
        await expect(
            page.locator('#today-title').locator('..').locator('time'),
        ).toHaveAttribute('datetime', '2026-10-13');
        await expect(
            page.getByRole('region', { name: 'Precisa de atenção' }),
        ).toHaveCount(0);
        await page.clock.pauseAt(before);
        expect(await page.evaluate(() => Date.now())).toBe(before.getTime());
        await page.clock.runFor(1000);
        expect(await page.evaluate(() => Date.now())).toBe(
            before.getTime() + 1000,
        );
        await page.clock.resume();
        await expect.poll(() => reads).toBe(2);
        await expect(
            page.locator('#today-title').locator('..').locator('time'),
        ).toHaveAttribute('datetime', '2026-10-14');
        await expect(
            page.getByRole('region', { name: 'Precisa de atenção' }),
        ).toBeVisible();
        expect(reads).toBe(2);
    } finally {
        await context.close();
        await actor.dispose();
    }
});

test('A21: despesa pelo formulário atualiza Hoje no retorno sem inventar compromisso futuro', async ({
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
        const financial = await financialContext(actor, spaceId);
        await openHome(page, context, a, spaceId);
        await expect(
            page.getByText('Nenhum acerto para hoje ou datas futuras.'),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Adicionar', exact: true })
            .click();
        await page
            .getByRole('menuitem', { name: 'Adicionar despesa', exact: true })
            .click();
        await page
            .getByLabel('Descrição', { exact: true })
            .fill('Despesa Hoje');
        await page.getByLabel('Valor (R$)', { exact: true }).fill('100,00');
        await page.getByLabel('Pessoa A (%)', { exact: true }).fill('100');
        await page.getByLabel('Pessoa B (%)', { exact: true }).fill('0');
        await page
            .getByLabel('Forma de pagamento', { exact: true })
            .selectOption('PIX');
        await page
            .getByLabel('Quem pagou?', { exact: true })
            .selectOption(
                financial.members.find((m) => m.personId === b.id)!.memberId,
            );
        await page.getByLabel('Acerto', { exact: true }).selectOption('DATE');
        await page
            .getByLabel('Data do acerto', { exact: true })
            .fill('2099-11-10');
        await page
            .getByRole('button', { name: 'Salvar despesa', exact: true })
            .click();
        await expect(
            page.getByRole('heading', {
                name: 'Despesa registrada',
                exact: true,
            }),
        ).toBeVisible();
        await page.getByRole('link', { name: 'Hoje', exact: true }).click();
        await expect(
            page
                .getByRole('region', { name: 'Próximo acerto' })
                .getByText('Falta acertar', { exact: true })
                .locator('..')
                .getByText('R$ 100,00', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Nenhum compromisso próximo para exibir.'),
        ).toBeVisible();
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

test('A14/A19/A21: avulsa permanece em Finanças; foco/reconexão atualizam Hoje e falha não reapresenta alerta antigo', async ({
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
        await expense(actor, spaceId, a.id, b.id, 'Somente avulsa', 1000, null);
        await openHome(page, context, a, spaceId);
        await expect(
            page.getByText('Nenhum acerto para hoje ou datas futuras.'),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Finanças', exact: true }),
        ).toBeVisible();
        await expect(page.getByText(/Tudo quitado|Tudo em dia/)).toHaveCount(0);
        await expense(
            actor,
            spaceId,
            a.id,
            b.id,
            'Atualização por foco',
            1000,
            '2001-01-01',
        );
        const focusRead = page.waitForResponse(
            `${browserApiUrl}/spaces/${spaceId}/today`,
        );
        await page.evaluate(() =>
            window.dispatchEvent(new Event('visibilitychange')),
        );
        expect((await focusRead).status()).toBe(200);
        await expect(
            page.getByRole('region', { name: 'Precisa de atenção' }),
        ).toBeVisible();
        await page.route(`${browserApiUrl}/spaces/${spaceId}/today`, (route) =>
            route.fulfill({
                status: 500,
                headers: cors,
                json: { code: 'CONTROLLED', message: 'Falha de leitura' },
            }),
        );
        const failedRead = page.waitForResponse(
            `${browserApiUrl}/spaces/${spaceId}/today`,
        );
        await page.evaluate(() => {
            window.dispatchEvent(new Event('offline'));
            window.dispatchEvent(new Event('online'));
        });
        expect((await failedRead).status()).toBe(500);
        await expect(
            page.getByText('Não foi possível carregar Hoje.'),
        ).toBeVisible();
        await expect(
            page.getByRole('region', { name: 'Precisa de atenção' }),
        ).toHaveCount(0);
        await expect(
            page.getByText('Nenhum compromisso próximo para exibir.'),
        ).toHaveCount(0);
        await page.unroute(`${browserApiUrl}/spaces/${spaceId}/today`);
        await page
            .getByRole('button', { name: 'Tentar novamente', exact: true })
            .click();
        await expect(
            page.getByRole('region', { name: 'Precisa de atenção' }),
        ).toBeVisible();
    } finally {
        await actor.dispose();
        await member.dispose();
    }
});

test('A16/A18/A20: perda de acesso durante Today descarta origem e recupera Meu espaço', async ({
    playwright,
    page,
    context,
}) => {
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    try {
        const spaceId = readSpaceId;
        await openHome(page, context, a, spaceId);
        await expect(
            page
                .getByRole('region', { name: 'Próximo acerto' })
                .getByRole('link', { name: 'Ver acerto' }),
        ).toBeVisible();
        await page.route(`${browserApiUrl}/spaces/${spaceId}/today`, (route) =>
            route.fulfill({
                status: 404,
                headers: cors,
                json: {
                    code: 'SPACE_NOT_FOUND',
                    message: 'Espaço indisponível',
                },
            }),
        );
        await page.evaluate(() =>
            window.dispatchEvent(new Event('visibilitychange')),
        );
        await expect(
            page.getByText(
                'Este espaço não está mais disponível. Você voltou para Meu espaço.',
            ),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Próximo acerto' }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('link', { name: 'Ver acerto', exact: true }),
        ).toHaveCount(0);
        await expect(
            page
                .getByRole('region', { name: 'Contexto do espaço' })
                .getByText('Pessoal · Ativo', { exact: true }),
        ).toBeVisible();
    } finally {
        await actor.dispose();
    }
});

test('A19 composição: falha de Compras preserva acerto autorizado e retry recupera apenas leitura', async ({
    playwright,
    page,
    context,
}) => {
    const actor = await playwright.request.newContext({
        storageState: a.state,
    });
    try {
        const body = await readToday(actor, readSpaceId);
        const requests: string[] = [];
        let reads = 0;
        await page.route(
            `${browserApiUrl}/spaces/${readSpaceId}/today`,
            (route) => {
                requests.push(route.request().method());
                const current = structuredClone(body);
                if (++reads === 1) {
                    current.shopping = {
                        status: 'UNAVAILABLE',
                        error: {
                            code: 'SHOPPING_TODAY_UNAVAILABLE',
                            message: 'Não foi possível carregar as compras.',
                        },
                    };
                    current.blocks = current.blocks.map((block) =>
                        block.kind === 'SHOPPING'
                            ? {
                                  ...block,
                                  status: 'UNAVAILABLE',
                                  items: [],
                                  totalCount: null,
                                  knownTotalCount: 0,
                                  hasMore: null,
                              }
                            : block,
                    );
                }
                return route.fulfill({
                    status: 200,
                    headers: cors,
                    json: current,
                });
            },
        );
        await openHome(page, context, a, readSpaceId);
        const shopping = page.getByRole('region', {
            name: 'Compras',
            exact: true,
        });
        const settlement = page.getByRole('region', { name: 'Próximo acerto' });
        await expect(shopping).toContainText(
            'Não foi possível carregar compras.',
        );
        await expect(
            shopping.getByText('Nenhuma compra pendente para exibir.'),
        ).toHaveCount(0);
        await expect(shopping.getByLabel(/itens? no total/)).toHaveCount(0);
        await expect(
            settlement.getByRole('link', { name: 'Ver acerto' }),
        ).toBeVisible();
        await expect(
            settlement.getByText('R$ 10,00', { exact: true }).first(),
        ).toBeVisible();
        await shopping
            .getByRole('button', { name: 'Tentar novamente', exact: true })
            .click();
        await expect(shopping).toContainText(
            'Nenhuma compra pendente para exibir.',
        );
        await expect(
            settlement.getByRole('link', { name: 'Ver acerto' }),
        ).toBeVisible();
        expect(requests).toEqual(['GET', 'GET']);
    } finally {
        await actor.dispose();
    }
});
