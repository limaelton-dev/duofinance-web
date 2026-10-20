import { expect, test } from '@playwright/test';
import { QueryClient } from '@tanstack/react-query';
import { recordIncome, recordIncomeReceipt } from '../../src/lib/api/income';
import { recordPersonalExpense } from '../../src/lib/api/personal-expense';
import {
    getExpenseDisbursementOptions,
    recordExpenseDisbursement,
} from '../../src/lib/api/expense-disbursement';
import { ApiError } from '../../src/lib/api/api-error';
import { invalidateIncomeQueries } from '../../src/features/finances/cache/income-query-keys';

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

const commitment = {
    id: 'commitment-a',
    version: 1,
    kind: 'INCOME' as const,
    modality: 'ONE_TIME' as const,
    description: 'Receita prevista',
    amountInCents: 100000,
    expectedReceiptDate: '2026-10-15',
    registeredAt: '2026-10-15T12:00:00.000Z',
    createdByPersonId: 'person-a',
    ownerPersonId: 'person-a',
};
const firstReceipt = {
    id: 'receipt-a',
    amountInCents: 100000,
    factDate: '2026-10-15',
    registeredAt: '2026-10-15T12:00:00.000Z',
    recordedByPersonId: 'person-a',
    recipientPersonId: 'person-a',
    recipientMemberId: null,
};
const legacyIncome = {
    spaceId: 'personal-a',
    spaceType: 'PERSONAL' as const,
    commitment,
    receipt: firstReceipt,
    status: 'RECEIVED' as const,
    receivedAmountInCents: 100000,
    obligation: null,
    settlementCycle: null,
    replayed: true,
};

test('receipt retry retains amount, version, destination and key after the server advances', async () => {
    await withApi(legacyIncome, async (calls, reply) => {
        const input = {
            amountInCents: 30000,
            expectedCommitmentVersion: 2,
            factDate: '2026-10-14',
        };
        const signal = new AbortController().signal;
        await recordIncomeReceipt(
            'personal-a',
            'commitment-a',
            input,
            'csrf-1',
            'same-attempt',
            signal,
        );
        reply({ ...legacyIncome, commitment: { ...commitment, version: 4 } });
        await recordIncomeReceipt(
            'personal-a',
            'commitment-a',
            input,
            'csrf-2',
            'same-attempt',
            signal,
        );
        expect(calls).toHaveLength(2);
        for (const call of calls) {
            expect(call.url).toBe(
                'http://api.example.test/v2/spaces/personal-a/financial-commitments/commitment-a/receipts',
            );
            expect(JSON.parse(call.init.body as string)).toEqual(input);
            expect(call.init.method).toBe('POST');
            expect(call.init.credentials).toBe('include');
            expect(call.init.cache).toBe('no-store');
            expect(call.init.signal).toBe(signal);
            expect(new Headers(call.init.headers).get('Idempotency-Key')).toBe(
                'same-attempt',
            );
        }
        expect(new Headers(calls[1].init.headers).get('X-CSRF-Token')).toBe(
            'csrf-2',
        );
    });
});

test('a legacy replay derives collections and totals from its original receipt', async () => {
    await withApi(legacyIncome, async () => {
        const result = await recordIncome(
            'personal-a',
            {
                description: commitment.description,
                amountInCents: commitment.amountInCents,
                expectedReceiptDate: commitment.expectedReceiptDate,
                receipt: { factDate: firstReceipt.factDate },
            },
            'csrf',
            'old-key',
        );
        expect(result.replayed).toBe(true);
        expect(result.receipt).toEqual(firstReceipt);
        expect(result.receipts).toEqual([firstReceipt]);
        expect(result.receivedAmountInCents).toBe(100000);
        expect(result.remainingAmountInCents).toBe(0);
        expect(result.obligations).toEqual([]);
    });
});

test('an old pending-income replay never invents a receipt', async () => {
    await withApi(
        {
            ...legacyIncome,
            receipt: null,
            status: 'PENDING',
            receivedAmountInCents: 0,
        },
        async () => {
            const result = await recordIncome(
                'personal-a',
                {
                    description: commitment.description,
                    amountInCents: 100000,
                    expectedReceiptDate: commitment.expectedReceiptDate,
                    receipt: null,
                },
                'csrf',
                'forecast-key',
            );
            expect(result.receipt).toBeNull();
            expect(result.receipts).toEqual([]);
            expect(result.receivedAmountInCents).toBe(0);
            expect(result.remainingAmountInCents).toBe(100000);
            expect(result.status).toBe('PENDING');
        },
    );
});

