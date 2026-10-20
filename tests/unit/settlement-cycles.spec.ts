import { expect, test } from '@playwright/test';
import { QueryClient } from '@tanstack/react-query';
import { financesQueryKeys } from '../../src/features/finances/cache/finances-query-keys';
import { queryInFinancialContext } from '../../src/features/finances/cache/financial-context-query';
import { watchSpacesSession } from '../../src/features/spaces/cache/spaces-session';
import { settlementReturnPath } from '../../src/features/finances/utils/settlement-return';
import { formatPositionMoney } from '../../src/features/finances/utils/position-money';
import {
    getSettlementCycle,
    getSettlementCycles,
} from '../../src/lib/api/settlement-cycles';
import { ApiError } from '../../src/lib/api/api-error';

const auth = {
    person: { id: 'person-a', displayName: 'Pessoa', email: 'a@example.com' },
    personalSpace: { id: 'personal', type: 'PERSONAL', label: 'Meu espaço' },
};
const cycle = '11111111-1111-4111-8111-111111111111';
function deferred<T>() {
    let resolve!: (value: T) => void, reject!: (value: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

test('A10/A22: exact money and return through internal UUID identity', () => {
    expect(formatPositionMoney('18014398509481983')).toBe(
        'R$ 180.143.985.094.819,83',
    );
    expect(settlementReturnPath('space-a', cycle)).toBe(
        `/spaces/space-a/finances/settlements/${cycle}`,
    );
    for (const value of [
        'https://example.com',
        '//example.com',
        '/spaces/other',
        `${cycle}?a=b`,
        [cycle],
        undefined,
    ])
        expect(settlementReturnPath('space-a', value)).toBeNull();
});

test('A19: keys isolate person, space, cycle, view, direction and page', () => {
    const keys = [
        financesQueryKeys.cycles('a', 's', 'OPEN', null),
        financesQueryKeys.cycles('a', 's', 'UPCOMING', null),
        financesQueryKeys.cycles('b', 's', 'OPEN', null),
        financesQueryKeys.cycles('a', 't', 'OPEN', null),
        financesQueryKeys.cycles('a', 's', 'OPEN', 'cursor'),
        financesQueryKeys.cycle('a', 's', cycle, 'ALL', null),
        financesQueryKeys.cycle('a', 's', 'other', 'ALL', null),
        financesQueryKeys.cycle('a', 's', cycle, 'PAYABLE', null),
        financesQueryKeys.cycle('a', 's', cycle, 'ALL', 'cursor'),
    ];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(
        keys.length,
    );
});

for (const kind of ['success', '401', '500'] as const)
    test(`A19 transport fake ${kind}: stale generation is rejected before success or error`, async () => {
        const client = new QueryClient();
        client.setQueryData(['auth', 'me'], auth);
        const response = deferred<{ spaceId: string; marker: string }>();
        let generation = 1;
        const pending = queryInFinancialContext(
            client,
            'person-a',
            's',
            () => generation === 1,
            () => response.promise,
        );
        const rejection = expect(pending).rejects.toThrow(
            'O espaço foi alterado.',
        );
        generation = 3;
        if (kind === 'success')
            response.resolve({ spaceId: 's', marker: 'antigo' });
        else
            response.reject(
                new ApiError(
                    kind === '401' ? 401 : 500,
                    'CONTROLLED',
                    'Falha fake',
                    {},
                ),
            );
        await rejection;
        expect(client.getQueryData(['auth', 'me'])).toEqual(auth);
        client.clear();
    });

for (const kind of ['success', '401'] as const)
    test(`A19 session fake ${kind}: same-person logout and login discard stale response`, async () => {
        const client = new QueryClient();
        client.setQueryData(['auth', 'me'], auth);
        const stop = watchSpacesSession(client),
            response = deferred<{ spaceId: string }>();
        const pending = queryInFinancialContext(
            client,
            'person-a',
            's',
            () => true,
            () => response.promise,
        );
        const rejected = expect(pending).rejects.toThrow();
        client.setQueryData(
            financesQueryKeys.cycles('person-a', 's', 'OPEN', null),
            { marker: 'private' },
        );
        client.setQueryData(['auth', 'me'], null);
        expect(client.getQueriesData({ queryKey: ['finances'] })).toEqual([]);
        client.setQueryData(['auth', 'me'], auth);
        if (kind === 'success') response.resolve({ spaceId: 's' });
        else
            response.reject(
                new ApiError(401, 'UNAUTHENTICATED', 'Sessão fake antiga', {}),
            );
        await rejected;
        expect(client.getQueryData(['auth', 'me'])).toEqual(auth);
        stop();
        client.clear();
    });

test('REST client preserves GET/no-store, encoded cursors and explicit destinations', async () => {
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
        return new Response('{}', {
            headers: { 'Content-Type': 'application/json' },
        });
    };
    try {
        const signal = new AbortController().signal;
        await getSettlementCycles('space-a', 'UPCOMING', 'a+b/=', signal);
        await getSettlementCycle(
            'space-a',
            cycle,
            'RECEIVABLE',
            'page?2',
            signal,
        );
        expect(calls.map((call) => call.url)).toEqual([
            'http://api.example.test/v2/spaces/space-a/settlement-cycles?view=UPCOMING&cursor=a%2Bb%2F%3D',
            `http://api.example.test/v2/spaces/space-a/settlement-cycles/${cycle}?direction=RECEIVABLE&cursor=page%3F2`,
        ]);
        for (const { init } of calls) {
            expect(init.method).toBe('GET');
            expect(init.cache).toBe('no-store');
            expect(init.credentials).toBe('include');
            expect(init.signal).toBe(signal);
            expect(new Headers(init.headers).has('X-CSRF-Token')).toBe(false);
            expect(new Headers(init.headers).has('Idempotency-Key')).toBe(
                false,
            );
        }
    } finally {
        globalThis.fetch = oldFetch;
        if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
        else Reflect.deleteProperty(globalThis, 'window');
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = oldUrl;
    }
});
