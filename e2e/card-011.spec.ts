import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import type { PersonalExpenseResult } from '../src/features/finances/types/personal-expense';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const setupUrl = 'http://127.0.0.1:3101/v2',
    apiUrl = 'http://localhost:3101/v2',
    origin = 'http://localhost:3100';
const password = 'uma-senha-forte-de-testes';
const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Retry-After, Location',
    'Content-Type': 'application/json',
};
type Account = {
    id: string;
    personalId: string;
    email: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
let a: Account, b: Account, journal: Account, sharedId: string;
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
    displayName: string,
): Promise<Account> {
    const email = `${randomUUID()}@example.com`,
        response = await post(api, '/auth/register', {
            displayName,
            email,
            password,
        });
    expect(response.status()).toBe(201);
    const body = await response.json();
    return {
        id: body.person.id,
        personalId: body.personalSpace.id,
        email,
        state: await api.storageState(),
    };
}
async function open(
    page: Page,
    context: BrowserContext,
    account = a,
    path = `/spaces/${account.personalId}/finances`,
) {
    await context.addCookies(
        account.state.cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    );
    await page.goto(path);
    await expect(switcher(page)).toHaveValue(account.personalId);
}
const switcher = (page: Page) =>
    page.getByRole('combobox', { name: 'Espaço atual', exact: true });
const composer = (account = a) => `/spaces/${account.personalId}/expenses/new`;
const expenseUrl = (account = a) =>
    `${apiUrl}/spaces/${account.personalId}/personal-expenses`;
async function fill(
    page: Page,
    description = 'Consulta pessoal',
    amount = '120,00',
) {
    await page.getByLabel('Descrição', { exact: true }).fill(description);
    await page.getByLabel('Valor (R$)', { exact: true }).fill(amount);
    if ((await page.getByLabel('Forma de pagamento').inputValue()) === '')
        await page.getByLabel('Forma de pagamento').selectOption('PIX');
}
async function save(page: Page) {
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
}
async function recorded(page: Page) {
    await expect(
        page.getByRole('heading', { name: 'Despesa registrada', exact: true }),
    ).toBeVisible();
}
async function login(page: Page, account = a, refreshProtection = false) {
    await page.getByLabel('E-mail', { exact: true }).fill(account.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    if (refreshProtection)
        await page
            .getByRole('button', { name: 'Tentar novamente', exact: true })
            .click();
    await expect(
        page.getByRole('heading', { name: 'Hoje', exact: true }),
    ).toBeVisible();
}
async function freshSession(
    api: APIRequestContext,
    account = a,
): Promise<Account> {
    expect(
        (
            await post(api, '/auth/login', { email: account.email, password })
        ).status(),
    ).toBe(200);
    return { ...account, state: await api.storageState() };
}
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
async function ignoreFinancialAbort(page: Page) {
    await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (url, init) =>
            original(
                url,
                typeof url === 'string' &&
                    (url.includes('/personal-expenses') ||
                        url.includes('/personal-expense-options') ||
                        url.includes('/financial-commitments/'))
                    ? { ...init, signal: undefined }
                    : init,
            );
    });
}
async function noSharedConcepts(page: Page) {
    for (const name of [
        /Quem pagou/,
        /Quem era previsto/,
        /Como dividir/,
        /Acerto/,
        /Regra padrão/,
        /aprovação/i,
        /Falta acertar/,
        /saldo bancário/i,
    ])
        await expect(page.getByText(name)).toHaveCount(0);
    await expect(
        page.locator(
            '[name^="responsibilitySplit"], [name^="settlement"], [name="payerMemberId"], [name="expectedPayerMemberId"]',
        ),
    ).toHaveCount(0);
}
test.beforeAll(async ({ playwright }) => {
    const owner = await playwright.request.newContext(),
        member = await playwright.request.newContext(),
        history = await playwright.request.newContext();
    try {
        a = await register(owner, 'Pessoa A pessoal');
        b = await register(member, 'Pessoa B pessoal');
        journal = await register(history, 'Histórico pessoal');
        const response = await post(owner, '/spaces', {
            name: 'Casa CARD 011',
        });
        expect(response.status()).toBe(201);
        const body = await response.json();
        sharedId = body.space.id;
        expect(
            (
                await post(member, '/invitations/respond', {
                    token: new URLSearchParams(
                        new URL(body.inviteUrl).hash.slice(1),
                    ).get('token'),
                    decision: 'ACCEPT',
                    expectedVersion: 1,
                })
            ).status(),
        ).toBe(200);
    } finally {
        await owner.dispose();
        await member.dispose();
        await history.dispose();
    }
});

