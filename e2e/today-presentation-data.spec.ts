import { expect, test } from '@playwright/test';
import type {
    Today,
    TodayBlock,
    TodayPreviewItem,
} from '../src/features/today/types/today';
import {
    formatTodayReferenceDate,
    shouldShowTodayBlock,
    todayItemHref,
    todayItemKey,
} from '../src/features/today/utils/today-presentation';

const context: Today = {
    spaceId: 'space-a',
    spaceType: 'PERSONAL',
    spaceStatus: 'ACTIVE',
    referenceDate: '2026-10-19',
    finance: {
        status: 'AVAILABLE',
        data: {
            upcomingCommitments: { items: [], totalCount: 0 },
            settlements: null,
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
        status: 'UNAVAILABLE',
        error: {
            code: 'SHOPPING_TODAY_UNAVAILABLE',
            message: 'Compras indisponíveis.',
        },
    },
    closure: { status: 'AVAILABLE', data: null },
    blocks: [],
    capabilities: { spaceClosureAttention: 'SUPPORTED' },
};
const income: Extract<TodayPreviewItem, { type: 'FINANCIAL_COMMITMENT' }> = {
    type: 'FINANCIAL_COMMITMENT',
    label: 'Serviço de outubro',
    date: '2026-10-19',
    reference: {
        type: 'FINANCIAL_COMMITMENT',
        commitmentId: 'income-a',
        occurrenceId: null,
        modality: 'ONE_TIME',
        expectedDate: '2026-10-19',
    },
    details: {
        commitmentId: 'income-a',
        occurrenceId: null,
        modality: 'ONE_TIME',
        kind: 'INCOME',
        description: 'Serviço de outubro',
        expectedDate: '2026-10-19',
        amountInCents: 100000,
        expectedAmountInCents: 100000,
        valuePending: false,
        fulfilledAmountInCents: 30000,
        remainingAmountInCents: 70000,
    },
};
const empty: TodayBlock = {
    kind: 'ATTENTION',
    status: 'AVAILABLE',
    items: [],
    totalCount: 0,
    knownTotalCount: 0,
    hasMore: false,
};

test('partial attention and an unavailable source never become confirmed empty states', () => {
    const partial: TodayBlock = {
        ...empty,
        status: 'PARTIAL',
        items: [income],
        totalCount: null,
        knownTotalCount: 1,
        hasMore: null,
    };
    const unavailable: TodayBlock = {
        ...empty,
        kind: 'SHOPPING',
        status: 'UNAVAILABLE',
        totalCount: null,
        hasMore: null,
    };
    const response: Today = {
        ...context,
        blocks: [
            partial,
            { ...empty, kind: 'TODAY' },
            { ...empty, kind: 'NEXT_SETTLEMENT', status: 'NOT_APPLICABLE' },
            { ...empty, kind: 'UPCOMING' },
            { ...empty, kind: 'TASKS' },
            unavailable,
        ],
    };
    expect(
        response.blocks.filter(shouldShowTodayBlock).map((block) => block.kind),
    ).toEqual(['ATTENTION', 'TODAY', 'UPCOMING', 'TASKS', 'SHOPPING']);
    expect(response.blocks[0].totalCount).toBeNull();
    expect(response.blocks[0].items[0]).toEqual(income);
    expect(shouldShowTodayBlock(empty)).toBe(false);
    expect(
        shouldShowTodayBlock({
            ...empty,
            status: 'PARTIAL',
            totalCount: null,
            hasMore: null,
        }),
    ).toBe(true);
    expect(todayItemHref(income, response)).toBe(
        '/spaces/space-a/incomes/income-a',
    );
});

test('income links use the selected space and do not depend on a truncated legacy preview', () => {
    expect(
        context.finance.status === 'AVAILABLE' &&
            context.finance.data.upcomingCommitments.items,
    ).toEqual([]);
    expect(todayItemHref(income, context)).toBe(
        '/spaces/space-a/incomes/income-a',
    );
    expect(todayItemHref(income, { ...context, spaceId: 'space-b' })).toBe(
        '/spaces/space-b/incomes/income-a',
    );
});

test('planned expenses and recurring occurrences open their compatible operation routes', () => {
    const expense = {
        ...income,
        details: { ...income.details, kind: 'EXPENSE' as const },
    };
    const recurrence = {
        ...income,
        reference: {
            ...income.reference,
            modality: 'RECURRING' as const,
            occurrenceId: 'occurrence-a',
        },
        details: {
            ...income.details,
            modality: 'RECURRING' as const,
            occurrenceId: 'occurrence-a',
        },
    };
    expect(todayItemHref(expense, context)).toBe(
        '/spaces/space-a/finances/planning/income-a',
    );
    expect(todayItemHref(recurrence, context)).toBe(
        '/spaces/space-a/recurring-commitments/income-a?month=2026-10',
    );
    expect(todayItemKey(recurrence)).not.toBe(
        todayItemKey({
            ...recurrence,
            reference: {
                ...recurrence.reference,
                occurrenceId: 'occurrence-b',
            },
        }),
    );
});

test('shopping quantity stays a quantity and has no invented route', () => {
    const shopping: Extract<TodayPreviewItem, { type: 'SHOPPING_LIST' }> = {
        type: 'SHOPPING_LIST',
        reference: { type: 'SHOPPING_LIST', listId: 'list-a' },
        label: 'Mercado',
        date: null,
        details: {
            id: 'list-a',
            name: 'Mercado',
            status: 'ACTIVE',
            summary: {
                activeItemCount: 2,
                actionableItemCount: 1,
                isComplete: false,
            },
            pendingItems: {
                items: [
                    {
                        id: 'item-a',
                        description: 'Arroz',
                        unit: 'kg',
                        desiredQuantity: '2.5',
                        purchasedQuantity: '1',
                        remainingQuantity: '1.5',
                        status: 'PARTIALLY_PURCHASED',
                    },
                ],
                totalCount: 1,
                hasMore: false,
            },
        },
    };
    expect(todayItemHref(shopping, context)).toBeNull();
    expect(shopping.details.pendingItems.items[0].remainingQuantity).toBe(
        '1.5',
    );
});

test('Today formats the API civil date without moving it across browser time zones', () => {
    expect(formatTodayReferenceDate('2026-10-19')).toBe(
        'segunda-feira, 19 de outubro',
    );
    expect(formatTodayReferenceDate('2028-02-29')).toBe(
        'terça-feira, 29 de fevereiro',
    );
});
