import { expect, test, type Page, type Request } from '@playwright/test';
import type { RecurringChangeImpact } from '../../src/features/finances/types/recurring-commitment';

const personId = '10000000-0000-4000-8000-000000000001';
const spaceId = '20000000-0000-4000-8000-000000000001';
const commitmentId = '40000000-0000-4000-8000-000000000001';
const members = [
    {
        memberId: '30000000-0000-4000-8000-000000000001',
        personId,
        displayName: 'Lucas',
    },
    {
        memberId: '30000000-0000-4000-8000-000000000002',
        personId: '10000000-0000-4000-8000-000000000002',
        displayName: 'Ana',
    },
];

async function setup(
    page: Page,
    shared: boolean,
    respond: (path: string, request: Request) => unknown,
) {
    const space = {
        id: spaceId,
        label: 'Espaço de teste',
        type: shared ? 'SHARED' : 'PERSONAL',
        status: 'ACTIVE',
        version: 2,
    };
    const personalSpace = shared
        ? {
              ...space,
              id: '20000000-0000-4000-8000-000000000002',
              type: 'PERSONAL',
          }
        : space;
    const writes: { path: string; method: string; body: unknown }[] = [];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install({ time: new Date('2026-10-19T15:00:00Z') });
    await page.addInitScript(
        ({ personId, spaceId }) =>
            sessionStorage.setItem(
                `prospera-mais:space-context:v1:${personId}`,
                spaceId,
            ),
        { personId, spaceId },
    );
    await page.route('**/v2/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const headers = {
            'Access-Control-Allow-Origin': 'http://localhost:3200',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Headers':
                'Content-Type, X-CSRF-Token, Idempotency-Key',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        };
        if (request.method() === 'OPTIONS')
            return route.fulfill({ status: 204, headers });
        if (request.method() !== 'GET')
            writes.push({
                path,
                method: request.method(),
                body: request.postDataJSON(),
            });
        let json: unknown;
        if (path.endsWith('/auth/me'))
            json = {
                person: {
                    id: personId,
                    displayName: 'Lucas',
                    email: 'lucas@example.test',
                },
                personalSpace,
            };
        else if (path.endsWith('/auth/csrf'))
            json = { csrfToken: 'contract-csrf' };
        else if (path === '/v2/spaces')
            json = { items: shared ? [personalSpace, space] : [space] };
        else if (path === `/v2/spaces/${spaceId}`)
            json = {
                space,
                actorMembership: shared
                    ? { id: members[0].memberId, personId, status: 'ACTIVE' }
                    : null,
                activeMemberCount: shared ? 2 : 0,
                invitation: null,
            };
        else if (path.endsWith('/financial-entry-context'))
            json = {
                spaceId,
                spaceType: space.type,
                status: 'ACTIVE',
                version: 2,
                actorMemberId: members[0].memberId,
                members,
            };
        else if (path.endsWith('/income-options'))
            json = {
                spaceId,
                spaceType: space.type,
                status: 'ACTIVE',
                canCreate: true,
                referenceDate: '2026-10-19',
            };
        else json = respond(path, request);
        return route.fulfill({
            status: json === undefined ? 404 : 200,
            headers,
            json: json ?? {
                code: 'NOT_FOUND',
                message: `Fixture ausente: ${path}`,
            },
        });
    });
    return writes;
}

