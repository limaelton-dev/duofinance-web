import { expect, test } from '@playwright/test';
import {
    getPlannedExpenses,
    createPlannedExpense,
} from '../src/lib/api/planned-expense';
import {
    getRecurringDetail,
    getRecurringOccurrences,
    recurringRequest,
} from '../src/lib/api/recurring-commitment';
import {
    getInstallmentDetail,
    getInstallmentItems,
    installmentRequest,
} from '../src/lib/api/installment-commitment';
import { ApiError } from '../src/lib/api/api-error';

type Call = { url: string; init: RequestInit };
async function withApi(
    run: (
        calls: Call[],
        reply: (body: unknown, status?: number) => void,
    ) => Promise<void>,
) {
    const fetch = globalThis.fetch,
        window = Object.getOwnPropertyDescriptor(globalThis, 'window'),
        url = process.env.NEXT_PUBLIC_API_URL;
    const calls: Call[] = [];
    let body: unknown = {},
        status = 200;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
    });
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.test/v2';
    globalThis.fetch = async (input, init = {}) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    };
    try {
        await run(calls, (next, code = 200) => {
            body = next;
            status = code;
        });
    } finally {
        globalThis.fetch = fetch;
        if (window) Object.defineProperty(globalThis, 'window', window);
        else Reflect.deleteProperty(globalThis, 'window');
        if (url === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = url;
    }
}

