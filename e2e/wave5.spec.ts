import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type Page,
    type BrowserContext,
} from '@playwright/test';
import { businessToday } from '../src/features/finances/utils/expense-money';

const apiUrl = 'http://127.0.0.1:3101/v2',
    webOrigin = 'http://localhost:3100';
type Account = {
    personId: string;
    spaceId: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
let a: Account, b: Account, sharedId: string, aMember: string, bMember: string;
let pendingId: string,
    receivedId: string,
    cardId: string,
    paidId: string,
    proposalId: string;
const csrf = new WeakMap<APIRequestContext, string>();
async function post(api: APIRequestContext, path: string, data: object) {
    let token = csrf.get(api);
    if (!token) {
        token = (await (await api.get(`${apiUrl}/auth/csrf`)).json()).csrfToken;
        csrf.set(api, token!);
    }
    return api.post(`${apiUrl}${path}`, {
        headers: {
            Origin: webOrigin,
            'X-CSRF-Token': token!,
            'Idempotency-Key': randomUUID(),
        },
        data,
    });
}
async function create(api: APIRequestContext, path: string, data: object) {
    const r = await post(api, path, data);
    expect(r.status(), await r.text()).toBe(201);
    return r.json();
}
async function register(
    api: APIRequestContext,
    name: string,
): Promise<Account> {
    const value = await create(api, '/auth/register', {
        displayName: name,
        email: `${randomUUID()}@example.test`,
        password: 'teste-integridade-financeira-seguro',
    });
    csrf.delete(api);
    return {
        personId: value.person.id,
        spaceId: value.personalSpace.id,
        state: await api.storageState(),
    };
}
async function open(
    page: Page,
    context: BrowserContext,
    account: Account,
    spaceId: string,
    id?: string,
) {
    await context.addCookies(
        account.state.cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    );
    await page.goto(
        id
            ? `/spaces/${spaceId}/finances/commitments/${id}`
            : `/spaces/${spaceId}/finances/changes`,
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        id ? 'Histórico e correções' : 'Alterações financeiras',
    );
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(spaceId);
}
test.beforeAll(async ({ playwright }) => {
    const owner = await playwright.request.newContext(),
        other = await playwright.request.newContext();
    try {
        a = await register(owner, 'Pessoa A integridade');
        b = await register(other, 'Pessoa B integridade');
        const today = businessToday();
        pendingId = (
            await create(owner, `/spaces/${a.spaceId}/incomes`, {
                description: 'Receita sem realização',
                amountInCents: 10000,
                expectedReceiptDate: '2099-01-10',
                receipt: null,
            })
        ).commitment.id;
        receivedId = (
            await create(owner, `/spaces/${a.spaceId}/incomes`, {
                description: 'Receita recebida',
                amountInCents: 10000,
                expectedReceiptDate: today,
                receipt: { amountInCents: 10000, factDate: today },
            })
        ).commitment.id;
        paidId = (
            await create(owner, `/spaces/${a.spaceId}/personal-expenses`, {
                description: 'Despesa paga',
                amountInCents: 10000,
                factDate: today,
                disbursement: { method: 'PIX' },
            })
        ).commitment.id;
        const card = await create(
            owner,
            `/spaces/${a.spaceId}/credit-card-purchases`,
            {
                description: 'Compra no cartão',
                amountInCents: 10000,
                factDate: today,
                externalLiability: {},
            },
        );
        cardId = card.commitment.id;
        const liabilityId = card.externalLiabilities[0].id;
        await create(
            owner,
            `/spaces/${a.spaceId}/financial-commitments/${cardId}/external-liabilities/${liabilityId}/settlements`,
            {
                amountInCents: 4000,
                factDate: today,
                expectedCommitmentVersion: card.commitment.version,
            },
        );
        const shared = await create(owner, '/spaces', {
            name: 'Casa integridade',
        });
        sharedId = shared.space.id;
        const token = new URLSearchParams(
            new URL(shared.inviteUrl).hash.slice(1),
        ).get('token');
        const accepted = await post(other, '/invitations/respond', {
            token,
            decision: 'ACCEPT',
            expectedVersion: shared.space.version,
        });
        expect(accepted.status()).toBe(200);
        const financialContext = await (
            await owner.get(
                `${apiUrl}/spaces/${sharedId}/financial-entry-context`,
            )
        ).json();
        aMember = financialContext.members.find(
            (m: { personId: string }) => m.personId === a.personId,
        ).memberId;
        bMember = financialContext.members.find(
            (m: { personId: string }) => m.personId === b.personId,
        ).memberId;
        proposalId = (
            await create(owner, `/spaces/${sharedId}/planned-expenses`, {
                scope: 'SHARED',
                expectedSpaceVersion: financialContext.version,
                description: 'Aluguel futuro',
                amountInCents: 10000,
                expectedPaymentDate: '2099-01-10',
                responsibilitySplit: {
                    mode: 'AMOUNTS',
                    shares: [
                        { memberId: aMember, amountInCents: 5000 },
                        { memberId: bMember, amountInCents: 5000 },
                    ],
                },
            })
        ).commitment.id;
    } finally {
        await owner.dispose();
        await other.dispose();
    }
});

test('ajuste mostra a diferença sem criar realização e cancelamento preserva o registro', async ({
    page,
    context,
}) => {
    await open(page, context, a, a.spaceId, pendingId);
    await page.getByLabel('Motivo', { exact: true }).fill('Desconto combinado');
    await page
        .getByLabel('Valor da diferença (R$)', { exact: true })
        .fill('10,00');
    await page
        .getByRole('button', { name: 'Revisar efeito', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Confira o efeito' }),
    ).toBeVisible();
    await expect(
        page.getByText('R$ 90,00', { exact: true }).first(),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Confirmar operação', exact: true })
        .click();
    await expect(
        page.getByRole('status').filter({ hasText: 'Operação registrada' }),
    ).toContainText('Operação registrada');
    await page
        .getByRole('combobox', { name: 'Operação', exact: true })
        .selectOption('CANCEL');
    await page
        .getByLabel('Motivo', { exact: true })
        .fill('Compromisso cancelado externamente');
    await page
        .getByRole('button', { name: 'Revisar efeito', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar operação', exact: true })
        .click();
    await expect(page.getByText(/Cancelado em/)).toBeVisible();
    await expect(page.getByText(/Desconto de R\$ 10,00/)).toBeVisible();
});

for (const kind of [
    'RECEIPT',
    'DISBURSEMENT',
    'EXTERNAL_SETTLEMENT',
    'EXTERNAL_LIABILITY',
] as const) {
    test(`reversão ${kind} mantém original e centavos exatos`, async ({
        page,
        context,
    }) => {
        const id =
            kind === 'RECEIPT'
                ? receivedId
                : kind === 'DISBURSEMENT'
                  ? paidId
                  : cardId;
        await open(page, context, a, a.spaceId, id);
        await page
            .getByRole('combobox', { name: 'Operação', exact: true })
            .selectOption('REVERSE');
        const options = page.getByRole('combobox', {
            name: 'Fato original',
            exact: true,
        });
        const labels = {
            RECEIPT: 'Recebimento',
            DISBURSEMENT: 'Pagamento',
            EXTERNAL_SETTLEMENT: 'Liquidação do cartão',
            EXTERNAL_LIABILITY: 'Obrigação no cartão',
        };
        const value = await options
            .locator('option')
            .filter({ hasText: labels[kind] })
            .getAttribute('value');
        expect(value).toBeTruthy();
        await options.selectOption(value!);
        await page
            .getByLabel('Motivo', { exact: true })
            .fill(`Correção de ${labels[kind]}`);
        await page
            .getByLabel('Valor a reverter (R$)', { exact: true })
            .fill('1,01');
        await page
            .getByRole('button', { name: 'Revisar efeito', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Confira o efeito' }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Confirmar operação', exact: true })
            .click();
        await expect(
            page.getByRole('status').filter({ hasText: 'Operação registrada' }),
        ).toContainText('Operação registrada');
        await expect(
            page.getByRole('heading', { name: `${labels[kind]} · R$ 1,01` }),
        ).toBeVisible();
        await expect(
            options.locator('option').filter({ hasText: labels[kind] }),
        ).toHaveCount(1);
    });
}

test('alteração onerosa exige proposta e apenas destinatário decide', async ({
    page,
    context,
    browser,
}) => {
    await open(page, context, a, sharedId, proposalId);
    await page
        .getByRole('combobox', { name: 'Operação', exact: true })
        .selectOption('CHANGE');
    await page
        .getByLabel('Nova descrição', { exact: true })
        .fill('Aluguel futuro revisto');
    await page
        .getByLabel('Vigência futura', { exact: true })
        .fill('2099-01-02');
    await page
        .getByLabel('Novo valor total (R$)', { exact: true })
        .fill('120,00');
    await page
        .getByLabel('Parte de Pessoa A integridade (R$)', { exact: true })
        .fill('50,00');
    await page
        .getByLabel('Parte de Pessoa B integridade (R$)', { exact: true })
        .fill('70,00');
    await page
        .getByRole('button', { name: 'Revisar efeito', exact: true })
        .click();
    await expect(
        page.getByText('Depende do aceite desta pessoa.', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Enviar para aprovação', exact: true })
        .click();
    await expect(
        page.getByRole('status').filter({ hasText: 'Proposta registrada' }),
    ).toContainText('Proposta registrada');
    await page.goto(`/spaces/${sharedId}/finances/changes`);
    await expect(
        page.getByRole('heading', {
            name: 'Aluguel futuro revisto',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Revisar aceite', exact: true }),
    ).toHaveCount(0);
    const recipientContext = await browser.newContext();
    const recipient = await recipientContext.newPage();
    try {
        await open(recipient, recipientContext, b, sharedId);
        await recipient
            .getByRole('button', { name: 'Revisar aceite', exact: true })
            .click();
        await expect(
            recipient.getByText('Aceitar esta alteração?', { exact: true }),
        ).toBeVisible();
        await recipient
            .getByRole('button', { name: 'Confirmar aceite', exact: true })
            .click();
        await expect(
            recipient
                .getByRole('status')
                .filter({ hasText: 'Proposta aceita' }),
        ).toContainText('Proposta aceita');
        await recipient.reload();
        await expect(
            recipient.getByText('Aceita', { exact: true }),
        ).toBeVisible();
    } finally {
        await recipientContext.close();
    }
});

test('resultado incerto recupera a mesma reversão sem duplicar o fato', async ({
    page,
    context,
}) => {
    await open(page, context, a, a.spaceId, receivedId);
    await page
        .getByRole('combobox', { name: 'Operação', exact: true })
        .selectOption('REVERSE');
    const facts = page.getByRole('combobox', {
        name: 'Fato original',
        exact: true,
    });
    const originalId = await facts
        .locator('option')
        .filter({ hasText: 'Recebimento' })
        .getAttribute('value');
    await facts.selectOption(originalId!);
    await page
        .getByLabel('Motivo', { exact: true })
        .fill('Recuperar resultado incerto');
    await page
        .getByLabel('Valor a reverter (R$)', { exact: true })
        .fill('2,02');
    await page
        .getByRole('button', { name: 'Revisar efeito', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Confira o efeito' }),
    ).toBeVisible();
    const attempts: { key: string | undefined; body: string | null }[] = [];
    await page.route(
        `**/financial-commitments/${receivedId}/reversals`,
        async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            attempts.push({
                key: route.request().headers()['idempotency-key'],
                body: route.request().postData(),
            });
            const response = await route.fetch();
            if (attempts.length === 1) {
                expect(response.status()).toBe(201);
                return route.abort('failed');
            }
            return route.fulfill({ response });
        },
    );
    await page
        .getByRole('button', { name: 'Confirmar operação', exact: true })
        .click();
    await expect(
        page
            .getByRole('alert')
            .filter({ hasText: 'Ainda não conseguimos confirmar' }),
    ).toContainText('Ainda não conseguimos confirmar');
    await expect(page.getByLabel('Motivo', { exact: true })).toBeDisabled();
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toBeDisabled();
    await page
        .getByRole('button', {
            name: 'Reenviar a mesma tentativa',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('status').filter({ hasText: 'Operação registrada' }),
    ).toContainText('Operação registrada');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
    await expect(
        page.getByRole('heading', {
            name: 'Recebimento · R$ 2,02',
            exact: true,
        }),
    ).toHaveCount(1);
});