test('proposals render recurring fixed totals and variable weights alongside nonrecurring money', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const recurringImpact: RecurringChangeImpact = {
        effectiveFrom: '2026-11-01',
        assessmentThrough: '2028-11-30',
        currentVersion: 1,
        proposedVersion: 2,
        currentOccurrences: ['2026-11-20', '2026-12-20'],
        proposedOccurrences: ['2026-11-20', '2026-12-20', '2027-01-20'],
        impactByMember: [
            {
                memberId: members[0].memberId,
                currentFixedAmountInCents: '12345',
                proposedFixedAmountInCents: '23456',
                fixedDeltaInCents: '11111',
                currentVariableWeight: 10000,
                proposedVariableWeight: 18000,
                variableWeightDelta: 8000,
                currentOccurrenceCount: 2,
                proposedOccurrenceCount: 3,
                requiresAcceptance: true,
            },
        ],
        requiresAcceptance: true,
        materializedOccurrencesPreserved: [
            {
                referenceDate: '2026-11-20',
                status: 'FULFILLED',
                economicVersion: 1,
            },
        ],
    };
    const proposal = {
        commitmentId,
        version: 1,
        baseVersion: 1,
        recipientMemberId: members[0].memberId,
        proposedByMemberId: members[1].memberId,
        effectiveFrom: '2026-11-01',
        registeredAt: '2026-10-19T15:00:00Z',
        status: 'PROPOSED',
    };
    await setup(page, true, (path) =>
        path.endsWith('/financial-change-proposals')
            ? {
                  items: [
                      {
                          ...proposal,
                          id: 'recurring-proposal',
                          configuration: {
                              description: 'Alteração recorrente',
                          },
                          impact: recurringImpact,
                      },
                      {
                          ...proposal,
                          id: 'one-time-proposal',
                          configuration: { description: 'Alteração avulsa' },
                          impact: {
                              commitmentId,
                              currentVersion: 1,
                              eligible: true,
                              requiresAcceptance: true,
                              currentAmountInCents: '10000',
                              proposedAmountInCents: '12000',
                              impactByMember: [
                                  {
                                      memberId: members[0].memberId,
                                      currentAmountInCents: '5000',
                                      proposedAmountInCents: '6000',
                                      deltaInCents: '1000',
                                      requiresAcceptance: true,
                                  },
                              ],
                          },
                      },
                  ],
                  nextCursor: null,
                  totalCount: 2,
              }
            : undefined,
    );
    await page.goto(`/spaces/${spaceId}/finances/changes`);
    const recurring = page.getByRole('article').filter({
        has: page.getByRole('heading', {
            name: 'Alteração recorrente',
            exact: true,
        }),
    });
    await expect(
        recurring.getByText('R$ 123,45', { exact: true }),
    ).toBeVisible();
    await expect(
        recurring.getByText('R$ 234,56', { exact: true }),
    ).toBeVisible();
    await expect(
        recurring.getByText('R$ 111,11', { exact: true }),
    ).toBeVisible();
    await expect(
        recurring.getByText('Soma das participações nas ocorrências — antes', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        recurring.getByText('Soma das participações nas ocorrências — depois', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(recurring.getByText('100%', { exact: true })).toBeVisible();
    await expect(recurring.getByText('180%', { exact: true })).toBeVisible();
    await expect(
        recurring.getByText('80 pontos percentuais', { exact: true }),
    ).toBeVisible();
    await expect(
        recurring.getByText('Ocorrências previstas: 2 antes · 3 depois.'),
    ).toBeVisible();
    await expect(
        recurring.getByText('Ocorrências já registradas preservadas: 1.'),
    ).toBeVisible();
    await expect(
        recurring.getByText('Período avaliado: 01/11/2026 até 30/11/2028.'),
    ).toBeVisible();
    await recurring.getByRole('button', { name: 'Revisar aceite' }).click();
    await expect(
        recurring.getByRole('button', { name: 'Confirmar aceite' }),
    ).toBeVisible();
    const oneTime = page.getByRole('article').filter({
        has: page.getByRole('heading', {
            name: 'Alteração avulsa',
            exact: true,
        }),
    });
    await expect(oneTime.getByText('R$ 50,00', { exact: true })).toBeVisible();
    await expect(oneTime.getByText('R$ 60,00', { exact: true })).toBeVisible();
    await expect(oneTime.getByText('R$ 10,00', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
});

test('variable income defines its pending value before offering a receipt', async ({
    page,
}) => {
    const root = {
        id: commitmentId,
        spaceId,
        kind: 'INCOME',
        scope: 'PERSONAL',
        description: 'Receita variável',
        valueMode: 'VARIABLE',
        amountInCents: null,
        expectedAmountInCents: 15000,
        recurrence: { frequency: 'MONTHLY', dayOfMonth: 20 },
        startsOn: '2026-10-01',
        endsOn: null,
        version: 1,
        economicVersion: 1,
        effectiveFrom: '2026-10-01',
        terminatedOn: null,
        versions: [],
        nextOccurrence: { referenceDate: '2026-10-20', amountInCents: null },
    };
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
    const writes = await setup(page, false, (path, request) => {
        if (path.endsWith('/value') && request.method() === 'PUT') {
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
        if (path.endsWith('/options'))
            return {
                commitment: root,
                occurrence,
                suggestedSettlement: null,
                openCycles: [],
                nextCursor: null,
            };
        if (path.endsWith('/occurrences'))
            return { commitmentId, month: '2026-10', items: [occurrence] };
        if (path.endsWith(commitmentId)) return { commitment: root };
    });
    await page.goto(
        `/spaces/${spaceId}/recurring-commitments/${commitmentId}?month=2026-10`,
    );
    await page.getByRole('button', { name: 'Abrir ocorrência' }).click();
    const action = page.getByRole('combobox', { name: 'Ação', exact: true });
    await expect(action).toHaveValue('VALUE');
    await expect(page.getByLabel('Data do fato', { exact: true })).toHaveCount(
        0,
    );
    await action.selectOption('CANCEL');
    await expect(action).toHaveValue('CANCEL');
    await action.selectOption('VALUE');
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
    expect(writes).toEqual([
        {
            path: `/v2/spaces/${spaceId}/recurring-commitments/${commitmentId}/occurrences/2026-10-20/value`,
            method: 'PUT',
            body: {
                expectedCommitmentVersion: 1,
                expectedOccurrenceVersion: 1,
                amountInCents: 17345,
            },
        },
    ]);
    await action.selectOption('RECEIPT');
    await expect(page.getByLabel('Valor realizado (R$)')).toBeVisible();
});
