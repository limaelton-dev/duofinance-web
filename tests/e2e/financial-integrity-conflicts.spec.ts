import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import {
    businessToday,
    formatDate,
} from '../../src/features/finances/utils/expense-money';
import type { IntegrityPreview } from '../../src/features/finances/types/financial-integrity';
import type { InterMemberPosition } from '../../src/features/finances/types/inter-member-position';
import type { SettlementCycleDetail } from '../../src/features/finances/types/settlement-cycle';

const apiUrl = 'http://127.0.0.1:3101/v2';
const webOrigin = 'http://localhost:3100';
const csrfTokens = new WeakMap<APIRequestContext, string>();

type Account = {
    id: string;
    personalSpaceId: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
type FinanceContext = {
    version: number;
    members: { personId: string; memberId: string; displayName: string }[];
};
type SharedFixture = {
    a: Account;
    b: Account;
    spaceId: string;
    aMember: string;
    bMember: string;
};
type PlanDetail = {
    commitment: {
        id: string;
        version: number;
        description: string;
        plan: {
            status: 'OPEN' | 'COMPLETED';
            fulfilledAmountInCents: number;
            remainingAmountInCents: number;
            globalAdjustmentInCents: number;
            installments: {
                id: string;
                position: number;
                dueDate: string;
                amountInCents: number;
                economicShares:
                    { memberId: string; amountInCents: number }[] | null;
            }[];
            payoff: {
                id: string;
                factId: string;
                paidAmountInCents: number;
            } | null;
            payoffHistory: {
                id: string;
                factId: string;
                paidAmountInCents: number;
                compensated: boolean;
            }[];
        };
    };
};

async function post(api: APIRequestContext, path: string, data: object) {
    let token = csrfTokens.get(api);
    if (!token) {
        const response = await api.get(`${apiUrl}/auth/csrf`);
        expect(response.status(), await response.text()).toBe(200);
        token = (await response.json()).csrfToken as string;
        csrfTokens.set(api, token);
    }
    return api.post(`${apiUrl}${path}`, {
        headers: {
            Origin: webOrigin,
            'X-CSRF-Token': token,
            'Idempotency-Key': randomUUID(),
        },
        data,
    });
}

async function write<T>(
    api: APIRequestContext,
    path: string,
    data: object,
    status = 201,
): Promise<T> {
    const response = await post(api, path, data);
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
}

async function read<T>(api: APIRequestContext, path: string): Promise<T> {
    const response = await api.get(`${apiUrl}${path}`);
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
}

async function register(
    api: APIRequestContext,
    displayName: string,
): Promise<Account> {
    const result = await write<{
        person: { id: string };
        personalSpace: { id: string };
    }>(api, '/auth/register', {
        displayName,
        email: `${randomUUID()}@example.test`,
        password: 'integridade-financeira-edge-testes',
    });
    csrfTokens.delete(api);
    return {
        id: result.person.id,
        personalSpaceId: result.personalSpace.id,
        state: await api.storageState(),
    };
}

async function sharedFixture(
    owner: APIRequestContext,
    recipient: APIRequestContext,
): Promise<SharedFixture> {
    const a = await register(owner, 'Pessoa A casos de integridade');
    const b = await register(recipient, 'Pessoa B casos de integridade');
    const created = await write<{
        space: { id: string; version: number };
        inviteUrl: string;
    }>(owner, '/spaces', { name: 'Casa dos casos de integridade' });
    await write(
        recipient,
        '/invitations/respond',
        {
            token: new URLSearchParams(
                new URL(created.inviteUrl).hash.slice(1),
            ).get('token'),
            decision: 'ACCEPT',
            expectedVersion: created.space.version,
        },
        200,
    );
    const ctx = await read<FinanceContext>(
        owner,
        `/spaces/${created.space.id}/financial-entry-context`,
    );
    const aMember = ctx.members.find(
        (member) => member.personId === a.id,
    )?.memberId;
    const bMember = ctx.members.find(
        (member) => member.personId === b.id,
    )?.memberId;
    expect(aMember).toBeTruthy();
    expect(bMember).toBeTruthy();
    return {
        a,
        b,
        spaceId: created.space.id,
        aMember: aMember!,
        bMember: bMember!,
    };
}

function dateAfter(days: number) {
    const date = new Date(`${businessToday()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

async function open(
    page: Page,
    context: BrowserContext,
    account: Account,
    spaceId: string,
    path: string,
) {
    await context.addCookies(
        account.state.cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    );
    await page.addInitScript(
        ({ personId, spaceId }) =>
            sessionStorage.setItem(
                `prospera-mais:space-context:v1:${personId}`,
                spaceId,
            ),
        { personId: account.id, spaceId },
    );
    await page.goto(`/spaces/${spaceId}/finances/${path}`);
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(spaceId);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        path === 'changes' ? 'Alterações financeiras' : 'Histórico e correções',
    );
}

async function review(
    page: Page,
    commitmentId: string,
    endpoint: 'reversal-preview' | 'change-preview',
) {
    const [response] = await Promise.all([
        page.waitForResponse(
            (response) =>
                response
                    .url()
                    .endsWith(
                        `/financial-commitments/${commitmentId}/${endpoint}`,
                    ) && response.request().method() === 'POST',
        ),
        page
            .getByRole('button', { name: 'Revisar efeito', exact: true })
            .click(),
    ]);
    expect(response.status(), await response.text()).toBe(200);
    const value: IntegrityPreview = await response.json();
    const input: Record<string, unknown> = response.request().postDataJSON();
    await expect(
        page.getByRole('heading', { name: 'Confira o efeito', exact: true }),
    ).toBeVisible();
    return { value, input };
}

async function confirm(
    page: Page,
    commitmentId: string,
    endpoint: 'reversals' | 'change-proposals',
    name = 'Confirmar operação',
) {
    const [response] = await Promise.all([
        page.waitForResponse(
            (response) =>
                response
                    .url()
                    .endsWith(
                        `/financial-commitments/${commitmentId}/${endpoint}`,
                    ) && response.request().method() === 'POST',
        ),
        page.getByRole('button', { name, exact: true }).click(),
    ]);
    expect(response.status(), await response.text()).toBe(201);
    const result = await response.json();
    await expect(
        page.getByRole('status').filter({
            hasText:
                endpoint === 'reversals'
                    ? 'Operação registrada'
                    : 'Proposta registrada',
        }),
    ).toBeVisible();
    return result;
}

test('reversão preserva ciclo finalizado e exige destino corretivo aberto', async ({
    playwright,
    page,
    context,
}) => {
    const owner = await playwright.request.newContext();
    const recipient = await playwright.request.newContext();
    try {
        const f = await sharedFixture(owner, recipient);
        const ctx = await read<FinanceContext>(
            owner,
            `/spaces/${f.spaceId}/financial-entry-context`,
        );
        const expense = await write<{
            commitment: { id: string };
            disbursements: { id: string }[];
            obligation: { id: string };
            settlementCycle: { id: string };
        }>(owner, `/spaces/${f.spaceId}/shared-cash-expenses`, {
            expectedSpaceVersion: ctx.version,
            description: 'Pagamento cujo acerto já foi finalizado',
            amountInCents: 10000,
            factDate: businessToday(),
            expectedPayerMemberId: f.aMember,
            responsibilitySplit: {
                mode: 'AMOUNTS',
                shares: [
                    { memberId: f.aMember, amountInCents: 0 },
                    { memberId: f.bMember, amountInCents: 10000 },
                ],
            },
            disbursement: { payerMemberId: f.aMember, method: 'PIX' },
            settlement: { mode: 'DATE', targetDate: dateAfter(1) },
        });
        const cycleId = expense.settlementCycle.id;
        const options = await read<{
            spaceVersion: number;
            items: { id: string; version: number }[];
        }>(
            recipient,
            `/spaces/${f.spaceId}/settlement-transfers/options?direction=PAYABLE&cycleId=${cycleId}`,
        );
        const obligation = options.items.find(
            (item) => item.id === expense.obligation.id,
        );
        expect(obligation).toBeTruthy();
        await write(recipient, `/spaces/${f.spaceId}/settlement-transfers`, {
            expectedSpaceVersion: options.spaceVersion,
            payerMemberId: f.bMember,
            recipientMemberId: f.aMember,
            amountInCents: 10000,
            factDate: businessToday(),
            allocations: [
                {
                    obligationId: obligation!.id,
                    expectedObligationVersion: obligation!.version,
                    amountInCents: 10000,
                },
            ],
        });
        const settled = await read<SettlementCycleDetail>(
            owner,
            `/spaces/${f.spaceId}/settlement-cycles/${cycleId}`,
        );
        expect(settled.cycle.canFinalize).toBe(true);
        await write(
            owner,
            `/spaces/${f.spaceId}/settlement-cycles/${cycleId}/finalize`,
            {
                expectedSpaceVersion: ctx.version,
                expectedCycleVersion: settled.cycle.version,
            },
            200,
        );
        const frozen = await read<SettlementCycleDetail>(
            owner,
            `/spaces/${f.spaceId}/settlement-cycles/${cycleId}`,
        );
        expect(frozen.cycle.status).toBe('FINALIZED');

        await open(
            page,
            context,
            f.a,
            f.spaceId,
            `commitments/${expense.commitment.id}`,
        );
        await page
            .getByRole('combobox', { name: 'Operação', exact: true })
            .selectOption('REVERSE');
        await page
            .getByRole('combobox', { name: 'Fato original', exact: true })
            .selectOption(expense.disbursements[0].id);
        await page
            .getByLabel('Motivo', { exact: true })
            .fill('Pagamento original desfeito após o acerto');
        await page
            .getByLabel('Valor a reverter (R$)', { exact: true })
            .fill('100,00');
        const blocked = await review(
            page,
            expense.commitment.id,
            'reversal-preview',
        );
        expect(blocked.value).toMatchObject({
            eligible: false,
            reconciliation: {
                requiresOpenCycle: true,
                finalizedCycleIds: [cycleId],
            },
        });
        await expect(
            page.getByRole('alert').filter({
                hasText: 'Esta correção precisa de um acerto aberto',
            }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', {
                name: 'Confirmar operação',
                exact: true,
            }),
        ).toBeDisabled();

        await page
            .getByRole('combobox', {
                name: 'Acerto para a correção',
                exact: true,
            })
            .selectOption('DATE');
        await page
            .getByLabel('Data do acerto corretivo', { exact: true })
            .fill(dateAfter(2));
        const eligible = await review(
            page,
            expense.commitment.id,
            'reversal-preview',
        );
        expect(eligible.value.eligible).toBe(true);
        expect(eligible.input.settlement).toEqual({
            mode: 'DATE',
            targetDate: dateAfter(2),
        });
        await confirm(page, expense.commitment.id, 'reversals');

        const preserved = await read<SettlementCycleDetail>(
            owner,
            `/spaces/${f.spaceId}/settlement-cycles/${cycleId}`,
        );
        expect(preserved.cycle).toEqual(frozen.cycle);
        expect(preserved.items).toEqual(frozen.items);
        const position = await read<InterMemberPosition>(
            owner,
            `/spaces/${f.spaceId}/inter-member-position?direction=ALL`,
        );
        const correction = position.items.find(
            (item) => item.origin.commitmentId === expense.commitment.id,
        );
        expect(correction).toMatchObject({
            debtorMemberId: f.aMember,
            creditorMemberId: f.bMember,
            remainingAmountInCents: 10000,
            settlementCycle: { status: 'OPEN', targetDate: dateAfter(2) },
        });
        expect(correction!.settlementCycle!.id).not.toBe(cycleId);
        const detail = await read<{
            paidAmountInCents: number;
            remainingAmountInCents: number;
            disbursements: { id: string; amountInCents: number }[];
        }>(
            owner,
            `/spaces/${f.spaceId}/financial-commitments/${expense.commitment.id}`,
        );
        expect(detail).toMatchObject({
            paidAmountInCents: 0,
            remainingAmountInCents: 10000,
        });
        expect(detail.disbursements).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: expense.disbursements[0].id,
                    amountInCents: 10000,
                }),
            ]),
        );
    } finally {
        await owner.dispose();
        await recipient.dispose();
    }
});

test('alteração onerosa seleciona uma parcela e rejeição mantém a condição original', async ({
    playwright,
    page,
    context,
    browser,
}) => {
    const owner = await playwright.request.newContext();
    const recipient = await playwright.request.newContext();
    const recipientContext = await browser.newContext();
    try {
        const f = await sharedFixture(owner, recipient);
        const ctx = await read<FinanceContext>(
            owner,
            `/spaces/${f.spaceId}/financial-entry-context`,
        );
        const original = await write<PlanDetail>(
            owner,
            `/spaces/${f.spaceId}/installment-commitments`,
            {
                scope: 'SHARED',
                description: 'Curso em duas parcelas preservadas',
                count: 2,
                explicitDueDates: [dateAfter(30), dateAfter(60)],
                amountsInCents: [10000, 10000],
                distribution: {
                    mode: 'PERCENTAGES',
                    shares: [
                        { memberId: f.aMember, basisPoints: 6000 },
                        { memberId: f.bMember, basisPoints: 4000 },
                    ],
                },
                expectedMemberId: f.aMember,
                expectedSpaceVersion: ctx.version,
                expectedRuleVersion: 0,
            },
        );
        const id = original.commitment.id;
        const before = await read<PlanDetail>(
            owner,
            `/spaces/${f.spaceId}/installment-commitments/${id}`,
        );
        const target = before.commitment.plan.installments[1];
        await open(
            page,
            context,
            f.a,
            f.spaceId,
            `commitments/${id}?modality=INSTALLMENT`,
        );
        await page
            .getByRole('combobox', { name: 'Operação', exact: true })
            .selectOption('CHANGE');
        await page
            .getByLabel('Nova descrição', { exact: true })
            .fill('Somente a segunda parcela revista');
        await page
            .getByLabel('Vigência futura', { exact: true })
            .fill(dateAfter(1));
        await page
            .getByLabel('Novo valor total (R$)', { exact: true })
            .fill('100,00');
        await page
            .getByLabel('Parte de Pessoa A casos de integridade (R$)', {
                exact: true,
            })
            .fill('20,00');
        await page
            .getByLabel('Parte de Pessoa B casos de integridade (R$)', {
                exact: true,
            })
            .fill('80,00');
        await expect(
            page.getByRole('combobox', { name: 'Parcela', exact: true }),
        ).toHaveValue('');
        await page
            .getByRole('button', { name: 'Revisar efeito', exact: true })
            .click();
        await expect(
            page
                .getByRole('alert')
                .filter({ hasText: 'Escolha a ocorrência ou parcela' }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', {
                name: 'Enviar para aprovação',
                exact: true,
            }),
        ).toHaveCount(0);

        await page
            .getByRole('combobox', { name: 'Parcela', exact: true })
            .selectOption(target.id);
        const preview = await review(page, id, 'change-preview');
        expect(preview.input.installmentIds).toEqual([target.id]);
        expect(preview.value.requiresAcceptance).toBe(true);
        expect(preview.value.targets?.map((item) => item.id)).toEqual([
            target.id,
        ]);
        const included = page
            .getByRole('heading', {
                name: 'Registros incluídos: 1',
                exact: true,
            })
            .locator('..');
        await expect(included).toContainText(
            `Vencimento: ${formatDate(target.dueDate)}`,
        );
        await expect(included).not.toContainText(
            formatDate(before.commitment.plan.installments[0].dueDate),
        );
        await expect(
            page.getByText('Depende do aceite desta pessoa.', { exact: true }),
        ).toBeVisible();
        const sent = await confirm(
            page,
            id,
            'change-proposals',
            'Enviar para aprovação',
        );
        const proposalId = sent.proposal.id as string;
        expect(sent.proposal.recipientMemberId).toBe(f.bMember);

        const recipientPage = await recipientContext.newPage();
        await open(recipientPage, recipientContext, f.b, f.spaceId, 'changes');
        const proposal = recipientPage.getByRole('article').filter({
            has: recipientPage.getByRole('heading', {
                name: 'Somente a segunda parcela revista',
                exact: true,
            }),
        });
        await proposal
            .getByRole('button', { name: 'Revisar rejeição', exact: true })
            .click();
        await expect(
            proposal.getByRole('group', {
                name: 'Confirmar decisão da proposta',
                exact: true,
            }),
        ).toContainText('A condição anterior será mantida');
        await proposal
            .getByRole('button', { name: 'Confirmar rejeição', exact: true })
            .click();
        await expect(
            recipientPage
                .getByRole('status')
                .filter({ hasText: 'Proposta rejeitada' }),
        ).toContainText('A condição anterior foi mantida');
        const rejected = await read<{ proposal: { status: string } }>(
            owner,
            `/spaces/${f.spaceId}/financial-commitments/${id}/change-proposals/${proposalId}`,
        );
        expect(rejected.proposal.status).toBe('REJECTED');
        const preserved = await read<PlanDetail>(
            owner,
            `/spaces/${f.spaceId}/installment-commitments/${id}`,
        );
        expect(preserved.commitment.version).toBe(before.commitment.version);
        expect(preserved.commitment.description).toBe(
            before.commitment.description,
        );
        expect(preserved.commitment.plan.installments).toEqual(
            before.commitment.plan.installments,
        );
        await recipientPage.reload();
        await expect(
            recipientPage
                .getByRole('article')
                .filter({ hasText: 'Somente a segunda parcela revista' }),
        ).toContainText('Rejeitada');
    } finally {
        await recipientContext.close();
        await owner.dispose();
        await recipient.dispose();
    }
});

test('quitação global só aceita reversão integral e preserva o pagamento original', async ({
    playwright,
    page,
    context,
}) => {
    const owner = await playwright.request.newContext();
    try {
        const account = await register(owner, 'Pessoa da quitação global');
        const spaceId = account.personalSpaceId;
        const base = `/spaces/${spaceId}/installment-commitments`;
        const original = await write<PlanDetail>(owner, base, {
            scope: 'PERSONAL',
            description: 'Plano quitado com desconto global',
            count: 2,
            explicitDueDates: [dateAfter(30), dateAfter(60)],
            amountsInCents: [10000, 10000],
        });
        const id = original.commitment.id;
        const preview = await write<{
            items: {
                installmentId: string;
                expectedInstallmentVersion: number;
            }[];
        }>(
            owner,
            `${base}/${id}/payoff-preview`,
            {
                paidAmountInCents: 18000,
                factDate: businessToday(),
                expectedCommitmentVersion: 1,
            },
            200,
        );
        const paid = await write<{ fact: { id: string } }>(
            owner,
            `${base}/${id}/payoffs`,
            {
                paidAmountInCents: 18000,
                factDate: businessToday(),
                method: 'PIX',
                expectedCommitmentVersion: 1,
                installments: preview.items.map((item) => ({
                    installmentId: item.installmentId,
                    expectedInstallmentVersion: item.expectedInstallmentVersion,
                })),
            },
        );
        const before = await read<PlanDetail>(owner, `${base}/${id}`);
        expect(before.commitment.plan.status).toBe('COMPLETED');
        expect(before.commitment.plan.payoff!.factId).toBe(paid.fact.id);
        await open(
            page,
            context,
            account,
            spaceId,
            `commitments/${id}?modality=INSTALLMENT`,
        );
        await page
            .getByRole('combobox', { name: 'Operação', exact: true })
            .selectOption('REVERSE');
        const targets = page.getByRole('combobox', {
            name: 'Parcela',
            exact: true,
        });
        await expect(
            targets.locator('option').filter({ hasText: 'Quitação global' }),
        ).toHaveCount(1);
        await targets.selectOption(before.commitment.plan.payoff!.id);
        await page
            .getByRole('combobox', { name: 'Fato original', exact: true })
            .selectOption(paid.fact.id);
        await page
            .getByLabel('Motivo', { exact: true })
            .fill('Quitação externa desfeita integralmente');
        await page
            .getByLabel('Valor a reverter (R$)', { exact: true })
            .fill('90,00');
        const partial = await review(page, id, 'reversal-preview');
        expect(partial.value).toMatchObject({
            eligible: false,
            requiresFullReversal: true,
        });
        await expect(
            page.getByRole('alert').filter({
                hasText: 'Esta quitação global exige reversão integral',
            }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', {
                name: 'Confirmar operação',
                exact: true,
            }),
        ).toBeDisabled();
        expect(
            (await read<PlanDetail>(owner, `${base}/${id}`)).commitment.plan,
        ).toEqual(before.commitment.plan);

        await page
            .getByLabel('Valor a reverter (R$)', { exact: true })
            .fill('180,00');
        const full = await review(page, id, 'reversal-preview');
        expect(full.value.eligible).toBe(true);
        expect(full.input).toMatchObject({
            originalKind: 'DISBURSEMENT',
            originalId: paid.fact.id,
            amountInCents: 18000,
        });
        expect(full.input).not.toHaveProperty('installmentId');
        expect(full.input).not.toHaveProperty('occurrenceId');
        expect(full.input).not.toHaveProperty('referenceDate');
        expect(full.input).not.toHaveProperty('expectedOccurrenceVersion');
        await confirm(page, id, 'reversals');
        const reversed = await read<PlanDetail>(owner, `${base}/${id}`);
        expect(reversed.commitment.plan).toMatchObject({
            status: 'OPEN',
            fulfilledAmountInCents: 0,
            remainingAmountInCents: 18000,
            globalAdjustmentInCents: -2000,
            payoff: null,
        });
        expect(
            reversed.commitment.plan.installments.map((item) => item.dueDate),
        ).toEqual(
            before.commitment.plan.installments.map((item) => item.dueDate),
        );
        expect(reversed.commitment.plan.payoffHistory).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    factId: paid.fact.id,
                    paidAmountInCents: 18000,
                    compensated: true,
                }),
            ]),
        );
        const history = await read<{
            items: {
                originalId: string;
                originalKind: string;
                amountInCents: number;
            }[];
        }>(owner, `/spaces/${spaceId}/financial-commitments/${id}/reversals`);
        expect(history.items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    originalId: paid.fact.id,
                    originalKind: 'DISBURSEMENT',
                    amountInCents: 18000,
                }),
            ]),
        );
    } finally {
        await owner.dispose();
    }
});
