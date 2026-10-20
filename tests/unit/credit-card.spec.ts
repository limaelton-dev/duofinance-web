import { expect, test } from '@playwright/test';
import {
    recordPersonalExpense,
    getPersonalExpenseOptions,
} from '../../src/lib/api/personal-expense';
import {
    recordExpense,
    getExpenseOptions,
} from '../../src/lib/api/shared-expense';
import {
    recordExternalLiability,
    getExternalLiabilityOptions,
} from '../../src/lib/api/credit-card-purchase';
import { normalizeExpenseFulfillment } from '../../src/lib/api/normalize-fulfillment';
import type { PersonalExpenseResult } from '../../src/features/finances/types/personal-expense';
import { QueryClient } from '@tanstack/react-query';
import { invalidateIncomeQueries } from '../../src/features/finances/cache/income-query-keys';
import { todayQueryKeys } from '../../src/features/today/cache/today-query-keys';
type Call = { url: string; init: RequestInit };

async function withApi(
    response: unknown,
    run: (
        calls: Call[],
        reply: (body: unknown, status?: number) => void,
    ) => Promise<void>,
) {
    const originalFetch = globalThis.fetch,
        originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'),
        originalUrl = process.env.NEXT_PUBLIC_API_URL;
    let body = response,
        status = 200;
    const calls: Call[] = [];
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
    });
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.test/v2';
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    };
    try {
        await run(calls, (next, nextStatus = 200) => {
            body = next;
            status = nextStatus;
        });
    } finally {
        globalThis.fetch = originalFetch;
        if (originalWindow)
            Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
        if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = originalUrl;
    }
}

const liability = {
    id: 'external-a',
    holderPersonId: 'person-a',
    amountInCents: 30000,
    remainingAmountInCents: 30000,
    factDate: '2026-10-15',
    registeredAt: '2026-10-15T12:00:00Z',
    recordedByPersonId: 'person-a',
    sequence: 1,
};
const response = {
    spaceId: 'personal-a',
    spaceType: 'PERSONAL',
    commitment: {
        id: 'commitment-a',
        version: 1,
        kind: 'EXPENSE',
        modality: 'ONE_TIME',
        description: 'Compra',
        amountInCents: 100000,
        factDate: '2026-10-15',
        registeredAt: '2026-10-15T12:00:00Z',
        createdByPersonId: 'person-a',
        ownerPersonId: 'person-a',
    },
    disbursement: null,
    disbursements: [],
    externalLiability: liability,
    externalLiabilities: [liability],
    paidAmountInCents: 0,
    assumedAmountInCents: 30000,
    externalOutstandingAmountInCents: 30000,
    supportedAmountInCents: 30000,
    remainingAmountInCents: 70000,
    fulfillmentStatus: 'PARTIALLY_FULFILLED',
    status: 'PARTIALLY_FULFILLED',
    replayed: false,
} as PersonalExpenseResult;

