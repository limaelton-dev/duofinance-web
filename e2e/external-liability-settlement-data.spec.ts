import { expect, test } from '@playwright/test';
import { QueryClient } from '@tanstack/react-query';
import {
    getOpenExternalLiabilities,
    getExternalLiabilitySettlementOptions,
    settleExternalLiability,
} from '../src/lib/api/external-liability-settlement';
import { invalidateIncomeQueries } from '../src/features/finances/cache/income-query-keys';
import { todayQueryKeys } from '../src/features/today/cache/today-query-keys';
type Call = { url: string; init: RequestInit };

test('CARD-015 A10: own-open list pagination and selected options use readonly cancellable requests', async () => {
    await withApi({}, async (calls) => {
        const signal = new AbortController().signal;
        await getOpenExternalLiabilities('s', 'next +/&', signal);
        await getExternalLiabilitySettlementOptions('s', 'c', 'l', signal);
        expect(calls.map((c) => c.url)).toEqual([
            'http://api.example.test/v2/spaces/s/external-liabilities?cursor=next%20%2B%2F%26',
            'http://api.example.test/v2/spaces/s/financial-commitments/c/external-liabilities/l/settlement-options',
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

test('CARD-015 A01/A07: settlement preserves direct cash, support, immutable retry and separate settlement result', async () => {
    const settlement = {
        id: 'settlement',
        externalLiabilityId: 'l',
        amountInCents: 6000,
    };
    const reply = {
        spaceId: 's',
        commitment: { id: 'c' },
        settlement,
        disbursement: null,
        paidAmountInCents: 0,
        assumedAmountInCents: 20000,
        supportedAmountInCents: 20000,
        externalSettledAmountInCents: 6000,
        externalOutstandingAmountInCents: 14000,
        externalLiabilities: [
            {
                id: 'l',
                amountInCents: 20000,
                remainingAmountInCents: 14000,
                settlements: [settlement],
            },
        ],
        replayed: true,
    };
    await withApi(reply, async (calls) => {
        const body = {
            amountInCents: 6000,
            factDate: '2026-10-15',
            expectedCommitmentVersion: 1,
            expectedSpaceVersion: 2,
        };
        const snapshot = structuredClone(body),
            signal = new AbortController().signal;
        const result = await settleExternalLiability(
            's',
            'c',
            'l',
            body,
            'csrf',
            'same-key',
            signal,
        );
        await settleExternalLiability(
            's',
            'c',
            'l',
            body,
            'csrf',
            'same-key',
            signal,
        );
        expect(calls[0].url).toBe(
            'http://api.example.test/v2/spaces/s/financial-commitments/c/external-liabilities/l/settlements',
        );
        expect(calls[0].init.body).toBe(calls[1].init.body);
        expect(JSON.parse(calls[0].init.body as string)).toEqual(snapshot);
        expect(new Headers(calls[0].init.headers).get('Idempotency-Key')).toBe(
            'same-key',
        );
        expect(new Headers(calls[0].init.headers).get('X-CSRF-Token')).toBe(
            'csrf',
        );
        expect(calls[0].init.signal).toBe(signal);
        expect(body).toEqual(snapshot);
        expect(result).toMatchObject(reply);
        expect(result.disbursements).toEqual([]);
    });
});

test('CARD-015 A05/A06/A07: settlement rejects holder, amount, stale version and divergent replay failures', async () => {
    await withApi({}, async (_calls, reply) => {
        for (const [status, code] of [
            [400, 'VALIDATION_ERROR'],
            [403, 'EXTERNAL_LIABILITY_HOLDER_REQUIRED'],
            [404, 'EXTERNAL_LIABILITY_NOT_FOUND'],
            [409, 'EXTERNAL_LIABILITY_ALREADY_SETTLED'],
            [409, 'CONCURRENT_MODIFICATION'],
            [409, 'IDEMPOTENCY_KEY_REUSED'],
        ] as const) {
            reply({ code, message: 'Revise o pagamento', details: {} }, status);
            await expect(
                settleExternalLiability(
                    's',
                    'c',
                    'l',
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

test('CARD-015 A11: refresh includes list, detail, options, cycles and Today only in current account and space', () => {
    const client = new QueryClient();
    for (const key of [
        ['finances', 'a', 's', 'external-liabilities', null],
        [
            'finances',
            'a',
            's',
            'external-liability-settlement-options',
            'c',
            'l',
        ],
        ['finances', 'a', 's', 'personal-expense-detail', 'c'],
        ['finances', 'a', 's', 'settlement-cycles'],
        todayQueryKeys.space('a', 's'),
        ['finances', 'b', 's', 'external-liabilities', null],
        ['finances', 'a', 't', 'external-liabilities', null],
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
        client.getQueryState([
            'finances',
            'b',
            's',
            'external-liabilities',
            null,
        ])?.isInvalidated,
    ).toBe(false);
    expect(
        client.getQueryState([
            'finances',
            'a',
            't',
            'external-liabilities',
            null,
        ])?.isInvalidated,
    ).toBe(false);
    client.clear();
});

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
