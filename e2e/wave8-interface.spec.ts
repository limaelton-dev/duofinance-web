import { expect, test, type Page } from '@playwright/test';
import type {
    ClosureBlocker,
    ClosureView,
} from '../src/features/spaces/closure/types';

const personId = '10000000-0000-4000-8000-000000000001';
const otherPersonId = '10000000-0000-4000-8000-000000000002';
const personalId = '20000000-0000-4000-8000-000000000001';
const spaceId = '20000000-0000-4000-8000-000000000002';
const memberId = '30000000-0000-4000-8000-000000000001';
const otherMemberId = '30000000-0000-4000-8000-000000000002';
const originId = '40000000-0000-4000-8000-000000000001';
const fingerprint = 'a'.repeat(64);
const participants = [
    { memberId, personId, displayName: 'Lucas' },
    { memberId: otherMemberId, personId: otherPersonId, displayName: 'Ana' },
];
function initialClosure(): ClosureView {
    return {
        spaceId,
        spaceStatus: 'CLOSING',
        spaceVersion: 2,
        processId: '50000000-0000-4000-8000-000000000001',
        processStatus: 'OPEN',
        planRevision: 1,
        planStatus: 'DRAFT',
        cutoffDate: '2026-10-19',
        proposedCutoffDate: null,
        requestedByMemberId: memberId,
        requiredMemberIds: [memberId, otherMemberId],
        participants,
        approvals: [],
        confirmations: [],
        futureDestinations: [],
        proposalSnapshot: null,
        hasBilateralApproval: false,
        cancellationConsents: [],
        actorNextAction: 'PROPOSE_PLAN',
        startedAt: '2026-10-19T15:00:00Z',
        completedAt: null,
        cancelledAt: null,
        invitationStatus: 'CANCELLED',
    };
}
async function fixture(
    page: Page,
    options: {
        closed?: boolean;
        active?: boolean;
        many?: boolean;
        wrongContext?: boolean;
        retryStart?: boolean;
        conflictCutoff?: boolean;
        delayDiagnostic?: Promise<void>;
    } = {},
) {
    let closure: ClosureView | null = options.active ? null : initialClosure();
    if (options.closed && closure) {
        closure.spaceStatus = 'CLOSED';
        closure.processStatus = 'COMPLETED';
        closure.planStatus = 'APPROVED';
    }
    const requests: {
        path: string;
        input: unknown;
        key: string | undefined;
    }[] = [];
    const pages: number[] = [];
    const gross: ClosureBlocker[] = [memberId, otherMemberId].map(
        (debtor, index) => ({
            type: 'INTER_MEMBER_OBLIGATION',
            originId: `60000000-0000-4000-8000-00000000000${index + 1}`,
            commitmentId: originId,
            description: `Pendência ${index + 1}`,
            version: 1,
            referenceDate: '2026-10-19',
            amountInCents: '1000',
            debtorMemberId: debtor,
            creditorMemberId: participants.find(
                (member) => member.memberId !== debtor,
            )!.memberId,
            action: 'Resolver por transferência, compensação ou dispensa do credor.',
        }),
    );
    let blockers: ClosureBlocker[] = options.closed
        ? []
        : options.many
          ? [
                ...Array.from({ length: 100 }, (_, index): ClosureBlocker => ({
                    type: 'OPEN_ONE_TIME_COMMITMENT',
                    originId: `70000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                    commitmentId: originId,
                    description: `Compromisso ${index + 1}`,
                    version: 1,
                    referenceDate: '2026-10-19',
                    amountInCents: '100',
                    action: 'Resolver compromisso existente.',
                })),
                {
                    type: 'ACTIVE_RECURRENCE',
                    originId,
                    commitmentId: originId,
                    description: 'Recorrência da última página',
                    referenceDate: '2099-01-20',
                    version: 4,
                    amountInCents: '3000',
                    action: 'Definir destino no plano.',
                },
            ]
          : gross;
    const info = {
        routine: { pendingTaskCount: 2, activeRecurrenceCount: 1 },
        shopping: { activeListCount: 1 },
        blocksFinancialClosure: false,
    };
    const finance = () => ({
        blockers,
        totalCount: blockers.length,
        counts: Object.fromEntries(
            [...new Set(blockers.map((item) => item.type))].map((type) => [
                type,
                blockers.filter((item) => item.type === type).length,
            ]),
        ),
        outstandingAmounts:
            options.many || options.closed
                ? []
                : gross.map((item) => ({
                      debtorMemberId: item.debtorMemberId,
                      creditorMemberId: item.creditorMemberId,
                      amountInCents: '1000',
                  })),
        financiallyReady: blockers.length === 0,
    });
    const validation = () => ({
        ...finance(),
        spaceId,
        processId: closure!.processId,
        planRevision: closure!.planRevision,
        spaceVersion: closure!.spaceVersion,
        planApproved: closure!.planStatus === 'APPROVED',
        canConfirm: closure!.planStatus === 'APPROVED' && !blockers.length,
        financialFingerprint: fingerprint,
        appliedDestinations: [],
        resolutions: [],
        missingDestinationOriginIds:
            options.many && !closure!.futureDestinations.length
                ? [originId]
                : [],
        informational: info,
    });
    let firstStart = true;
    let firstConflict = !!options.conflictCutoff;
    await page.route('**/v2/**', async (route) => {
        const request = route.request(),
            url = new URL(request.url()),
            path = url.pathname;
        const headers = {
            'Access-Control-Allow-Origin': 'http://localhost:3200',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Headers':
                'Content-Type, X-CSRF-Token, Idempotency-Key',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        };
        if (request.method() === 'OPTIONS')
            return route.fulfill({ status: 204, headers });
        const shared = {
            id: spaceId,
            type: 'SHARED',
            label: 'Nossa casa',
            status: closure?.spaceStatus ?? 'ACTIVE',
            version: closure?.spaceVersion ?? 1,
        };
        const personal = {
            id: personalId,
            type: 'PERSONAL',
            label: 'Meu espaço',
            status: 'ACTIVE',
            version: 1,
        };
        let json: unknown;
        if (path.endsWith('/auth/me'))
            json = {
                person: {
                    id: personId,
                    displayName: 'Lucas',
                    email: 'lucas@example.test',
                },
                personalSpace: personal,
            };
        else if (path.endsWith('/auth/csrf')) json = { csrfToken: 'test-csrf' };
        else if (path === '/v2/spaces') json = { items: [personal, shared] };
        else if (path === `/v2/spaces/${spaceId}`)
            json = {
                space: shared,
                actorMembership: { id: memberId, personId, status: 'ACTIVE' },
                activeMemberCount: 2,
                invitation: null,
            };
        else if (path === `/v2/spaces/${personalId}`)
            json = {
                space: personal,
                actorMembership: null,
                activeMemberCount: 0,
                invitation: null,
            };
        else if (path.endsWith('/financial-entry-context'))
            json = {
                spaceId,
                type: 'SHARED',
                status: shared.status,
                version: shared.version,
                actorMemberId: memberId,
                members: participants,
            };
        else if (path.endsWith('/closure/diagnostic')) {
            await options.delayDiagnostic;
            const offset = Number(url.searchParams.get('offset'));
            pages.push(offset);
            json = {
                spaceId: options.wrongContext ? personalId : spaceId,
                closure,
                finance: {
                    ...finance(),
                    blockers: blockers.slice(offset, offset + 100),
                },
                informational: info,
            };
        } else if (path.endsWith('/closure/plan-review'))
            json = {
                spaceId,
                closure,
                finance: {
                    fingerprint,
                    diagnostic: finance(),
                    missingDestinationOriginIds:
                        options.many && !closure!.futureDestinations.length
                            ? [originId]
                            : [],
                    appliedDestinations: [],
                },
                informational: info,
            };
        else if (path.endsWith('/closure/financial-validation'))
            json = validation();
        else if (path.endsWith('/closure/final-summary'))
            json = {
                ...validation(),
                closure,
                actorConfirmed: false,
                validConfirmations: [],
                requiredConfirmations: 2,
                confirmedCount: 0,
            };
        else if (path.endsWith('/closure/history'))
            json = {
                items: closure
                    ? [
                          {
                              id: 'history',
                              processId: closure.processId,
                              action: 'START_CLOSURE',
                              actorMemberId: memberId,
                              planRevision: 1,
                              recordedAt: closure.startedAt,
                              snapshot: closure,
                          },
                      ]
                    : [],
                nextCursor: null,
            };
        else if (request.method() === 'POST' && path.includes('/closure')) {
            const input = request.postDataJSON();
            requests.push({
                path,
                input,
                key: request.headers()['idempotency-key'],
            });
            if (path.endsWith('/closure')) {
                closure ??= initialClosure();
                if (options.retryStart && firstStart) {
                    firstStart = false;
                    return route.abort('failed');
                }
            } else if (path.endsWith('/cutoff-date')) {
                if (firstConflict) {
                    firstConflict = false;
                    closure!.spaceVersion++;
                    closure!.planRevision++;
                    closure!.approvals = [];
                    closure!.planStatus = 'DRAFT';
                    return route.fulfill({
                        status: 409,
                        headers,
                        json: {
                            code: 'CONCURRENT_MODIFICATION',
                            message: 'O plano mudou.',
                        },
                    });
                }
                closure!.spaceVersion++;
                closure!.planRevision++;
                closure!.proposedCutoffDate = input.cutoffDate;
                closure!.approvals = [];
                closure!.confirmations = [];
                closure!.planStatus = 'DRAFT';
            } else if (path.endsWith('/future-destinations')) {
                closure!.spaceVersion++;
                closure!.planRevision++;
                closure!.futureDestinations = [
                    {
                        ...input,
                        cutoffDate: closure!.cutoffDate,
                        assigneeMemberId: input.assigneeMemberId ?? null,
                        amountInCents: input.amountInCents ?? null,
                        impactByMember: participants.map((member) => ({
                            memberId: member.memberId,
                            beforeInCents: '1500',
                            afterInCents:
                                member.memberId === input.assigneeMemberId
                                    ? '3000'
                                    : '0',
                            requiresAcceptance: true,
                        })),
                        originSnapshot: {
                            version: 4,
                            fingerprint,
                            kind: 'EXPENSE',
                            description: 'Recorrência da última página',
                            eligibleRemainingInCents: null,
                            futureItems: [
                                {
                                    originItemId: null,
                                    referenceDate: '2099-01-20',
                                    remainingInCents: 3000,
                                    version: null,
                                },
                            ],
                            recurringImpacts: [],
                        },
                    },
                ];
                blockers = blockers.filter(
                    (blocker) => blocker.originId !== originId,
                );
            }
            json = closure;
        } else
            return route.fulfill({
                status: 404,
                headers,
                json: { code: 'NOT_FOUND', message: 'Fixture não definida' },
            });
        return route.fulfill({ headers, json });
    });
    return { requests, pages };
}

for (const width of [320, 390, 768, 1280])
    test(`Wave8: diagnóstico completo e destino legíveis em ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        const state = await fixture(page, { many: true });
        await page.goto(`/spaces/${spaceId}/closure`);
        await expect(
            page
                .locator('#diagnostic')
                .getByText('101 bloqueador(es)', { exact: false }),
        ).toBeVisible();
        expect(state.pages).toEqual([0, 100]);
        await page
            .getByLabel('Destino de Recorrência da última página')
            .selectOption('PERSONAL_SUCCESSOR');
        await page
            .getByLabel('Pessoa que assumirá o futuro')
            .selectOption(memberId);
        await page
            .getByRole('button', { name: 'Conferir escolha', exact: true })
            .click();
        await page.getByLabel('Conferi o destino e entendi').check();
        await page
            .getByRole('button', {
                name: 'Salvar destino no plano',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('status').filter({ hasText: 'Decisão registrada' }),
        ).toBeVisible();
        expect(state.requests[0].input).toEqual({
            expectedSpaceVersion: 2,
            expectedPlanRevision: 1,
            originType: 'RECURRING',
            originId,
            expectedOriginVersion: 4,
            destination: 'PERSONAL_SUCCESSOR',
            assigneeMemberId: memberId,
        });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        await page.addStyleTag({ content: 'html { font-size: 200%; }' });
        const overflow = await page.evaluate(() =>
            Array.from(document.body.querySelectorAll<HTMLElement>('*'))
                .filter((element) => {
                    const rect = element.getBoundingClientRect();
                    return (
                        rect.width > 0 &&
                        rect.right > innerWidth + 1 &&
                        getComputedStyle(element).visibility !== 'hidden'
                    );
                })
                .map((element) => ({
                    tag: element.tagName,
                    text: element.textContent?.slice(0, 100),
                    width: element.getBoundingClientRect().width,
                    right: element.getBoundingClientRect().right,
                }))
                .slice(-12),
        );
        expect(overflow).toEqual([]);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
    });

test('Wave8: líquido zero mantém bloqueadores brutos e links dos mecanismos existentes', async ({
    page,
}) => {
    await fixture(page);
    await page.goto(`/spaces/${spaceId}/closure`);
    await expect(page.getByText('Lucas deve a Ana').first()).toBeVisible();
    await expect(page.getByText('Ana deve a Lucas').first()).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: 'Revisar confirmação final',
            exact: true,
        }),
    ).toBeDisabled();
    await expect(
        page.getByRole('link', {
            name: 'Registrar transferência',
            exact: true,
        }),
    ).toHaveAttribute(
        'href',
        `/spaces/${spaceId}/finances/settlements/transfers/new`,
    );
    await page
        .getByText('Escolher pendências para compensação', { exact: true })
        .click();
    await page
        .getByRole('button', {
            name: 'Selecionar todas as pendências',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('link', { name: 'Registrar compensação', exact: true }),
    ).toHaveAttribute(
        'href',
        `/spaces/${spaceId}/finances/settlements/offsets/new?obligationIds=60000000-0000-4000-8000-000000000001,60000000-0000-4000-8000-000000000002`,
    );
});

test('Wave8: resultado incerto repete exatamente a mesma solicitação e chave', async ({
    page,
}) => {
    const state = await fixture(page, { active: true, retryStart: true });
    await page.goto(`/spaces/${spaceId}/closure`);
    await page.getByLabel('Entendi o corte inicial').check();
    await page
        .getByRole('button', { name: 'Iniciar encerramento', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Reenviar a mesma tentativa' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Iniciar encerramento', exact: true }),
    ).toBeDisabled();
    await page
        .getByRole('button', { name: 'Reenviar a mesma tentativa' })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Data de corte', exact: true }),
    ).toBeVisible();
    expect(state.requests).toHaveLength(2);
    expect(state.requests[0]).toEqual(state.requests[1]);
    expect(state.requests[0].key).toBeTruthy();
});