test('Wave 4: planned expenses preserve pending state and never add a payment to the command', async () => {
    await withApi(async (calls, reply) => {
        const input = {
            scope: 'PERSONAL' as const,
            description: 'Revisão da bicicleta',
            amountInCents: 20000,
            expectedPaymentDate: '2099-01-20',
        };
        reply({
            spaceId: 'personal-a',
            commitment: { id: 'planned-a', ...input },
            paidAmountInCents: 0,
            remainingAmountInCents: 20000,
            replayed: false,
        });
        await createPlannedExpense('personal-a', input, 'csrf', 'attempt-1');
        expect(JSON.parse(calls[0].init.body as string)).toEqual(input);
        expect(new Headers(calls[0].init.headers).get('Idempotency-Key')).toBe(
            'attempt-1',
        );
        await getPlannedExpenses(
            'personal-a',
            '2099-01',
            'cursor+/',
            new AbortController().signal,
        );
        expect(calls[1].url).toContain('month=2099-01&cursor=cursor%2B%2F');
        expect(calls[1].init.cache).toBe('no-store');
    });
});
test('Wave 4: recurrence versions and explicit variable values preserve the same destination, body, and key on replay', async () => {
    await withApi(async (calls, reply) => {
        reply({
            commitment: { spaceId: 'space-a', id: 'recurrence-a', version: 2 },
            replayed: true,
        });
        const input = {
            expectedCommitmentVersion: 2,
            expectedOccurrenceVersion: 1,
            expectedSpaceVersion: 4,
            amountInCents: 17345,
        };
        await recurringRequest(
            'space-a',
            '/recurrence-a/occurrences/2026-10-20/value',
            input,
            'csrf-1',
            'same-key',
            undefined,
            'PUT',
        );
        await recurringRequest(
            'space-a',
            '/recurrence-a/occurrences/2026-10-20/value',
            input,
            'csrf-2',
            'same-key',
            undefined,
            'PUT',
        );
        expect(calls).toHaveLength(2);
        for (const call of calls) {
            expect(call.init.method).toBe('PUT');
            expect(JSON.parse(call.init.body as string)).toEqual(input);
            expect(new Headers(call.init.headers).get('Idempotency-Key')).toBe(
                'same-key',
            );
            expect(call.url).toContain(
                '/spaces/space-a/recurring-commitments/recurrence-a/occurrences/2026-10-20/value',
            );
        }
    });
});
test('Wave 4: reject details from another space and preserve versions in scoped read models', async () => {
    await withApi(async (_calls, reply) => {
        reply({ commitment: { spaceId: 'space-b', id: 'a' } });
        await expect(getRecurringDetail('space-a', 'a')).rejects.toThrow(
            'outro espaço',
        );
        await expect(getInstallmentDetail('space-a', 'a')).rejects.toThrow(
            'outro espaço',
        );
        reply({
            commitmentId: 'a',
            items: [
                {
                    id: 'occurrence',
                    stateVersion: 4,
                    referenceDate: '2026-10-20',
                },
            ],
        });
        expect(
            (await getRecurringOccurrences('space-a', 'a', '2026-10')).items[0]
                .stateVersion,
        ).toBe(4);
        reply({
            commitmentId: 'a',
            items: [
                {
                    id: 'installment',
                    stateVersion: 8,
                    facts: [{ id: 'real-fact' }],
                },
            ],
        });
        expect(
            (await getInstallmentItems('space-a', 'a')).items[0].facts[0].id,
        ).toBe('real-fact');
    });
});
for (const [label, read] of [
    [
        'recurring occurrences',
        () => getRecurringOccurrences('space-a', 'commitment-a', '2026-10'),
    ],
    ['installment items', () => getInstallmentItems('space-a', 'commitment-a')],
] as const) {
    test(`Wave 4: ${label} rejects incompatible origins before assigning the requested space`, async () => {
        await withApi(async (_calls, reply) => {
            for (const origin of [
                { commitmentId: 'commitment-b', spaceId: 'space-a' },
                { commitmentId: 'commitment-a', spaceId: 'space-b' },
                { commitmentId: 'commitment-a', spaceId: '' },
                { spaceId: 'space-a' },
            ]) {
                reply({
                    ...origin,
                    items: [{ id: 'foreign-item', stateVersion: 7 }],
                });
                await expect(read()).rejects.toThrow(
                    'não corresponde ao compromisso',
                );
            }
            const items = [{ id: 'correct-item', stateVersion: 3 }];
            reply({ commitmentId: 'commitment-a', items });
            expect(await read()).toEqual({
                commitmentId: 'commitment-a',
                spaceId: 'space-a',
                items,
            });
            reply({ commitmentId: 'commitment-a', spaceId: 'space-a', items });
            expect(await read()).toEqual({
                commitmentId: 'commitment-a',
                spaceId: 'space-a',
                items,
            });
        });
    });
}
test('Wave 4: previews do not send idempotency keys; confirmed payoff sends one global value and exact versions', async () => {
    await withApi(async (calls, reply) => {
        reply({
            items: [{ installmentId: 'i-1', expectedInstallmentVersion: 2 }],
            paidAmountInCents: 870000,
        });
        await installmentRequest(
            'space-a',
            '/plan-a/payoff-preview',
            { paidAmountInCents: 870000, factDate: '2026-10-19' },
            'csrf',
        );
        expect(new Headers(calls[0].init.headers).has('Idempotency-Key')).toBe(
            false,
        );
        const input = {
            paidAmountInCents: 870000,
            factDate: '2026-10-19',
            method: 'PIX',
            expectedCommitmentVersion: 3,
            installments: [
                { installmentId: 'i-1', expectedInstallmentVersion: 2 },
            ],
        };
        reply({ commitment: { spaceId: 'space-a' }, replayed: false });
        await installmentRequest(
            'space-a',
            '/plan-a/payoffs',
            input,
            'csrf',
            'payoff-key',
        );
        expect(JSON.parse(calls[1].init.body as string)).toEqual(input);
        expect(new Headers(calls[1].init.headers).get('Idempotency-Key')).toBe(
            'payoff-key',
        );
        expect(
            JSON.parse(calls[1].init.body as string).installments[0],
        ).not.toHaveProperty('paidAmountInCents');
    });
});
test('Wave 4: cancellation retains reason, selection, and conflict instead of fabricating a successful result', async () => {
    await withApi(async (calls, reply) => {
        reply(
            {
                code: 'INSTALLMENT_SELECTION_CHANGED',
                message: 'A seleção mudou.',
            },
            409,
        );
        const input = {
            reason: 'Contrato encerrado',
            factDate: '2026-10-19',
            expectedCommitmentVersion: 3,
            installments: [
                { installmentId: 'i-3', expectedInstallmentVersion: 2 },
            ],
        };
        await expect(
            installmentRequest(
                'space-a',
                '/plan-a/future-installment-cancellations',
                input,
                'csrf',
                'cancel-key',
            ),
        ).rejects.toBeInstanceOf(ApiError);
        expect(JSON.parse(calls[0].init.body as string)).toEqual(input);
    });
});
