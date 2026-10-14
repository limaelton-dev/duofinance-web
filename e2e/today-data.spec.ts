import { expect, test } from '@playwright/test';
import { QueryClient } from '@tanstack/react-query';
import { queryInFinancialContext } from '../src/features/finances/cache/financial-context-query';
import { formatPositionMoney } from '../src/features/finances/utils/position-money';
import { watchSpacesSession } from '../src/features/spaces/cache/spaces-session';
import { todayQueryKeys } from '../src/features/today/cache/today-query-keys';
import { millisecondsUntilBusinessDateChange } from '../src/features/today/utils/business-date-change';
import { getToday } from '../src/lib/api/get-today';
import { ApiError } from '../src/lib/api/api-error';

const auth = {
    person: { id: 'person-a', displayName: 'Pessoa A', email: 'a@example.com' },
    personalSpace: { id: 'personal-a', type: 'PERSONAL', label: 'Meu espaço' },
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (value: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

test('A11/A20: Today keys isolate identity and space and preserve exact cents', () => {
    const keys = [
        todayQueryKeys.space('a', 's'),
        todayQueryKeys.space('a', 't'),
        todayQueryKeys.space('b', 's'),
    ];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(3);
    expect(keys[0]).toEqual(['today', 'a', 's']);
    expect(formatPositionMoney('18014398509481983')).toBe(
        'R$ 180.143.985.094.819,83',
    );
});

for (const status of [200, 401, 500])
    test(`A20 controlled transport ${status}: A→B→A discards old generation`, async () => {
        const client = new QueryClient();
        client.setQueryData(['auth', 'me'], auth);
        const response = deferred<{ spaceId: string }>();
        let generation = 1;
        const result = queryInFinancialContext(
            client,
            'person-a',
            'space-a',
            () => generation === 1,
            () => response.promise,
        );
        const rejected = expect(result).rejects.toThrow(
            'O espaço foi alterado.',
        );
        generation = 3;
        if (status === 200) response.resolve({ spaceId: 'space-a' });
        else
            response.reject(
                new ApiError(status, 'CONTROLLED', 'Resposta antiga', {}),
            );
        await rejected;
        expect(client.getQueryData(['auth', 'me'])).toEqual(auth);
        client.clear();
    });

for (const status of [200, 401])
    test(`A20 controlled session ${status}: logout/login same person clears Today and discards old response`, async () => {
        const client = new QueryClient();
        client.setQueryData(['auth', 'me'], auth);
        const stop = watchSpacesSession(client);
        client.setQueryData(todayQueryKeys.space('person-a', 'space-a'), {
            marker: 'private',
        });
        const response = deferred<{ spaceId: string }>();
        const result = queryInFinancialContext(
            client,
            'person-a',
            'space-a',
            () => true,
            () => response.promise,
        );
        const rejected = expect(result).rejects.toThrow();
        client.setQueryData(['auth', 'me'], null);
        expect(client.getQueriesData({ queryKey: todayQueryKeys.all })).toEqual(
            [],
        );
        client.setQueryData(['auth', 'me'], auth);
        if (status === 200) response.resolve({ spaceId: 'space-a' });
        else
            response.reject(
                new ApiError(401, 'UNAUTHENTICATED', 'Sessão antiga', {}),
            );
        await rejected;
        expect(client.getQueryData(['auth', 'me'])).toEqual(auth);
        stop();
        client.clear();
    });

test('A20: confirmed context mismatch never publishes another space', async () => {
    const client = new QueryClient();
    client.setQueryData(['auth', 'me'], auth);
    await expect(
        queryInFinancialContext(
            client,
            'person-a',
            'space-a',
            () => true,
            async () => ({ spaceId: 'space-b' }),
        ),
    ).rejects.toThrow('O espaço foi alterado.');
    expect(client.getQueryData(['auth', 'me'])).toEqual(auth);
    client.clear();
});

for (const date of [
    '2026-10-14T02:59:59.500Z',
    '2026-10-14T03:00:00.000Z',
    '2028-02-29T15:30:00.250Z',
])
    test(`A10: next civil date is São Paulo regardless of browser timezone at ${date}`, () => {
        const now = Date.parse(date);
        const delay = millisecondsUntilBusinessDateChange(now);
        const format = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
        expect(format.format(now + delay - 1)).toBe(format.format(now));
        expect(format.format(now + delay)).not.toBe(format.format(now));
    });

test('A23: Today REST uses authenticated GET/no-store without filters or command headers', async () => {
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
        await getToday('space-a', signal);
        expect(calls[0].url).toBe(
            'http://api.example.test/v2/spaces/space-a/today',
        );
        expect(calls[0].init.method).toBe('GET');
        expect(calls[0].init.credentials).toBe('include');
        expect(calls[0].init.cache).toBe('no-store');
        expect(calls[0].init.signal).toBe(signal);
        expect(calls[0].init.body).toBeUndefined();
        expect(new Headers(calls[0].init.headers).has('X-CSRF-Token')).toBe(
            false,
        );
        expect(new Headers(calls[0].init.headers).has('Idempotency-Key')).toBe(
            false,
        );
    } finally {
        globalThis.fetch = oldFetch;
        if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
        else Reflect.deleteProperty(globalThis, 'window');
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = oldUrl;
    }
});
