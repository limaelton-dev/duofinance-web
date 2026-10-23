import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Keep the browser's civil date aligned with the mocked API reference date.
test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-19T15:00:00Z'));
});
import type { Today, TodayBlock } from '../../src/features/today/types/today';
import type { ExpenseResult } from '../../src/features/finances/types/shared-expense';
import type { SettlementCycle } from '../../src/features/finances/types/settlement-cycle';

const actorId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const personalId = '20000000-0000-4000-8000-000000000001';
const spaceId = '20000000-0000-4000-8000-000000000002';
const memberId = '30000000-0000-4000-8000-000000000001';
const otherMemberId = '30000000-0000-4000-8000-000000000002';
const commitmentId = '40000000-0000-4000-8000-000000000001';
const members = [
    { memberId, personId: actorId, displayName: 'Lucas' },
    { memberId: otherMemberId, personId: otherId, displayName: 'Ana' },
];
const shared = {
    id: spaceId,
    type: 'SHARED',
    label: 'Nossa casa',
    status: 'ACTIVE',
    version: 1,
};
const personal = {
    id: personalId,
    type: 'PERSONAL',
    label: 'Meu espaço',
    status: 'ACTIVE',
    version: 1,
};
const cycle: SettlementCycle = {
    id: '50000000-0000-4000-8000-000000000001',
    version: 1,
    targetDate: '2026-10-25',
    status: 'OPEN',
    isOverdue: false,
    obligationCount: 2,
    openObligationCount: 2,
    totals: {
        originalAmountInCents: '20000',
        recognizedAmountInCents: '20000',
        resolvedAmountInCents: '0',
        transferredAmountInCents: '0',
        remainingAmountInCents: '20000',
    },
    position: {
        payableAmountInCents: '20000',
        receivableAmountInCents: '0',
        net: { direction: 'PAYABLE', amountInCents: '20000' },
    },
};
const block = (
    kind: TodayBlock['kind'],
    items: TodayBlock['items'] = [],
): TodayBlock => ({
    kind,
    status: 'AVAILABLE',
    items,
    totalCount: items.length,
    knownTotalCount: items.length,
    hasMore: false,
});
const today: Today = {
    spaceId,
    spaceType: 'SHARED',
    spaceStatus: 'ACTIVE',
    referenceDate: '2026-10-19',
    finance: {
        status: 'AVAILABLE',
        data: {
            upcomingCommitments: { items: [], totalCount: 0 },
            settlements: {
                actorMemberId: memberId,
                members,
                nextCycle: cycle,
                overdueCycles: { items: [], totalCount: 0 },
            },
        },
    },
    routine: {
        status: 'AVAILABLE',
        data: {
            items: [],
            counts: {
                totalCount: 0,
                today: 0,
                overdue: 0,
                urgent: 0,
                upcoming: 0,
                noDeadline: 0,
            },
            hasMore: false,
            referenceDate: '2026-10-19',
            referenceInstant: '2026-10-19T15:00:00Z',
        },
    },
    shopping: {
        status: 'AVAILABLE',
        data: {
            spaceId,
            actorMemberId: memberId,
            referenceDate: '2026-10-19',
            referenceInstant: '2026-10-19T15:00:00Z',
            items: [],
            totalCount: 0,
            activeListCount: 0,
        },
    },
    closure: { status: 'AVAILABLE', data: null },
    capabilities: { spaceClosureAttention: 'SUPPORTED' },
    blocks: [
        block('ATTENTION'),
        block('TODAY', [
            {
                type: 'FINANCIAL_COMMITMENT',
                reference: {
                    type: 'FINANCIAL_COMMITMENT',
                    commitmentId,
                    occurrenceId: null,
                    modality: 'ONE_TIME',
                    expectedDate: '2026-10-19',
                },
                label: 'Reembolso do mercado',
                date: '2026-10-19',
                details: {
                    commitmentId,
                    occurrenceId: null,
                    modality: 'ONE_TIME',
                    kind: 'INCOME',
                    description: 'Reembolso do mercado',
                    expectedDate: '2026-10-19',
                    amountInCents: 12550,
                    expectedAmountInCents: 12550,
                    valuePending: false,
                    fulfilledAmountInCents: 0,
                    remainingAmountInCents: 12550,
                },
            },
        ]),
        block('NEXT_SETTLEMENT', [
            {
                type: 'SETTLEMENT_CYCLE',
                reference: { type: 'SETTLEMENT_CYCLE', cycleId: cycle.id },
                label: 'Acerto de 25/10/2026',
                date: '2026-10-25',
                details: cycle,
            },
        ]),
        block('UPCOMING'),
        block('TASKS'),
        block('SHOPPING'),
    ],
};
const disbursement = {
    id: '60000000-0000-4000-8000-000000000001',
    payerMemberId: otherMemberId,
    recordedByPersonId: actorId,
    method: 'DEBIT' as const,
    amountInCents: 50000,
    factDate: '2026-10-19',
    registeredAt: '2026-10-19T15:00:00Z',
};
const obligation = {
    id: '70000000-0000-4000-8000-000000000001',
    originCommitmentId: commitmentId,
    originDisbursementId: disbursement.id,
    debtorMemberId: memberId,
    creditorMemberId: otherMemberId,
    originalAmountInCents: 20000,
    remainingAmountInCents: 20000,
    status: 'OPEN' as const,
    recognizedAmountInCents: 20000,
    transferredAmountInCents: 0,
    cycleId: null,
};
const expense: ExpenseResult = {
    spaceId,
    status: 'PAID',
    paidAmountInCents: 50000,
    remainingAmountInCents: 0,
    replayed: false,
    disbursement,
    disbursements: [disbursement],
    obligation,
    obligations: [obligation],
    settlementCycle: null,
    commitment: {
        id: commitmentId,
        version: 1,
        kind: 'EXPENSE',
        modality: 'ONE_TIME',
        description: 'Mercado da semana',
        amountInCents: 50000,
        factDate: '2026-10-19',
        registeredAt: '2026-10-19T15:00:00Z',
        createdByPersonId: actorId,
        expectedPayerMemberId: null,
        responsibilitySplit: {
            mode: 'AMOUNTS',
            shares: [
                { memberId, amountInCents: 20000 },
                { memberId: otherMemberId, amountInCents: 30000 },
            ],
            calculatedShares: [
                { memberId, amountInCents: 20000 },
                { memberId: otherMemberId, amountInCents: 30000 },
            ],
        },
        settlementRuleSnapshot: null,
        settlementRuleSourceVersion: 0,
        suggestedTargetDate: null,
    },
};

