import { expect, test } from '@playwright/test';
const personId = '10000000-0000-4000-8000-000000000001',
    spaceId = '20000000-0000-4000-8000-000000000001',
    id = '40000000-0000-4000-8000-000000000001';
for (const width of [320, 390, 768, 1280]) {
    test(`Wave5: revisão e histórico sem sobreposição em ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        let version = 1,
            amount = 10000;
        await page.route('**/v2/**', async (route) => {
            const path = new URL(route.request().url()).pathname;
            const headers = {
                'Access-Control-Allow-Origin': 'http://localhost:3200',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Allow-Headers':
                    'Content-Type, X-CSRF-Token, Idempotency-Key',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            };
            if (route.request().method() === 'OPTIONS')
                return route.fulfill({ status: 204, headers });
            const space = {
                id: spaceId,
                label: 'Meu espaço',
                type: 'PERSONAL',
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
                    personalSpace: space,
                };
            else if (path.endsWith('/auth/csrf'))
                json = { csrfToken: 'test-csrf' };
            else if (path === '/v2/spaces') json = { items: [space] };
            else if (path === `/v2/spaces/${spaceId}`)
                json = {
                    space,
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
            else if (path.endsWith('/versions'))
                json = { version, targets: [{ id }], versions: [] };
            else if (path.endsWith('/reversals'))
                json = { items: [], nextCursor: null };
            else if (path.endsWith('/adjustment-preview'))
                json = {
                    commitmentId: id,
                    currentVersion: version,
                    amountInCents: amount,
                    proposedAmountInCents: 9000,
                    proposedRemainingAmountInCents: 9000,
                    eligible: true,
                    requiresAcceptance: false,
                    cashImpactInCents: '0',
                };
            else if (path.endsWith('/adjustments')) {
                version++;
                amount = 9000;
                json = {
                    commitmentId: id,
                    version,
                    eligible: true,
                    replayed: false,
                };
            } else if (path.endsWith(`/financial-commitments/${id}`))
                json = {
                    spaceId,
                    commitment: {
                        id,
                        version,
                        kind: 'INCOME',
                        modality: 'ONE_TIME',
                        description:
                            'Receita prevista para conferir sem pressa',
                        amountInCents: amount,
                    },
                    receipts: [],
                    adjustments:
                        version > 1
                            ? [
                                  {
                                      id: 'adjustment',
                                      direction: 'DECREASE',
                                      amountInCents: 1000,
                                      reason: 'Desconto combinado',
                                      factDate: '2026-10-19',
                                  },
                              ]
                            : [],
                };
            else
                return route.fulfill({
                    status: 404,
                    headers,
                    json: {
                        code: 'NOT_FOUND',
                        message: 'Fixture não definida',
                    },
                });
            return route.fulfill({ headers, json });
        });
        await page.goto(`/spaces/${spaceId}/finances/commitments/${id}`);
        await page
            .getByLabel('Motivo', { exact: true })
            .fill('Desconto combinado');
        await page
            .getByLabel('Valor da diferença (R$)', { exact: true })
            .fill('10,00');
        await page
            .getByRole('button', { name: 'Revisar efeito', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Confira o efeito' }),
        ).toBeVisible();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        await page
            .getByRole('button', { name: 'Confirmar operação', exact: true })
            .click();
        await expect(
            page.getByRole('status').filter({ hasText: 'Operação registrada' }),
        ).toBeVisible();
        await page
            .getByRole('combobox', { name: 'Operação', exact: true })
            .selectOption('CANCEL');
        await expect(
            page.getByText('O cancelamento só é permitido sem realização.', {
                exact: false,
            }),
        ).toBeVisible();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
    });
}
