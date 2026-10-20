import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import type { TransferOptions } from '../../src/features/finances/types/settlement-transfer';

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
        a = await register(owner, 'Pessoa A parcial');
        await register(member, 'Pessoa B parcial');
        const created = await post(owner, '/spaces', { name: 'Casa CARD 013' });
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

async function pay(page: Page, amount: string, payer?: string) {
    await page
        .getByLabel('Valor pago agora (R$)', { exact: true })
        .fill(amount);
    if (payer)
        await page
            .getByLabel('Quem pagou de fato')
            .selectOption({ label: payer });
    await page
        .getByRole('button', { name: 'Revisar pagamento', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar pagamento', exact: true })
        .click();
}

async function receive(page: Page, amount: string, recipient?: string) {
    await page
        .getByLabel('Valor recebido agora (R$)', { exact: true })
        .fill(amount);
    if (recipient)
        await page
            .getByLabel('Quem recebeu de fato')
            .selectOption({ label: recipient });
    await page
        .getByRole('button', { name: 'Revisar recebimento', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar recebimento', exact: true })
        .click();
}

test('personal expense preserves original and three payments with mobile keyboard', async ({
    page,
    context,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, context, a, `/spaces/${a.personalId}/expenses/new`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill('Tratamento em partes');
    await page.getByLabel('Valor (R$)', { exact: true }).fill('1.000,00');
    await page
        .getByLabel('Forma de pagamento', { exact: true })
        .selectOption('PIX');
    await page.getByLabel('Valor pago agora (R$)').fill('300,00');
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Despesa registrada' }),
    ).toBeVisible();
    await expect(
        page.getByText('Parcialmente paga', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await expect(
        page
            .getByRole('region', { name: 'Histórico de pagamentos' })
            .getByRole('listitem'),
    ).toHaveCount(1);
    const path = page.url();
    await pay(page, '200,00');
    await expect(
        page
            .getByRole('region', { name: 'Histórico de pagamentos' })
            .getByRole('listitem'),
    ).toHaveCount(2);
    await page.getByLabel('Valor pago agora (R$)').fill('500,00');
    await page.getByRole('button', { name: 'Revisar pagamento' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Confirmar pagamento' }).focus();
    await page.keyboard.press('Enter');
    await expect(
        page.getByText('Paga integralmente', { exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole('region', { name: 'Histórico de pagamentos' })
            .getByRole('listitem'),
    ).toHaveCount(3);
    await expect(
        page.getByRole('heading', { name: 'Registrar pagamento' }),
    ).toHaveCount(0);
    await expect(
        page.locator('[name="payerMemberId"], [name="settlement"]'),
    ).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(path);
    await expect(
        page
            .getByRole('region', { name: 'Histórico de pagamentos' })
            .getByRole('listitem'),
    ).toHaveCount(3);
    await page.goto(`/spaces/${a.personalId}/finances`);
    await expect(
        page.getByRole('link', { name: 'Tratamento em partes', exact: true }),
    ).toHaveCount(1);
});

test('personal forecast receives 300, 200 and 500 and Today tracks remaining', async ({
    page,
    context,
}) => {
    await open(page, context, a, `/spaces/${a.personalId}/incomes/new`);
    await page.getByLabel('Descrição').fill('Serviço em três partes');
    await page.getByLabel('Valor total (R$)').fill('1.000,00');
    await page.getByRole('button', { name: 'Revisar receita' }).click();
    await page.getByRole('button', { name: 'Confirmar receita' }).click();
    await page.getByRole('link', { name: 'Ver receita', exact: true }).click();
    await receive(page, '300,00');
    await expect(
        page.getByText('Receita parcialmente recebida.', { exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole('region', { name: 'Histórico de recebimentos' })
            .getByRole('listitem'),
    ).toHaveCount(1);
    const path = page.url();
    await page.goto('/');
    const upcoming = page.getByRole('listitem').filter({
        has: page.getByRole('link', {
            name: 'Serviço em três partes',
            exact: true,
        }),
    });
    await expect(upcoming).toContainText('Falta receber');
    await expect(upcoming).toContainText('R$ 700,00');
    await page.goto(`/spaces/${a.personalId}/incomes`);
    await page.getByLabel('Mostrar receitas').selectOption('PENDING');
    await expect(
        page.getByText('Serviço em três partes', { exact: true }),
    ).toBeVisible();
    await page.goto(path);
    await receive(page, '200,00');
    await expect(
        page
            .getByRole('region', { name: 'Histórico de recebimentos' })
            .getByRole('listitem'),
    ).toHaveCount(2);
    await receive(page, '500,00');
    await expect(
        page.getByText('Receita recebida integralmente.', { exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole('region', { name: 'Histórico de recebimentos' })
            .getByRole('listitem'),
    ).toHaveCount(3);
    await expect(
        page.getByRole('button', { name: 'Revisar recebimento' }),
    ).toHaveCount(0);
    await page.goto('/');
    await expect(
        page.getByRole('link', { name: 'Serviço em três partes', exact: true }),
    ).toHaveCount(0);
});

test('income can start partially received and exposes immutable forecast', async ({
    page,
    context,
}) => {
    await open(page, context, a, `/spaces/${a.personalId}/incomes/new`);
    await page.getByLabel('Descrição').fill('Entrada parcial na criação');
    await page.getByLabel('Valor total (R$)').fill('1.000,00');
    await page.getByLabel('Sim, informar valor').check();
    await page.getByLabel('Valor recebido agora (R$)').fill('300,00');
    await page.getByRole('button', { name: 'Revisar receita' }).click();
    await expect(
        page.getByRole('group', { name: 'Confirmar receita' }),
    ).toContainText('Recebimento de R$ 300,00');
    await page.getByRole('button', { name: 'Confirmar receita' }).click();
    await expect(
        page.getByRole('term').filter({ hasText: /^Recebido$/ }),
    ).toBeVisible();
    await expect(
        page.getByRole('definition').filter({ hasText: /^R\$ 300,00$/ }),
    ).toBeVisible();
    await expect(
        page.getByRole('term').filter({ hasText: /^Falta receber$/ }),
    ).toBeVisible();
    await expect(
        page.getByRole('definition').filter({ hasText: /^R\$ 700,00$/ }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Ver receita', exact: true }).click();
    await expect(
        page.getByRole('definition').filter({ hasText: 'R$ 1.000,00' }),
    ).toHaveCount(1);
    await expect(
        page
            .getByRole('region', { name: 'Histórico de recebimentos' })
            .getByRole('listitem'),
    ).toHaveCount(1);
});

test('shared expense keeps original responsibilities with different effective payers', async ({
    page,
    context,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, context, a, `/spaces/${sharedId}/expenses/new`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill('Despesa com dois pagadores');
    await page.getByLabel('Valor (R$)', { exact: true }).fill('500,00');
    await page
        .getByLabel('Forma de pagamento', { exact: true })
        .selectOption('DEBIT');
    await page.getByLabel('Valor pago agora (R$)').fill('350,00');
    await page.getByLabel('Pessoa A parcial (%)').fill('60');
    await page.getByLabel('Pessoa B parcial (%)').fill('40');
    await page
        .getByLabel('Quem pagou?', { exact: true })
        .selectOption({ label: 'Pessoa A parcial' });
    await page
        .getByRole('button', { name: 'Salvar despesa', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Despesa registrada' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Ver despesa', exact: true }).click();
    await pay(page, '150,00', 'Pessoa B parcial');
    await expect(
        page.getByText('Paga integralmente', { exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole('region', { name: 'Histórico de pagamentos' })
            .getByRole('listitem'),
    ).toHaveCount(2);
    await expect(
        page.getByText(
            'Falta acertar: Pessoa B parcial deve R$ 50,00 a Pessoa A parcial',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        page
            .getByRole('region', { name: 'Resumo da despesa', exact: true })
            .getByText('Sua parte: R$ 300,00', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Pessoa B parcial: R$ 200,00', { exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
});

test('shared receipts reverse repass while preserving reconciliation history', async ({
    page,
    context,
    playwright,
}) => {
    await open(page, context, a, `/spaces/${sharedId}/incomes/new`);
    await page.getByLabel('Descrição').fill('Receita com inversão');
    await page.getByLabel('Valor total (R$)').fill('1.000,00');
    await page.getByLabel('Pessoa A parcial (%)').fill('60');
    await page.getByLabel('Pessoa B parcial (%)').fill('40');
    await page.getByLabel('Sim, informar valor').check();
    await page.getByLabel('Valor recebido agora (R$)').fill('500,00');
    await page
        .getByLabel('Quem recebeu de fato')
        .selectOption({ label: 'Pessoa A parcial' });
    await page.getByRole('button', { name: 'Revisar receita' }).click();
    await page.getByRole('button', { name: 'Confirmar receita' }).click();
    await page.getByRole('link', { name: 'Ver receita', exact: true }).click();
    await expect(
        page.getByText(
            'Pessoa A parcial deve repassar R$ 200,00 a Pessoa B parcial.',
        ),
    ).toBeVisible();
    await receive(page, '500,00', 'Pessoa B parcial');
    await expect(
        page.getByText(
            'Pessoa B parcial deve repassar R$ 100,00 a Pessoa A parcial.',
        ),
    ).toBeVisible();
    const history = page.getByRole('region', {
        name: 'Histórico de pendências',
    });
    await expect(history.getByRole('listitem')).toHaveCount(2);
    await expect(
        history.getByText(/Encerrada por reconciliação/),
    ).toBeVisible();
    await expect(
        history.getByText(/sem registrar transferência/),
    ).toBeVisible();
    await page.reload();
    await expect(history.getByRole('listitem')).toHaveCount(2);
    const commitmentId = page.url().split('/').at(-1);
    const api = await playwright.request.newContext({ storageState: a.state });
    try {
        const response = await api.get(
            `${setupUrl}/spaces/${sharedId}/settlement-transfers/options?direction=RECEIVABLE`,
        );
        expect(response.status()).toBe(200);
        const options: TransferOptions = await response.json();
        const obligation = options.items.find(
            (item) => item.origin.commitmentId === commitmentId,
        );
        if (!obligation)
            throw new Error(
                'O repasse da receita deve estar disponível para acerto.',
            );
        const transfer = await post(
            api,
            `/spaces/${sharedId}/settlement-transfers`,
            {
                expectedSpaceVersion: options.spaceVersion,
                payerMemberId: obligation.debtorMemberId,
                recipientMemberId: obligation.creditorMemberId,
                amountInCents: obligation.remainingAmountInCents,
                factDate: options.referenceDate,
                allocations: [
                    {
                        obligationId: obligation.id,
                        expectedObligationVersion: obligation.version,
                        amountInCents: obligation.remainingAmountInCents,
                    },
                ],
            },
        );
        expect(transfer.status()).toBe(201);
    } finally {
        await api.dispose();
    }
    await page.reload();
    await expect(history.getByText(/Pendência: .*Acertada/)).toBeVisible();
    await expect(page.getByText(/deve repassar/)).toHaveCount(0);
    await expect(
        page.getByRole('link', {
            name: 'Registrar transferência',
            exact: true,
        }),
    ).toHaveCount(0);
});

test('partial payment rejects zero, excess, fractions and future date before sending', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const created = await post(
        api,
        `/spaces/${a.personalId}/personal-expenses`,
        {
            description: 'Limites de parcial',
            amountInCents: 10000,
            factDate: '2026-01-01',
            disbursement: { method: 'PIX', amountInCents: 3000 },
        },
    );
    expect(created.status()).toBe(201);
    const body = await created.json();
    await api.dispose();
    await open(
        page,
        context,
        a,
        `/spaces/${a.personalId}/expenses/${body.commitment.id}`,
    );
    let writes = 0;
    page.on('request', (request) => {
        if (
            request.method() === 'POST' &&
            request.url().endsWith('/disbursements')
        )
            writes++;
    });
    for (const invalid of ['0', '70,01', '1,001', '90071992547409,92']) {
        await page.getByLabel('Valor pago agora (R$)').fill(invalid);
        await page.getByRole('button', { name: 'Revisar pagamento' }).click();
        await expect(page.getByRole('main').getByRole('alert')).toContainText(
            'Informe um valor positivo',
        );
    }
    await page.getByLabel('Valor pago agora (R$)').fill('70,00');
    await page
        .getByLabel('Data do pagamento', { exact: true })
        .fill('2099-01-01');
    await page.getByRole('button', { name: 'Revisar pagamento' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'até hoje',
    );
    expect(writes).toBe(0);
});

test('lost payment response retries same immutable attempt once', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const created = await post(
        api,
        `/spaces/${a.personalId}/personal-expenses`,
        {
            description: 'Pagamento sem resposta',
            amountInCents: 10000,
            factDate: '2026-01-01',
            disbursement: { method: 'PIX', amountInCents: 3000 },
        },
    );
    const body = await created.json();
    const endpoint = `**/financial-commitments/${body.commitment.id}/disbursements`;
    const sent: { key: string | undefined; body: string | null }[] = [];
    await page.route(endpoint, async (route) => {
        sent.push({
            key: route.request().headers()['idempotency-key'],
            body: route.request().postData(),
        });
        if (sent.length === 1) {
            await route.fetch();
            await route.abort('failed');
        } else await route.continue();
    });
    await open(
        page,
        context,
        a,
        `/spaces/${a.personalId}/expenses/${body.commitment.id}`,
    );
    await pay(page, '20,00');
    await expect(
        page.getByRole('button', { name: 'Reenviar a mesma tentativa' }),
    ).toBeVisible();
    await expect(page.getByLabel('Valor pago agora (R$)')).toBeDisabled();
    const advanced = await api.get(
        `${setupUrl}/spaces/${a.personalId}/financial-commitments/${body.commitment.id}`,
    );
    const another = await post(
        api,
        `/spaces/${a.personalId}/financial-commitments/${body.commitment.id}/disbursements`,
        {
            expectedCommitmentVersion: (await advanced.json()).commitment
                .version,
            amountInCents: 1000,
            method: 'CASH',
            factDate: '2026-01-01',
        },
    );
    expect(another.status()).toBe(201);
    await page
        .getByRole('button', { name: 'Reenviar a mesma tentativa' })
        .click();
    await expect(
        page
            .getByRole('region', { name: 'Histórico de pagamentos' })
            .getByRole('listitem'),
    ).toHaveCount(3);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    const detail = await api.get(
        `${setupUrl}/spaces/${a.personalId}/financial-commitments/${body.commitment.id}`,
    );
    expect((await detail.json()).disbursements).toHaveLength(3);
    await api.dispose();
});

test('options loading failure supports explicit retry on partial receipt', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const created = await post(api, `/spaces/${a.personalId}/incomes`, {
        description: 'Opções recuperáveis',
        amountInCents: 10000,
        expectedReceiptDate: '2026-01-01',
        receipt: { factDate: '2026-01-01', amountInCents: 3000 },
    });
    const body = await created.json();
    await api.dispose();
    let attempts = 0;
    await page.route(
        `**/financial-commitments/${body.commitment.id}/receipt-options`,
        async (route) => {
            if (++attempts === 1) await route.abort('failed');
            else await route.continue();
        },
    );
    await open(
        page,
        context,
        a,
        `/spaces/${a.personalId}/incomes/${body.commitment.id}`,
    );
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Não foi possível carregar as opções',
    );
    await page
        .getByRole('button', { name: 'Tentar novamente', exact: true })
        .click();
    await expect(page.getByLabel('Valor recebido agora (R$)')).toBeVisible();
    await receive(page, '70,00');
    await expect(
        page.getByText('Receita recebida integralmente.', { exact: true }),
    ).toBeVisible();
});

test('double confirmation locks context and records one payment', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const created = await post(
        api,
        `/spaces/${a.personalId}/personal-expenses`,
        {
            description: 'Confirmação única parcial',
            amountInCents: 10000,
            factDate: '2026-01-01',
            disbursement: { method: 'PIX', amountInCents: 3000 },
        },
    );
    const body = await created.json();
    await api.dispose();
    let release!: () => void,
        captured!: () => void,
        count = 0;
    const held = new Promise<void>((resolve) => {
            release = resolve;
        }),
        arrived = new Promise<void>((resolve) => {
            captured = resolve;
        });
    await page.route(
        `**/financial-commitments/${body.commitment.id}/disbursements`,
        async (route) => {
            count++;
            const response = await route.fetch();
            captured();
            await held;
            await route.fulfill({ response });
        },
    );
    await open(
        page,
        context,
        a,
        `/spaces/${a.personalId}/expenses/${body.commitment.id}`,
    );
    await page.getByLabel('Valor pago agora (R$)').fill('20,00');
    await page.getByRole('button', { name: 'Revisar pagamento' }).click();
    await page
        .getByRole('button', { name: 'Confirmar pagamento', exact: true })
        .evaluate((button: HTMLButtonElement) => {
            button.click();
            button.click();
        });
    await arrived;
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toBeDisabled();
    release();
    await expect(
        page
            .getByRole('region', { name: 'Histórico de pagamentos' })
            .getByRole('listitem'),
    ).toHaveCount(2);
    expect(count).toBe(1);
});

test('receipt options from A to B to A cannot replace the new context generation', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const created = await post(api, `/spaces/${a.personalId}/incomes`, {
        description: 'Opções com resposta tardia',
        amountInCents: 10000,
        expectedReceiptDate: '2026-01-01',
        receipt: { factDate: '2026-01-01', amountInCents: 3000 },
    });
    const body = await created.json();
    await api.dispose();
    await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (input, init) =>
            original(
                input,
                typeof input === 'string' && input.endsWith('/receipt-options')
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
        `**/financial-commitments/${body.commitment.id}/receipt-options`,
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
        `/spaces/${a.personalId}/incomes/${body.commitment.id}`,
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
    await page.goto(`/spaces/${a.personalId}/incomes/${body.commitment.id}`);
    await expect(page.getByLabel('Valor recebido agora (R$)')).toHaveValue(
        '70,00',
    );
    release();
    await done;
    await expect(page.getByLabel('Valor recebido agora (R$)')).toHaveValue(
        '70,00',
    );
    await receive(page, '70,00');
    await expect(
        page.getByText('Receita recebida integralmente.', { exact: true }),
    ).toBeVisible();
});

test('receipt response for a different commitment remains uncertain until same-attempt replay', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    const created = await post(api, `/spaces/${a.personalId}/incomes`, {
        description: 'Recebimento com origem conferida',
        amountInCents: 10000,
        expectedReceiptDate: '2026-01-01',
        receipt: { factDate: '2026-01-01', amountInCents: 3000 },
    });
    const body = await created.json();
    await api.dispose();
    let count = 0;
    const attempts: (string | null)[] = [];
    await page.route(
        `**/financial-commitments/${body.commitment.id}/receipts`,
        async (route) => {
            attempts.push(route.request().postData());
            if (++count > 1) return route.continue();
            const response = await route.fetch(),
                value = await response.json();
            await route.fulfill({
                response,
                json: {
                    ...value,
                    commitment: { ...value.commitment, id: randomUUID() },
                },
            });
        },
    );
    await open(
        page,
        context,
        a,
        `/spaces/${a.personalId}/incomes/${body.commitment.id}`,
    );
    await receive(page, '70,00');
    await expect(
        page.getByRole('button', { name: 'Reenviar a mesma tentativa' }),
    ).toBeVisible();
    await expect(
        page
            .getByRole('region', { name: 'Histórico de recebimentos' })
            .getByRole('listitem'),
    ).toHaveCount(1);
    await expect(page.getByLabel('Valor recebido agora (R$)')).toBeDisabled();
    await page
        .getByRole('button', { name: 'Reenviar a mesma tentativa' })
        .click();
    await expect(
        page.getByText('Receita recebida integralmente.', { exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole('region', { name: 'Histórico de recebimentos' })
            .getByRole('listitem'),
    ).toHaveCount(2);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
});

for (const status of [201, 401])
    test(`payment delayed ${status} after logout and same-person login cannot mutate the new session`, async ({
        page,
        context,
        playwright,
    }) => {
        const api = await playwright.request.newContext();
        const account = await register(api, `Sessão parcial ${status}`);
        const created = await post(
            api,
            `/spaces/${account.personalId}/personal-expenses`,
            {
                description: `Pagamento na sessão anterior ${status}`,
                amountInCents: 10000,
                factDate: '2026-01-01',
                disbursement: { method: 'PIX', amountInCents: 3000 },
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
                        input.endsWith('/disbursements')
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
            `**/financial-commitments/${body.commitment.id}/disbursements`,
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
            await pay(page, '20,00');
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
                page.getByText('Pagamento registrado.', { exact: true }),
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
                    name: `Pagamento na sessão anterior ${status}`,
                    exact: true,
                }),
            ).toHaveCount(1);
        } finally {
            release();
            await other.close();
        }
    });
