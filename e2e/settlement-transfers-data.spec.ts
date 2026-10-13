import { expect, test } from '@playwright/test';
import { financesQueryKeys } from '../src/features/finances/cache/finances-query-keys';
import {
    getTransfer,
    getTransferHistory,
    getTransferOptions,
    recordTransfer,
} from '../src/lib/api/settlement-transfers';

test('A19/A20: cliente mantém filtros, destino, payload e chave da tentativa', async () => {
    const oldFetch = globalThis.fetch;
    const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const oldUrl = process.env.NEXT_PUBLIC_API_URL;
    const calls: { url: string; init: RequestInit }[] = [];
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
    });
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.test/v2';
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return new Response('{}', {
            headers: { 'Content-Type': 'application/json' },
        });
    };
    try {
        const signal = new AbortController().signal;
        const input = {
            expectedSpaceVersion: 3,
            payerMemberId: 'member-a',
            recipientMemberId: 'member-b',
            amountInCents: 15000,
            factDate: '2026-10-12',
            allocations: [
                {
                    obligationId: 'obligation-a',
                    expectedObligationVersion: 2,
                    amountInCents: 12000,
                },
                {
                    obligationId: 'obligation-b',
                    expectedObligationVersion: 1,
                    amountInCents: 3000,
                },
            ],
        };
        await getTransferOptions(
            'space-a',
            'RECEIVABLE',
            'cycle-a',
            'a+b/=',
            signal,
        );
        await recordTransfer('space-a', input, 'csrf-1', 'same-key', signal);
        await recordTransfer('space-a', input, 'csrf-2', 'same-key', signal);
        await getTransfer('space-a', 'transfer-a', signal);
        await getTransferHistory(
            'space-a',
            'cycle-a',
            'obligation-a',
            'page?2',
            signal,
        );
        expect(calls.map((call) => call.url)).toEqual([
            'http://api.example.test/v2/spaces/space-a/settlement-transfers/options?direction=RECEIVABLE&cycleId=cycle-a&cursor=a%2Bb%2F%3D',
            'http://api.example.test/v2/spaces/space-a/settlement-transfers',
            'http://api.example.test/v2/spaces/space-a/settlement-transfers',
            'http://api.example.test/v2/spaces/space-a/settlement-transfers/transfer-a',
            'http://api.example.test/v2/spaces/space-a/settlement-transfers?cycleId=cycle-a&obligationId=obligation-a&cursor=page%3F2',
        ]);
        for (const { init } of calls) {
            expect(init.credentials).toBe('include');
            expect(init.cache).toBe('no-store');
            expect(init.signal).toBe(signal);
        }
        for (const { init } of [calls[0], calls[3], calls[4]]) {
            expect(init.method).toBe('GET');
            expect(new Headers(init.headers).has('Idempotency-Key')).toBe(
                false,
            );
            expect(new Headers(init.headers).has('X-CSRF-Token')).toBe(false);
        }
        for (const { init } of [calls[1], calls[2]]) {
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body as string)).toEqual(input);
            expect(new Headers(init.headers).get('Idempotency-Key')).toBe(
                'same-key',
            );
        }
        expect(new Headers(calls[1].init.headers).get('X-CSRF-Token')).toBe(
            'csrf-1',
        );
        expect(new Headers(calls[2].init.headers).get('X-CSRF-Token')).toBe(
            'csrf-2',
        );
    } finally {
        globalThis.fetch = oldFetch;
        if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
        else Reflect.deleteProperty(globalThis, 'window');
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = oldUrl;
    }
});

test('A21/A22: chaves isolam pessoa, espaço, filtros, página e transferência', () => {
    const keys = [
        financesQueryKeys.transferOptions('a', 's', 'PAYABLE', null, null),
        financesQueryKeys.transferOptions('a', 's', 'RECEIVABLE', null, null),
        financesQueryKeys.transferOptions('a', 's', 'PAYABLE', 'cycle', null),
        financesQueryKeys.transferOptions('a', 's', 'PAYABLE', null, 'cursor'),
        financesQueryKeys.transferOptions('b', 's', 'PAYABLE', null, null),
        financesQueryKeys.transferOptions('a', 't', 'PAYABLE', null, null),
        financesQueryKeys.transferHistory('a', 's', null, null, null),
        financesQueryKeys.transferHistory('a', 's', 'cycle', null, null),
        financesQueryKeys.transferHistory('a', 's', null, 'obligation', null),
        financesQueryKeys.transferHistory('a', 's', null, null, 'cursor'),
        financesQueryKeys.transfer('a', 's', 'transfer-a'),
        financesQueryKeys.transfer('a', 's', 'transfer-b'),
    ];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(
        keys.length,
    );
});