test('A03/A27: card-only normalization preserves null disbursement and independent financial dimensions', () => {
    const result = normalizeExpenseFulfillment(response);
    expect(result.disbursement).toBeNull();
    expect(result.disbursements).toEqual([]);
    expect(result.paidAmountInCents).toBe(0);
    expect(result.assumedAmountInCents).toBe(30000);
    expect(result.externalOutstandingAmountInCents).toBe(30000);
    expect(result.supportedAmountInCents).toBe(30000);
    expect(result.remainingAmountInCents).toBe(70000);
    expect(result.externalLiabilities).toEqual([liability]);
    expect(response).toEqual({
        ...response,
        disbursement: null,
        disbursements: [],
    });
});
test('A23: historical cash-only response stays readable and preserves cash semantics', () => {
    const cash = {
        id: 'cash-a',
        payerPersonId: 'person-a',
        recordedByPersonId: 'person-a',
        method: 'PIX',
        amountInCents: 100000,
        factDate: '2026-10-14',
        registeredAt: '2026-10-15T12:00:00Z',
    };
    const result = normalizeExpenseFulfillment({
        spaceId: response.spaceId,
        commitment: response.commitment,
        disbursement: cash,
    } as PersonalExpenseResult);
    expect(result.disbursements).toEqual([cash]);
    expect(result.paidAmountInCents).toBe(100000);
    expect(result.supportedAmountInCents).toBe(100000);
    expect(result.externalLiabilities).toEqual([]);
    expect(result.assumedAmountInCents).toBe(0);
    expect(result.status).toBe('PAID');
});
test('A03/A16: personal card routes the immutable command without shared or synthetic cash fields', async () => {
    await withApi(response, async (calls) => {
        const input = {
            description: 'Compra',
            amountInCents: 100000,
            factDate: '2026-10-15',
            externalLiability: { amountInCents: 30000 },
        };
        const frozen = structuredClone(input);
        const result = await recordPersonalExpense(
            'personal-a',
            input,
            'csrf',
            'same-key',
        );
        expect(calls[0].url).toBe(
            'http://api.example.test/v2/spaces/personal-a/credit-card-purchases',
        );
        expect(JSON.parse(calls[0].init.body as string)).toEqual(frozen);
        expect(input).toEqual(frozen);
        expect(new Headers(calls[0].init.headers).get('Idempotency-Key')).toBe(
            'same-key',
        );
        expect(result.disbursement).toBeNull();
    });
});
test('A01/A02: shared card sends holder independently of author, predicted payer and split', async () => {
    await withApi({ ...response, spaceType: 'SHARED' }, async (calls) => {
        const input = {
            description: 'Compra',
            amountInCents: 100000,
            factDate: '2026-10-15',
            expectedSpaceVersion: 2,
            expectedPayerMemberId: null,
            responsibilitySplit: {
                mode: 'PERCENTAGES' as const,
                shares: [
                    { memberId: 'a', basisPoints: 5000 },
                    { memberId: 'b', basisPoints: 5000 },
                ],
            },
            externalLiability: { holderMemberId: 'b', amountInCents: 30000 },
            settlement: { mode: 'NONE' as const },
        };
        await recordExpense('shared-a', input, 'csrf', 'shared-key');
        expect(calls[0].url).toContain('/shared-a/credit-card-purchases');
        expect(JSON.parse(calls[0].init.body as string)).toEqual(input);
        expect(JSON.parse(calls[0].init.body as string)).not.toHaveProperty(
            'disbursement',
        );
    });
});
test('A06/A25: subsequent card support binds destination, version and abort signal and retries same request payload', async () => {
    await withApi(response, async (calls) => {
        const controller = new AbortController();
        const input = {
            amountInCents: 30000,
            factDate: '2026-10-15',
            expectedCommitmentVersion: 3,
        };
        await recordExternalLiability(
            'personal-a',
            'commitment-a',
            input,
            'csrf',
            'immutable',
            controller.signal,
        );
        await recordExternalLiability(
            'personal-a',
            'commitment-a',
            input,
            'csrf',
            'immutable',
            controller.signal,
        );
        expect(calls[0].url).toBe(
            'http://api.example.test/v2/spaces/personal-a/financial-commitments/commitment-a/external-liabilities',
        );
        expect(calls[0].init.body).toBe(calls[1].init.body);
        expect(calls[0].init.signal).toBe(controller.signal);
        expect(JSON.parse(calls[0].init.body as string)).not.toHaveProperty(
            'method',
        );
    });
});
test('A13/A24: dedicated card options preserve cursor and cancellation without writing', async () => {
    await withApi({}, async (calls) => {
        const signal = new AbortController().signal;
        await getExpenseOptions('s', 'cursor +/&', signal, true);
        await getPersonalExpenseOptions('p', signal, true);
        await getExternalLiabilityOptions('p', 'c', signal, 'next +');
        expect(calls.map((c) => c.url)).toEqual([
            'http://api.example.test/v2/spaces/s/credit-card-purchase-options?cursor=cursor%20%2B%2F%26',
            'http://api.example.test/v2/spaces/p/credit-card-purchase-options',
            'http://api.example.test/v2/spaces/p/financial-commitments/c/external-liability-options?cursor=next%20%2B',
        ]);
        expect(
            calls.every(
                (c) =>
                    c.init.method === 'GET' &&
                    c.init.body === undefined &&
                    c.init.signal === signal,
            ),
        ).toBe(true);
    });
});
test('A15/A19: validation, authorization, concurrent versions and reused keys remain explicit errors', async () => {
    await withApi({}, async (_calls, reply) => {
        for (const [status, code] of [
            [400, 'VALIDATION_ERROR'],
            [401, 'UNAUTHENTICATED'],
            [403, 'INVALID_CSRF_TOKEN'],
            [409, 'CONCURRENT_MODIFICATION'],
            [409, 'IDEMPOTENCY_KEY_REUSED'],
        ] as const) {
            reply({ code, message: 'Confira o registro', details: {} }, status);
            await expect(
                recordExternalLiability(
                    'p',
                    'c',
                    {
                        amountInCents: 1,
                        factDate: '2026-10-15',
                        expectedCommitmentVersion: 1,
                    },
                    'csrf',
                    'key',
                ),
            ).rejects.toMatchObject({ status, code });
        }
    });
});
test('A26: card support invalidation includes all financial reads and Today in only its person and space', () => {
    const client = new QueryClient();
    for (const key of [
        ['finances', 'a', 's', 'external-liability-options', 'c'],
        ['finances', 'a', 's', 'inter-member-position'],
        ['finances', 'a', 's', 'settlement-cycles'],
        ['finances', 'a', 's', 'personal-expenses'],
        todayQueryKeys.space('a', 's'),
        ['finances', 'b', 's', 'personal-expenses'],
        ['finances', 'a', 't', 'personal-expenses'],
    ])
        client.setQueryData(key, {});
    invalidateIncomeQueries(client, 'a', 's');
    expect(
        client
            .getQueriesData({ queryKey: ['finances', 'a', 's'] })
            .every(([key]) => client.getQueryState(key)?.isInvalidated),
    ).toBe(true);
    expect(
        client.getQueryState(todayQueryKeys.space('a', 's'))?.isInvalidated,
    ).toBe(true);
    expect(
        client.getQueryState(['finances', 'b', 's', 'personal-expenses'])
            ?.isInvalidated,
    ).toBe(false);
    expect(
        client.getQueryState(['finances', 'a', 't', 'personal-expenses'])
            ?.isInvalidated,
    ).toBe(false);
    client.clear();
});
