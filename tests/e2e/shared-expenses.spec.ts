import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { apiDirectory, testDatabaseUrl } from '../support/environment';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';

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
type Space = { id: string; name: string };
let a: Account;
let b: Account;
let s1: Space;
let s2: Space;
let s3: Space;
const financialUrl = (id: string) =>
    `${apiUrl}/spaces/${id}/default-settlement-rule`;
async function csrf(api: APIRequestContext) {
    const response = await api.get(`${setupUrl}/auth/csrf`);
    expect(response.status()).toBe(200);
    return (await response.json()).csrfToken as string;
}
async function post(api: APIRequestContext, path: string, data: object) {
    return api.post(`${setupUrl}${path}`, {
        headers: {
            Origin: origin,
            'X-CSRF-Token': await csrf(api),
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
    const state = await api.storageState();
    return {
        email,
        id: body.person.id,
        personalId: body.personalSpace.id,
        state: {
            ...state,
            cookies: state.cookies.map((cookie) => ({
                ...cookie,
                domain: 'localhost',
            })),
        },
    };
}
async function create(
    api: APIRequestContext,
    name: string,
    member?: APIRequestContext,
): Promise<Space> {
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
    return { id: body.space.id, name };
}
async function dbQuery(sql: string, params: string[] = []) {
    const requireApi = createRequire(resolve(apiDirectory, 'package.json'));
    const { Client } = requireApi('pg') as {
        Client: new (options: { connectionString: string }) => {
            connect(): Promise<void>;
            query(
                sql: string,
                params?: string[],
            ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
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
        ).toBe('junelo_test');
        return await db.query(sql, params);
    } finally {
        await db.end();
    }
}

const composer = (id: string) => `/spaces/${id}/expenses/new`;
const optionsUrl = (id: string) =>
    `${apiUrl}/spaces/${id}/shared-cash-expense-options`;
const expenseUrl = (id: string) =>
    `${apiUrl}/spaces/${id}/shared-cash-expenses`;
const trigger = (page: Page) =>
    page.getByRole('combobox', { name: 'Espaço atual', exact: true });
async function open(
    page: Page,
    context: BrowserContext,
    space = s1,
    account = a,
) {
    await context.addCookies(account.state.cookies);
    await page.goto(composer(space.id));
    await expect(trigger(page)).toHaveValue(space.id);
    await expect(
        page.getByLabel('Forma de pagamento', { exact: true }),
    ).toBeVisible();
}
async function fill(page: Page, amount = '500,00') {
    await page.getByLabel('Descrição', { exact: true }).fill('Mercado');
    await page.getByLabel('Valor (R$)', { exact: true }).fill(amount);
    const method = page.getByLabel('Forma de pagamento', { exact: true });
    if ((await method.isVisible()) && (await method.inputValue()) === '')
        await method.selectOption('DEBIT');
}
const planningToggle = (page: Page) =>
    page.getByRole('button', {
        name: 'Previsão de pagamento (opcional)',
        exact: true,
    });
const plannedPayer = (page: Page) =>
    page.getByLabel('Quem era previsto pagar?', { exact: true });
const save = (page: Page) =>
    page.getByRole('button', { name: 'Salvar despesa', exact: true }).click();
async function freshAccount(api: APIRequestContext) {
    const response = await post(api, '/auth/login', {
        email: a.email,
        password,
    });
    expect(response.status()).toBe(200);
    const state = await api.storageState();
    return {
        ...a,
        state: {
            ...state,
            cookies: state.cookies.map((cookie) => ({
                ...cookie,
                domain: 'localhost',
            })),
        },
    };
}
async function recorded(page: Page) {
    await expect(
        page.getByRole('heading', { name: 'Despesa registrada', exact: true }),
    ).toBeVisible();
}
async function contextMembers(page: Page, space = s1) {
    return (
        await page.request.get(
            `${apiUrl}/spaces/${space.id}/financial-entry-context`,
        )
    ).json();
}
test.beforeAll(async ({ playwright }) => {
    const apis = await Promise.all(
        [0, 1, 2].map(() => playwright.request.newContext()),
    );
    try {
        a = await register(apis[0], 'Despesa A');
        b = await register(apis[1], 'Despesa B');
        s1 = await create(apis[0], 'Casa despesa', apis[1]);
        s2 = await create(apis[0], 'Casa sozinho');
        s3 = await create(apis[0], 'Casa adicional');
    } finally {
        await Promise.all(apis.map((api) => api.dispose()));
    }
});
test.beforeEach(async () => {
    await dbQuery(
        'TRUNCATE financial_expense_command_receipts,inter_member_obligation_changes,inter_member_obligations,financial_disbursements,financial_commitment_shares,financial_commitment_versions,financial_commitments,settlement_cycles CASCADE',
    );
    await dbQuery(
        'TRUNCATE finances_command_receipts,default_settlement_rule_changes,default_settlement_rules',
    );
    await dbQuery(
        "UPDATE spaces SET status='ACTIVE' WHERE id=ANY($1::uuid[])",
        [`{${s1.id},${s2.id},${s3.id}}`],
    );
});
test('A01/A02/A23: Mercado 40/60 sem previsão, servidor confirma null e refresh preserva origem', async ({
    page,
    context,
}) => {
    await open(page, context);
    await fill(page);
    await expect(planningToggle(page)).toHaveAttribute(
        'aria-expanded',
        'false',
    );
    await expect(plannedPayer(page)).toBeHidden();
    await expect(page.getByText(/^Responsável previsto:/)).toHaveCount(0);
    await page.getByLabel('Despesa A (%)', { exact: true }).fill('40');
    await page.getByLabel('Despesa B (%)', { exact: true }).fill('60');
    const ctx = await contextMembers(page);
    const memberB = ctx.members.find(
        (m: { personId: string }) => m.personId === b.id,
    ).memberId;
    await page.getByLabel('Quem pagou?', { exact: true }).selectOption(memberB);
    const response = page.waitForResponse(expenseUrl(s1.id));
    await save(page);
    const created = await response;
    expect(created.request().postDataJSON().expectedPayerMemberId).toBeNull();
    expect((await created.json()).commitment.expectedPayerMemberId).toBeNull();
    await recorded(page);
    await expect(page.getByText(/^Responsável previsto:/)).toHaveCount(0);
    await expect(
        page.getByText('Sua parte: R$ 200,00', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Falta acertar: Despesa A deve R$ 200,00 a Despesa B', {
            exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Despesa', exact: true }),
    ).toBeVisible();
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByText(/^Responsável previsto:/)).toHaveCount(0);
    const detail = await page.request.get(
        url
            .replace(origin, apiUrl)
            .replace('/expenses/', '/financial-commitments/'),
    );
    expect(detail.status()).toBe(200);
    expect((await detail.json()).commitment.expectedPayerMemberId).toBeNull();
    await expect(
        page.getByText('Sua parte: R$ 200,00', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Regra no registro: Sem regra padrão', { exact: true }),
    ).toBeVisible();
});
test('A04/A05/A06: centavo residual visível e criador sozinho sem pendência', async ({
    page,
    context,
}) => {
    await open(page, context);
    await fill(page, '0,01');
    await expect(page.getByText(/O centavo residual/)).toBeVisible();
    await save(page);
    await recorded(page);
    await page
        .getByRole('button', { name: 'Adicionar outra', exact: true })
        .click();
    await trigger(page).selectOption(s2.id);
    await expect(page).toHaveURL(composer(s2.id));
    await fill(page);
    await save(page);
    await recorded(page);
    await expect(page.getByText(/^Responsável previsto:/)).toHaveCount(0);
    expect(
        (
            await dbQuery(
                'SELECT expected_payer_member_id AS planned FROM financial_commitment_versions',
            )
        ).rows.every((row) => row.planned === null),
    ).toBe(true);
    await expect(
        page.getByText('Não há valor a acertar', { exact: true }),
    ).toBeVisible();
    expect(
        (await dbQuery('SELECT count(*)::int AS n FROM settlement_cycles'))
            .rows[0].n,
    ).toBe(0);
});
test('Previsão opcional: escolha diferente ou igual ao pagador persiste recolhida e no detalhe', async ({
    page,
    context,
}) => {
    await open(page, context);
    const ctx = await contextMembers(page);
    const memberA = ctx.members.find(
        (m: { personId: string }) => m.personId === a.id,
    ).memberId;
    const memberB = ctx.members.find(
        (m: { personId: string }) => m.personId === b.id,
    ).memberId;
    for (const expected of [memberB, memberA]) {
        await fill(page);
        await expect(planningToggle(page)).toHaveAttribute(
            'aria-expanded',
            'false',
        );
        await planningToggle(page).click();
        await expect(plannedPayer(page)).toHaveValue('');
        await plannedPayer(page).selectOption(expected);
        await planningToggle(page).click();
        await expect(plannedPayer(page)).toBeHidden();
        await expect(
            page
                .getByRole('complementary', { name: 'Resumo vivo' })
                .getByText(
                    'Responsável previsto: ' +
                        (expected === memberA ? 'Despesa A' : 'Despesa B'),
                    { exact: true },
                ),
        ).toBeVisible();
        await planningToggle(page).click();
        await expect(plannedPayer(page)).toHaveValue(expected);
        await planningToggle(page).click();
        const response = page.waitForResponse(expenseUrl(s1.id));
        await save(page);
        const created = await response;
        expect(created.request().postDataJSON().expectedPayerMemberId).toBe(
            expected,
        );
        const result = await created.json();
        expect(result.commitment.expectedPayerMemberId).toBe(expected);
        expect(result.disbursement.payerMemberId).toBe(memberA);
        await recorded(page);
        const detail = await page.request.get(
            apiUrl +
                '/spaces/' +
                s1.id +
                '/financial-commitments/' +
                result.commitment.id,
        );
        expect((await detail.json()).commitment.expectedPayerMemberId).toBe(
            expected,
        );
        await page
            .getByRole('button', { name: 'Adicionar outra', exact: true })
            .click();
        await expect(planningToggle(page)).toHaveAttribute(
            'aria-expanded',
            'false',
        );
        await expect(plannedPayer(page)).toHaveValue('');
        await expect(page.getByText(/^Responsável previsto:/)).toHaveCount(0);
    }
});

test('Previsão opcional: Não informado limpa escolha e erro recolhido abre e foca o campo', async ({
    page,
    context,
}) => {
    await open(page, context);
    await fill(page);
    const ctx = await contextMembers(page);
    await planningToggle(page).click();
    await plannedPayer(page).selectOption(ctx.actorMemberId);
    await plannedPayer(page).selectOption('');
    await expect(page.getByText(/^Responsável previsto:/)).toHaveCount(0);
    await planningToggle(page).click();
    let rejected = false;
    await page.route(expenseUrl(s1.id), async (route) => {
        expect(route.request().postDataJSON().expectedPayerMemberId).toBeNull();
        if (!rejected) {
            rejected = true;
            await route.fulfill({
                status: 422,
                json: {
                    code: 'VALIDATION_ERROR',
                    message: 'Confira a previsão.',
                    details: { fields: [{ field: 'expectedPayerMemberId' }] },
                },
            });
        } else await route.continue();
    });
    await save(page);
    await expect(planningToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(plannedPayer(page)).toBeFocused();
    await planningToggle(page).click();
    await expect(planningToggle(page)).toHaveAttribute(
        'aria-expanded',
        'false',
    );
    await expect(plannedPayer(page)).toBeHidden();
    await planningToggle(page).click();
    await expect(plannedPayer(page)).toHaveValue('');
    const response = page.waitForResponse(expenseUrl(s1.id));
    await save(page);
    expect(
        (await (await response).json()).commitment.expectedPayerMemberId,
    ).toBeNull();
    await recorded(page);
    await expect(page.getByText(/^Responsável previsto:/)).toHaveCount(0);
});

test('A03/A22: valores/percentuais inválidos focam campo e mantêm rascunho', async ({
    page,
    context,
}) => {
    await open(page, context);
    await fill(page, '1e3');
    await save(page);
    await expect(page.getByLabel('Valor (R$)', { exact: true })).toBeFocused();
    await page.getByLabel('Valor (R$)', { exact: true }).fill('500,00');
    await page.getByLabel('Divisão', { exact: true }).selectOption('AMOUNTS');
    await page.getByLabel('Despesa A (R$)', { exact: true }).fill('200');
    await page.getByLabel('Despesa B (R$)', { exact: true }).fill('200');
    await save(page);
    await expect(page.locator('[data-share-index="0"]')).toBeFocused();
    await expect(
        page.getByRole('alert').filter({ hasText: 'totalizar' }),
    ).toBeVisible();
    await page.getByLabel('Despesa B (R$)', { exact: true }).fill('300');
    await save(page);
    await recorded(page);
});
test('A09/A22: falha parcial opções e regra permite DATE com participantes públicos', async ({
    page,
    context,
}) => {
    await page.route(optionsUrl(s1.id), (route) =>
        route.fulfill({
            status: 500,
            json: { code: 'INTERNAL_ERROR', message: 'Falha', details: {} },
        }),
    );
    await page.route(financialUrl(s1.id), (route) =>
        route.fulfill({
            status: 500,
            json: { code: 'INTERNAL_ERROR', message: 'Falha', details: {} },
        }),
    );
    await open(page, context);
    await fill(page);
    await expect(
        page.getByRole('alert').filter({ hasText: 'opções' }),
    ).toBeVisible();
    await page.getByLabel('Acerto', { exact: true }).selectOption('DATE');
    await page.getByLabel('Data do acerto', { exact: true }).fill('2099-10-20');
    await save(page);
    await recorded(page);
    await expect(
        page.getByText('Acerto: 20/10/2099', { exact: true }),
    ).toBeVisible();
});
test('A22: falha de participantes bloqueia envio até reconsulta sem inventar membros', async ({
    page,
    context,
}) => {
    await page.route(optionsUrl(s1.id), (route) =>
        route.fulfill({
            status: 500,
            json: { code: 'INTERNAL_ERROR', message: 'Falha', details: {} },
        }),
    );
    const memberUrl = `${apiUrl}/spaces/${s1.id}/financial-entry-context`;
    await page.route(memberUrl, (route) =>
        route.fulfill({
            status: 500,
            json: { code: 'INTERNAL_ERROR', message: 'Falha', details: {} },
        }),
    );
    await context.addCookies(a.state.cookies);
    await page.goto(composer(s1.id));
    await fill(page);
    await expect(
        page.getByRole('button', { name: 'Salvar despesa', exact: true }),
    ).toBeDisabled();
    await page.unroute(memberUrl);
    await page
        .getByRole('button', {
            name: 'Tentar novamente os participantes',
            exact: true,
        })
        .click();
    await page
        .getByLabel('Forma de pagamento', { exact: true })
        .selectOption('DEBIT');
    await expect(page.getByLabel('Quem pagou?', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
    await save(page);
    await recorded(page);
});
test('A11/A22: sugestão obsoleta preserva rascunho e exige confirmação nova chave', async ({
    page,
    context,
}) => {
    await dbQuery(
        "INSERT INTO default_settlement_rules(space_id,kind,day_of_month,version,created_at,updated_at) VALUES($1,'MONTHLY_DAY',31,1,now(),now())",
        [s1.id],
    );
    await open(page, context);
    await fill(page);
    await expect(page.getByLabel('Acerto', { exact: true })).toHaveValue(
        'SUGGESTED',
    );
    await dbQuery(
        'UPDATE default_settlement_rules SET version=2,day_of_month=10 WHERE space_id=$1',
        [s1.id],
    );
    const keys: string[] = [];
    page.on('request', (request) => {
        if (request.url() === expenseUrl(s1.id))
            keys.push(request.headers()['idempotency-key']);
    });
    await save(page);
    await expect(
        page.getByRole('alert').filter({ hasText: 'Confira os participantes' }),
    ).toBeVisible();
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
    await page
        .getByRole('button', { name: 'Confirmar nova tentativa', exact: true })
        .click();
    await recorded(page);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
});
test('A12: ciclo OPEN vencido selecionável e FINALIZED recusado preserva formulário', async ({
    page,
    context,
}) => {
    const id = randomUUID();
    await dbQuery(
        "INSERT INTO settlement_cycles(id,space_id,target_date,status,version) SELECT gen_random_uuid(),$1,'2020-08-01'::date + n,'OPEN',1 FROM generate_series(0,19) n",
        [s1.id],
    );
    await dbQuery(
        "INSERT INTO settlement_cycles(id,space_id,target_date,status,version) VALUES($1,$2,'2020-09-01','OPEN',1)",
        [id, s1.id],
    );
    await open(page, context);
    await fill(page);
    await page.getByLabel('Acerto', { exact: true }).selectOption('CYCLE');
    await page
        .getByRole('button', { name: 'Carregar mais acertos', exact: true })
        .click();
    await expect(page.locator(`option[value="${id}"]`)).toHaveCount(1);
    await page.getByLabel('Acerto aberto', { exact: true }).selectOption(id);
    await dbQuery(
        "UPDATE settlement_cycles SET status='FINALIZED',finalized_at=now() WHERE id=$1",
        [id],
    );
    await save(page);
    await expect(
        page.getByRole('alert').filter({ hasText: 'Confira os participantes' }),
    ).toBeVisible();
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
    await page.getByLabel('Acerto', { exact: true }).selectOption('NONE');
    await expect(page.locator(`option[value="${id}"]`)).toHaveCount(0);
    await expect(
        page.getByRole('button', {
            name: 'Carregar mais acertos',
            exact: true,
        }),
    ).toHaveCount(0);
    await page
        .getByRole('button', { name: 'Confirmar nova tentativa', exact: true })
        .click();
    await recorded(page);
});
test('A20/A22: saída suja confirma seletor, links e Cancelar; A→B→A não mistura campos', async ({
    page,
    context,
}) => {
    await open(page, context);
    await fill(page);
    page.once('dialog', (dialog) => dialog.dismiss());
    await trigger(page).selectOption(s2.id);
    await expect(trigger(page)).toHaveValue(s1.id);
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Meus espaços', exact: true }).click();
    await expect(page).toHaveURL(composer(s1.id));
    page.once('dialog', (dialog) => dialog.accept());
    await trigger(page).selectOption(s2.id);
    await expect(page).toHaveURL(composer(s2.id));
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue('');
    await trigger(page).selectOption(s1.id);
    await expect(page).toHaveURL(composer(s1.id));
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue('');
    await fill(page);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await expect(page).toHaveURL(`/spaces/${s1.id}`);
});
test('A21: resposta perdida após commit mantém tentativa e bloqueia navegação até retry', async ({
    page,
    context,
}) => {
    await open(page, context);
    await fill(page);
    const attempts: { key: string; body: string }[] = [];
    let count = 0;
    await page.route(expenseUrl(s1.id), async (route) => {
        attempts.push({
            key: route.request().headers()['idempotency-key'],
            body: route.request().postData()!,
        });
        if (count++ === 0) {
            await route.fetch();
            await route.abort('failed');
        } else await route.continue();
    });
    await save(page);
    await expect(
        page.getByRole('button', {
            name: 'Recuperar esta tentativa',
            exact: true,
        }),
    ).toBeVisible();
    await expect(trigger(page)).toBeDisabled();
    await expect(planningToggle(page)).toBeDisabled();
    await expect(plannedPayer(page)).toBeDisabled();
    expect(JSON.parse(attempts[0].body).expectedPayerMemberId).toBeNull();
    await expect(
        page.getByRole('button', { name: 'Sair', exact: true }),
    ).toBeDisabled();
    const blockedNavigation = page.getByRole('link', {
        name: 'Meus espaços',
        exact: true,
    });
    await expect(blockedNavigation).toBeDisabled();
    await blockedNavigation.click({ force: true });
    await expect(page).toHaveURL(composer(s1.id));
    await page
        .getByRole('button', { name: 'Recuperar esta tentativa', exact: true })
        .click();
    await recorded(page);
    await expect(page.getByText(/^Responsável previsto:/)).toHaveCount(0);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(
        (await dbQuery('SELECT count(*)::int AS n FROM financial_commitments'))
            .rows[0].n,
    ).toBe(1);
    await expect(
        page.getByText('A tentativa original foi recuperada.', { exact: true }),
    ).toBeVisible();
});
for (const scenario of [
    { status: 429, code: 'TOO_MANY_REQUESTS' },
    { status: 500, code: 'INTERNAL_ERROR' },
    { status: 403, code: 'INVALID_CSRF_TOKEN' },
])
    test(`A21: ${scenario.code} renova proteção quando necessário sem reenviar automaticamente`, async ({
        page,
        context,
    }) => {
        await open(page, context);
        await fill(page);
        const attempts: { key: string; body: string }[] = [];
        let count = 0;
        await page.route(expenseUrl(s1.id), async (route) => {
            attempts.push({
                key: route.request().headers()['idempotency-key'],
                body: route.request().postData()!,
            });
            if (count++ === 0)
                await route.fulfill({
                    status: scenario.status,
                    headers: { 'Retry-After': '1' },
                    json: {
                        code: scenario.code,
                        message: 'Tente novamente',
                        details: {},
                    },
                });
            else await route.continue();
        });
        await save(page);
        await expect(
            page.getByRole('button', {
                name: 'Recuperar esta tentativa',
                exact: true,
            }),
        ).toBeVisible();
        await page.waitForTimeout(1100);
        expect(attempts).toHaveLength(1);
        await page
            .getByRole('button', {
                name: 'Recuperar esta tentativa',
                exact: true,
            })
            .click();
        await recorded(page);
        expect(attempts[0]).toEqual(attempts[1]);
    });
test('A20: logout e login mesma pessoa limpam formulário', async ({
    page,
    context,
    request,
}) => {
    await open(page, context, s1, await freshAccount(request));
    await fill(page);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(a.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(trigger(page)).toHaveValue(a.personalId);
    await page.goto(composer(s1.id));
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue('');
});
test('A22: browser Back confirma antes de perder rascunho', async ({
    page,
    context,
}) => {
    await context.addCookies(a.state.cookies);
    await page.goto(`/spaces/${s1.id}`);
    await page
        .getByRole('link', { name: 'Adicionar despesa', exact: true })
        .click();
    await fill(page);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(composer(s1.id));
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(`/spaces/${s1.id}`);
});
test('A23: mobile e teclado mostram resumo e dados exatos', async ({
    page,
    context,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, context);
    await fill(page, '1,01');
    await page.getByLabel('Descrição', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Valor (R$)', { exact: true })).toBeFocused();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await expect(
        page.getByRole('complementary', { name: 'Resumo vivo' }),
    ).toBeVisible();
    await save(page);
    await recorded(page);
});
test('A07/A08: pessoal usa formulário próprio e CLOSED lê opções mas bloqueia nova despesa', async ({
    page,
    context,
}) => {
    await context.addCookies(a.state.cookies);
    await page.goto(composer(a.personalId));
    await expect(page.getByLabel('Forma de pagamento')).toBeVisible();
    await expect(page.getByLabel('Quem pagou?', { exact: true })).toHaveCount(
        0,
    );
    await dbQuery("UPDATE spaces SET status='CLOSED' WHERE id=$1", [s1.id]);
    await page.goto(composer(s1.id));
    await expect(
        page.getByText(/Novas despesas estão indisponíveis/),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Salvar despesa', exact: true }),
    ).toBeDisabled();
});

function deferred() {
    let resolve!: () => void;
    return {
        promise: new Promise<void>((done) => {
            resolve = done;
        }),
        resolve: () => resolve(),
    };
}
async function ignoreExpenseAbort(page: Page) {
    await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (url, init) =>
            original(
                url,
                typeof url === 'string' &&
                    (url.includes('shared-cash-expense-options') ||
                        url.includes('shared-cash-expenses') ||
                        url.includes('default-settlement-rule') ||
                        url.includes('financial-commitments'))
                    ? { ...init, signal: undefined }
                    : init,
            );
    });
}
test('A20: opções fora de ordem A→B→A descartam geração antiga mesmo sem aborto transporte', async ({
    page,
    context,
}) => {
    await ignoreExpenseAbort(page);
    const started = deferred(),
        release = deferred();
    let reads = 0;
    await page.route(optionsUrl(s1.id), async (route) => {
        if (++reads === 1) {
            const response = await route.fetch();
            const body = await response.json();
            started.resolve();
            await release.promise;
            await route.fulfill({
                status: 200,
                json: {
                    ...body,
                    defaultSettlementRule: {
                        rule: { kind: 'MONTHLY_DAY', dayOfMonth: 7 },
                        version: 99,
                    },
                    suggestedTargetDate: '2099-01-07',
                },
            });
        } else await route.continue();
    });
    await open(page, context);
    await started.promise;
    await trigger(page).selectOption(s2.id);
    await expect(page).toHaveURL(composer(s2.id));
    await trigger(page).selectOption(s1.id);
    await expect(page).toHaveURL(composer(s1.id));
    await fill(page);
    await expect(page.getByLabel('Acerto', { exact: true })).toHaveValue(
        'NONE',
    );
    const late = page.waitForResponse(
        (response) => response.url() === optionsUrl(s1.id),
    );
    release.resolve();
    await late;
    await expect(page.getByLabel('Acerto', { exact: true })).toHaveValue(
        'NONE',
    );
    await expect(page.getByText(/07\/01\/2099/)).toHaveCount(0);
});
for (const resource of [
    'shared-cash-expense-options',
    'default-settlement-rule',
]) {
    test(`A20: 401 tardio de ${resource} após A→B→A não encerra sessão atual`, async ({
        page,
        context,
    }) => {
        await ignoreExpenseAbort(page);
        const started = deferred(),
            release = deferred();
        const url = `${apiUrl}/spaces/${s1.id}/${resource}`;
        let reads = 0;
        await page.route(url, async (route) => {
            if (++reads === 1) {
                started.resolve();
                await release.promise;
                await route.fulfill({
                    status: 401,
                    json: {
                        code: 'UNAUTHENTICATED',
                        message: 'Sessão antiga.',
                    },
                });
            } else await route.continue();
        });
        await open(page, context);
        await started.promise;
        await trigger(page).selectOption(s2.id);
        await expect(page).toHaveURL(composer(s2.id));
        await trigger(page).selectOption(s1.id);
        await expect(page).toHaveURL(composer(s1.id));
        await fill(page);
        const late = page.waitForResponse(
            (response) => response.url() === url && response.status() === 401,
        );
        release.resolve();
        await (await late).finished();
        page.once('dialog', (dialog) => dialog.accept());
        await trigger(page).selectOption(s2.id);
        await expect(page).toHaveURL(composer(s2.id));
        await trigger(page).selectOption(s1.id);
        await expect(page).toHaveURL(composer(s1.id));
        await expect(trigger(page)).toHaveValue(s1.id);
        await expect(
            page.getByLabel('Descrição', { exact: true }),
        ).toBeVisible();
    });
}

test('A20: detalhe tardio da sessão anterior mesma pessoa não publica dado novo', async ({
    page,
    context,
    request,
}) => {
    await ignoreExpenseAbort(page);
    await open(page, context, s1, await freshAccount(request));
    await fill(page);
    await save(page);
    await recorded(page);
    const started = deferred(),
        release = deferred();
    let reads = 0;
    const detailPattern = `${apiUrl}/spaces/${s1.id}/financial-commitments/*`;
    await page.route(detailPattern, async (route) => {
        if (++reads === 1) {
            const response = await route.fetch();
            const body = await response.json();
            started.resolve();
            await release.promise;
            await route.fulfill({
                status: 200,
                json: {
                    ...body,
                    commitment: {
                        ...body.commitment,
                        description: 'Descrição antiga atrasada',
                    },
                },
            });
        } else await route.continue();
    });
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await started.promise;
    const detailUrl = page.url();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(a.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(trigger(page)).toHaveValue(a.personalId);
    const late = page.waitForResponse((response) =>
        response.url().includes('financial-commitments'),
    );
    release.resolve();
    await late;
    await expect(page.getByText(/Descrição antiga atrasada/)).toHaveCount(0);
    await page.goto(detailUrl);
    await expect(
        page.getByRole('heading', { name: 'Mercado', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('region', { name: 'Resumo da despesa', exact: true }),
    ).toContainText('R$ 500,00');
    await expect(page.getByText(/Descrição antiga atrasada/)).toHaveCount(0);
});
test('A22: erro HTTP de parte específica foca membro correto e mantém entrada', async ({
    page,
    context,
}) => {
    await open(page, context);
    await fill(page);
    await page.route(expenseUrl(s1.id), (route) =>
        route.fulfill({
            status: 400,
            json: {
                code: 'VALIDATION_ERROR',
                message: 'Confira a segunda parte.',
                details: {
                    fields: [
                        {
                            field: 'responsibilitySplit.shares.1.basisPoints',
                            messages: ['Confira esta parte.'],
                        },
                    ],
                },
            },
        }),
    );
    await save(page);
    await expect(page.locator('[data-share-index="1"]')).toBeFocused();
    await expect(
        page.getByRole('alert').filter({ hasText: 'segunda parte' }),
    ).toBeVisible();
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
});
test('A23: checagens responsivas desktop/mobile e detalhe sem segredos', async ({
    page,
    context,
}) => {
    await open(page, context);
    await fill(page);
    await expect(
        page.getByRole('complementary', { name: 'Resumo vivo' }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await save(page);
    await recorded(page);
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Mercado', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('region', { name: 'Resumo da despesa', exact: true }),
    ).toContainText('R$ 500,00');
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(
        page.getByRole('heading', { name: 'Mercado', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('region', { name: 'Resumo da despesa', exact: true }),
    ).toContainText('R$ 500,00');
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
});
test('A20/A21: sucesso POST tardio após logout externo não reaparece na sessão nova', async ({
    page,
    context,
    request,
}) => {
    await ignoreExpenseAbort(page);
    await open(page, context, s1, await freshAccount(request));
    await fill(page);
    const started = deferred(),
        release = deferred();
    await page.route(expenseUrl(s1.id), async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        started.resolve();
        await release.promise;
        await route.fulfill({ response });
    });
    await save(page);
    await started.promise;
    const other = await context.newPage();
    try {
        await other.goto('/spaces');
        await other.getByRole('button', { name: 'Sair', exact: true }).click();
        await expect(other).toHaveURL('/login');
        await page.bringToFront();
        await page.evaluate(() =>
            window.dispatchEvent(new Event('visibilitychange')),
        );
        await expect(page).toHaveURL('/login');
        const late = page.waitForResponse(
            (response) => response.url() === expenseUrl(s1.id),
        );
        release.resolve();
        await (await late).finished();
        await expect(page).toHaveURL('/login');
        await expect(
            page.getByRole('heading', {
                name: 'Despesa registrada',
                exact: true,
            }),
        ).toHaveCount(0);
        await page.reload();
        await page.getByLabel('E-mail', { exact: true }).fill(a.email);
        await page.getByLabel('Senha', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Entrar', exact: true }).click();
        await expect(trigger(page)).toHaveValue(a.personalId);
        await expect(
            page.getByRole('heading', {
                name: 'Despesa registrada',
                exact: true,
            }),
        ).toHaveCount(0);
        expect(
            (
                await dbQuery(
                    'SELECT count(*) AS count FROM financial_commitments',
                )
            ).rows[0].count,
        ).toBe('1');
    } finally {
        await other.close();
        release.resolve();
    }
});

test('A20: detalhe cacheado que perde acesso no refetch limpa dados e volta ao pessoal', async ({
    page,
    context,
}) => {
    await open(page, context);
    await fill(page);
    await save(page);
    await recorded(page);
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Mercado', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('region', { name: 'Resumo da despesa', exact: true }),
    ).toContainText('R$ 500,00');
    await page
        .getByRole('link', { name: 'Voltar ao espaço', exact: true })
        .click();
    await expect(page).toHaveURL(`/spaces/${s1.id}`);
    await page.route(
        `${apiUrl}/spaces/${s1.id}/financial-commitments/*`,
        (route) =>
            route.fulfill({
                status: 404,
                json: {
                    code: 'SPACE_NOT_FOUND',
                    message: 'Espaço indisponível.',
                },
            }),
    );
    await page.evaluate(() => history.back());
    await expect(trigger(page)).toHaveValue(a.personalId);
    await expect(page).toHaveURL(`/spaces/${a.personalId}`);
    await expect(
        page.getByRole('heading', { name: 'Mercado', exact: true }),
    ).toHaveCount(0);
});

test('A22: fallback sem Navigation API restaura Back/Forward e múltiplas entradas sem sentinelas', async ({
    page,
    context,
}) => {
    await page.addInitScript(() =>
        Object.defineProperty(window, 'navigation', {
            value: undefined,
            configurable: true,
        }),
    );
    await context.addCookies(a.state.cookies);
    await page.goto('/spaces');
    await page.locator(`a[href="/spaces/${s1.id}"]`).click();
    await expect(page).toHaveURL(`/spaces/${s1.id}`);
    await page
        .getByRole('link', { name: 'Adicionar despesa', exact: true })
        .click();
    await fill(page);
    page.once('dialog', (dialog) => {
        expect(dialog.type()).toBe('confirm');
        return dialog.dismiss();
    });
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(composer(s1.id));
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await expect(page).toHaveURL(`/spaces/${s1.id}`);
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(composer(s1.id));
    await fill(page);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.evaluate(() => history.forward());
    await expect(page).toHaveURL(composer(s1.id));
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.evaluate(() => history.go(-2));
    await expect(page).toHaveURL(composer(s1.id));
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
    await page.route(expenseUrl(s1.id), (route) =>
        route.fulfill({
            status: 500,
            json: { code: 'INTERNAL_ERROR', message: 'Resultado incerto.' },
        }),
    );
    await save(page);
    await expect(
        page.getByRole('button', {
            name: 'Recuperar esta tentativa',
            exact: true,
        }),
    ).toBeVisible();
    await page.evaluate(() => history.forward());
    await expect(page).toHaveURL(composer(s1.id));
    await page.evaluate(() => history.go(-2));
    await expect(page).toHaveURL(composer(s1.id));
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Mercado',
    );
});
