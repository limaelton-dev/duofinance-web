import { expect, test, type Page } from '@playwright/test';

const actorId = '10000000-0000-4000-8000-000000000011';
const spaceId = '20000000-0000-4000-8000-000000000011';
const commitmentId = '40000000-0000-4000-8000-000000000011';
const personal = {
    id: spaceId,
    type: 'PERSONAL',
    label: 'Meu espaço',
    status: 'ACTIVE',
    version: 1,
};
const receipt = {
    id: 'receipt',
    amountInCents: 6000,
    factDate: '2026-10-19',
    registeredAt: '2026-10-19T15:00:00Z',
    recordedByPersonId: actorId,
    recipientPersonId: actorId,
    recipientMemberId: null,
};
const income = {
    spaceId,
    spaceType: 'PERSONAL',
    commitment: {
        id: commitmentId,
        kind: 'INCOME',
        modality: 'ONE_TIME',
        version: 1,
        description: 'Reembolso de uma compra para a casa',
        amountInCents: 10000,
        expectedReceiptDate: '2026-10-19',
        registeredAt: '2026-10-19T15:00:00Z',
        createdByPersonId: actorId,
        ownerPersonId: actorId,
    },
    receipt,
    receipts: [receipt],
    status: 'PARTIALLY_RECEIVED',
    receivedAmountInCents: 6000,
    remainingAmountInCents: 4000,
    obligation: null,
    obligations: [],
    settlementCycle: null,
    replayed: false,
};