test('successive facts keep accumulated totals while the singular field remains the first receipt', async () => {
    const first = { ...firstReceipt, amountInCents: 30000 };
    const second = {
        ...firstReceipt,
        id: 'receipt-b',
        amountInCents: 20000,
        factDate: '2026-10-14',
    };
    const response = {
        ...legacyIncome,
        commitment: { ...commitment, version: 3 },
        receipt: first,
        receipts: [first, second],
        status: 'PARTIALLY_RECEIVED',
        receivedAmountInCents: 50000,
        remainingAmountInCents: 50000,
        obligations: [],
    };
    await withApi(response, async () => {
        const result = await recordIncomeReceipt(
            'personal-a',
            commitment.id,
            {
                amountInCents: 20000,
                expectedCommitmentVersion: 2,
                factDate: '2026-10-14',
            },
            'csrf',
            'second-key',
        );
        expect(result.receipt?.amountInCents).toBe(30000);
        expect(result.receipts).toEqual([first, second]);
        expect(result.receivedAmountInCents).toBe(50000);
        expect(result.remainingAmountInCents).toBe(50000);
        expect(result.commitment.amountInCents).toBe(100000);
        expect(result.status).toBe('PARTIALLY_RECEIVED');
    });
});

test('partial personal creation sends the external payment separately from the economic total', async () => {
    const first = {
        id: 'payment-a',
        payerPersonId: 'person-a',
        recordedByPersonId: 'person-a',
        amountInCents: 30000,
        method: 'PIX' as const,
        factDate: '2026-10-15',
        registeredAt: commitment.registeredAt,
    };
    await withApi(
        {
            spaceId: 'personal-a',
            spaceType: 'PERSONAL',
            commitment: {
                ...commitment,
                kind: 'EXPENSE',
                factDate: '2026-10-15',
            },
            disbursement: first,
            disbursements: [first],
            paidAmountInCents: 30000,
            remainingAmountInCents: 70000,
            status: 'PARTIALLY_PAID',
            replayed: false,
        },
        async (calls) => {
            const input = {
                description: 'Consulta',
                amountInCents: 100000,
                factDate: '2026-10-15',
                disbursement: { method: 'PIX' as const, amountInCents: 30000 },
            };
            const result = await recordPersonalExpense(
                'personal-a',
                input,
                'csrf',
                'partial-key',
            );
            expect(JSON.parse(calls[0].init.body as string)).toEqual(input);
            expect(result.commitment.amountInCents).toBe(100000);
            expect(result.disbursement!.amountInCents).toBe(30000);
            expect(result.paidAmountInCents).toBe(30000);
            expect(result.remainingAmountInCents).toBe(70000);
        },
    );
});

test('legacy amount omission survives the client and a conflict requires explicit reconfirmation', async () => {
    await withApi(
        {
            code: 'CONCURRENT_MODIFICATION',
            message: 'Recarregue o compromisso.',
            details: {},
        },
        async (calls, reply) => {
            reply(
                {
                    code: 'CONCURRENT_MODIFICATION',
                    message: 'Recarregue o compromisso.',
                    details: {},
                },
                409,
            );
            const input = {
                expectedCommitmentVersion: 1,
                factDate: '2026-10-15',
            };
            const result = recordIncomeReceipt(
                'personal-a',
                commitment.id,
                input,
                'csrf',
                'legacy-key',
            );
            await expect(result).rejects.toBeInstanceOf(ApiError);
            expect(calls).toHaveLength(1);
            expect(JSON.parse(calls[0].init.body as string)).toEqual(input);
            expect(JSON.parse(calls[0].init.body as string)).not.toHaveProperty(
                'amountInCents',
            );
        },
    );
});

