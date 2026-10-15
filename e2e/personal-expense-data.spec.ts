import { expect, test } from '@playwright/test';
import { QueryClient } from '@tanstack/react-query';
import {
    personalExpenseQueryKeys,
    invalidatePersonalExpenseQueries,
} from '../src/features/finances/cache/personal-expense-query-keys';
import { todayQueryKeys } from '../src/features/today/cache/today-query-keys';
import { queryInFinancialContext } from '../src/features/finances/cache/financial-context-query';
import { watchSpacesSession } from '../src/features/spaces/cache/spaces-session';
import {
    getPersonalExpenseOptions,
    getPersonalExpenseHistory,
    getPersonalExpenseDetail,
    recordPersonalExpense,
} from '../src/lib/api/personal-expense';
import { ApiError } from '../src/lib/api/api-error';
import { isPastOrCurrentCivilDate } from '../src/features/finances/utils/personal-expense-date';
import {
    decimalUnits,
    formatMoney,
} from '../src/features/finances/utils/expense-money';

const auth = {
    person: { id: 'person-a', displayName: 'Pessoa A', email: 'a@example.com' },
    personalSpace: { id: 'personal-a', type: 'PERSONAL', label: 'Meu espaço' },
};
function deferred<T>() {
    let resolve!: (value: T) => void, reject!: (value: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

test('A04/A05: valid civil dates and exact monetary limits use the server reference', () => {
    for (const value of ['2024-02-29', '2026-10-13', '2026-10-14'])
        expect(isPastOrCurrentCivilDate(value, '2026-10-14')).toBe(true);
    for (const value of [
        '2026-10-15',
        '2025-02-29',
        '2026-04-31',
        '2026-13-01',
        '2026-00-01',
        '0000-01-01',
        '14/10/2026',
        '',
        '2026-1-01',
    ])
        expect(isPastOrCurrentCivilDate(value, '2026-10-14')).toBe(false);
    expect(decimalUnits('0,01')).toBe(1);
    expect(decimalUnits('90.071.992.547.409,91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(decimalUnits('90.071.992.547.409,92')).toBeNull();
    expect(formatMoney(1)).toBe('R$ 0,01');
});

test('A18/A19: personal keys isolate person, space, resource, cursor and detail ID under financial session cleanup', () => {
    const client = new QueryClient();
    client.setQueryData(['auth', 'me'], auth);
    const stop = watchSpacesSession(client);
    const keys = [
        personalExpenseQueryKeys.options('a', 's'),
        personalExpenseQueryKeys.history('a', 's', null),
        personalExpenseQueryKeys.history('a', 's', 'cursor'),
        personalExpenseQueryKeys.history('b', 's', null),
        personalExpenseQueryKeys.history('a', 't', null),
        personalExpenseQueryKeys.detail('a', 's', 'one'),
        personalExpenseQueryKeys.detail('a', 's', 'two'),
    ];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(
        keys.length,
    );
    keys.forEach((key) => client.setQueryData(key, { marker: 'private' }));
    client.setQueryData(['auth', 'me'], null);
    expect(client.getQueriesData({ queryKey: ['finances'] })).toEqual([]);
    client.setQueryData(['auth', 'me'], auth);
    expect(client.getQueriesData({ queryKey: ['finances'] })).toEqual([]);
    stop();
    client.clear();
});

test('A17: success/replay invalidates every captured personal history/detail page and Today while preserving other people/spaces', () => {
    const client = new QueryClient();
    const affected = [
        personalExpenseQueryKeys.history('a', 's', null),
        personalExpenseQueryKeys.history('a', 's', 'next'),
        personalExpenseQueryKeys.detail('a', 's', 'first'),
        personalExpenseQueryKeys.detail('a', 's', 'second'),
        todayQueryKeys.space('a', 's'),
    ];
    const unchanged = [
        personalExpenseQueryKeys.history('b', 's', null),
        personalExpenseQueryKeys.detail('a', 'other', 'first'),
        todayQueryKeys.space('a', 'other'),
        personalExpenseQueryKeys.options('a', 's'),
        ['finances', 'a', 's', 'inter-member-position'],
    ];
    [...affected, ...unchanged].forEach((key) =>
        client.setQueryData(key, { marker: 'current' }),
    );
    invalidatePersonalExpenseQueries(client, 'a', 's');
    for (const key of affected)
        expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of unchanged)
        expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
});

for (const status of [200, 401])
    test(`A18: personal read ${status} from A→SHARED→A never publishes or expires the current session`, async () => {
        const client = new QueryClient();
        client.setQueryData(['auth', 'me'], auth);
        const response = deferred<{ spaceId: string }>();
        let generation = 1;
        const result = queryInFinancialContext(
            client,
            'person-a',
            'personal-a',
            () => generation === 1,
            () => response.promise,
        );
        const rejection = expect(result).rejects.toThrow(
            'O espaço foi alterado.',
        );
        generation = 3;
        if (status === 200) response.resolve({ spaceId: 'personal-a' });
        else
            response.reject(
                new ApiError(401, 'UNAUTHENTICATED', 'Sessão antiga', {}),
            );
        await rejection;
        expect(client.getQueryData(['auth', 'me'])).toEqual(auth);
        client.clear();
    });

for (const status of [200, 401])
    test(`A19: personal reads from an older epoch reject delayed ${status} after same-person login`, async () => {
        const client = new QueryClient();
        client.setQueryData(['auth', 'me'], auth);
        const stop = watchSpacesSession(client),
            response = deferred<{ spaceId: string }>();
        const result = queryInFinancialContext(
            client,
            'person-a',
            'personal-a',
            () => true,
            () => response.promise,
        );
        const rejection = expect(result).rejects.toThrow();
        client.setQueryData(['auth', 'me'], null);
        client.setQueryData(['auth', 'me'], auth);
        if (status === 200) response.resolve({ spaceId: 'personal-a' });
        else
            response.reject(
                new ApiError(401, 'UNAUTHENTICATED', 'Sessão antiga', {}),
            );
        await rejection;
        expect(client.getQueryData(['auth', 'me'])).toEqual(auth);
        stop();
        client.clear();
    });

test('A06/A09: personal REST uses strict reduced inputs, authenticated no-store and an opaque encoded cursor', async () => {
    const oldFetch = globalThis.fetch,
        oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'),
        oldUrl = process.env.NEXT_PUBLIC_API_URL;
    const calls: { url: string; init: RequestInit }[] = [];
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
    });
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.test/v2';
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return new Response(
            JSON.stringify({
                spaceId: 'space-a',
                commitment: {
                    id: 'id-a',
                    kind: 'EXPENSE',
                    amountInCents: 12000,
                },
                disbursement: { id: 'disbursement-a', amountInCents: 12000 },
            }),
            {
                headers: { 'Content-Type': 'application/json' },
            },
        );
    };
    try {
        const signal = new AbortController().signal;
        await getPersonalExpenseOptions('space-a', signal);
        await getPersonalExpenseHistory('space-a', 'a+/=b', signal);
        await getPersonalExpenseDetail('space-a', 'id-a', signal);
        const input = {
            description: 'Consulta',
            amountInCents: 12000,
            factDate: '2026-10-14',
            disbursement: { method: 'PIX' as const },
        };
        await recordPersonalExpense(
            'space-a',
            input,
            'csrf',
            'immutable-key',
            signal,
        );
        expect(calls.map((call) => call.url)).toEqual([
            'http://api.example.test/v2/spaces/space-a/personal-expense-options',
            'http://api.example.test/v2/spaces/space-a/personal-expenses?cursor=a%2B%2F%3Db',
            'http://api.example.test/v2/spaces/space-a/financial-commitments/id-a',
            'http://api.example.test/v2/spaces/space-a/personal-expenses',
        ]);
        for (const call of calls) {
            expect(call.init.credentials).toBe('include');
            expect(call.init.cache).toBe('no-store');
            expect(call.init.signal).toBe(signal);
        }
        for (const call of calls.slice(0, 3)) {
            expect(call.init.method).toBe('GET');
            expect(call.init.body).toBeUndefined();
            expect(new Headers(call.init.headers).has('X-CSRF-Token')).toBe(
                false,
            );
        }
        expect(calls[3].init.method).toBe('POST');
        expect(JSON.parse(calls[3].init.body as string)).toEqual(input);
        expect(new Headers(calls[3].init.headers).get('Idempotency-Key')).toBe(
            'immutable-key',
        );
        expect(new Headers(calls[3].init.headers).get('X-CSRF-Token')).toBe(
            'csrf',
        );
    } finally {
        globalThis.fetch = oldFetch;
        if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
        else Reflect.deleteProperty(globalThis, 'window');
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = oldUrl;
    }
});