async function fixture(
    page: Page,
    uncertain = false,
    extendedForecast = false,
) {
    const sent: { body: unknown; key: string | undefined }[] = [];
    await page.route('**/v2/**', async (route) => {
        const request = route.request(),
            url = new URL(request.url()),
            path = url.pathname;
        const headers = {
            'Access-Control-Allow-Origin':
                request.headers()['origin'] ?? 'http://localhost:3200',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Headers':
                'Content-Type, X-CSRF-Token, Idempotency-Key',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        };
        if (request.method() === 'OPTIONS')
            return route.fulfill({ status: 204, headers });
        let json: unknown;
        if (path.endsWith('/auth/me'))
            json = {
                person: {
                    id: actorId,
                    displayName: 'Alex',
                    email: 'alex@example.test',
                },
                personalSpace: personal,
            };
        else if (path.endsWith('/auth/csrf'))
            json = { csrfToken: 'synthetic-csrf' };
        else if (path === '/v2/spaces') json = { items: [personal] };
        else if (path === `/v2/spaces/${spaceId}`)
            json = {
                space: personal,
                actorMembership: null,
                activeMemberCount: 0,
                invitation: null,
            };
        else if (path.endsWith('/income-options'))
            json = {
                spaceId,
                spaceType: 'PERSONAL',
                status: 'ACTIVE',
                canCreate: true,
                referenceDate: '2026-10-19',
            };
        else if (path.endsWith('/incomes') && request.method() === 'POST') {
            sent.push({
                body: request.postDataJSON(),
                key: request.headers()['idempotency-key'],
            });
            if (uncertain && sent.length === 1) return route.abort('failed');
            return route.fulfill({ status: 201, headers, json: income });
        } else if (path.endsWith('/incomes'))
            json = {
                spaceId,
                items: [
                    {
                        id: commitmentId,
                        description: income.commitment.description,
                        amountInCents: 10000,
                        expectedReceiptDate: '2026-10-19',
                        status: 'PARTIALLY_RECEIVED',
                        receivedAmountInCents: 6000,
                        remainingAmountInCents: 4000,
                    },
                ],
                nextCursor: null,
            };
        else if (path.endsWith(`/financial-commitments/${commitmentId}`))
            json = income;
        else if (path.endsWith('/receipt-options'))
            json = {
                spaceId,
                spaceType: 'PERSONAL',
                commitmentId,
                canReceive: false,
                referenceDate: '2026-10-19',
                expectedCommitmentVersion: 1,
                amountInCents: 10000,
                receivedAmountInCents: 6000,
                remainingAmountInCents: 4000,
            };
        else if (path.endsWith('/financial-overview'))
            json = {
                spaceId,
                spaceType: 'PERSONAL',
                month: url.searchParams.get('month'),
                memberId: null,
                members: [],
                referenceDate: '2026-10-19',
                byMember: [],
                totals: {
                    expenseAmountInCents: '10000',
                    realizedIncomeAmountInCents: '6000',
                    economicResultInCents: '-4000',
                    paidAmountInCents: '5000',
                    receivedAmountInCents: '6000',
                    assumedAmountInCents: '5000',
                    externalSettledAmountInCents: '1000',
                    disbursedAmountInCents: '6000',
                    supportedAmountInCents: '10000',
                    internalTransfersSentAmountInCents: '0',
                    internalTransfersReceivedAmountInCents: '0',
                },
                currentExternalLiabilities: {
                    referenceDate: '2026-10-19',
                    outstandingAmountInCents: '4000',
                    byMember: [],
                },
            };
        else if (path.endsWith('/financial-timeline'))
            json = {
                spaceId,
                spaceType: 'PERSONAL',
                month: url.searchParams.get('month'),
                memberId: null,
                members: [],
                referenceDate: '2026-10-19',
                view: url.searchParams.get('view'),
                items: [],
                nextCursor: null,
            };
        else if (path.endsWith('/financial-forecast'))
            json = {
                spaceId,
                spaceType: 'PERSONAL',
                month: url.searchParams.get('month'),
                memberId: null,
                members: [],
                referenceDate: '2026-10-19',
                totals: {
                    expectedAmountInCents: '0',
                    receivedAmountInCents: '0',
                    remainingAmountInCents: '0',
                    ...(extendedForecast
                        ? {
                              expectedExpenseAmountInCents: '10000',
                              fulfilledExpenseAmountInCents: '4000',
                              remainingExpenseAmountInCents: '6000',
                              unknownAmountCount: 1,
                          }
                        : {}),
                },
                globalCorrections: extendedForecast
                    ? [
                          {
                              commitmentId,
                              globalAdjustmentInCents: '-2000',
                              globalRemainingAmountInCents: '18000',
                          },
                      ]
                    : [],
                items: extendedForecast
                    ? [
                          {
                              id: 'occurrence',
                              type: 'EXPECTED_EXPENSE',
                              commitmentId,
                              externalLiabilityId: null,
                              description: 'Energia com valor a definir',
                              amountInCents: null,
                              expectedAmountInCents: null,
                              receivedAmountInCents: 0,
                              fulfilledAmountInCents: 0,
                              remainingAmountInCents: null,
                              overdue: true,
                              relevantDate: '2026-10-10',
                              dateNature: 'EXPECTED',
                              registeredAt: '2026-10-01T15:00:00Z',
                              recordedByPersonId: actorId,
                              participantMemberId: null,
                              participantPersonId: actorId,
                              recipientMemberId: null,
                              memberIds: [],
                          },
                      ]
                    : [],
                nextCursor: null,
            };
        else if (path.endsWith('/personal-expenses'))
            json = { spaceId, items: [], nextCursor: null };
        else
            return route.fulfill({
                status: 404,
                headers,
                json: { code: 'NOT_FOUND', message: 'Fixture não definida' },
            });
        return route.fulfill({ status: 200, headers, json });
    });
    return sent;
}

async function noOverflow(page: Page) {
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    const controls = await page
        .locator('main input:not([type="radio"]), main select, main button')
        .evaluateAll((elements) =>
            elements
                .filter((e) => e.getBoundingClientRect().width > 0)
                .map((e) => e.getBoundingClientRect().height),
        );
    expect(controls.every((height) => height >= 48)).toBe(true);
}