test('A01/A13/A15/A16/A17: real personal journey from Today to confirmation, history, refresh and a new session', async ({
    page,
    context,
    request,
}) => {
    const session = await freshSession(request);
    await open(page, context, session, '/');
    await expect(
        page.getByRole('heading', { name: 'Próximo acerto' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Adicionar despesa', exact: true })
        .click();
    await noSharedConcepts(page);
    await fill(page);
    const response = page.waitForResponse(
        (value) =>
            value.url() === expenseUrl() && value.request().method() === 'POST',
    );
    await save(page);
    const http = await response;
    expect(http.status()).toBe(201);
    const result = (await http.json()) as PersonalExpenseResult;
    expect(result.spaceType).toBe('PERSONAL');
    expect(result.commitment.amountInCents).toBe(12000);
    expect(result.disbursement!.amountInCents).toBe(12000);
    expect(result.commitment.id).not.toBe(result.disbursement!.id);
    expect(result.commitment.ownerPersonId).toBe(a.id);
    expect(result.disbursement!.payerPersonId).toBe(a.id);
    await recorded(page);
    await expect(
        page.getByRole('heading', { name: 'Despesa registrada' }),
    ).toBeFocused();
    await noSharedConcepts(page);
    await expect(page.getByRole('definition')).toContainText([
        'R$ 120,00',
        'R$ 120,00',
        'PIX',
    ]);
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await page.getByText('Identificação do registro', { exact: true }).click();
    await expect(
        page.getByText(`Registro: ${result.commitment.id}`, { exact: true }),
    ).toBeVisible();
    await noSharedConcepts(page);
    await page.reload();
    await page.getByText('Identificação do registro', { exact: true }).click();
    await expect(
        page.getByText(`Desembolso: ${result.disbursement!.id}`, {
            exact: true,
        }),
    ).toBeVisible();
    await page
        .getByRole('link', { name: 'Voltar às Finanças', exact: true })
        .click();
    await expect(
        page.getByRole('link', { name: 'Consulta pessoal', exact: true }),
    ).toBeVisible();
    await noSharedConcepts(page);
    await page.getByRole('link', { name: 'Hoje', exact: true }).click();
    await expect(
        page.getByText('Nenhum compromisso próximo para exibir.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await login(page);
    await page.getByRole('link', { name: 'Finanças', exact: true }).click();
    await page
        .getByRole('link', { name: 'Consulta pessoal', exact: true })
        .click();
    await page.getByText('Identificação do registro', { exact: true }).click();
    await expect(
        page.getByText(`Registro: ${result.commitment.id}`, { exact: true }),
    ).toBeVisible();
});

for (const [method, amount] of [
    ['DEBIT', '0,01'],
    ['CASH', '90.071.992.547.409,91'],
] as const)
    test(`A02/A04/A05: ${method} preserves ${amount} and past civil date through a real command`, async ({
        page,
        context,
    }) => {
        await open(page, context, a, composer());
        await fill(page, `Despesa ${method}`, amount);
        await page.getByLabel('Data do pagamento').fill('2024-02-29');
        await page.getByLabel('Forma de pagamento').selectOption(method);
        expect(
            await page
                .getByLabel('Forma de pagamento')
                .locator('option')
                .evaluateAll((nodes) =>
                    nodes.map((node) => (node as HTMLOptionElement).value),
                ),
        ).toEqual(['', 'CREDIT_CARD', 'PIX', 'DEBIT', 'CASH']);
        await save(page);
        await recorded(page);
        await expect(page.getByRole('definition')).toContainText([
            `R$ ${amount}`,
            `R$ ${amount}`,
            method === 'DEBIT' ? 'Débito' : 'Dinheiro',
            '29/02/2024',
        ]);
        await noSharedConcepts(page);
    });

test('A04/A05/A21: local field validation focuses invalid input and never submits a future date', async ({
    page,
    context,
}) => {
    await open(page, context, a, composer());
    let posts = 0;
    page.on('request', (value) => {
        if (value.url() === expenseUrl() && value.method() === 'POST') posts++;
    });
    await save(page);
    await expect(page.getByLabel('Descrição', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveAttribute(
        'aria-invalid',
        'true',
    );
    await fill(page, '  Teste  ', '0');
    await save(page);
    await expect(page.getByLabel('Valor (R$)', { exact: true })).toBeFocused();
    await page.getByLabel('Valor (R$)', { exact: true }).fill('120,00');
    await page.getByLabel('Data do pagamento').fill('2099-01-01');
    await save(page);
    await expect(page.getByLabel('Data do pagamento')).toBeFocused();
    await expect(page.locator('main p[role="alert"]')).toContainText(
        'data válida',
    );
    expect(posts).toBe(0);
});

test('A04/A21: server date is authoritative in a Tokyo browser with another local day', async ({
    browser,
}) => {
    const context = await browser.newContext({ timezoneId: 'Asia/Tokyo' }),
        page = await context.newPage();
    try {
        await page.clock.install({ time: new Date('2026-10-14T02:30:00Z') });
        await page.route(
            `${apiUrl}/spaces/${a.personalId}/personal-expense-options`,
            async (route) => {
                const response = await route.fetch();
                expect(response.status()).toBe(200);
                await route.fulfill({
                    response,
                    json: {
                        ...(await response.json()),
                        referenceDate: '2026-10-13',
                    },
                });
            },
        );
        await open(page, context, a, composer());
        await page.getByLabel('Forma de pagamento').selectOption('PIX');
        await expect(page.getByLabel('Data do pagamento')).toHaveValue(
            '2026-10-13',
        );
        await expect(page.getByLabel('Data do pagamento')).toHaveAttribute(
            'max',
            '2026-10-13',
        );
        expect(await page.evaluate(() => new Date().getDate())).toBe(14);
    } finally {
        await context.close();
    }
});

test('A07/A08: a shared partner cannot list or open personal data and surfaces stay structurally separated', async ({
    page,
    context,
    playwright,
}) => {
    const owner = await playwright.request.newContext({
            storageState: a.state,
        }),
        partner = await playwright.request.newContext({
            storageState: b.state,
        });
    try {
        const registered = await post(
            owner,
            `/spaces/${a.personalId}/personal-expenses`,
            {
                description: 'Segredo pessoal',
                amountInCents: 12000,
                factDate: '2024-01-01',
                disbursement: { method: 'PIX' },
            },
        );
        expect(registered.status()).toBe(201);
        const expense = (await registered.json()) as PersonalExpenseResult;
        for (const path of [
            `/spaces/${a.personalId}/personal-expenses`,
            `/spaces/${a.personalId}/financial-commitments/${expense.commitment.id}`,
            `/spaces/${b.personalId}/financial-commitments/${expense.commitment.id}`,
        ])
            expect((await partner.get(`${setupUrl}${path}`)).status()).toBe(
                404,
            );
        await open(page, context, b);
        await page.goto(
            `/spaces/${a.personalId}/expenses/${expense.commitment.id}`,
        );
        await expect(switcher(page)).toHaveValue(b.personalId);
        await expect(page.getByText('Segredo pessoal')).toHaveCount(0);
        await page.goto(`/spaces/${sharedId}/expenses/new`);
        await expect(
            page.getByLabel('Forma de pagamento', { exact: true }),
        ).toBeVisible();
        await switcher(page).selectOption(b.personalId);
        await expect(page).toHaveURL(composer(b));
        await expect(page.getByLabel('Forma de pagamento')).toBeVisible();
        await noSharedConcepts(page);
    } finally {
        await owner.dispose();
        await partner.dispose();
    }
});

test('A13/A14: more than twenty real facts sharing a date paginate deterministically without duplicate IDs', async ({
    page,
    context,
    playwright,
}) => {
    const actor = await playwright.request.newContext({
        storageState: journal.state,
    });
    try {
        const ids = new Set<string>();
        for (let index = 0; index < 23; index++) {
            const response = await post(
                actor,
                `/spaces/${journal.personalId}/personal-expenses`,
                {
                    description: `Histórico ${index}`,
                    amountInCents: index + 1,
                    factDate: '2024-01-01',
                    disbursement: { method: 'PIX' },
                },
            );
            expect(response.status()).toBe(201);
            ids.add((await response.json()).commitment.id);
        }
        await open(page, context, journal);
        const list = page.getByRole('list', { name: 'Despesas pessoais' });
        await expect(list.getByRole('listitem')).toHaveCount(20);
        const links = await list
            .getByRole('link')
            .evaluateAll((nodes) =>
                nodes.map((node) =>
                    (node as HTMLAnchorElement).pathname.split('/').pop()!,
                ),
            );
        await page
            .getByRole('button', { name: 'Próxima página de despesas' })
            .click();
        await expect(list.getByRole('listitem')).toHaveCount(3);
        links.push(
            ...(await list
                .getByRole('link')
                .evaluateAll((nodes) =>
                    nodes.map((node) =>
                        (node as HTMLAnchorElement).pathname.split('/').pop()!,
                    ),
                )),
        );
        expect(new Set(links)).toEqual(ids);
        expect(links).toHaveLength(23);
        await page
            .getByRole('button', { name: 'Atualizar / Voltar ao início' })
            .click();
        await expect(list.getByRole('listitem')).toHaveCount(20);
        await page.reload();
        await expect(list.getByRole('listitem')).toHaveCount(20);
        await noSharedConcepts(page);
    } finally {
        await actor.dispose();
    }
});

test('A10/A20: lost response after real commit keeps the immutable key/input, guards navigation and retries exactly one fact', async ({
    page,
    context,
}) => {
    await open(page, context, a, composer());
    await fill(page, 'Resposta perdida');
    const attempts: {
        key: string;
        body: string;
        result: PersonalExpenseResult;
    }[] = [];
    await page.route(expenseUrl(), async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const response = await route.fetch();
        expect(response.status()).toBe(attempts.length === 0 ? 201 : 200);
        attempts.push({
            key: route.request().headers()['idempotency-key'],
            body: route.request().postData()!,
            result: await response.json(),
        });
        if (attempts.length === 1) await route.abort('failed');
        else await route.fulfill({ response });
    });
    await save(page);
    await expect(
        page.getByRole('button', { name: 'Recuperar esta tentativa' }),
    ).toBeVisible();
    await expect(switcher(page)).toBeDisabled();
    await expect(page.getByLabel('Descrição', { exact: true })).toBeDisabled();
    await expect(
        page.getByRole('button', { name: 'Sair', exact: true }),
    ).toBeDisabled();
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await expect(page).toHaveURL(composer());
    const blockedNavigation = page.getByRole('link', {
        name: 'Hoje',
        exact: true,
    });
    await expect(blockedNavigation).toBeDisabled();
    await blockedNavigation.click({ force: true });
    await expect(page).toHaveURL(composer());
    await page
        .getByRole('button', { name: 'Recuperar esta tentativa' })
        .click();
    await recorded(page);
    expect(attempts).toHaveLength(2);
    expect(attempts[1].key).toBe(attempts[0].key);
    expect(attempts[1].body).toBe(attempts[0].body);
    expect(attempts[1].result.replayed).toBe(true);
    expect(attempts[1].result.commitment.id).toBe(
        attempts[0].result.commitment.id,
    );
    expect(attempts[1].result.disbursement!.id).toBe(
        attempts[0].result.disbursement!.id,
    );
    await page.getByRole('link', { name: 'Ver histórico de despesas' }).click();
    await expect(
        page.getByRole('link', { name: 'Resposta perdida', exact: true }),
    ).toHaveCount(1);
});

test('A20: double submit while pending has one command and blocks traversal and links', async ({
    page,
    context,
}) => {
    const started = deferred(),
        release = deferred();
    await open(page, context, a, '/');
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Adicionar despesa', exact: true })
        .click();
    await fill(page, 'Envio único');
    let commands = 0;
    await page.route(expenseUrl(), async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        commands++;
        started.resolve();
        await release.promise;
        await route.continue();
    });
    try {
        await page
            .getByRole('button', { name: 'Salvar despesa' })
            .evaluate((button) => {
                (button as HTMLButtonElement).click();
                (button as HTMLButtonElement).click();
            });
        await started.promise;
        await expect(
            page.getByRole('status').filter({ hasText: 'Salvando despesa…' }),
        ).toBeVisible();
        await expect(switcher(page)).toBeDisabled();
        await page.getByRole('link', { name: 'Cancelar' }).click();
        await expect(page).toHaveURL(composer());
        await page.evaluate(() => history.back());
        await expect(page).toHaveURL(composer());
        expect(commands).toBe(1);
        release.resolve();
        await recorded(page);
    } finally {
        release.resolve();
    }
});

for (const scenario of [
    { status: 429, code: 'TOO_MANY_REQUESTS' },
    { status: 500, code: 'INTERNAL_ERROR' },
    { status: 403, code: 'INVALID_CSRF_TOKEN' },
])
    test(`A09/A20: ${scenario.code} retries only explicitly with the same command`, async ({
        page,
        context,
    }) => {
        await open(page, context, a, composer());
        await fill(page, scenario.code);
        if (scenario.status === 429) await page.clock.install();
        const attempts: { key: string; body: string }[] = [];
        await page.route(expenseUrl(), async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            attempts.push({
                key: route.request().headers()['idempotency-key'],
                body: route.request().postData()!,
            });
            if (attempts.length === 1)
                await route.fulfill({
                    status: scenario.status,
                    headers: { ...cors, 'Retry-After': '30' },
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
            page.getByRole('button', { name: 'Recuperar esta tentativa' }),
        ).toBeVisible();
        if (scenario.status === 429) {
            await page
                .getByRole('button', { name: 'Recuperar esta tentativa' })
                .click();
            await expect(page.locator('main p[role="alert"]')).toContainText(
                'Aguarde',
            );
        }
        if (scenario.status === 429) await page.clock.fastForward(30_100);
        else await page.waitForTimeout(1100);
        expect(attempts).toHaveLength(1);
        await page
            .getByRole('button', { name: 'Recuperar esta tentativa' })
            .click();
        await recorded(page);
        expect(attempts[1]).toEqual(attempts[0]);
    });

test('A14/A21: history failure stays distinct from empty and retry reads the real API', async ({
    page,
    context,
}) => {
    let unavailable = true;
    await page.route(expenseUrl(b), (route) =>
        unavailable
            ? route.fulfill({
                  status: 503,
                  headers: cors,
                  json: { code: 'UNAVAILABLE', message: 'Indisponível' },
              })
            : route.continue(),
    );
    await open(page, context, b);
    await expect(page.locator('main p[role="alert"]')).toContainText(
        'consultar suas despesas',
    );
    await expect(
        page.getByText('Nenhuma despesa registrada nesta página.'),
    ).toHaveCount(0);
    unavailable = false;
    await page
        .getByRole('button', { name: 'Tentar novamente as despesas' })
        .click();
    await expect(
        page.getByText('Nenhuma despesa registrada nesta página.'),
    ).toBeVisible();
    await expect(
        page.getByRole('link', { name: 'Adicionar despesa' }),
    ).toBeVisible();
});

test('A21: options and detail errors retain retries and field error focuses its input', async ({
    page,
    context,
}) => {
    let optionsUnavailable = true;
    await page.route(
        `${apiUrl}/spaces/${a.personalId}/personal-expense-options`,
        (route) =>
            optionsUnavailable
                ? route.fulfill({
                      status: 503,
                      headers: cors,
                      json: { code: 'UNAVAILABLE', message: 'Indisponível' },
                  })
                : route.continue(),
    );
    await open(page, context, a, composer());
    await expect(
        page.getByRole('button', { name: 'Salvar despesa' }),
    ).toBeDisabled();
    await expect(
        page.getByRole('button', {
            name: 'Tentar novamente as opções',
            exact: true,
        }),
    ).toBeVisible();
    optionsUnavailable = false;
    await page
        .getByRole('button', { name: 'Tentar novamente as opções' })
        .click();
    await fill(page, 'Validação remota');
    await page.route(expenseUrl(), (route) =>
        route.request().method() === 'POST'
            ? route.fulfill({
                  status: 400,
                  headers: cors,
                  json: {
                      code: 'VALIDATION_ERROR',
                      message: 'Confira a descrição',
                      details: { fields: [{ field: 'description' }] },
                  },
              })
            : route.continue(),
    );
    await save(page);
    await expect(page.getByLabel('Descrição', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Validação remota',
    );
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveAttribute(
        'aria-invalid',
        'true',
    );
    await page.unroute(expenseUrl());
    await save(page);
    await recorded(page);
    let detailUnavailable = true;
    await page.route(
        `${apiUrl}/spaces/${a.personalId}/financial-commitments/*`,
        (route) =>
            detailUnavailable
                ? route.fulfill({
                      status: 503,
                      headers: cors,
                      json: { code: 'UNAVAILABLE', message: 'Indisponível' },
                  })
                : route.continue(),
    );
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await expect(page.locator('main p[role="alert"]')).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Validação remota' }),
    ).toHaveCount(0);
    detailUnavailable = false;
    await page
        .getByRole('button', { name: 'Tentar novamente a despesa' })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Validação remota' }),
    ).toBeVisible();
});

for (const status of [200, 401])
    test(`A18: personal history A→SHARED→A discards delayed ${status} without expiring session`, async ({
        page,
        context,
        playwright,
    }) => {
        await ignoreFinancialAbort(page);
        const started = deferred(),
            release = deferred();
        let reads = 0,
            delivered = false;
        const actor = await playwright.request.newContext({
            storageState: a.state,
        });
        const response = await actor.get(
            `${setupUrl}/spaces/${a.personalId}/personal-expenses`,
        );
        expect(response.status()).toBe(200);
        const old = await response.json();
        if (old.items[0]) old.items[0].description = 'Resposta antiga pessoal';
        await page.route(expenseUrl(), async (route) => {
            if (++reads !== 1) return route.continue();
            started.resolve();
            await release.promise;
            await route.fulfill({
                status,
                headers: cors,
                json:
                    status === 200
                        ? old
                        : { code: 'UNAUTHENTICATED', message: 'Sessão antiga' },
            });
            delivered = true;
        });
        try {
            await open(page, context);
            await started.promise;
            await switcher(page).selectOption(sharedId);
            await expect(switcher(page)).toHaveValue(sharedId);
            await expect(page).toHaveURL(`/spaces/${sharedId}/finances`);
            await switcher(page).selectOption(a.personalId);
            await expect(switcher(page)).toHaveValue(a.personalId);
            await expect(page).toHaveURL(`/spaces/${a.personalId}/finances`);
            await expect(
                page.getByRole('list', { name: 'Despesas pessoais' }),
            ).toBeVisible();
            release.resolve();
            await expect.poll(() => delivered).toBe(true);
            await expect(page.getByText('Resposta antiga pessoal')).toHaveCount(
                0,
            );
            await expect(switcher(page)).toHaveValue(a.personalId);
            await expect(page).toHaveURL(`/spaces/${a.personalId}/finances`);
        } finally {
            release.resolve();
            await actor.dispose();
        }
    });

for (const status of [200, 401])
    test(`A19: same-person logout/login clears personal history and rejects delayed ${status}`, async ({
        page,
        context,
        request,
    }) => {
        await ignoreFinancialAbort(page);
        const session = await freshSession(request),
            started = deferred(),
            release = deferred();
        let reads = 0,
            delivered = false;
        await page.route(expenseUrl(), async (route) => {
            if (++reads !== 1) return route.continue();
            const response = await route.fetch();
            const old = await response.json();
            if (old.items[0])
                old.items[0].description = 'Sessão antiga pessoal';
            started.resolve();
            await release.promise;
            await route.fulfill({
                status,
                headers: cors,
                json:
                    status === 200
                        ? old
                        : { code: 'UNAUTHENTICATED', message: 'Sessão antiga' },
            });
            delivered = true;
        });
        try {
            await open(page, context, session);
            await started.promise;
            await page
                .getByRole('button', { name: 'Sair', exact: true })
                .click();
            await login(page);
            await page
                .getByRole('link', { name: 'Finanças', exact: true })
                .click();
            await expect(
                page.getByRole('list', { name: 'Despesas pessoais' }),
            ).toBeVisible();
            release.resolve();
            await expect.poll(() => delivered).toBe(true);
            await expect(page.getByText('Sessão antiga pessoal')).toHaveCount(
                0,
            );
            await expect(page).toHaveURL(`/spaces/${a.personalId}/finances`);
            await expect(switcher(page)).toHaveValue(a.personalId);
        } finally {
            release.resolve();
        }
    });

for (const status of [201, 401])
    test(`A19/A20: delayed command ${status} after external logout never changes a new session`, async ({
        page,
        context,
        request,
    }) => {
        await ignoreFinancialAbort(page);
        const session = await freshSession(request),
            started = deferred(),
            release = deferred();
        let delivered = false;
        await open(page, context, session, composer());
        await fill(page, `Comando tardio ${status}`);
        await page.route(expenseUrl(), async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            started.resolve();
            await release.promise;
            await route.fulfill(
                status === 201
                    ? { response }
                    : {
                          status,
                          headers: cors,
                          json: {
                              code: 'UNAUTHENTICATED',
                              message: 'Sessão antiga',
                          },
                      },
            );
            delivered = true;
        });
        const other = await context.newPage();
        try {
            await save(page);
            await started.promise;
            await other.goto('/spaces');
            await other
                .getByRole('button', { name: 'Sair', exact: true })
                .click();
            await expect(other).toHaveURL('/login');
            await page.evaluate(() =>
                window.dispatchEvent(new Event('visibilitychange')),
            );
            await expect(page).toHaveURL('/login');
            await login(page, a, true);
            await page
                .getByRole('link', { name: 'Finanças', exact: true })
                .click();
            release.resolve();
            await expect.poll(() => delivered).toBe(true);
            await expect(
                page.getByRole('heading', { name: 'Despesa registrada' }),
            ).toHaveCount(0);
            await expect(page).toHaveURL(`/spaces/${a.personalId}/finances`);
            await expect(
                page.getByRole('link', {
                    name: `Comando tardio ${status}`,
                    exact: true,
                }),
            ).toHaveCount(1);
        } finally {
            release.resolve();
            await other.close();
        }
    });

test('A21: personal form supports keyboard and mobile layout; dirty navigation preserves or discards explicitly', async ({
    page,
    context,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, context, a, composer());
    await fill(page, 'Teclado pessoal', '1,00');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Cancelar' }).click();
    await expect(page).toHaveURL(composer());
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(
        'Teclado pessoal',
    );
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Salvar despesa' }).focus();
    await page.keyboard.press('Enter');
    await recorded(page);
    await noSharedConcepts(page);
    await page.getByRole('button', { name: 'Adicionar outra' }).click();
    await fill(page, 'Descartar pessoal');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Cancelar' }).click();
    await expect(page).toHaveURL(`/spaces/${a.personalId}/finances`);
});
