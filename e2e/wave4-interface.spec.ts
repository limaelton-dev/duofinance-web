import { expect, test, type Page } from '@playwright/test';
const actorId = '10000000-0000-4000-8000-000000000001',
    personalId = '20000000-0000-4000-8000-000000000001',
    sharedId = '20000000-0000-4000-8000-000000000002',
    commitmentId = '40000000-0000-4000-8000-000000000001';
const members = [
    {
        memberId: '30000000-0000-4000-8000-000000000001',
        personId: actorId,
        displayName: 'Lucas',
    },
    {
        memberId: '30000000-0000-4000-8000-000000000002',
        personId: '10000000-0000-4000-8000-000000000002',
        displayName: 'Ana',
    },
];
const personal = {
        id: personalId,
        type: 'PERSONAL',
        label: 'Meu espaço',
        status: 'ACTIVE',
        version: 1,
    },
    shared = {
        id: sharedId,
        type: 'SHARED',
        label: 'Nossa casa',
        status: 'ACTIVE',
        version: 2,
    };
type Call = {
    path: string;
    body: Record<string, unknown>;
    key: string | undefined;
    method: string;
};
async function setup(
    page: Page,
    responder: (call: Call) => unknown,
    sharedContext = false,
) {
    const calls: Call[] = [],
        spaceId = sharedContext ? sharedId : personalId;
    await page.clock.install({ time: new Date('2026-10-19T15:00:00Z') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
        ({ actorId, spaceId }) =>
            sessionStorage.setItem(
                `prospera-mais:space-context:v1:${actorId}`,
                spaceId,
            ),
        { actorId, spaceId },
    );
    await page.route('http://localhost:3101/v2/**', async (route) => {
        const request = route.request(),
            path = new URL(request.url()).pathname,
            method = request.method();
        const headers = {
            'Access-Control-Allow-Origin': 'http://localhost:3200',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Headers':
                'Content-Type, X-CSRF-Token, Idempotency-Key',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
        };
        if (method === 'OPTIONS')
            return route.fulfill({ status: 204, headers });
        const call = {
            path,
            method,
            body: method === 'GET' ? {} : request.postDataJSON(),
            key: request.headers()['idempotency-key'],
        };
        calls.push(call);
        let json: unknown;
        if (path.endsWith('/auth/me'))
            json = {
                person: {
                    id: actorId,
                    displayName: 'Lucas',
                    email: 'lucas@example.test',
                },
                personalSpace: personal,
            };
        else if (path.endsWith('/auth/csrf'))
            json = { csrfToken: 'synthetic-csrf' };
        else if (path === '/v2/spaces') json = { items: [personal, shared] };
        else if (path === `/v2/spaces/${personalId}`)
            json = {
                space: personal,
                actorMembership: null,
                activeMemberCount: 0,
                invitation: null,
            };
        else if (path === `/v2/spaces/${sharedId}`)
            json = {
                space: shared,
                actorMembership: {
                    id: members[0].memberId,
                    personId: actorId,
                    status: 'ACTIVE',
                },
                activeMemberCount: 2,
                invitation: null,
            };
        else if (path.endsWith('/income-options'))
            json = {
                spaceId,
                spaceType: sharedContext ? 'SHARED' : 'PERSONAL',
                status: 'ACTIVE',
                canCreate: true,
                referenceDate: '2026-10-19',
                ...(sharedContext
                    ? { version: 2, members, openCycles: [] }
                    : {}),
            };
        else json = responder(call);
        if (json === undefined)
            return route.fulfill({
                status: 404,
                headers,
                json: {
                    code: 'NOT_FOUND',
                    message: `Fixture ausente: ${path}`,
                },
            });
        return route.fulfill({ headers, json });
    });
    return { calls, spaceId };
}
function recurringRoot(spaceId = personalId, variable = true) {
    return {
        id: commitmentId,
        spaceId,
        kind: 'EXPENSE',
        scope: spaceId === personalId ? 'PERSONAL' : 'SHARED',
        description: 'Energia da casa',
        valueMode: variable ? 'VARIABLE' : 'FIXED',
        amountInCents: variable ? null : 15000,
        expectedAmountInCents: 15000,
        recurrence: { frequency: 'MONTHLY', dayOfMonth: 20 },
        startsOn: '2026-10-01',
        endsOn: null,
        version: 1,
        economicVersion: 1,
        effectiveFrom: '2026-10-01',
        terminatedOn: null,
        versions: [
            {
                version: 1,
                effectiveFrom: '2026-10-01',
                description: 'Energia da casa',
                valueMode: variable ? 'VARIABLE' : 'FIXED',
                amountInCents: variable ? null : 15000,
            },
        ],
        nextOccurrence: {
            referenceDate: '2026-10-20',
            amountInCents: variable ? null : 15000,
        },
        ...(spaceId !== personalId
            ? {
                  distribution: {
                      mode: 'PERCENTAGES',
                      shares: members.map((member) => ({
                          memberId: member.memberId,
                          basisPoints: 5000,
                      })),
                  },
              }
            : {}),
    };
}
function installmentItem(position: number, amount = 10000) {
    return {
        id: `50000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
        position,
        dueDate: `2027-${String(position).padStart(2, '0')}-20`,
        amountInCents: amount,
        effectiveAmountInCents: amount,
        stateVersion: 1,
        status: 'PENDING',
        fulfilledAmountInCents: 0,
        remainingAmountInCents: amount,
        economicShares: null,
        effectiveEconomicShares: null,
        anticipation: null,
        resolution: null,
        facts: [],
        externalSettlements: [],
    };
}
function installmentRoot() {
    return {
        id: commitmentId,
        spaceId: personalId,
        description: 'Curso de idiomas',
        version: 1,
        scope: 'PERSONAL',
        plan: {
            id: 'plan-1',
            count: 3,
            cadence: 'MONTHLY',
            status: 'OPEN',
            totalAmountInCents: 30000,
            fulfilledAmountInCents: 0,
            remainingAmountInCents: 30000,
            payoff: null,
            installments: [1, 2, 3].map((n) => installmentItem(n)),
        },
    };
}
async function noOverflow(page: Page) {
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
}

test('Wave 4 mobile: planning creates a pending personal expense and review never creates a payment', async ({
    page,
}) => {
    const { calls, spaceId } = await setup(page, (call) =>
        call.method === 'POST' && call.path.endsWith('/planned-expenses')
            ? {
                  spaceId: personalId,
                  commitment: { id: commitmentId, ...call.body },
                  replayed: false,
              }
            : call.path.endsWith('/planned-expenses')
              ? {
                    spaceId: personalId,
                    month: '2026-10',
                    items: [],
                    totals: {
                        expectedExpenseAmountInCents: '0',
                        remainingExpenseAmountInCents: '0',
                    },
                    nextCursor: null,
                }
              : undefined,
    );
    await page.goto(`/spaces/${spaceId}/finances/planning`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill('Revisão da bicicleta');
    await page.getByLabel('Valor previsto (R$)').fill('200,00');
    await page.getByLabel('Data prevista para pagamento').fill('2026-10-30');
    await page
        .getByRole('button', { name: 'Revisar despesa prevista' })
        .click();
    await expect(
        page.getByText('Prevista para 30/10/2026. Pagamento pendente.'),
    ).toBeVisible();
    expect(
        calls.filter(
            (call) =>
                call.path.endsWith('/planned-expenses') &&
                call.method === 'POST',
        ),
    ).toHaveLength(0);
    await page
        .getByRole('button', { name: 'Confirmar despesa prevista' })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Despesa prevista registrada' }),
    ).toBeVisible();
    const sent = calls.find(
        (call) =>
            call.method === 'POST' && call.path.endsWith('/planned-expenses'),
    )!;
    expect(sent.body).toEqual({
        scope: 'PERSONAL',
        description: 'Revisão da bicicleta',
        amountInCents: 20000,
        expectedPaymentDate: '2026-10-30',
    });
    expect(sent.key).toBeTruthy();
    await noOverflow(page);
});
test('Wave 4 mobile: variable occurrence receives an explicit value before fulfillment', async ({
    page,
}) => {
    let occurrence = {
        id: null as string | null,
        commitmentId,
        referenceDate: '2026-10-20',
        economicVersion: 1,
        stateVersion: 1,
        amountInCents: null as number | null,
        expectedAmountInCents: 15000,
        valuePending: true,
        status: 'PENDING',
        fulfilledAmountInCents: 0,
        remainingAmountInCents: null as number | null,
        facts: [],
        externalSettlements: [],
        valueHistory: [],
        cancellation: null,
    };
    const root = recurringRoot();
    const { calls, spaceId } = await setup(page, (call) => {
        if (call.path.endsWith('/value') && call.method === 'PUT') {
            occurrence = {
                ...occurrence,
                id: 'occurrence-1',
                amountInCents: 17345,
                remainingAmountInCents: 17345,
                valuePending: false,
                stateVersion: 2,
            };
            return { commitment: root, occurrence, replayed: false };
        }
        if (call.path.endsWith('/options'))
            return {
                commitment: root,
                occurrence,
                suggestedSettlement: null,
                openCycles: [],
                nextCursor: null,
            };
        if (call.path.endsWith('/occurrences'))
            return { commitmentId, month: '2026-10', items: [occurrence] };
        if (call.path.endsWith(commitmentId)) return { commitment: root };
    });
    await page.goto(
        `/spaces/${spaceId}/recurring-commitments/${commitmentId}?month=2026-10`,
    );
    await page.getByRole('button', { name: 'Abrir ocorrência' }).click();
    await page.getByLabel('Valor real da ocorrência (R$)').fill('173,45');
    await page.getByRole('button', { name: 'Revisar registro' }).click();
    await expect(
        page.getByText(
            'Valor informado, sem pagamento ou recebimento: R$ 173,45.',
        ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar registro' }).click();
    await expect(
        page.getByText('Registro confirmado. O histórico foi preservado.'),
    ).toBeVisible();
    expect(calls.find((call) => call.method === 'PUT')!.body).toEqual({
        expectedCommitmentVersion: 1,
        expectedOccurrenceVersion: 1,
        amountInCents: 17345,
    });
    await noOverflow(page);
});
test('Wave 4: onerous new recurrence validity displays the server impact and submits a proposal', async ({
    page,
}) => {
    const root = recurringRoot(sharedId, false);
    const { calls, spaceId } = await setup(
        page,
        (call) => {
            if (call.path.endsWith('/change-preview'))
                return {
                    commitmentId,
                    effectiveFrom: '2026-11-01',
                    assessmentThrough: '2028-11-30',
                    currentVersion: 1,
                    proposedVersion: 2,
                    requiresAcceptance: true,
                    currentOccurrences: [],
                    proposedOccurrences: [],
                    materializedOccurrencesPreserved: [],
                    impactByMember: [
                        {
                            memberId: members[1].memberId,
                            currentFixedAmountInCents: '15000',
                            proposedFixedAmountInCents: '20000',
                            fixedDeltaInCents: '5000',
                            currentVariableWeight: 0,
                            proposedVariableWeight: 0,
                            requiresAcceptance: true,
                        },
                    ],
                };
            if (call.path.endsWith('/change-proposals'))
                return { spaceId: sharedId, proposal: { id: 'proposal-a' } };
            if (call.path.endsWith('/occurrences'))
                return { commitmentId, items: [] };
            if (call.path.endsWith(commitmentId)) return { commitment: root };
        },
        true,
    );
    await page.goto(`/spaces/${spaceId}/recurring-commitments/${commitmentId}`);
    await page
        .getByRole('button', { name: 'Criar nova vigência', exact: true })
        .click();
    await page.getByLabel('Valor por ocorrência (R$)').fill('200,00');
    await page.getByLabel('Nova vigência a partir de').fill('2026-11-01');
    await page.getByRole('button', { name: 'Revisar nova vigência' }).click();
    await expect(page.getByText('Exige aprovação desta pessoa.')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar para aprovação' }).click();
    await expect(
        page.getByRole('heading', { name: 'Alteração aguardando aprovação' }),
    ).toBeVisible();
    expect(calls.some((call) => call.path.endsWith('/versions'))).toBe(false);
    expect(
        calls.find((call) => call.path.endsWith('/change-proposals'))!.body
            .effectiveFrom,
    ).toBe('2026-11-01');
});
test('Wave 4 mobile: installment schedule uses the server preview and preserves the final cent', async ({
    page,
}) => {
    const { calls, spaceId } = await setup(page, (call) =>
        call.path.endsWith('/preview')
            ? {
                  scope: 'PERSONAL',
                  description: call.body.description,
                  count: 3,
                  totalAmountInCents: 10000,
                  installments: [3333, 3333, 3334].map((amount, index) => ({
                      position: index + 1,
                      dueDate: `2027-0${index + 1}-20`,
                      amountInCents: amount,
                      economicShares: null,
                  })),
              }
            : call.method === 'POST' &&
                call.path.endsWith('/installment-commitments')
              ? { commitment: installmentRoot(), replayed: false }
              : undefined,
    );
    await page.goto(`/spaces/${spaceId}/installment-commitments/new`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill('Curso de idiomas');
    await page.getByLabel('Quantidade de parcelas').fill('3');
    await page.getByLabel('Valor total (R$)', { exact: true }).fill('100,00');
    await page.getByLabel('Primeiro vencimento').fill('2027-01-20');
    await page.getByRole('button', { name: 'Conferir cronograma' }).click();
    await expect(page.getByText('R$ 33,34', { exact: true })).toBeVisible();
    expect(
        calls.filter(
            (call) =>
                call.path.endsWith('/installment-commitments') &&
                call.method === 'POST',
        ),
    ).toHaveLength(0);
    await page
        .getByRole('button', { name: 'Criar parcelamento', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Parcelamento criado' }),
    ).toBeVisible();
    expect(
        calls.find(
            (call) =>
                call.path.endsWith('/installment-commitments') &&
                call.method === 'POST',
        )!.body,
    ).toMatchObject({
        count: 3,
        totalAmountInCents: 10000,
        firstDueDate: '2027-01-20',
        cadence: 'MONTHLY',
        scope: 'PERSONAL',
    });
    await noOverflow(page);
});
function planResponder(call: Call) {
    const root = installmentRoot();
    if (call.path.endsWith('/installments'))
        return { commitmentId, items: root.plan.installments };
    if (call.path.endsWith('/anticipation-options'))
        return {
            commitmentId,
            expectedCommitmentVersion: 1,
            totalEligibleCount: 3,
            items: [...root.plan.installments].reverse().map((item) => ({
                ...item,
                selectionEligible: true,
                blockingReason: null,
            })),
            nextCursor: null,
        };
    if (call.path.endsWith('/resolution-options'))
        return {
            commitmentId,
            expectedCommitmentVersion: 1,
            expectedSpaceVersion: null,
            totalOpenCount: 3,
            totalExpectedRemainingAmountInCents: '30000',
            items: root.plan.installments.map((item) => ({
                installmentId: item.id,
                position: item.position,
                dueDate: item.dueDate,
                expectedRemainingAmountInCents: item.remainingAmountInCents,
                expectedInstallmentVersion: 1,
                cancellationEligible: true,
                blockingReason: null,
            })),
            nextCursor: null,
        };
    if (call.path.endsWith(commitmentId)) return { commitment: root };
    if (
        call.path.endsWith('/anticipations') ||
        call.path.endsWith('/payoffs') ||
        call.path.endsWith('/future-installment-cancellations')
    )
        return { commitment: root, replayed: false };
    if (call.path.endsWith('/anticipation-preview')) {
        const input = call.body as {
            values?: { installmentId: string; paidAmountInCents: number }[];
        };
        const items = root.plan.installments
            .slice(1)
            .reverse()
            .map((item) => ({
                installmentId: item.id,
                position: item.position,
                dueDate: item.dueDate,
                expectedInstallmentVersion: 1,
                expectedRemainingAmountInCents: 10000,
                paidAmountInCents:
                    input.values?.find(
                        (value) => value.installmentId === item.id,
                    )?.paidAmountInCents ?? 10000,
                adjustmentInCents: 0,
                effectiveEconomicShares: null,
            }));
        return {
            commitmentId,
            expectedCommitmentVersion: 1,
            items,
            totalExpectedRemainingAmountInCents: '20000',
            totalPaidAmountInCents: String(
                items.reduce((n, item) => n + item.paidAmountInCents, 0),
            ),
            totalAdjustmentInCents: '-3000',
        };
    }
    if (call.path.endsWith('/payoff-preview'))
        return {
            commitmentId,
            expectedCommitmentVersion: 1,
            items: root.plan.installments.map((item) => ({
                installmentId: item.id,
                expectedInstallmentVersion: 1,
            })),
            expectedRemainingAmountInCents: 30000,
            paidAmountInCents: 27000,
            adjustmentInCents: -3000,
            effectiveEconomicShares: null,
        };
}
test('Wave 4: selected future installments preserve individual real anticipation values', async ({
    page,
}) => {
    const { calls, spaceId } = await setup(page, planResponder);
    await page.goto(
        `/spaces/${spaceId}/installment-commitments/${commitmentId}`,
    );
    await page
        .getByRole('button', { name: 'Antecipar parcelas', exact: true })
        .click();
    await page.getByLabel('Selecionar parcelas').selectOption('FROM_END');
    await page.getByLabel('Quantidade a partir do final').fill('2');
    await page
        .getByRole('button', { name: 'Conferir parcelas selecionadas' })
        .click();
    await page
        .getByLabel('Valor real da parcela 3', { exact: true })
        .fill('80,00');
    await page
        .getByLabel('Valor real da parcela 2', { exact: true })
        .fill('90,00');
    await page.getByRole('button', { name: 'Revisar antecipação' }).click();
    await expect(
        page.getByRole('region', {
            name: 'Confirmar resolução do parcelamento',
        }),
    ).toContainText('R$ 170,00');
    await page.getByRole('button', { name: 'Confirmar antecipação' }).click();
    await expect(
        page.getByText('Antecipação registrada nas parcelas selecionadas.'),
    ).toBeVisible();
    const command = calls.find((call) => call.path.endsWith('/anticipations'))!;
    expect(command.body.selection).toEqual({ mode: 'FROM_END', quantity: 2 });
    expect(command.body.values).toEqual([
        {
            installmentId: installmentItem(3).id,
            expectedInstallmentVersion: 1,
            paidAmountInCents: 8000,
        },
        {
            installmentId: installmentItem(2).id,
            expectedInstallmentVersion: 1,
            paidAmountInCents: 9000,
        },
    ]);
    await noOverflow(page);
});
test('Wave 4: payoff submits a global value without fictional payments per installment', async ({
    page,
}) => {
    const { calls, spaceId } = await setup(page, planResponder);
    await page.goto(
        `/spaces/${spaceId}/installment-commitments/${commitmentId}`,
    );
    await page
        .getByRole('button', { name: 'Quitar restante', exact: true })
        .click();
    await page.getByLabel('Valor real global da quitação (R$)').fill('270,00');
    await page.getByRole('button', { name: 'Revisar quitação' }).click();
    await expect(page.getByText('Diferença global: −R$ 30,00')).toBeVisible();
    await page
        .getByRole('button', { name: 'Confirmar quitação global' })
        .click();
    await expect(
        page.getByText(
            'Quitação global registrada. As parcelas realizadas continuam no histórico.',
        ),
    ).toBeVisible();
    const command = calls.find((call) => call.path.endsWith('/payoffs'))!;
    expect(command.body.paidAmountInCents).toBe(27000);
    expect(command.body.installments).toEqual(
        [1, 2, 3].map((n) => ({
            installmentId: installmentItem(n).id,
            expectedInstallmentVersion: 1,
        })),
    );
});
test('Wave 4: cancellation requires explicit future selection and reason', async ({
    page,
}) => {
    const { calls, spaceId } = await setup(page, planResponder);
    await page.goto(
        `/spaces/${spaceId}/installment-commitments/${commitmentId}`,
    );
    await page
        .getByRole('button', { name: 'Cancelar futuras', exact: true })
        .click();
    await page.getByRole('checkbox', { name: /Parcela 3/ }).check();
    await page.getByLabel('Motivo do cancelamento').fill('Contrato encerrado');
    await page.getByRole('button', { name: 'Revisar cancelamento' }).click();
    await expect(
        page.getByText(
            'Os pagamentos já realizados permanecem no histórico. Esta ação não registra devolução.',
        ),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Confirmar cancelamento das parcelas' })
        .click();
    await expect(
        page.getByText(
            'Parcelas futuras canceladas. Os fatos anteriores foram preservados.',
        ),
    ).toBeVisible();
    expect(
        calls.find((call) =>
            call.path.endsWith('/future-installment-cancellations'),
        )!.body,
    ).toEqual({
        expectedCommitmentVersion: 1,
        installments: [
            {
                installmentId: installmentItem(3).id,
                expectedInstallmentVersion: 1,
            },
        ],
        reason: 'Contrato encerrado',
        factDate: '2026-10-19',
    });
});
