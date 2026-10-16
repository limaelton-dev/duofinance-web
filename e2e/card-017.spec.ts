import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import type { FinancialOverview } from '../src/features/finances/types/financial-review';
import { formatReviewMoney } from '../src/features/finances/utils/financial-review';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const apiUrl = 'http://127.0.0.1:3101/v2',
    origin = 'http://localhost:3100';
type Account = {
    personalId: string;
    id: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
let a: Account, b: Account, sharedId: string, aMember: string, bMember: string;
let personalCardId: string, sharedCardId: string;
const csrfTokens = new WeakMap<APIRequestContext, string>();

async function post(api: APIRequestContext, path: string, data: object) {
    let csrfToken = csrfTokens.get(api);
    if (!csrfToken) {
        const csrf = await api.get(`${apiUrl}/auth/csrf`);
        expect(csrf.status()).toBe(200);
        csrfToken = (await csrf.json()).csrfToken as string;
        csrfTokens.set(api, csrfToken);
    }
    return api.post(`${apiUrl}${path}`, {
        headers: {
            Origin: origin,
            'X-CSRF-Token': csrfToken,
            'Idempotency-Key': randomUUID(),
        },
        data,
    });
}
async function json(api: APIRequestContext, path: string, data: object) {
    const response = await post(api, path, data);
    expect(response.status(), await response.text()).toBe(201);
    return response.json();
}
async function register(
    api: APIRequestContext,
    displayName: string,
): Promise<Account> {
    const value = await json(api, '/auth/register', {
        displayName,
        email: `${randomUUID()}@example.com`,
        password: 'uma-senha-forte-de-testes',
    });
    csrfTokens.delete(api);
    return {
        id: value.person.id,
        personalId: value.personalSpace.id,
        state: await api.storageState(),
    };
}
async function open(
    page: Page,
    context: BrowserContext,
    account = a,
    spaceId = account.personalId,
) {
    await context.addCookies(
        account.state.cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    );
    await page.goto(`/spaces/${account.personalId}`);
    const switcher = page.getByRole('combobox', {
        name: 'Espaço atual',
        exact: true,
    });
    await expect(switcher).toHaveValue(account.personalId);
    if (spaceId !== account.personalId) {
        await switcher.selectOption(spaceId);
        await expect(switcher).toHaveValue(spaceId);
    }
    await page.goto(`/spaces/${spaceId}/finances`);
    await expect(
        page.getByRole('region', {
            name: 'Resumo financeiro do mês',
            exact: true,
        }),
    ).toBeVisible();
}
async function month(page: Page, value: string) {
    await page.getByLabel('Mês calendário', { exact: true }).fill(value);
    const summary =
        (await page
            .getByRole('button', { name: 'Resumo', exact: true })
            .getAttribute('aria-current')) === 'page';
    await expect(
        page.getByRole('heading', {
            name: `${summary ? 'Resumo' : 'Compromissos'} de ${value}`,
            exact: true,
        }),
    ).toBeVisible();
}
const overview = (page: Page) =>
    page.getByRole('region', { name: 'Resumo financeiro do mês', exact: true });
const metric = (page: Page, label: string) =>
    overview(page)
        .getByText(label, { exact: true })
        .locator('..')
        .locator('dd');

async function seed(
    api: APIRequestContext,
    holder: APIRequestContext,
    spaceId: string,
    shared: boolean,
) {
    const options = await (
        await api.get(
            `${apiUrl}/spaces/${spaceId}/credit-card-purchase-options`,
        )
    ).json();
    const split = {
        mode: 'PERCENTAGES',
        shares: [
            { memberId: aMember, basisPoints: 6000 },
            { memberId: bMember, basisPoints: 4000 },
        ],
    };
    const sharedInput = shared
        ? {
              expectedSpaceVersion: options.version,
              responsibilitySplit: split,
              expectedPayerMemberId: null,
              settlement: { mode: 'NONE' },
          }
        : {};
    await json(
        api,
        `/spaces/${spaceId}/${shared ? 'shared-cash-expenses' : 'personal-expenses'}`,
        {
            description: 'Despesa direta de janeiro',
            amountInCents: 50000,
            factDate: '2026-01-01',
            ...sharedInput,
            disbursement: {
                method: 'PIX',
                ...(shared ? { payerMemberId: aMember } : {}),
            },
        },
    );
    const card = await json(api, `/spaces/${spaceId}/credit-card-purchases`, {
        description: 'Cartão de janeiro',
        amountInCents: 20000,
        factDate: '2026-01-02',
        ...sharedInput,
        externalLiability: shared ? { holderMemberId: bMember } : {},
    });
    const liabilityId = card.externalLiability.id;
    await json(
        holder,
        `/spaces/${spaceId}/financial-commitments/${card.commitment.id}/external-liabilities/${liabilityId}/settlements`,
        {
            amountInCents: 6000,
            factDate: '2026-02-01',
            expectedCommitmentVersion: card.commitment.version,
            ...(shared ? { expectedSpaceVersion: options.version } : {}),
        },
    );
    await json(api, `/spaces/${spaceId}/incomes`, {
        description: 'Receita futura parcialmente recebida',
        amountInCents: 100000,
        expectedReceiptDate: '2099-01-20',
        ...(shared
            ? {
                  expectedSpaceVersion: options.version,
                  participationSplit: split,
                  expectedRecipientMemberId: bMember,
              }
            : {}),
        receipt: {
            amountInCents: 40000,
            factDate: '2026-01-03',
            ...(shared
                ? { recipientMemberId: aMember, settlement: { mode: 'NONE' } }
                : {}),
        },
    });
    return card.commitment.id as string;
}

test.beforeAll(async ({ playwright }) => {
    const owner = await playwright.request.newContext(),
        member = await playwright.request.newContext();
    try {
        a = await register(owner, 'Pessoa A revisão');
        b = await register(member, 'Pessoa B revisão');
        const created = await json(owner, '/spaces', {
            name: 'Casa Cards 016 e 017',
        });
        sharedId = created.space.id;
        const token = new URLSearchParams(
            new URL(created.inviteUrl).hash.slice(1),
        ).get('token');
        const accepted = await post(member, '/invitations/respond', {
            token,
            decision: 'ACCEPT',
            expectedVersion: created.space.version,
        });
        expect(accepted.status()).toBe(200);
        const options = await (
            await owner.get(
                `${apiUrl}/spaces/${sharedId}/credit-card-purchase-options`,
            )
        ).json();
        aMember = options.members.find(
            (m: { personId: string }) => m.personId === a.id,
        ).memberId;
        bMember = options.members.find(
            (m: { personId: string }) => m.personId === b.id,
        ).memberId;
        personalCardId = await seed(owner, owner, a.personalId, false);
        sharedCardId = await seed(owner, member, sharedId, true);
        for (let index = 0; index < 21; index++)
            await json(owner, `/spaces/${a.personalId}/incomes`, {
                description: `Futuro paginado ${String(index).padStart(2, '0')}`,
                amountInCents: 100,
                expectedReceiptDate: '2099-02-10',
                receipt: null,
            });
    } finally {
        await owner.dispose();
        await member.dispose();
    }
});

test('A08/A09/A16: pessoal separa economia, caixa, cartão, suporte e aberto atual em meses diferentes', async ({
    page,
    context,
}) => {
    await open(page, context);
    await month(page, '2026-01');
    for (const [label, value] of [
        ['Despesas econômicas registradas', 'R$ 700,00'],
        ['Receitas realizadas', 'R$ 400,00'],
        [
            'Resultado econômico: receitas realizadas menos despesas',
            '-R$ 300,00',
        ],
        ['Pagamentos diretos de despesas', 'R$ 500,00'],
        ['Liquidações externas', 'R$ 0,00'],
        ['Desembolsado em despesas e liquidações', 'R$ 500,00'],
        ['Obrigações externas assumidas no cartão', 'R$ 200,00'],
        [
            'Valor suportado: pagamentos diretos e obrigações assumidas',
            'R$ 700,00',
        ],
        ['Obrigações externas abertas agora', 'R$ 140,00'],
    ])
        await expect(metric(page, label)).toHaveText(value);
    await expect(
        page.getByRole('link', { name: 'Acertos', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel('Valores por membro')).toHaveCount(0);
    await month(page, '2026-02');
    await expect(metric(page, 'Despesas econômicas registradas')).toHaveText(
        'R$ 0,00',
    );
    await expect(metric(page, 'Liquidações externas')).toHaveText('R$ 60,00');
    await expect(
        metric(page, 'Desembolsado em despesas e liquidações'),
    ).toHaveText('R$ 60,00');
    await expect(
        metric(
            page,
            'Valor suportado: pagamentos diretos e obrigações assumidas',
        ),
    ).toHaveText('R$ 0,00');
    await expect(metric(page, 'Obrigações externas abertas agora')).toHaveText(
        'R$ 140,00',
    );
});

test('A03/A16: previsão mostra somente restante conhecido e preserva visão ao trocar mês', async ({
    page,
    context,
}) => {
    await open(page, context);
    await month(page, '2099-01');
    await page
        .getByRole('button', { name: 'Compromissos', exact: true })
        .click();
    await page.getByLabel('Visão financeira').selectOption('FORECAST');
    const region = page.getByRole('region', {
        name: 'Consultas financeiras',
        exact: true,
    });
    await expect(
        region.getByText('Receita futura parcialmente recebida', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        region
            .getByText('Restante futuro conhecido')
            .locator('..')
            .locator('dd'),
    ).toHaveText('R$ 600,00');
    await expect(
        region
            .getByText('Já recebido dos compromissos previstos')
            .locator('..')
            .locator('dd'),
    ).toHaveText('R$ 400,00');
    await month(page, '2026-01');
    await expect(page.getByLabel('Visão financeira')).toHaveValue('FORECAST');
    await expect(
        region.getByText('Nenhum compromisso futuro conhecido neste período.'),
    ).toBeVisible();
    await expect(region.getByRole('alert')).toHaveCount(0);
});

test('A01/A09/A16: calendário e histórico preservam datas, tipos e navegam a origem e liquidação', async ({
    page,
    context,
}) => {
    await open(page, context);
    await month(page, '2026-02');
    await page
        .getByRole('button', { name: 'Compromissos', exact: true })
        .click();
    const facts = page.getByRole('list', {
        name: 'Fatos financeiros',
        exact: true,
    });
    await expect(
        facts.getByText('Liquidação externa: R$ 60,00', { exact: true }),
    ).toBeVisible();
    await expect(
        facts.getByText('Data real do fato: 01/02/2026'),
    ).toBeVisible();
    await page.getByLabel('Visão financeira').selectOption('HISTORY');
    await expect(
        facts.getByText('Cadastrado em:', { exact: false }),
    ).toBeVisible();
    const link = facts.getByRole('link', {
        name: 'Ver obrigação e liquidações na origem',
        exact: true,
    });
    await expect(link).toHaveAttribute(
        'href',
        new RegExp(`/expenses/${personalCardId}#external-liability-`),
    );
    await link.click();
    await expect(
        page.getByRole('region', {
            name: 'Obrigações externas e liquidações',
            exact: true,
        }),
    ).toBeVisible();
});

test('A04/A16: paginação de previsão mantém totais do recorte e novo mês reinicia cursor', async ({
    page,
    context,
}) => {
    await open(page, context);
    await month(page, '2099-02');
    await page
        .getByRole('button', { name: 'Compromissos', exact: true })
        .click();
    await page.getByLabel('Visão financeira').selectOption('FORECAST');
    const list = page.getByRole('list', {
        name: 'Compromissos futuros conhecidos',
        exact: true,
    });
    await expect(list.getByRole('listitem')).toHaveCount(20);
    const total = page
        .getByText('Restante futuro conhecido')
        .locator('..')
        .locator('dd');
    await expect(total).toHaveText('R$ 21,00');
    await page
        .getByRole('button', {
            name: 'Próxima página de compromissos',
            exact: true,
        })
        .click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(total).toHaveText('R$ 21,00');
    await month(page, '2099-01');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await month(page, '2099-02');
    await expect(list.getByRole('listitem')).toHaveCount(20);
});

test('A05/A08/A13: membro tem responsabilidade e participação próprias, executor e cartão separados', async ({
    page,
    context,
}) => {
    await open(page, context, a, sharedId);
    await month(page, '2026-01');
    await page.getByLabel('Valores por membro').selectOption(bMember);
    await expect(
        page.getByText('Recorte de Pessoa B revisão:', { exact: false }),
    ).toBeVisible();
    await expect(
        metric(page, 'Responsabilidade original nas despesas').first(),
    ).toHaveText('R$ 280,00');
    await expect(
        metric(page, 'Participação econômica em receitas realizadas').first(),
    ).toHaveText('R$ 160,00');
    await expect(
        metric(page, 'Dinheiro recebido diretamente').first(),
    ).toHaveText('R$ 0,00');
    await expect(
        metric(page, 'Obrigações externas assumidas no cartão').first(),
    ).toHaveText('R$ 200,00');
    await page
        .getByRole('button', { name: 'Compromissos', exact: true })
        .click();
    await page.getByLabel('Visão financeira').selectOption('HISTORY');
    const facts = page.getByRole('list', {
        name: 'Fatos financeiros',
        exact: true,
    });
    await expect(
        facts.getByText('Recebedor efetivo: Pessoa A revisão'),
    ).toBeVisible();
    await expect(
        facts.getByText('Recebimento realizado: R$ 400,00', { exact: true }),
    ).toBeVisible();
    await month(page, '2099-01');
    await page.getByLabel('Visão financeira').selectOption('FORECAST');
    await expect(facts).toHaveCount(0);
    await expect(
        page.getByText('Recebedor previsto: Pessoa B revisão'),
    ).toBeVisible();
    await expect(
        page.getByText('Restante futuro conhecido').locator('..').locator('dd'),
    ).toHaveText('R$ 600,00');
});

test('A13: aberto de outro membro navega sua origem, sem conceder liquidação', async ({
    page,
    context,
}) => {
    await open(page, context, a, sharedId);
    await page
        .getByRole('link', {
            name: 'Ver obrigações de Pessoa B revisão',
            exact: true,
        })
        .click();
    await expect(page).toHaveURL(
        `/spaces/${sharedId}/finances/external-liabilities?memberId=${bMember}`,
    );
    await page
        .getByRole('link', {
            name: 'Ver despesa: Cartão de janeiro',
            exact: true,
        })
        .click();
    await expect(page).toHaveURL(
        new RegExp(`/expenses/${sharedCardId}#external-liability-`),
    );
    await expect(
        page.getByRole('region', {
            name: 'Obrigações externas e liquidações',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: 'Registrar pagamento da obrigação',
            exact: true,
        }),
    ).toHaveCount(0);
});

test('A15/A18: falha não aparece como resumo zero, retry recupera e teclado mantém foco', async ({
    page,
    context,
}) => {
    await open(page, context);
    let fail = true;
    await page.route('**/financial-overview?**', async (route) => {
        if (fail)
            await route.fulfill({
                status: 503,
                headers: {
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Credentials': 'true',
                },
                json: { code: 'INTERNAL_ERROR', message: 'Indisponível' },
            });
        else await route.continue();
    });
    await page
        .getByRole('button', { name: 'Atualizar resumo', exact: true })
        .click();
    await expect(
        page.getByRole('alert').filter({
            hasText: 'Não foi possível consultar o resumo financeiro.',
        }),
    ).toBeVisible();
    await expect(overview(page)).toHaveCount(0);
    fail = false;
    const retry = page.getByRole('button', {
        name: 'Tentar novamente o resumo',
        exact: true,
    });
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(overview(page)).toBeVisible();
    await page
        .getByRole('button', { name: 'Compromissos', exact: true })
        .click();
    await expect(page.getByLabel('Visão financeira')).toBeVisible();
});

test('A17: mês A → B → A e 401 tardio preservam nova seleção e sessão', async ({
    page,
    context,
}) => {
    await open(page, context);
    await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (input, init) =>
            original(
                input,
                typeof input === 'string' &&
                    input.includes('/financial-overview?')
                    ? { ...init, signal: undefined }
                    : init,
            );
    });
    await page.reload();
    await expect(overview(page)).toBeVisible();
    let release!: () => void,
        captured!: () => void,
        first = true,
        delivered = false;
    const held = new Promise<void>((resolve) => {
            release = resolve;
        }),
        arrived = new Promise<void>((resolve) => {
            captured = resolve;
        });
    await page.route('**/financial-overview?**', async (route) => {
        const url = new URL(route.request().url());
        if (!first || url.searchParams.get('month') !== '2026-01') {
            await route.continue();
            return;
        }
        first = false;
        await route.fetch();
        captured();
        await held;
        await route.fulfill({
            status: 401,
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Credentials': 'true',
            },
            json: { code: 'UNAUTHENTICATED', message: 'Expirada' },
        });
        delivered = true;
    });
    try {
        await page.getByLabel('Mês calendário').fill('2026-01');
        await arrived;
        await month(page, '2026-02');
        await month(page, '2026-01');
        release();
        await expect.poll(() => delivered).toBe(true);
        await expect(
            metric(page, 'Despesas econômicas registradas'),
        ).toHaveText('R$ 700,00');
        await expect(
            page.getByRole('button', { name: 'Sair', exact: true }),
        ).toBeVisible();
        await expect(page).toHaveURL(`/spaces/${a.personalId}/finances`);
    } finally {
        release();
    }
});

test('A02/A18: virada diária refaz consultas, leitura móvel não transborda e refresh preserva dados', async ({
    page,
    context,
}) => {
    await page.clock.install({ time: new Date('2026-10-15T02:59:59.500Z') });
    await page.setViewportSize({ width: 360, height: 780 });
    await open(page, context);
    await month(page, '2026-01');
    let requests = 0;
    page.on('request', (request) => {
        if (request.url().includes('/financial-overview?')) requests++;
    });
    const refreshed = page.waitForResponse(
        (response) =>
            response.url().includes('/financial-overview?') && response.ok(),
    );
    await page.clock.fastForward(1000);
    await refreshed;
    expect(requests).toBeGreaterThan(0);
    await expect(overview(page)).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page.reload();
    await month(page, '2026-01');
    await expect(metric(page, 'Obrigações externas abertas agora')).toHaveText(
        'R$ 140,00',
    );
});

test('A16: recebimento já suportado atualiza o resumo pelo comando existente', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    let value: { commitment: { id: string }; referenceDate: string };
    try {
        const reference = await (
            await api.get(`${apiUrl}/spaces/${a.personalId}/income-options`)
        ).json();
        const income = await json(api, `/spaces/${a.personalId}/incomes`, {
            description: 'Recebimento que atualiza leitura',
            amountInCents: 12345,
            expectedReceiptDate: reference.referenceDate,
            receipt: null,
        });
        value = {
            commitment: income.commitment,
            referenceDate: reference.referenceDate,
        };
    } finally {
        await api.dispose();
    }
    await open(page, context);
    await month(page, value.referenceDate.slice(0, 7));
    const beforeResponse = await page.request.get(
        `http://localhost:3101/v2/spaces/${a.personalId}/financial-overview?month=${value.referenceDate.slice(0, 7)}`,
    );
    const before: FinancialOverview = await beforeResponse.json();
    await page.goto(`/spaces/${a.personalId}/incomes/${value.commitment.id}`);
    const form = page;
    await form
        .getByRole('button', { name: 'Revisar recebimento', exact: true })
        .click();
    await form
        .getByRole('button', { name: 'Confirmar recebimento', exact: true })
        .click();
    await expect(
        page.getByText('Receita recebida integralmente.', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('link', { name: 'Voltar às receitas', exact: true })
        .click();
    await page.getByRole('link', { name: 'Finanças', exact: true }).click();
    await month(page, value.referenceDate.slice(0, 7));
    const formatted = formatReviewMoney(
        (BigInt(before.totals.realizedIncomeAmountInCents) + 12345n).toString(),
    );
    await expect(metric(page, 'Receitas realizadas')).toHaveText(formatted);
});

for (const status of ['CLOSING', 'CLOSED'] as const)
    test(`A12/A18: contexto ${status} preserva consultas e omite criação em Compromissos`, async ({
        page,
        context,
    }) => {
        await page.route(
            `http://localhost:3101/v2/spaces/${sharedId}`,
            async (route) => {
                const response = await route.fetch();
                expect(response.status()).toBe(200);
                const value = await response.json();
                await route.fulfill({
                    response,
                    json: { ...value, space: { ...value.space, status } },
                });
            },
        );
        await open(page, context, a, sharedId);
        await month(page, '2026-01');
        await page
            .getByRole('button', { name: 'Compromissos', exact: true })
            .click();
        await expect(
            page.getByRole('list', { name: 'Fatos financeiros', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Adicionar despesa', exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('link', { name: 'Adicionar receita', exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('link', {
                name: 'Histórico de receitas',
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Acertos', exact: true }),
        ).toBeVisible();
    });
