import { expect, test, type Page } from '@playwright/test';

const actorId = '10000000-0000-4000-8000-000000000001',
    otherId = '10000000-0000-4000-8000-000000000002';
const personalId = '20000000-0000-4000-8000-000000000001',
    spaceId = '20000000-0000-4000-8000-000000000002';
const memberId = '30000000-0000-4000-8000-000000000001',
    otherMemberId = '30000000-0000-4000-8000-000000000002';
const cycleId = '40000000-0000-4000-8000-000000000001',
    secondCycle = '40000000-0000-4000-8000-000000000002';
const obligationId = '50000000-0000-4000-8000-000000000001',
    otherObligation = '50000000-0000-4000-8000-000000000002';
const resolutionId = '60000000-0000-4000-8000-000000000001',
    allocationId = '60000000-0000-4000-8000-000000000002',
    secondAllocation = '60000000-0000-4000-8000-000000000003';
const commitmentId = '70000000-0000-4000-8000-000000000001';
const members = [
    { memberId, personId: actorId, displayName: 'Lucas' },
    { memberId: otherMemberId, personId: otherId, displayName: 'Ana' },
];
const shared = {
        id: spaceId,
        type: 'SHARED',
        label: 'Nossa casa',
        status: 'ACTIVE',
        version: 4,
    },
    personal = {
        id: personalId,
        type: 'PERSONAL',
        label: 'Meu espaço',
        status: 'ACTIVE',
        version: 1,
    };
const base = `/spaces/${spaceId}/finances/settlements`;
const origin = {
    commitmentId,
    disbursementId: resolutionId,
    kind: 'EXPENSE',
    description: 'Mercado da semana',
};
const context = {
    spaceId,
    spaceStatus: 'ACTIVE',
    spaceVersion: 4,
    actorMemberId: memberId,
    members,
    referenceDate: '2026-10-19',
};
const cycles = [
    { id: cycleId, targetDate: '2026-10-10', status: 'OPEN', version: 3 },
    { id: secondCycle, targetDate: '2026-11-10', status: 'OPEN', version: 5 },
];