async function setup(
    page: Page,
    response = today,
    label = 'Nossa casa',
    expenseResponse = expense,
) {
    const submitted: object[] = [];
    await page.addInitScript(
        ({ actorId, spaceId }) =>
            sessionStorage.setItem(
                `junelo:space-context:v1:${actorId}`,
                spaceId,
            ),
        { actorId, spaceId },
    );
    await page.route('http://localhost:3101/v2/**', async (route) => {
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
        let json: unknown;
        if (path.endsWith('/auth/csrf')) json = { csrfToken: 'synthetic-csrf' };
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
        else if (path === '/v2/spaces')
            json = { items: [personal, { ...shared, label }] };
        else if (path.endsWith('/today')) json = response;
        else if (path.endsWith('/financial-entry-context'))
            json = {
                spaceId,
                type: 'SHARED',
                status: 'ACTIVE',
                version: 1,
                actorMemberId: memberId,
                members,
            };
        else if (path.endsWith('/shared-cash-expense-options'))
            json = {
                spaceId,
                type: 'SHARED',
                status: 'ACTIVE',
                version: 1,
                actorMemberId: memberId,
                members,
                referenceDate: '2026-10-19',
                defaultSettlementRule: { rule: null, version: 0 },
                suggestedTargetDate: null,
                openCycles: [],
                nextCursor: null,
            };
        else if (path.endsWith('/default-settlement-rule'))
            json = { spaceId, rule: null, version: 0, updatedAt: null };
        else if (path.endsWith('/shared-cash-expenses')) {
            submitted.push(route.request().postDataJSON());
            json = expenseResponse;
        } else if (path.includes('/financial-commitments/'))
            json = { ...expenseResponse, members };
        else if (path === `/v2/spaces/${spaceId}`)
            json = {
                space: { ...shared, label },
                actorMembership: {
                    id: memberId,
                    personId: actorId,
                    status: 'ACTIVE',
                },
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
        else
            return route.fulfill({
                status: 404,
                headers,
                json: { code: 'NOT_FOUND', message: 'Fixture não definida' },
            });
        return route.fulfill({
            status: path.endsWith('/shared-cash-expenses') ? 201 : 200,
            headers,
            json,
        });
    });
    return submitted;
}

async function noOverflow(page: Page) {
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
}

async function capture(page: Page, name: string) {
    if (!process.env.IMPECCABLE_REVIEW) return;
    await mkdir('.impeccable/review', { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
        path: `.impeccable/review/${name}.png`,
        fullPage: true,
        animations: 'disabled',
    });
}

for (const width of [320, 1280]) {
    test(`seletor de espaço personalizado: troca por teclado em ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        await setup(page);
        await page.goto('/');
        const select = page.getByRole('combobox', {
            name: 'Espaço atual',
            exact: true,
        });
        await select.selectOption(personalId);
        await expect(select).toHaveValue(personalId);
        await select.focus();
        await page.keyboard.press('Alt+ArrowDown');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await expect(select).toHaveValue(spaceId);
        await expect(page.locator('#active-space-status')).toHaveText(
            'Compartilhado · Ativo',
        );
        await expect(select).toBeFocused();
    });
}

for (const width of [320, 768, 1280]) {
    test(`controles personalizados: calendário, limites e foco em ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        const submitted = await setup(page);
        await page.goto(`/spaces/${spaceId}/expenses/new`);
        await page.getByLabel('Descrição', { exact: true }).fill('Mercado');
        await page.getByLabel('Valor (R$)', { exact: true }).fill('100,00');
        const method = page.getByLabel('Forma de pagamento', { exact: true });
        await mkdir('test-results/controls-review', { recursive: true });
        if (
            await page.evaluate(() => CSS.supports('appearance', 'base-select'))
        ) {
            await method.click();
            await expect(
                page.getByRole('option', { name: 'Débito', exact: true }),
            ).toBeVisible();
            await page.screenshot({
                path: `test-results/controls-review/${test.info().project.name}-select-${width}.png`,
            });
            await page
                .getByRole('option', { name: 'Débito', exact: true })
                .click();
        } else {
            // Native platform menus are outside the page in fallback engines.
            await method.selectOption('DEBIT');
        }
        await expect(method).toHaveValue('DEBIT');
        const date = page.getByLabel('Data do pagamento', { exact: true });
        await date.fill('2026-10-19');
        await date.press('Alt+ArrowDown');
        const calendar = page.getByRole('dialog', { name: 'Escolher data' });
        await expect(calendar).toBeVisible();
        await expect(
            calendar.locator('[data-day="2026-10-20"] button'),
        ).toBeDisabled();
        await page.screenshot({
            path: `test-results/controls-review/${test.info().project.name}-date-${width}.png`,
        });
        await calendar.locator('[data-day="2026-10-18"] button').click();
        await expect(date).toHaveValue('2026-10-18');
        await expect(date).toBeFocused();
        await expect(calendar).toBeHidden();
        // Selecting the current day again confirms it instead of unselecting it.
        await date.press('Alt+ArrowDown');
        await calendar.locator('[data-day="2026-10-18"] button').click();
        await expect(calendar).toBeHidden();
        await date.press('Alt+ArrowDown');
        await page.keyboard.press('Escape');
        await expect(date).toBeFocused();
        // Clicking another field must retain focus in that field.
        await date.press('Alt+ArrowDown');
        await page.getByLabel('Valor pago agora (R$)', { exact: true }).click();
        await expect(
            page.getByLabel('Valor pago agora (R$)', { exact: true }),
        ).toBeFocused();
        await expect(calendar).toBeHidden();
        await page.getByLabel('Acerto', { exact: true }).selectOption('NONE');
        await noOverflow(page);
        await page
            .getByRole('button', { name: 'Salvar despesa', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Despesa registrada' }),
        ).toBeVisible();
        expect(submitted).toHaveLength(1);
        expect(submitted[0]).toMatchObject({ factDate: '2026-10-18' });
    });
}

test('controles personalizados: calendário com texto 200%, limpeza e teclado', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await setup(page);
    await page.goto(`/spaces/${spaceId}/expenses/new`);
    await page
        .getByLabel('Forma de pagamento', { exact: true })
        .selectOption('DEBIT');
    await page.addStyleTag({ content: 'html { font-size: 200% }' });
    const date = page.getByLabel('Data do pagamento', { exact: true });
    await date.fill('2026-10-18');
    await date.press('Alt+ArrowDown');
    const calendar = page.getByRole('dialog', { name: 'Escolher data' });
    await expect(calendar).toBeVisible();
    await mkdir('test-results/controls-review', { recursive: true });
    await page.screenshot({
        path: `test-results/controls-review/${test.info().project.name}-date-320-200.png`,
    });
    expect(
        await calendar.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
        ),
    ).toBe(true);
    const day = calendar.locator('[data-day="2026-10-18"] button');
    await day.focus();
    await day.scrollIntoViewIfNeeded();
    expect(
        await day.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: `test-results/controls-review/${test.info().project.name}-date-320-200-days.png`,
    });
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(date).toHaveValue('2026-10-17');
    await date.press('Alt+ArrowDown');
    await calendar.getByRole('button', { name: 'Limpar', exact: true }).click();
    await expect(date).toHaveValue('');
    await expect(date).toBeFocused();
    await noOverflow(page);
});