test('Wave8: conflito invalida a revisão local e exige nova conferência', async ({
    page,
}) => {
    const state = await fixture(page, { conflictCutoff: true });
    await page.goto(`/spaces/${spaceId}/closure`);
    await page.getByLabel('Nova data de corte').fill('2099-01-10');
    await page
        .getByRole('button', { name: 'Conferir nova data', exact: true })
        .click();
    await page.getByLabel('Entendi que a nova data').check();
    await page
        .getByRole('button', {
            name: 'Confirmar proposta de corte',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('alert').filter({ hasText: 'Os dados mudaram' }),
    ).toBeVisible();
    await expect(
        page.getByText('Revisão 2 · Rascunho', { exact: false }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: 'Confirmar proposta de corte',
            exact: true,
        }),
    ).toHaveCount(0);
    expect(state.requests).toHaveLength(1);
});

test('Wave8: resposta de outro contexto não permite decisões', async ({
    page,
}) => {
    const state = await fixture(page, { wrongContext: true });
    await page.goto(`/spaces/${spaceId}/closure`);
    await expect(
        page
            .getByRole('alert')
            .filter({ hasText: 'Não foi possível atualizar' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Iniciar encerramento', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('heading', {
            name: 'Plano de encerramento',
            exact: true,
        }),
    ).toHaveCount(0);
    expect(state.requests).toHaveLength(0);
});