test('receipt invalidates all affected financial views and Today only in the captured person/space', () => {
    const client = new QueryClient();
    const affected = [
        ['finances', 'person-a', 'space-a', 'income-detail', 'income-a'],
        [
            'finances',
            'person-a',
            'space-a',
            'income-receipt-options',
            'income-a',
        ],
        ['finances', 'person-a', 'space-a', 'incomes', 'PENDING', 'next'],
        ['finances', 'person-a', 'space-a', 'inter-member-position'],
        ['finances', 'person-a', 'space-a', 'settlement-cycle', 'cycle-a'],
        ['finances', 'person-a', 'space-a', 'settlement-transfers'],
        ['today', 'person-a', 'space-a'],
    ];
    const unrelated = [
        ['finances', 'person-a', 'space-b', 'income-detail', 'income-a'],
        ['finances', 'person-b', 'space-a', 'inter-member-position'],
        ['today', 'person-b', 'space-a'],
        ['today', 'person-a', 'space-b'],
    ];
    for (const key of [...affected, ...unrelated]) client.setQueryData(key, {});
    invalidateIncomeQueries(client, 'person-a', 'space-a');
    for (const key of affected)
        expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of unrelated)
        expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
});

test('later shared payment uses authorized options and preserves the captured command on retry', async () => {
    const first = {
        id: 'payment-a',
        payerMemberId: 'member-a',
        recordedByPersonId: 'person-a',
        amountInCents: 30000,
        method: 'PIX',
        factDate: '2026-10-15',
        registeredAt: commitment.registeredAt,
    };
    await withApi(
        {
            spaceId: 'shared-a',
            spaceType: 'SHARED',
            commitment: {
                ...commitment,
                kind: 'EXPENSE',
                factDate: first.factDate,
            },
            disbursement: first,
            disbursements: [first],
            paidAmountInCents: 30000,
            remainingAmountInCents: 70000,
            status: 'PARTIALLY_PAID',
            obligation: null,
            obligations: [],
            replayed: true,
        },
        async (calls) => {
            const signal = new AbortController().signal;
            await getExpenseDisbursementOptions(
                'shared-a',
                'commitment-a',
                signal,
            );
            const input = {
                amountInCents: 20000,
                factDate: '2026-10-14',
                method: 'DEBIT' as const,
                expectedCommitmentVersion: 1,
                payerMemberId: 'member-b',
                expectedSpaceVersion: 3,
                settlement: { mode: 'NONE' as const },
            };
            for (const token of ['csrf-1', 'csrf-2'])
                await recordExpenseDisbursement(
                    'shared-a',
                    'commitment-a',
                    input,
                    token,
                    'same-payment',
                    signal,
                );
            expect(calls[0].url).toBe(
                'http://api.example.test/v2/spaces/shared-a/financial-commitments/commitment-a/disbursement-options',
            );
            expect(calls[0].init.method).toBe('GET');
            expect(calls[0].init.body).toBeUndefined();
            expect(
                new Headers(calls[0].init.headers).has('Idempotency-Key'),
            ).toBe(false);
            for (const call of calls.slice(1)) {
                expect(call.url).toBe(
                    'http://api.example.test/v2/spaces/shared-a/financial-commitments/commitment-a/disbursements',
                );
                expect(JSON.parse(call.init.body as string)).toEqual(input);
                expect(
                    new Headers(call.init.headers).get('Idempotency-Key'),
                ).toBe('same-payment');
                expect(call.init.credentials).toBe('include');
                expect(call.init.cache).toBe('no-store');
                expect(call.init.signal).toBe(signal);
            }
        },
    );
});

test('a legacy personal expense replay retains its first fact and full-payment condition', async () => {
    const first = {
        id: 'legacy-payment',
        payerPersonId: 'person-a',
        amountInCents: 100000,
        method: 'CASH' as const,
        factDate: '2026-10-14',
        registeredAt: commitment.registeredAt,
    };
    await withApi(
        {
            spaceId: 'personal-a',
            spaceType: 'PERSONAL',
            commitment: {
                ...commitment,
                kind: 'EXPENSE',
                factDate: first.factDate,
            },
            disbursement: first,
            replayed: true,
        },
        async () => {
            const result = await recordPersonalExpense(
                'personal-a',
                {
                    description: 'Consulta',
                    amountInCents: 100000,
                    factDate: first.factDate,
                    disbursement: { method: first.method },
                },
                'csrf',
                'legacy-payment-key',
            );
            expect(result.replayed).toBe(true);
            expect(result.disbursements).toEqual([first]);
            expect(result.paidAmountInCents).toBe(100000);
            expect(result.remainingAmountInCents).toBe(0);
            expect(result.status).toBe('PAID');
            expect(result.commitment.version).toBe(1);
        },
    );
});