for (const width of [320, 390, 768, 1280]) {
    test(`interface: fluxo compartilhado e reflow em ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        const submitted = await setup(page);
        await page.goto('/');
        await expect(
            page.getByRole('heading', { name: 'Hoje', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Reembolso do mercado', { exact: true }),
        ).toBeVisible();
        await noOverflow(page);
        expect(
            await page
                .getByRole('banner')
                .evaluate((element) => element.getBoundingClientRect().height),
        ).toBeLessThan(210);
        await capture(
            page,
            width === 390
                ? 'mobile'
                : width === 1280
                  ? 'desktop'
                  : `today-${width}`,
        );
        await page
            .getByRole('button', { name: 'Adicionar', exact: true })
            .click();
        await expect(
            page.getByRole('menuitem', { name: 'Adicionar despesa' }),
        ).toBeVisible();
        await expect(
            page.getByRole('menuitem', { name: 'Adicionar despesa' }),
        ).toHaveCSS('cursor', 'pointer');
        await page.keyboard.press('Escape');
        await expect(
            page.getByRole('button', { name: 'Adicionar', exact: true }),
        ).toBeFocused();
        await page
            .getByRole('button', { name: 'Adicionar', exact: true })
            .click();
        await page.getByRole('menuitem', { name: 'Adicionar despesa' }).click();
        await page
            .getByLabel('Descrição', { exact: true })
            .fill('Mercado da semana');
        await page.getByLabel('Valor (R$)', { exact: true }).fill('500,00');
        await page
            .getByLabel('Divisão', { exact: true })
            .selectOption('AMOUNTS');
        await page.getByLabel('Lucas (R$)', { exact: true }).fill('200,00');
        await page.getByLabel('Ana (R$)', { exact: true }).fill('300,00');
        await page
            .getByLabel('Forma de pagamento', { exact: true })
            .selectOption('DEBIT');
        await page
            .getByLabel('Quem pagou?', { exact: true })
            .selectOption(otherMemberId);
        await page.getByLabel('Acerto', { exact: true }).selectOption('NONE');
        await noOverflow(page);
        await capture(page, `expense-${width}`);
        await page
            .getByRole('button', { name: 'Salvar despesa', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Despesa registrada' }),
        ).toBeVisible();
        expect(submitted).toHaveLength(1);
        expect(submitted[0]).toMatchObject({
            amountInCents: 50000,
            expectedPayerMemberId: null,
            disbursement: { payerMemberId: otherMemberId, method: 'DEBIT' },
            responsibilitySplit: {
                mode: 'AMOUNTS',
                shares: [
                    { memberId, amountInCents: 20000 },
                    { memberId: otherMemberId, amountInCents: 30000 },
                ],
            },
        });
        await expect(
            page.getByRole('region', { name: 'Resumo da despesa' }),
        ).toContainText('Sua parte: R$ 200,00');
        await expect(
            page.getByRole('region', { name: 'Resumo da despesa' }),
        ).toContainText('Lucas deve R$ 200,00 a Ana');
        await noOverflow(page);
        await capture(page, `result-${width}`);
        await page
            .getByRole('link', { name: 'Ver despesa', exact: true })
            .click();
        await expect(
            page.getByRole('heading', {
                name: 'Despesa',
                exact: true,
            }),
        ).toBeVisible();
        await noOverflow(page);
    });
}

for (const viewport of [
    { width: 320, height: 740, textScale: 1 },
    { width: 768, height: 844, textScale: 1 },
    { width: 640, height: 422, textScale: 1 },
    { width: 390, height: 844, textScale: 2 },
    { width: 320, height: 844, textScale: 2 },
]) {
    test(`interface: foco visível com Tab e Shift+Tab em ${viewport.width}px e texto ${viewport.textScale * 100}%`, async ({
        page,
    }) => {
        await page.setViewportSize(viewport);
        await setup(page);
        await page.goto(`/spaces/${spaceId}/expenses/new`);
        if (viewport.textScale > 1) {
            await page.addStyleTag({
                content: `html { font-size: ${viewport.textScale * 100}% }`,
            });
        }
        const description = page.getByLabel('Descrição', { exact: true });
        await expect(description).toBeVisible();
        await description.focus();
        for (const key of ['Tab', 'Shift+Tab']) {
            for (let index = 0; index < 8; index++) {
                await page.keyboard.press(key);
                await expect
                    .poll(() =>
                        page.evaluate(() => {
                            const focused = document.activeElement;
                            if (
                                !(focused instanceof HTMLElement) ||
                                !focused.closest('main')
                            )
                                return true;
                            const rect = focused.getBoundingClientRect();
                            const header = document.querySelector('header');
                            const headerBottom =
                                header &&
                                getComputedStyle(header).position === 'sticky'
                                    ? header.getBoundingClientRect().bottom
                                    : 0;
                            const navigation = document.querySelector(
                                'nav.navigation-glass',
                            );
                            const navigationTop =
                                navigation &&
                                navigation.getBoundingClientRect().height > 0
                                    ? navigation.getBoundingClientRect().top
                                    : window.innerHeight;
                            const visible =
                                rect.top >= headerBottom + 4 &&
                                rect.bottom <= navigationTop - 4;
                            return visible;
                        }),
                    )
                    .toBe(true);
            }
        }
        await noOverflow(page);
        if (viewport.textScale > 1) await capture(page, 'text-200-mobile');
    });
}

test('interface: acesso atualizado em mobile e desktop', async ({ page }) => {
    await page.route('**/v2/auth/csrf', (route) =>
        route.fulfill({ json: { csrfToken: 'synthetic-csrf' } }),
    );
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/login');
        await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Entrar', exact: true }),
        ).toBeEnabled();
        await capture(page, width === 390 ? 'login-mobile' : 'login-desktop');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/register');
    await expect(page.getByLabel('Nome', { exact: true })).toBeVisible();
    await capture(page, 'register-mobile');
});

test('interface: fonte parcial mantém dados saudáveis e nome longo não cobre navegação', async ({
    page,
}) => {
    const partial = structuredClone(today);
    partial.routine = {
        status: 'UNAVAILABLE',
        error: {
            code: 'ROUTINE_TODAY_UNAVAILABLE',
            message: 'Rotina indisponível',
        },
    };
    partial.blocks[1] = {
        ...partial.blocks[1],
        status: 'PARTIAL',
        totalCount: null,
        hasMore: null,
    };
    await setup(
        page,
        partial,
        'Casa compartilhada com um nome muito longo para verificar a leitura e navegação',
    );
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await expect(
        page.getByText('Reembolso do mercado', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Algumas informações não puderam ser carregadas.', {
            exact: false,
        }),
    ).toBeVisible();
    await noOverflow(page);
    await capture(page, 'partial-320');
    await page.emulateMedia({
        forcedColors: 'active',
        reducedMotion: 'reduce',
    });
    await expect(
        page.getByRole('button', { name: 'Adicionar', exact: true }),
    ).toBeVisible();
    expect(
        await page
            .locator('.navigation-glass')
            .first()
            .evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe('none');
});

test('interface: confirmação mantém pendência posterior quando a primeira já foi acertada', async ({
    page,
}) => {
    const multiple = structuredClone(expense);
    const settled = {
        ...obligation,
        remainingAmountInCents: 0,
        status: 'SETTLED' as const,
        transferredAmountInCents: 20000,
    };
    multiple.obligation = settled;
    multiple.obligations = [
        settled,
        { ...obligation, id: '70000000-0000-4000-8000-000000000002' },
    ];
    await setup(page, today, 'Nossa casa', multiple);
    await page.goto(`/spaces/${spaceId}/expenses/${commitmentId}`);
    const summary = page.getByRole('region', { name: 'Resumo da despesa' });
    await expect(summary).toContainText('Lucas deve R$ 200,00 a Ana');
    await expect(summary).not.toContainText('Não há valor a acertar');
});

test('interface: conta mobile alcança Sair com as setas do menu', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Conta e espaços' });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(
        page.getByRole('menuitem', { name: 'Meus espaços' }),
    ).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
        page.getByRole('menuitem', { name: 'Sair', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
});

test('Hoje integra as quatro áreas e mantém as prévias navegáveis mesmo com Finanças indisponível', async ({
    page,
}) => {
    const taskId = '80000000-0000-4000-8000-000000000001';
    const listId = '90000000-0000-4000-8000-000000000001';
    const task = {
        id: taskId,
        spaceId,
        kind: 'ONE_OFF' as const,
        description: 'Levar os documentos',
        creator: { personId: actorId, memberId },
        assignee: { personId: actorId, memberId },
        deadline: { date: '2026-10-18', time: '15:00' },
        urgency: 'URGENT' as const,
        status: 'PENDING' as const,
        version: 1,
        createdAt: '2026-10-18T12:00:00Z',
        completion: null,
        allowedActions: ['COMPLETE'],
        conditions: {
            today: false,
            overdue: true,
            urgent: true,
            upcoming: false,
            noDeadline: false,
            group: 'OVERDUE' as const,
        },
    };
    const list = {
        id: listId,
        name: 'Mercado',
        status: 'ACTIVE' as const,
        summary: {
            activeItemCount: 2,
            actionableItemCount: 1,
            isComplete: false,
        },
        pendingItems: {
            items: [
                {
                    id: 'rice',
                    description: 'Arroz',
                    unit: 'kg',
                    desiredQuantity: '2.5',
                    purchasedQuantity: '1',
                    remainingQuantity: '1.5',
                    status: 'PARTIALLY_PURCHASED' as const,
                },
            ],
            totalCount: 1,
            hasMore: false,
        },
    };
    const closure = {
        spaceId,
        spaceStatus: 'CLOSING' as const,
        processId: 'closure',
        cutoffDate: '2026-10-31',
        actorNextAction: 'REVIEW_PLAN' as const,
    };
    const taskPreview = {
        type: 'TASK' as const,
        reference: {
            type: 'TASK' as const,
            taskId,
            kind: 'ONE_OFF' as const,
            recurrenceId: null,
            scheduledDate: null,
        },
        label: task.description,
        date: task.deadline.date,
        details: task,
    };
    const response: Today = {
        ...today,
        finance: {
            status: 'UNAVAILABLE',
            error: {
                code: 'FINANCE_TODAY_UNAVAILABLE',
                message: 'Indisponível.',
            },
        },
        closure: { status: 'AVAILABLE', data: closure },
        blocks: [
            {
                ...block('ATTENTION', [
                    taskPreview,
                    {
                        type: 'SPACE_CLOSURE',
                        reference: {
                            type: 'SPACE_CLOSURE',
                            processId: 'closure',
                        },
                        label: 'Revisar encerramento',
                        date: null,
                        details: closure,
                    },
                ]),
                status: 'PARTIAL',
                totalCount: null,
                hasMore: null,
            },
            block('TODAY'),
            block('NEXT_SETTLEMENT'),
            block('UPCOMING'),
            block('TASKS', [taskPreview]),
            block('SHOPPING', [
                {
                    type: 'SHOPPING_LIST',
                    reference: { type: 'SHOPPING_LIST', listId },
                    label: 'Mercado',
                    date: null,
                    details: list,
                },
            ]),
        ],
    };
    await setup(page, response);
    await page.goto('/');
    await expect(
        page.getByRole('heading', { name: 'Hoje', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Algumas informações não puderam ser carregadas.', {
            exact: false,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('link', { name: task.description }).first(),
    ).toHaveAttribute('href', `/spaces/${spaceId}/routine/tasks/${taskId}`);
    await expect(
        page.getByRole('link', { name: 'Mercado', exact: true }),
    ).toHaveAttribute('href', `/spaces/${spaceId}/shopping/lists/${listId}`);
    await expect(page.getByText('Arroz: faltam 1,5 kg')).toBeVisible();
    await expect(
        page.getByText('Prazo vencido · Urgente').first(),
    ).toBeVisible();
    await expect(
        page.getByRole('link', { name: 'Revisar encerramento', exact: true }),
    ).toHaveAttribute('href', `/spaces/${spaceId}/closure`);
    await expect(
        page.getByText('Revise o plano para aprovar ou recusar.', {
            exact: false,
        }),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        // The labels remain present at every viewport; hidden navigation has the same destinations.
        const visibleNav = page.locator('nav:visible').filter({
            has: page.getByRole('link', { name: 'Rotina', exact: true }),
        });
        await expect(visibleNav.getByRole('link')).toHaveCount(4);
        await expect(
            visibleNav.getByRole('link', { name: 'Rotina', exact: true }),
        ).toHaveAttribute('href', `/spaces/${spaceId}/routine`);
        await expect(
            visibleNav.getByRole('link', { name: 'Compras', exact: true }),
        ).toHaveAttribute('href', `/spaces/${spaceId}/shopping`);
        await noOverflow(page);
    }
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(
        page.getByRole('menuitem', { name: 'Adicionar tarefa', exact: true }),
    ).toHaveAttribute('href', `/spaces/${spaceId}/routine/new`);
    await expect(
        page.getByRole('menuitem', {
            name: 'Criar lista de compras',
            exact: true,
        }),
    ).toHaveAttribute('href', `/spaces/${spaceId}/shopping?new=1`);
    await page.keyboard.press('Escape');
});

test('controles personalizados: menu preserva links, Home, End, busca e saída por Tab', async ({
    page,
    browserName,
}) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await setup(page);
    await page.goto('/');
    const account = page.getByRole('button', { name: 'Conta e espaços' });
    await account.focus();
    await page.keyboard.press('ArrowUp');
    const logout = page.getByRole('menuitem', { name: 'Sair', exact: true });
    await expect(logout).toBeFocused();
    await page.keyboard.press('Home');
    const spaces = page.getByRole('menuitem', {
        name: 'Meus espaços',
        exact: true,
    });
    await expect(spaces).toBeFocused();
    await expect(spaces).toHaveAttribute('href', '/spaces');
    await page.keyboard.press('End');
    await expect(logout).toBeFocused();
    await page.keyboard.press('m');
    await expect(spaces).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toBeFocused();
    const add = page.getByRole('button', { name: 'Adicionar', exact: true });
    await add.click();
    await page.keyboard.press('End');
    await expect(
        page.getByRole('menuitem', {
            name: 'Criar lista de compras',
            exact: true,
        }),
    ).toBeFocused();
    await page.keyboard.press('p');
    await expect(
        page.getByRole('menuitem', {
            name: 'Planejar compromisso',
            exact: true,
        }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(add).toBeFocused();
    await page.setViewportSize({ width: 320, height: 320 });
    await add.click();
    const bounds = await page.getByRole('menu').boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(320);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 320, height: 844 });
    const textScale = await page.addStyleTag({
        content: 'html { font-size: 200% }',
    });
    await add.click();
    const enlarged = await page.getByRole('menu').boundingBox();
    expect(enlarged!.width).toBeLessThanOrEqual(304);
    expect(enlarged!.x + enlarged!.width).toBeLessThanOrEqual(320);
    expect(
        await page
            .getByRole('menu')
            .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await textScale.evaluate((element) =>
        element.parentNode?.removeChild(element),
    );
    if (browserName === 'chromium') {
        // CDP changes the real VisualViewport scale and width, rather than
        // replacing browser globals with a synthetic viewport object.
        const session = await page.context().newCDPSession(page);
        await session.send('Emulation.setPageScaleFactor', {
            pageScaleFactor: 2,
        });
        await add.focus();
        await page.keyboard.press('Enter');
        const zoomed = await page.getByRole('menu').evaluate((element) => {
            const box = element.getBoundingClientRect();
            const viewport = window.visualViewport!;
            return {
                scale: viewport.scale,
                available: viewport.width - 16,
                width: box.width,
                left: box.left,
                right: box.right,
                viewportLeft: viewport.offsetLeft,
                viewportRight: viewport.offsetLeft + viewport.width,
            };
        });
        expect(zoomed.scale).toBe(2);
        expect(zoomed.width).toBeLessThanOrEqual(zoomed.available);
        expect(zoomed.left).toBeGreaterThanOrEqual(zoomed.viewportLeft);
        expect(zoomed.right).toBeLessThanOrEqual(zoomed.viewportRight);
        await page.keyboard.press('Escape');
        await session.send('Emulation.setPageScaleFactor', {
            pageScaleFactor: 1,
        });
        await session.detach();
    }
});

test('controles personalizados: calendário respeita step, eventos do input e required', async ({
    page,
}) => {
    await setup(page);
    await page.goto(`/spaces/${spaceId}/expenses/new`);
    await page
        .getByLabel('Forma de pagamento', { exact: true })
        .selectOption('DEBIT');
    const date = page.getByLabel('Data do pagamento', { exact: true });
    await date.fill('2026-10-19');
    await date.evaluate((element: HTMLInputElement) => {
        element.min = '2026-10-01';
        element.max = '2026-10-19';
        element.step = '2';
        element.required = true;
        element.dataset.receivedEvents = '';
        for (const type of ['input', 'change'])
            element.addEventListener(type, (event) => {
                if (event.target === element)
                    element.dataset.receivedEvents += `${event.type},`;
            });
    });
    await date.press('Alt+ArrowDown');
    const calendar = page.getByRole('dialog', { name: 'Escolher data' });
    await expect(
        calendar.locator('[data-day="2026-10-18"] button'),
    ).toBeDisabled();
    await expect(
        calendar.locator('[data-day="2026-10-17"] button'),
    ).toBeEnabled();
    await expect(
        calendar.getByRole('button', { name: 'Limpar', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('ArrowLeft');
    await expect(
        calendar.locator('[data-day="2026-10-17"] button'),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(date).toHaveValue('2026-10-17');
    await expect(date).toHaveAttribute('data-received-events', 'input,change,');
    await expect(date).toBeFocused();
    await date.evaluate((element: HTMLInputElement) => {
        element.readOnly = true;
    });
    await date.press('Alt+ArrowDown');
    await expect(calendar).toBeHidden();
});

test('sistema visual: tema, efeitos, teclado e preferência persistem sem perder contexto', async ({
    page,
}) => {
    await setup(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(
        page.getByRole('heading', { name: 'Hoje', exact: true }),
    ).toBeVisible();
    await expect(page.locator('body')).toHaveCSS(
        'background-color',
        'rgb(17, 17, 17)',
    );
    const appearance = page.getByRole('button', {
        name: 'Aparência',
        exact: true,
    });
    await appearance.click();
    const dialog = page.getByRole('dialog', { name: 'Aparência do Junelo' });
    await expect(
        dialog.getByRole('heading', { name: 'Do seu jeito' }),
    ).toBeFocused();
    await dialog.getByRole('radio', { name: 'Claro', exact: true }).check();
    await expect(page.locator('body')).toHaveCSS(
        'background-color',
        'rgb(245, 245, 245)',
    );
    await dialog
        .getByRole('checkbox', { name: /Reduzir efeitos visuais/ })
        .check();
    await dialog.getByRole('button', { name: 'Concluir' }).focus();
    await page.keyboard.press('Tab');
    expect(
        await page.evaluate(() =>
            Boolean(document.activeElement?.closest('dialog')),
        ),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(appearance).toBeFocused();
    await page.reload();
    await expect(
        page.getByRole('heading', { name: 'Hoje', exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute(
        'data-effects',
        'reduced',
    );
    for (const glass of await page.locator('.navigation-glass').all())
        await expect(glass).toHaveCSS('backdrop-filter', 'none');
    await capture(page, 'today-light-opaque-390');
    await appearance.click();
    await dialog.getByRole('radio', { name: 'Escuro', exact: true }).check();
    await dialog.getByRole('button', { name: 'Concluir' }).click();
    await expect(page.locator('body')).toHaveCSS(
        'background-color',
        'rgb(17, 17, 17)',
    );
    await capture(page, 'today-dark-390');
    await noOverflow(page);
});

test('sistema visual: larguras, paisagem e texto ampliado mantêm uma navegação e reflow', async ({
    page,
}) => {
    await setup(page);
    await page.goto('/');
    await expect(
        page.getByRole('heading', { name: 'Hoje', exact: true }),
    ).toBeVisible();
    for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await noOverflow(page);
        const brand = page.getByRole('link', {
            name: 'Junelo, Hoje',
            exact: true,
        });
        await expect(brand).toHaveCount(1);
        const mark = brand.getByRole('img', { name: 'Junelo', exact: true });
        await expect(mark).toBeVisible();
        const markBounds = await mark.boundingBox();
        // Full stacked logo on desktop; the short Ju keeps mobile navigation compact.
        expect(markBounds!.width / markBounds!.height).toBeCloseTo(
            width >= 1024 ? 478 / 450 : 452 / 294,
            1,
        );
        const visible = page.getByRole('navigation', {
            name: 'Navegação principal',
            exact: true,
        });
        await expect(visible).toHaveCount(1);
        await expect(
            visible.getByRole('link', { name: 'Hoje', exact: true }),
        ).toHaveAttribute('aria-current', 'page');
        for (const link of await visible.getByRole('link').all()) {
            const bounds = await link.boundingBox();
            expect(bounds!.width).toBeGreaterThanOrEqual(44);
            expect(bounds!.height).toBeGreaterThanOrEqual(44);
        }
        if (width === 390 || width === 1440)
            await capture(page, `today-${width}`);
        if (width === 390) {
            const row = page.getByRole('article').filter({
                has: page.getByRole('heading', {
                    name: 'Reembolso do mercado',
                    exact: true,
                }),
            });
            const title = await row.getByRole('heading').boundingBox();
            const amountLabel = await row
                .getByText('Falta receber', { exact: true })
                .boundingBox();
            expect(Math.abs(title!.x - amountLabel!.x)).toBeLessThan(1);
        }
    }
    await page.setViewportSize({ width: 640, height: 360 });
    await noOverflow(page);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: 'html { font-size: 200% }' });
    await noOverflow(page);
    await page.getByRole('button', { name: 'Aparência', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Aparência do Junelo' });
    await dialog
        .getByRole('button', { name: 'Concluir' })
        .scrollIntoViewIfNeeded();
    await expect(
        dialog.getByRole('button', { name: 'Concluir' }),
    ).toBeInViewport();
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await capture(page, 'today-text-200-320');
});

test('sistema visual: contraste real de texto e controles em claro e escuro', async ({
    page,
}) => {
    await setup(page);
    await page.goto(`/spaces/${spaceId}/expenses/new`);
    await expect(page.getByLabel('Descrição', { exact: true })).toBeVisible();
    for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        const ratios = await page.evaluate(() => {
            const luminance = (color: string) => {
                const components = color
                    .match(/[\d.]+/g)!
                    .slice(0, 3)
                    .map(Number)
                    .map((value) => {
                        const s = value / 255;
                        return s <= 0.04045
                            ? s / 12.92
                            : ((s + 0.055) / 1.055) ** 2.4;
                    });
                return (
                    components[0] * 0.2126 +
                    components[1] * 0.7152 +
                    components[2] * 0.0722
                );
            };
            const ratio = (a: string, b: string) => {
                const x = luminance(a),
                    y = luminance(b);
                return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
            };
            const body = getComputedStyle(document.body);
            const input = getComputedStyle(
                document.querySelector('main input:not([type="hidden"])')!,
            );
            const root = getComputedStyle(document.documentElement);
            const probe = document.createElement('span');
            probe.style.color = root.getPropertyValue('--muted-foreground');
            document.body.append(probe);
            const secondary = getComputedStyle(probe).color;
            probe.remove();
            return [
                ratio(body.color, body.backgroundColor),
                ratio(secondary, body.backgroundColor),
                ratio(input.color, input.backgroundColor),
                ratio(input.borderColor, input.backgroundColor),
            ];
        });
        expect(ratios[0]).toBeGreaterThanOrEqual(4.5);
        expect(ratios[1]).toBeGreaterThanOrEqual(4.5);
        expect(ratios[2]).toBeGreaterThanOrEqual(4.5);
        expect(ratios[3]).toBeGreaterThanOrEqual(3);
    }
});