for (const width of [320, 390, 768, 1280]) {
    test(`receita parcial, confirmação e detalhe em ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        const sent = await fixture(page);
        await page.goto(`/spaces/${spaceId}/incomes/new`);
        await page
            .getByLabel('Descrição', { exact: true })
            .fill(income.commitment.description);
        await page
            .getByLabel('Valor total (R$)', { exact: true })
            .fill('100,00');
        await page.getByLabel('Sim, informar valor', { exact: true }).check();
        await page
            .getByLabel('Valor recebido agora (R$)', { exact: true })
            .fill('60,00');
        await page
            .getByRole('button', { name: 'Revisar receita', exact: true })
            .click();
        const review = page.getByRole('group', {
            name: 'Confirmar receita',
            exact: true,
        });
        await expect(review).toContainText('R$ 40,00');
        await noOverflow(page);
        await review
            .getByRole('button', { name: 'Confirmar receita', exact: true })
            .click();
        await expect(
            page.getByRole('heading', {
                name: 'Receita registrada',
                exact: true,
            }),
        ).toBeFocused();
        expect(sent).toHaveLength(1);
        expect(sent[0].body).toMatchObject({
            amountInCents: 10000,
            receipt: { amountInCents: 6000 },
        });
        await expect(
            page.getByText('Receita parcialmente recebida.', { exact: true }),
        ).toBeVisible();
        await noOverflow(page);
        await page
            .getByRole('link', { name: 'Ver receita', exact: true })
            .click();
        await expect(
            page.getByRole('link', {
                name: 'Histórico e correções',
                exact: true,
            }),
        ).toHaveAttribute(
            'href',
            `/spaces/${spaceId}/finances/commitments/${commitmentId}`,
        );
        await expect(
            page.getByRole('heading', {
                name: 'Recebimentos realizados',
                exact: true,
            }),
        ).toBeVisible();
        await noOverflow(page);
    });

    test(`revisão econômica e previsão vazia em ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        await fixture(page);
        await page.goto(`/spaces/${spaceId}/finances`);
        await expect(
            page.getByRole('definition').filter({ hasText: '-R$ 40,00' }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', {
                name: 'Planejar compromisso',
                exact: true,
            }),
        ).toHaveAttribute('href', `/spaces/${spaceId}/finances/planning`);
        await expect(
            page.getByRole('heading', { name: 'Em aberto agora', exact: true }),
        ).toBeVisible();
        await noOverflow(page);
        await page
            .getByRole('button', { name: 'Compromissos', exact: true })
            .click();
        await page
            .getByLabel('Visão financeira', { exact: true })
            .selectOption('FORECAST');
        await expect(
            page.getByText(
                'Nenhum compromisso futuro conhecido neste período.',
                { exact: true },
            ),
        ).toBeVisible();
        await noOverflow(page);
    });
}

test('resultado incerto preserva a mesma tentativa de receita', async ({
    page,
}) => {
    const sent = await fixture(page, true);
    await page.goto(`/spaces/${spaceId}/incomes/new`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill(income.commitment.description);
    await page.getByLabel('Valor total (R$)', { exact: true }).fill('100,00');
    await page
        .getByRole('button', { name: 'Revisar receita', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar receita', exact: true })
        .click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Ainda não conseguimos confirmar o registro',
    );
    await expect(page.getByLabel('Descrição', { exact: true })).toBeDisabled();
    await page
        .getByRole('button', {
            name: 'Reenviar a mesma tentativa',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Receita registrada', exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
});

test('previsão separa despesas, valores desconhecidos e correções globais', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await fixture(page, false, true);
    await page.goto(`/spaces/${spaceId}/finances`);
    await page
        .getByRole('button', { name: 'Compromissos', exact: true })
        .click();
    await page
        .getByLabel('Visão financeira', { exact: true })
        .selectOption('FORECAST');
    const future = page.getByRole('list', {
        name: 'Compromissos futuros conhecidos',
        exact: true,
    });
    await expect(future).toContainText('Despesa prevista: Valor a definir');
    await expect(future).not.toContainText('Despesa prevista: R$ 0,00');
    await expect(future).toContainText(
        'Em atraso. A data prevista original foi preservada.',
    );
    await expect(
        future.getByRole('link', {
            name: 'Ver compromisso: Energia com valor a definir',
            exact: true,
        }),
    ).toHaveAttribute(
        'href',
        `/spaces/${spaceId}/finances/commitments/${commitmentId}`,
    );
    await expect(
        page
            .getByText('Restante das despesas previstas', { exact: true })
            .locator('..'),
    ).toContainText('R$ 60,00');
    const corrections = page.getByRole('region', {
        name: 'Correções globais de planos',
        exact: true,
    });
    await expect(corrections).toContainText('-R$ 20,00');
    await expect(corrections).toContainText('R$ 180,00');
    await expect(corrections).toContainText(
        'não são abatidos das parcelas ou dos totais mensais',
    );
    await noOverflow(page);
});