test('Wave8: trocar o espaço descarta diagnóstico atrasado', async ({
    page,
}) => {
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
        release = resolve;
    });
    const state = await fixture(page, { delayDiagnostic: delayed });
    await page.goto(`/spaces/${spaceId}/closure`);
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(spaceId);
    await page
        .getByRole('combobox', { name: 'Espaço atual', exact: true })
        .selectOption(personalId);
    release();
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(personalId);
    await expect(page.getByText('Lucas deve a Ana')).toHaveCount(0);
    await expect(
        page.getByRole('heading', {
            name: 'Plano de encerramento',
            exact: true,
        }),
    ).toHaveCount(0);
    expect(state.requests).toHaveLength(0);
});

test('Wave8: CLOSED oferece histórico sem comandos de negócio', async ({
    page,
}) => {
    const state = await fixture(page, { closed: true });
    await page.goto(`/spaces/${spaceId}/closure`);
    await expect(
        page.getByRole('heading', {
            name: 'Histórico do encerramento',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByText('Encerramento solicitado · revisão 1', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: /Confirmar|Iniciar|Salvar|Registrar/,
        }),
    ).toHaveCount(0);
    await page
        .getByText('Consultar estado registrado', { exact: true })
        .click();
    await expect(
        page.getByText('Plano aprovado · Corte em', { exact: false }),
    ).toBeVisible();
    expect(state.requests).toHaveLength(0);
});
