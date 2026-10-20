import { expect, test } from '@playwright/test';
import { QueryClient } from '@tanstack/react-query';
import { financesQueryKeys } from '../../src/features/finances/cache/finances-query-keys';
import { formatReviewMoney } from '../../src/features/finances/utils/financial-review';
import { financialReferenceDate } from '../../src/features/finances/utils/financial-review';
import { invalidatePersonalExpenseQueries } from '../../src/features/finances/cache/personal-expense-query-keys';

test('resultado negativo e somas acima do limite seguro preservam todos os centavos', () => {
    expect(formatReviewMoney('-18014398509481983')).toBe(
        '-R$ 180.143.985.094.819,83',
    );
    expect(formatReviewMoney('18014398509481983')).toBe(
        'R$ 180.143.985.094.819,83',
    );
    expect(formatReviewMoney('0')).toBe('R$ 0,00');
    for (const value of ['-0', '01', '1.2', '1e3', '', 'NaN'])
        expect(() => formatReviewMoney(value)).toThrow();
});

test('referência diária segue a data civil de São Paulo em limites de mês e ano', () => {
    expect(financialReferenceDate(new Date('2027-01-01T02:59:59.999Z'))).toBe(
        '2026-12-31',
    );
    expect(financialReferenceDate(new Date('2027-01-01T03:00:00Z'))).toBe(
        '2027-01-01',
    );
    expect(financialReferenceDate(new Date('2028-03-01T02:59:59Z'))).toBe(
        '2028-02-29',
    );
});

test('chaves isolam pessoa, espaço, visão, mês, membro, página e referência diária', () => {
    const base = [
        'person-a',
        'space-a',
        'HISTORY',
        '2026-10',
        null,
        null,
        '2026-10-15',
    ] as const;
    const key = financesQueryKeys.review(...base);
    expect(key.slice(0, 3)).toEqual(['finances', 'person-a', 'space-a']);
    for (const [index, replacement] of [
        [0, 'person-b'],
        [1, 'space-b'],
        [2, 'CALENDAR'],
        [3, '2026-11'],
        [4, 'member-a'],
        [5, 'cursor'],
        [6, '2026-10-16'],
    ] as const) {
        const changed = [...base] as [
            string,
            string,
            string,
            string,
            string | null,
            string | null,
            string,
        ];
        changed[index] = replacement;
        expect(financesQueryKeys.review(...changed)).not.toEqual(key);
    }
});