async function setup(
    page: Page,
    options: {
        creditor?: boolean;
        remaining?: number;
        finalized?: boolean;
        failOffset?: boolean;
        correction?: boolean;
    } = {},
) {
    const writes: {
        path: string;
        body: Record<string, unknown>;
        key: string | undefined;
        csrf: string | undefined;
    }[] = [];
    let remaining = options.remaining ?? 2000,
        finalized = options.finalized ?? false,
        offsetAttempts = 0,
        reversed = false;
    const obligation = () => ({
        id: obligationId,
        version: 7,
        status: remaining ? 'OPEN' : 'WAIVED',
        cycleId,
        debtorMemberId: options.creditor ? otherMemberId : memberId,
        creditorMemberId: options.creditor ? memberId : otherMemberId,
        originalAmountInCents: 2000,
        recognizedAmountInCents: 2000,
        resolvedAmountInCents: 2000 - remaining,
        remainingAmountInCents: remaining,
        factDate: '2026-10-03',
        registeredAt: '2026-10-03T15:00:00Z',
        origin,
    });
    const cycle = (id = cycleId) => ({
        ...(cycles.find((c) => c.id === id) ?? cycles[0]),
        status: finalized ? 'FINALIZED' : 'OPEN',
        isOverdue: id === cycleId,
        obligationCount: 2,
        openObligationCount: remaining ? 2 : 0,
        totals: {
            originalAmountInCents: '4000',
            recognizedAmountInCents: '4000',
            resolvedAmountInCents: String(4000 - remaining),
            transferredAmountInCents: '0',
            compensatedAmountInCents: '0',
            waivedAmountInCents: '0',
            remainingAmountInCents: String(remaining),
        },
        position: {
            payableAmountInCents: String(remaining),
            receivableAmountInCents: String(remaining),
            net: { direction: 'BALANCED', amountInCents: '0' },
        },
        finalizedAt: finalized ? '2026-10-19T17:00:00Z' : null,
        canFinalize: !finalized && remaining === 0,
    });
    const allocations = [
        {
            id: allocationId,
            obligationId,
            originCommitmentId: commitmentId,
            debtorMemberId: memberId,
            creditorMemberId: otherMemberId,
            amountInCents: 1000,
            cycleId,
            origin,
        },
        {
            id: secondAllocation,
            obligationId: otherObligation,
            originCommitmentId: commitmentId,
            debtorMemberId: otherMemberId,
            creditorMemberId: memberId,
            amountInCents: 1000,
            cycleId,
            origin,
        },
    ];
    const offsetResult = {
        spaceId,
        offset: {
            id: resolutionId,
            amountInCents: 1000,
            reversedAmountInCents: reversed ? 1000 : 0,
            effectiveAmountInCents: reversed ? 0 : 1000,
            reversalId: reversed ? secondAllocation : null,
            factDate: '2026-10-19',
            registeredAt: '2026-10-19T16:00:00Z',
            createdByPersonId: actorId,
        },
        allocations,
        affectedCycleIds: [cycleId],
        replayed: false,
    };
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
            url = new URL(request.url()),
            path = url.pathname;
        const headers = {
            'Access-Control-Allow-Origin': 'http://localhost:3200',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Headers':
                'Content-Type, X-CSRF-Token, Idempotency-Key',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        };
        if (request.method() === 'OPTIONS')
            return route.fulfill({ status: 204, headers });
        if (['POST', 'PUT'].includes(request.method()))
            writes.push({
                path,
                body: request.postDataJSON(),
                key: request.headers()['idempotency-key'],
                csrf: request.headers()['x-csrf-token'],
            });
        let json: unknown;
        if (path.endsWith('/auth/csrf')) json = { csrfToken: 'wave3-csrf' };
        else if (path.endsWith('/auth/me'))
            json = {
                person: {
                    id: actorId,
                    displayName: 'Lucas',
                    email: 'lucas@example.test',
                },
                personalSpace: {
                    id: personalId,
                    type: 'PERSONAL',
                    label: 'Meu espaço',
                },
            };
        else if (path === '/v2/spaces') json = { items: [personal, shared] };
        else if (path === `/v2/spaces/${spaceId}`)
            json = {
                space: shared,
                actorMembership: {
                    id: memberId,
                    personId: actorId,
                    status: 'ACTIVE',
                },
                activeMemberCount: 2,
                invitation: null,
            };
        else if (path.endsWith('/financial-entry-context'))
            json = {
                spaceId,
                type: 'SHARED',
                status: 'ACTIVE',
                version: 4,
                actorMemberId: memberId,
                members,
            };
        else if (path.endsWith('/settlement-cycles/summary'))
            json = {
                ...context,
                selectedCycles: [cycle(), cycle(secondCycle)],
                totals: {
                    ...cycle().totals,
                    transferTotalAmountInCents: '0',
                    transferCount: 0,
                    grossPayableAmountInCents: '2000',
                    grossReceivableAmountInCents: '2000',
                },
                position: cycle().position,
                items: [{ ...obligation(), cycleId }],
                page: { direction: 'ALL', pageSize: 20, nextCursor: null },
            };
        else if (path.endsWith('/settlement-cycles'))
            json = {
                ...context,
                items: [cycle(), cycle(secondCycle)],
                page: {
                    view: url.searchParams.get('view') ?? 'OPEN',
                    pageSize: 20,
                    nextCursor: null,
                },
            };
        else if (path.endsWith('/finalize')) {
            finalized = true;
            json = {
                spaceId,
                cycle: {
                    ...cycle(),
                    finalizedAt: '2026-10-19T17:00:00Z',
                    finalizedByPersonId: actorId,
                },
                affectedCycleIds: [cycleId],
                replayed: false,
            };
        } else if (path.endsWith(`/settlement-cycles/${cycleId}`))
            json = {
                ...context,
                cycle: cycle(),
                items: remaining ? [obligation()] : [],
                page: { direction: 'ALL', pageSize: 20, nextCursor: null },
            };
        else if (path.endsWith('/settlement-options'))
            json = {
                spaceId,
                spaceVersion: 4,
                obligation: obligation(),
                currentCycle: cycles[0],
                cycles,
                nextCursor: null,
                eligible: !finalized && remaining > 0,
                blockingReason: finalized
                    ? 'SETTLEMENT_CYCLE_FINALIZED'
                    : remaining === 0
                      ? 'OBLIGATION_ALREADY_RESOLVED'
                      : null,
                today: '2026-10-19',
            };
        else if (path.endsWith('/settlement-assignment'))
            json = {
                spaceId,
                obligation: {
                    ...obligation(),
                    version: 8,
                    cycleId: secondCycle,
                },
                settlementCycle: cycles[1],
                affectedCycleIds: [cycleId, secondCycle],
                replayed: false,
            };
        else if (path.endsWith('/waiver-options'))
            json = {
                ...context,
                obligation: obligation(),
                settlementCycle: cycles[0],
                canWaive: !!options.creditor && remaining > 0 && !finalized,
                waiverBlockReason: !options.creditor
                    ? 'CREDITOR_REQUIRED'
                    : finalized
                      ? 'SETTLEMENT_CYCLE_FINALIZED'
                      : remaining === 0
                        ? 'OBLIGATION_ALREADY_RESOLVED'
                        : null,
            };
        else if (path.endsWith('/waivers') && request.method() === 'POST') {
            const amount = Number(request.postDataJSON().amountInCents);
            remaining -= amount;
            json = {
                spaceId,
                waiver: {
                    id: resolutionId,
                    obligationId,
                    creditorMemberId: memberId,
                    amountInCents: amount,
                    factDate: '2026-10-19',
                    registeredAt: '2026-10-19T16:00:00Z',
                    createdByPersonId: actorId,
                    reason: null,
                },
                obligation: obligation(),
                affectedCycleIds: [cycleId],
                replayed: false,
            };
        } else if (path.endsWith('/waivers'))
            json = {
                spaceId,
                obligationId,
                items: [],
                page: { nextCursor: null },
            };
        else if (path.endsWith('/settlement-offsets/options'))
            json = {
                ...context,
                scope: { cycleIds: [cycleId], obligationIds: [] },
                canRecord: !finalized,
                cycles: [cycles[0]],
                maximumAmountInCents: '1000',
                reason: finalized ? 'SETTLEMENT_CYCLE_FINALIZED' : null,
                items: [
                    obligation(),
                    {
                        ...obligation(),
                        id: otherObligation,
                        debtorMemberId: otherMemberId,
                        creditorMemberId: memberId,
                    },
                ],
                preview: {
                    amountInCents: '1000',
                    complete: true,
                    allocations: allocations.map((a) => ({
                        obligationId: a.obligationId,
                        expectedObligationVersion: 7,
                        amountInCents: a.amountInCents,
                    })),
                },
                page: { direction: 'ALL', pageSize: 20, nextCursor: null },
            };
        else if (
            path.endsWith('/settlement-offsets') &&
            request.method() === 'POST'
        ) {
            offsetAttempts++;
            if (options.failOffset && offsetAttempts === 1)
                return route.fulfill({
                    status: 503,
                    headers,
                    json: {
                        code: 'TEMPORARILY_UNAVAILABLE',
                        message: 'Não foi possível confirmar o resultado.',
                    },
                });
            json = offsetResult;
        } else if (path.endsWith('/settlement-offsets'))
            json = {
                spaceId,
                items: [offsetResult],
                page: { nextCursor: null },
            };
        else if (path.endsWith('/reversal-options'))
            json = {
                ...context,
                original: {
                    kind: path.includes('settlement-transfers')
                        ? 'TRANSFER'
                        : 'OFFSET',
                    id: resolutionId,
                    amountInCents: 1000,
                    factDate: '2026-10-18',
                    registeredAt: '2026-10-18T16:00:00Z',
                    createdByPersonId: actorId,
                },
                allocations,
                previousReversals: reversed
                    ? [
                          {
                              id: secondAllocation,
                              amountInCents: 1000,
                              factDate: '2026-10-19',
                              registeredAt: '2026-10-19T17:00:00Z',
                              createdByPersonId: actorId,
                          },
                      ]
                    : [],
                obligations: [
                    { ...obligation(), id: obligationId },
                    { ...obligation(), id: otherObligation },
                ],
                cycles: [
                    {
                        ...cycles[0],
                        status: options.correction ? 'FINALIZED' : 'OPEN',
                    },
                ],
                reversibleAmountInCents: reversed ? 0 : 1000,
                requiresCorrectionCycle: !!options.correction,
                canReverse: !reversed && !options.correction,
                reversalBlockReason: reversed
                    ? 'ALREADY_REVERSED'
                    : options.correction
                      ? 'CORRECTION_CYCLE_REQUIRED'
                      : null,
                impact: [
                    {
                        originCommitmentId: commitmentId,
                        debtorMemberId: memberId,
                        creditorMemberId: otherMemberId,
                        remainingAmountInCents: 3000,
                        requiresCorrectionCycle: !!options.correction,
                        affectedCurrentCycleIds: [cycleId],
                        newCorrectionObligation: !!options.correction,
                    },
                ],
            };
        else if (path.endsWith('/reversals')) {
            reversed = true;
            json = {
                spaceId,
                reversal: {
                    id: secondAllocation,
                    originalKind: path.includes('settlement-transfers')
                        ? 'TRANSFER'
                        : 'OFFSET',
                    originalId: resolutionId,
                    amountInCents: 1000,
                    factDate: '2026-10-19',
                    registeredAt: '2026-10-19T17:00:00Z',
                    createdByPersonId: actorId,
                },
                applications: [],
                effects: [
                    {
                        obligationId,
                        originCommitmentId: commitmentId,
                        remainingAmountInCents: 3000,
                        cycleId: options.correction ? secondCycle : cycleId,
                        version: 8,
                        status: 'OPEN',
                    },
                ],
                affectedCycleIds: [cycleId],
                replayed: false,
            };
        } else if (path.endsWith(`/settlement-offsets/${resolutionId}`))
            json = offsetResult;
        else if (path.endsWith(`/settlement-transfers/${resolutionId}`))
            json = {
                ...context,
                transfer: {
                    id: resolutionId,
                    payerMemberId: memberId,
                    recipientMemberId: otherMemberId,
                    amountInCents: 1000,
                    factDate: '2026-10-18',
                    registeredAt: '2026-10-18T16:00:00Z',
                    createdByPersonId: actorId,
                    mode: 'MANUAL',
                    reversedAmountInCents: reversed ? 1000 : 0,
                    effectiveAmountInCents: reversed ? 0 : 1000,
                    reversalId: reversed ? secondAllocation : null,
                },
                allocations,
                affectedCycleIds: [cycleId],
            };
        else if (path.endsWith('/settlement-rule'))
            json = {
                spaceId,
                commitmentId,
                commitmentVersion: 8,
                settlementRule: {
                    source: 'SPECIFIC',
                    rule: { kind: 'MONTHLY_DAY', dayOfMonth: 25 },
                    version: 1,
                    referenceDate: '2026-10-19',
                    suggestedTargetDate: '2026-10-25',
                },
                affectedCycleIds: [],
                replayed: false,
            };
        else if (path.endsWith(`/financial-commitments/${commitmentId}`))
            json = {
                spaceId,
                commitment: {
                    id: commitmentId,
                    kind: 'EXPENSE',
                    version: 7,
                    description: 'Mercado da semana',
                    factDate: '2026-10-03',
                },
                settlementRule: { source: 'INHERITED', rule: null, version: 0 },
            };
        else
            return route.fulfill({
                status: 404,
                headers,
                json: { code: 'NOT_FOUND', message: 'Fixture não definida' },
            });
        return route.fulfill({ status: 200, headers, json });
    });
    return writes;
}
async function noOverflow(page: Page) {
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
}

