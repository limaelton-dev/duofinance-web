import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import { businessToday } from '../../src/features/finances/utils/expense-money';

const apiUrl = 'http://127.0.0.1:3101/v2',
    origin = 'http://localhost:3100';
type Account = {
    id: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
type CreatedExpense = {
    commitment: { id: string; factDate: string };
    obligation: { id: string };
    settlementCycle: { id: string };
};
let a: Account,
    b: Account,
    spaceId: string,
    aMember: string,
    bMember: string,
    cycleId: string,
    correctionCycleId: string,
    movable: CreatedExpense,
    waivable: CreatedExpense,
    transferId: string;
const csrf = new WeakMap<APIRequestContext, string>();
async function post(api: APIRequestContext, path: string, data: object) {
    let token = csrf.get(api);
    if (!token) {
        token = (await (await api.get(`${apiUrl}/auth/csrf`)).json()).csrfToken;
        csrf.set(api, token!);
    }
    return api.post(`${apiUrl}${path}`, {
        headers: {
            Origin: origin,
            'X-CSRF-Token': token!,
            'Idempotency-Key': randomUUID(),
        },
        data,
    });
}
async function created(api: APIRequestContext, path: string, data: object) {
    const response = await post(api, path, data);
    expect(response.status(), await response.text()).toBe(201);
    return response.json();
}
async function account(api: APIRequestContext, name: string): Promise<Account> {
    const result = await created(api, '/auth/register', {
        displayName: name,
        email: `${randomUUID()}@example.test`,
        password: 'teste-acertos-seguro-release-um',
    });
    csrf.delete(api);
    return { id: result.person.id, state: await api.storageState() };
}
function dateAfter(days: number) {
    const value = new Date(`${businessToday()}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}
async function expense(
    api: APIRequestContext,
    description: string,
    debtor: string,
    payer: string,
    amountInCents: number,
    days: number,
): Promise<CreatedExpense> {
    const ctx = await (
        await api.get(`${apiUrl}/spaces/${spaceId}/financial-entry-context`)
    ).json();
    return created(api, `/spaces/${spaceId}/shared-cash-expenses`, {
        expectedSpaceVersion: ctx.version,
        description,
        amountInCents,
        factDate: businessToday(),
        expectedPayerMemberId: null,
        responsibilitySplit: {
            mode: 'AMOUNTS',
            shares: [aMember, bMember].map((memberId) => ({
                memberId,
                amountInCents: memberId === debtor ? amountInCents : 0,
            })),
        },
        disbursement: { payerMemberId: payer, method: 'PIX' },
        settlement: { mode: 'DATE', targetDate: dateAfter(days) },
    });
}
async function open(
    page: Page,
    context: BrowserContext,
    who: Account,
    path: string,
) {
    await context.addCookies(
        who.state.cookies.map((cookie) => ({ ...cookie, domain: 'localhost' })),
    );
    await page.addInitScript(
        ({ id, spaceId }) =>
            sessionStorage.setItem(
                `duofinance:space-context:v1:${id}`,
                spaceId,
            ),
        { id: who.id, spaceId },
    );
    await page.goto(`/spaces/${spaceId}/finances/settlements${path}`);
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(spaceId);
}

test.beforeAll(async ({ playwright }) => {
    const owner = await playwright.request.newContext(),
        other = await playwright.request.newContext();
    try {
        a = await account(owner, 'Pessoa A acertos');
        b = await account(other, 'Pessoa B acertos');
        const shared = await created(owner, '/spaces', {
            name: 'Casa Wave 3 acertos',
        });
        spaceId = shared.space.id;
        const acceptance = await post(other, '/invitations/respond', {
            token: new URLSearchParams(
                new URL(shared.inviteUrl).hash.slice(1),
            ).get('token'),
            decision: 'ACCEPT',
            expectedVersion: 1,
        });
        expect(acceptance.status(), await acceptance.text()).toBe(200);
        const ctx = await (
            await owner.get(
                `${apiUrl}/spaces/${spaceId}/financial-entry-context`,
            )
        ).json();
        aMember = ctx.members.find(
            (m: { personId: string }) => m.personId === a.id,
        ).memberId;
        bMember = ctx.members.find(
            (m: { personId: string }) => m.personId === b.id,
        ).memberId;
        const payable = await expense(
            owner,
            'Recíproca a pagar',
            aMember,
            bMember,
            1000,
            0,
        );
        cycleId = payable.settlementCycle.id;
        await expense(owner, 'Recíproca a receber', bMember, aMember, 1000, 0);
        movable = await expense(
            owner,
            'Pendência para mover',
            aMember,
            bMember,
            1500,
            1,
        );
        correctionCycleId = movable.settlementCycle.id;
        waivable = await expense(
            owner,
            'Valor dispensável',
            bMember,
            aMember,
            2000,
            2,
        );
        const transferable = await expense(
            owner,
            'Transferência reversível',
            aMember,
            bMember,
            1000,
            3,
        );
        const transferOptions = await (
            await owner.get(
                `${apiUrl}/spaces/${spaceId}/settlement-transfers/options?direction=PAYABLE&cycleId=${transferable.settlementCycle.id}`,
            )
        ).json();
        const obligation = transferOptions.items.find(
            (item: { id: string }) => item.id === transferable.obligation.id,
        );
        const transfer = await created(
            owner,
            `/spaces/${spaceId}/settlement-transfers`,
            {
                expectedSpaceVersion: transferOptions.spaceVersion,
                payerMemberId: aMember,
                recipientMemberId: bMember,
                amountInCents: 1000,
                factDate: businessToday(),
                allocations: [
                    {
                        obligationId: obligation.id,
                        expectedObligationVersion: obligation.version,
                        amountInCents: 1000,
                    },
                ],
            },
        );
        transferId = transfer.transfer.id;
    } finally {
        await owner.dispose();
        await other.dispose();
    }
});

test('API real: compensar, finalizar e reverter em ciclo corretivo preserva composição histórica', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    try {
        await open(page, context, a, `/offsets/new?cycleIds=${cycleId}`);
        await expect(
            page.getByRole('heading', { name: 'Pode compensar R$ 10,00' }),
        ).toBeVisible();
        await page
            .getByLabel(
                'Confirmo a compensação de R$ 10,00 em cada direção, sem transferência de dinheiro.',
            )
            .check();
        const saved = page.waitForResponse(
            (r) =>
                r.request().method() === 'POST' &&
                r.url().endsWith('/settlement-offsets'),
        );
        await page
            .getByRole('button', { name: 'Confirmar compensação' })
            .click();
        const offset = await (await saved).json();
        await expect(
            page.getByRole('heading', { name: 'Compensação registrada' }),
        ).toBeVisible();
        expect(offset.offset.amountInCents).toBe(1000);
        const resolved = await (
            await api.get(
                `${apiUrl}/spaces/${spaceId}/settlement-cycles/${cycleId}`,
            )
        ).json();
        expect(resolved.cycle.totals.remainingAmountInCents).toBe('0');
        expect(resolved.cycle.totals.transferredAmountInCents).toBe('0');
        expect(resolved.cycle.totals.compensatedAmountInCents).toBe('2000');
        await page.goto(`/spaces/${spaceId}/finances/settlements/${cycleId}`);
        await page
            .getByLabel('Conferi os valores e quero finalizar este ciclo.')
            .check();
        await page
            .getByRole('button', { name: 'Finalizar ciclo de acerto' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Ciclo finalizado' }),
        ).toBeVisible();
        const frozen = await (
            await api.get(
                `${apiUrl}/spaces/${spaceId}/settlement-cycles/${cycleId}`,
            )
        ).json();
        expect(frozen.cycle.status).toBe('FINALIZED');
        await page.goto(
            `/spaces/${spaceId}/finances/settlements/offsets/${offset.offset.id}/reverse`,
        );
        await expect(
            page.getByText('A origem pertence a um ciclo finalizado.', {
                exact: false,
            }),
        ).toBeVisible();
        await page
            .getByLabel('Ciclo aberto para a correção')
            .selectOption(correctionCycleId);
        await page
            .getByLabel(
                'Conferi os efeitos e quero reverter integralmente este registro de R$ 10,00.',
            )
            .check();
        await page.getByRole('button', { name: 'Confirmar reversão' }).click();
        await expect(
            page.getByRole('heading', { name: 'Reversão registrada' }),
        ).toBeVisible();
        const historical = await (
            await api.get(
                `${apiUrl}/spaces/${spaceId}/settlement-cycles/${cycleId}`,
            )
        ).json();
        expect(historical.cycle.status).toBe('FINALIZED');
        expect(historical.items.map((item: { id: string }) => item.id)).toEqual(
            frozen.items.map((item: { id: string }) => item.id),
        );
        expect(historical.cycle.totals.remainingAmountInCents).toBe('0');
        const preserved = await (
            await api.get(
                `${apiUrl}/spaces/${spaceId}/settlement-offsets/${offset.offset.id}`,
            )
        ).json();
        expect(preserved.offset.amountInCents).toBe(1000);
        expect(preserved.offset.reversedAmountInCents).toBe(1000);
        expect(preserved.offset.reversalId).toBeTruthy();
    } finally {
        await api.dispose();
    }
});
test('API real: mudar ciclo, regra específica, dispensa do credor e reversão de transferência', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext({ storageState: a.state });
    try {
        await open(page, context, a, `/obligations/${movable.obligation.id}`);
        await page
            .getByLabel('Novo ciclo')
            .selectOption(waivable.settlementCycle.id);
        await page
            .getByLabel('Conferi o destino e quero mover a pendência.')
            .check();
        await page
            .getByRole('button', { name: 'Confirmar mudança de acerto' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Acerto atualizado' }),
        ).toBeVisible();
        const moved = await (
            await api.get(
                `${apiUrl}/spaces/${spaceId}/financial-commitments/${movable.commitment.id}`,
            )
        ).json();
        expect(moved.commitment.factDate).toBe(movable.commitment.factDate);
        await page.goto(
            `/spaces/${spaceId}/finances/settlements/rules/${movable.commitment.id}`,
        );
        await page.getByLabel('Dia do mês').fill('25');
        await page
            .getByLabel('Conferi a regra específica para este compromisso.')
            .check();
        await page
            .getByRole('button', { name: 'Salvar regra específica' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Regra específica salva' }),
        ).toBeVisible();
        await page.goto(
            `/spaces/${spaceId}/finances/settlements/obligations/${waivable.obligation.id}`,
        );
        await page.getByLabel('Valor a dispensar (R$)').fill('5,00');
        await page
            .getByLabel('Confirmo que abro mão deste valor a receber.')
            .check();
        await page.getByRole('button', { name: 'Confirmar dispensa' }).click();
        await expect(
            page.getByRole('heading', { name: 'Dispensa registrada' }),
        ).toBeVisible();
        const partial = await (
            await api.get(
                `${apiUrl}/spaces/${spaceId}/inter-member-obligations/${waivable.obligation.id}/waiver-options`,
            )
        ).json();
        expect(partial.obligation.remainingAmountInCents).toBe(1500);
        await page.reload();
        await page
            .getByRole('button', { name: 'Usar todo o valor em aberto' })
            .click();
        await page
            .getByLabel('Confirmo que abro mão deste valor a receber.')
            .check();
        await page.getByRole('button', { name: 'Confirmar dispensa' }).click();
        await expect(
            page.getByRole('heading', { name: 'Dispensa registrada' }),
        ).toBeVisible();
        const waived = await (
            await api.get(
                `${apiUrl}/spaces/${spaceId}/inter-member-obligations/${waivable.obligation.id}/waiver-options`,
            )
        ).json();
        expect(waived.obligation.remainingAmountInCents).toBe(0);
        expect(waived.obligation.status).toBe('WAIVED');
        await page.goto(
            `/spaces/${spaceId}/finances/settlements/transfers/${transferId}/reverse`,
        );
        await page
            .getByLabel(
                'Conferi os efeitos e quero reverter integralmente este registro de R$ 10,00.',
            )
            .check();
        await page.getByRole('button', { name: 'Confirmar reversão' }).click();
        await expect(
            page.getByRole('heading', { name: 'Reversão registrada' }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Conferir registro com a reversão' })
            .click();
        await expect(
            page.getByText(
                'Esta transferência recebeu uma reversão vinculada. O registro original foi preservado.',
            ),
        ).toBeVisible();
        const transfer = await (
            await api.get(
                `${apiUrl}/spaces/${spaceId}/settlement-transfers/${transferId}`,
            )
        ).json();
        expect(transfer.transfer.amountInCents).toBe(1000);
        expect(transfer.transfer.reversedAmountInCents).toBe(1000);
        expect(transfer.transfer.effectiveAmountInCents).toBe(0);
    } finally {
        await api.dispose();
    }
});