test('comando pessoal invalida consultas de qualquer mês só no contexto correto', () => {
    const client = new QueryClient();
    const own = financesQueryKeys.review(
        'a',
        'space-a',
        'OVERVIEW',
        '2026-08',
        null,
        null,
        '2026-10-15',
    );
    const other = financesQueryKeys.review(
        'a',
        'space-b',
        'OVERVIEW',
        '2026-08',
        null,
        null,
        '2026-10-15',
    );
    client.setQueryData(own, { total: '1' });
    client.setQueryData(other, { total: '2' });
    invalidatePersonalExpenseQueries(client, 'a', 'space-a');
    expect(client.getQueryState(own)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    client.clear();
});

import {
    getFinancialOverview,
    getFinancialTimeline,
    getFinancialForecast,
} from '../../src/lib/api/financial-review';
import { queryInFinancialContext } from '../../src/features/finances/cache/financial-context-query';
import { watchSpacesSession } from '../../src/features/spaces/cache/spaces-session';
import { ApiError } from '../../src/lib/api/api-error';

const reviewAuth = {
    person: { id: 'person-a' },
    personalSpace: { id: 'space-a' },
};

async function reviewApi(
    run: (
        calls: { url: URL; init: RequestInit }[],
        respond: (body: object, status?: number) => void,
    ) => Promise<void>,
) {
    const originalFetch = globalThis.fetch,
        originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'),
        originalUrl = process.env.NEXT_PUBLIC_API_URL;
    const calls: { url: URL; init: RequestInit }[] = [];
    let body: object = {},
        status = 200;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
    });
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.test/v2';
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: new URL(String(url)), init });
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    };
    try {
        await run(calls, (value, code = 200) => {
            body = value;
            status = code;
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

test('clientes GET preservam filtros/cursor, cancelamento e contrato sem dados de comando', async () => {
    await reviewApi(async (calls, respond) => {
        const scope = {
            spaceId: 'space-a',
            month: '2026-10',
            memberId: 'member-b',
        };
        const signal = new AbortController().signal;
        respond(scope);
        await getFinancialOverview('space-a', '2026-10', 'member-b', signal);
        respond({ ...scope, view: 'HISTORY' });
        await getFinancialTimeline(
            'space-a',
            '2026-10',
            'HISTORY',
            'member-b',
            'opaque/+==',
            signal,
        );
        respond(scope);
        await getFinancialForecast(
            'space-a',
            '2026-10',
            'member-b',
            'opaque/+==',
            signal,
        );
        expect(calls.map((call) => call.url.pathname)).toEqual([
            '/v2/spaces/space-a/financial-overview',
            '/v2/spaces/space-a/financial-timeline',
            '/v2/spaces/space-a/financial-forecast',
        ]);
        expect(calls[1].url.searchParams.get('cursor')).toBe('opaque/+==');
        expect(calls[1].url.searchParams.get('view')).toBe('HISTORY');
        for (const { url, init } of calls) {
            expect(url.searchParams.get('month')).toBe('2026-10');
            expect(url.searchParams.get('memberId')).toBe('member-b');
            expect(init.signal).toBe(signal);
            expect(init.method).toBe('GET');
            expect(init.body).toBeUndefined();
            expect(init.credentials).toBe('include');
            expect(init.cache).toBe('no-store');
            expect(new Headers(init.headers).has('Idempotency-Key')).toBe(
                false,
            );
        }
    });
});

test('respostas de outro espaço, mês, membro ou visão são recusadas e falha HTTP não vira zero', async () => {
    await reviewApi(async (_, respond) => {
        const scope = { spaceId: 'space-a', month: '2026-10', memberId: null };
        for (const wrong of [
            { spaceId: 'space-b' },
            { month: '2026-11' },
            { memberId: 'member-b' },
        ]) {
            respond({ ...scope, ...wrong });
            await expect(
                getFinancialOverview('space-a', '2026-10', null),
            ).rejects.toThrow('contexto');
            await expect(
                getFinancialForecast('space-a', '2026-10', null, null),
            ).rejects.toThrow('contexto');
        }
        respond({ ...scope, view: 'CALENDAR' });
        await expect(
            getFinancialTimeline('space-a', '2026-10', 'HISTORY', null, null),
        ).rejects.toThrow('visão');
        respond({ code: 'INTERNAL_ERROR', message: 'Indisponível' }, 503);
        await expect(
            getFinancialOverview('space-a', '2026-10', null),
        ).rejects.toMatchObject({ status: 503 });
    });
});

for (const late401 of [false, true])
    test(`mês A → B → A descarta ${late401 ? '401' : 'sucesso'} tardio sem substituir a seleção atual`, async () => {
        const client = new QueryClient();
        client.setQueryData(['auth', 'me'], reviewAuth);
        let generation = 1;
        let resolve!: (value: { spaceId: string }) => void,
            reject!: (reason: unknown) => void;
        const pending = queryInFinancialContext(
            client,
            'person-a',
            'space-a',
            () => generation === 1,
            () =>
                new Promise<{ spaceId: string }>((done, fail) => {
                    resolve = done;
                    reject = fail;
                }),
        );
        const rejected = expect(pending).rejects.toThrow(
            'O espaço foi alterado.',
        );
        generation = 2;
        generation = 3;
        if (late401)
            reject(new ApiError(401, 'UNAUTHENTICATED', 'Expirada', {}));
        else resolve({ spaceId: 'space-a' });
        await rejected;
        expect(client.getQueryData(['auth', 'me'])).toEqual(reviewAuth);
        client.clear();
    });

test('logout/login da mesma pessoa descarta 401 de sessão anterior e limpa leituras', async () => {
    const client = new QueryClient();
    client.setQueryData(['auth', 'me'], reviewAuth);
    const stop = watchSpacesSession(client);
    let reject!: (error: unknown) => void;
    const pending = queryInFinancialContext(
        client,
        'person-a',
        'space-a',
        () => true,
        () =>
            new Promise<{ spaceId: string }>((_, fail) => {
                reject = fail;
            }),
    );
    const rejected = expect(pending).rejects.toBeInstanceOf(ApiError);
    const key = financesQueryKeys.review(
        'person-a',
        'space-a',
        'OVERVIEW',
        '2026-10',
        null,
        null,
        '2026-10-15',
    );
    client.setQueryData(key, { spaceId: 'space-a' });
    client.setQueryData(['auth', 'me'], null);
    client.setQueryData(['auth', 'me'], reviewAuth);
    reject(new ApiError(401, 'UNAUTHENTICATED', 'Expirada', {}));
    await rejected;
    expect(client.getQueryData(['auth', 'me'])).toEqual(reviewAuth);
    expect(client.getQueryData(key)).toBeUndefined();
    stop();
    client.clear();
});

import { invalidateIncomeQueries } from '../../src/features/finances/cache/income-query-keys';
import { getOpenExternalLiabilities } from '../../src/lib/api/external-liability-settlement';

test('recebimento e liquidação invalidam previsão, resumo e aberto em todos os meses do contexto', () => {
    const client = new QueryClient();
    const keys = [
        financesQueryKeys.review(
            'person-a',
            'space-a',
            'OVERVIEW',
            '2026-08',
            'member-b',
            null,
            '2026-10-15',
        ),
        financesQueryKeys.review(
            'person-a',
            'space-a',
            'FORECAST',
            '2099-01',
            null,
            null,
            '2026-10-15',
        ),
        [
            'finances',
            'person-a',
            'space-a',
            'external-liabilities',
            'member-b',
            null,
        ],
    ];
    const other = financesQueryKeys.review(
        'person-b',
        'space-a',
        'OVERVIEW',
        '2026-08',
        null,
        null,
        '2026-10-15',
    );
    for (const key of [...keys, other]) client.setQueryData(key, {});
    invalidateIncomeQueries(client, 'person-a', 'space-a');
    for (const key of keys)
        expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    client.clear();
});

test('drilldown de cartão preserva filtro de titular e cursor sem alterar comandos', async () => {
    await reviewApi(async (calls, respond) => {
        respond({ spaceId: 'space-a' });
        await getOpenExternalLiabilities(
            'space-a',
            'page/+==',
            undefined,
            'member-b',
        );
        expect(calls[0].url.searchParams.get('memberId')).toBe('member-b');
        expect(calls[0].url.searchParams.get('cursor')).toBe('page/+==');
        expect(calls[0].init.method).toBe('GET');
        expect(calls[0].init.body).toBeUndefined();
    });
});