for (const width of [320, 1280])
    test(`Wave3: acertos vencidos e recorte de ciclos em ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        const writes = await setup(page);
        await page.goto(base);
        await page.getByLabel('Mostrar acertos').selectOption('OVERDUE');
        await expect(
            page.getByRole('list', { name: 'Ciclos de acerto' }),
        ).toBeVisible();
        await page.getByLabel('Selecionar acerto de 10/10/2026').check();
        await page.getByLabel('Selecionar acerto de 10/11/2026').check();
        await noOverflow(page);
        await page
            .getByRole('link', { name: 'Conferir ciclos selecionados' })
            .click();
        await expect(
            page.getByRole('heading', { name: '2 ciclos neste recorte' }),
        ).toBeVisible();
        await expect(
            page.getByText('Este resumo é temporário.', { exact: false }),
        ).toBeVisible();
        await noOverflow(page);
        expect(writes).toHaveLength(0);
    });
test('Wave3: mover pendência preserva data econômica e mostra resultado após atualização', async ({
    page,
}) => {
    const writes = await setup(page);
    await page.goto(`${base}/obligations/${obligationId}`);
    await expect(
        page.getByText(
            'Somente a pessoa que tem a receber pode dispensar esta pendência.',
        ),
    ).toBeVisible();
    await page.getByLabel('Novo ciclo').selectOption(secondCycle);
    await page
        .getByLabel('Conferi o destino e quero mover a pendência.')
        .check();
    await page
        .getByRole('button', { name: 'Confirmar mudança de acerto' })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Acerto atualizado' }),
    ).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toEqual({
        settlement: { mode: 'CYCLE', cycleId: secondCycle },
        expectedObligationVersion: 7,
        expectedSpaceVersion: 4,
        expectedCycleVersions: [
            { cycleId, version: 3 },
            { cycleId: secondCycle, version: 5 },
        ],
    });
    expect(writes[0].body).not.toHaveProperty('factDate');
    expect(writes[0].csrf).toBe('wave3-csrf');
});
for (const total of [false, true])
    test(`Wave3: credor dispensa ${total ? 'total' : 'parcial'} sem alterar origem`, async ({
        page,
    }) => {
        await page.setViewportSize({ width: 320, height: 900 });
        const writes = await setup(page, { creditor: true });
        await page.goto(`${base}/obligations/${obligationId}`);
        await expect(
            page.getByRole('button', { name: 'Confirmar dispensa' }),
        ).toBeDisabled();
        if (total)
            await page
                .getByRole('button', { name: 'Usar todo o valor em aberto' })
                .click();
        else await page.getByLabel('Valor a dispensar (R$)').fill('5,00');
        await page
            .getByLabel('Confirmo que abro mão deste valor a receber.')
            .check();
        await page.getByRole('button', { name: 'Confirmar dispensa' }).click();
        await expect(
            page.getByRole('heading', { name: 'Dispensa registrada' }),
        ).toBeVisible();
        expect(writes[0].body.amountInCents).toBe(total ? 2000 : 500);
        await noOverflow(page);
    });
test('Wave3: compensação exige confirmação e retry preserva chave, corpo e destino', async ({
    page,
}) => {
    const writes = await setup(page, { failOffset: true });
    await page.goto(`${base}/offsets/new?cycleIds=${cycleId}`);
    await expect(
        page.getByRole('heading', { name: 'Pode compensar R$ 10,00' }),
    ).toBeVisible();
    expect(writes).toHaveLength(0);
    await expect(
        page.getByRole('button', { name: 'Confirmar compensação' }),
    ).toBeDisabled();
    await page
        .getByLabel(
            'Confirmo a compensação de R$ 10,00 em cada direção, sem transferência de dinheiro.',
        )
        .check();
    await page.getByRole('button', { name: 'Confirmar compensação' }).click();
    await expect(
        page.getByRole('button', { name: 'Reenviar a mesma tentativa' }),
    ).toBeVisible();
    await expect(page.getByLabel('Data da compensação')).toBeDisabled();
    expect(writes).toHaveLength(1);
    await page
        .getByRole('button', { name: 'Reenviar a mesma tentativa' })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Compensação registrada' }),
    ).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[0].body.allocations).toEqual([
        { obligationId, expectedObligationVersion: 7, amountInCents: 1000 },
        {
            obligationId: otherObligation,
            expectedObligationVersion: 7,
            amountInCents: 1000,
        },
    ]);
});
test('Wave3: ciclo com valor aberto bloqueia finalização e ciclo zerado exige confirmação', async ({
    page,
}) => {
    const writes = await setup(page);
    await page.goto(`${base}/${cycleId}`);
    await expect(
        page.getByText(
            'Resolva os valores em aberto antes de finalizar este ciclo.',
        ),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Finalizar ciclo de acerto' }),
    ).toHaveCount(0);
    expect(writes).toHaveLength(0);
});
test('Wave3: finalizar preserva histórico e impede alterações na consulta seguinte', async ({
    page,
}) => {
    const writes = await setup(page, { remaining: 0 });
    await page.goto(`${base}/${cycleId}`);
    await page
        .getByLabel('Conferi os valores e quero finalizar este ciclo.')
        .check();
    await page
        .getByRole('button', { name: 'Finalizar ciclo de acerto' })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Ciclo finalizado' }),
    ).toBeVisible();
    expect(writes[0].body).toEqual({
        expectedSpaceVersion: 4,
        expectedCycleVersion: 3,
    });
    await page.reload();
    await expect(
        page.getByText(
            'Este ciclo foi finalizado. A composição histórica está preservada e não aceita alterações retroativas.',
        ),
    ).toBeVisible();
});
test('Wave3: reversão em ciclo finalizado exige ciclo corretivo e conserva o registro original', async ({
    page,
}) => {
    const writes = await setup(page, { correction: true });
    await page.goto(`${base}/transfers/${resolutionId}/reverse`);
    await expect(
        page.getByText('A origem pertence a um ciclo finalizado.', {
            exact: false,
        }),
    ).toBeVisible();
    await page
        .getByLabel('Ciclo aberto para a correção')
        .selectOption(secondCycle);
    await page
        .getByLabel(
            'Conferi os efeitos e quero reverter integralmente este registro de R$ 10,00.',
        )
        .check();
    await page.getByRole('button', { name: 'Confirmar reversão' }).click();
    await expect(
        page.getByRole('heading', { name: 'Reversão registrada' }),
    ).toBeVisible();
    expect(writes[0].body.correctionCycleId).toBe(secondCycle);
    expect(writes[0].body.expectedCycleVersions).toEqual([
        { cycleId, version: 3 },
        { cycleId: secondCycle, version: 5 },
    ]);
    expect(writes[0].body.applications).toEqual([
        { allocationId, amountInCents: 1000 },
        { allocationId: secondAllocation, amountInCents: 1000 },
    ]);
    await page
        .getByRole('link', { name: 'Conferir registro com a reversão' })
        .click();
    await expect(
        page.getByText(
            'Esta transferência recebeu uma reversão vinculada. O registro original foi preservado.',
        ),
    ).toBeVisible();
});
test('Wave3: regra específica usa compromisso e versões atuais', async ({
    page,
}) => {
    const writes = await setup(page);
    await page.goto(`${base}/rules/${commitmentId}`);
    await page.getByLabel('Dia do mês').fill('25');
    await page
        .getByLabel('Conferi a regra específica para este compromisso.')
        .check();
    await page.getByRole('button', { name: 'Salvar regra específica' }).click();
    await expect(
        page.getByRole('heading', { name: 'Regra específica salva' }),
    ).toBeVisible();
    expect(writes[0].body).toEqual({
        rule: { kind: 'MONTHLY_DAY', dayOfMonth: 25 },
        expectedSpaceVersion: 4,
        expectedCommitmentVersion: 7,
    });
});
