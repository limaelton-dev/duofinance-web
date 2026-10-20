import { expect, test } from '@playwright/test';
import {
    assignmentVersions,
    reversalInput,
    settlementIds,
} from '../../src/features/finances/utils/settlement-depth';
import {
    configureSpecificRule,
    finalizeCycle,
    getAssignmentOptions,
    getOffsetHistory,
    getOffsetOptions,
    getReversalOptions,
    getSelectedCycles,
    getWaiverHistory,
    getWaiverOptions,
    moveObligation,
    recordOffset,
    reverseSettlement,
    waiveObligation,
} from '../../src/lib/api/settlement-depth';
import type {
    AssignmentOptions,
    ReversalOptions,
} from '../../src/features/finances/types/settlement-depth';

const first = '10000000-0000-4000-8000-000000000001',
    second = '10000000-0000-4000-8000-000000000002';
test('recorte temporário valida identidade, quantidade e duplicação antes da consulta', () => {
    expect(settlementIds(`${second},${first}`, 2)).toEqual([first, second]);
    for (const invalid of [
        undefined,
        first,
        `${first},${first}`,
        'https://example.test',
        `${first},${second}?x=1`,
        Array(51).fill(first).join(','),
    ])
        expect(settlementIds(invalid, 2)).toBeNull();
});
test('mudança de ciclo envia versões exatas sem incluir datas econômicas', () => {
    const source = {
            id: first,
            version: 3,
            targetDate: '2026-10-20',
            status: 'OPEN' as const,
        },
        target = {
            id: second,
            version: 7,
            targetDate: '2026-11-20',
            status: 'OPEN' as const,
        };
    const data = {
        currentCycle: source,
        cycles: [source, target],
    } as AssignmentOptions;
    expect(
        assignmentVersions(data, { mode: 'CYCLE', cycleId: second }),
    ).toEqual([
        { cycleId: first, version: 3 },
        { cycleId: second, version: 7 },
    ]);
    expect(
        assignmentVersions(data, { mode: 'DATE', targetDate: '2026-11-20' }),
    ).toEqual([
        { cycleId: first, version: 3 },
        { cycleId: second, version: 7 },
    ]);
    expect(assignmentVersions(data, { mode: 'CYCLE', cycleId: first })).toEqual(
        [{ cycleId: first, version: 3 }],
    );
    expect(assignmentVersions(data, { mode: 'NONE' })).toEqual([
        { cycleId: first, version: 3 },
    ]);
});
test('reversão preserva todas as aplicações e inclui versão do ciclo corretivo sem duplicação', () => {
    const data = {
        spaceVersion: 4,
        allocations: [{ id: first, amountInCents: 875, obligationId: second }],
        obligations: [{ id: second, version: 8 }],
        cycles: [{ id: first, version: 3, status: 'FINALIZED' }],
    } as ReversalOptions;
    const correction = {
        id: second,
        version: 5,
        targetDate: '2026-11-10',
        status: 'OPEN' as const,
    };
    expect(reversalInput(data, '2026-10-19', correction)).toEqual({
        expectedSpaceVersion: 4,
        factDate: '2026-10-19',
        expectedObligationVersions: [{ obligationId: second, version: 8 }],
        expectedCycleVersions: [
            { cycleId: first, version: 3 },
            { cycleId: second, version: 5 },
        ],
        applications: [{ allocationId: first, amountInCents: 875 }],
        correctionCycleId: second,
    });
    expect(reversalInput(data, '2026-10-19')).not.toHaveProperty(
        'correctionCycleId',
    );
});
test('contratos usam caminhos reais, versões e proteção CSRF; consultas permanecem somente leitura', async () => {
    const oldFetch = globalThis.fetch,
        oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'),
        oldUrl = process.env.NEXT_PUBLIC_API_URL;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
    });
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.test/v2';
    const calls: { url: URL; init: RequestInit }[] = [];
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: new URL(String(url)), init });
        return new Response('{}', {
            headers: { 'Content-Type': 'application/json' },
        });
    };
    const signal = new AbortController().signal,
        body = { expectedSpaceVersion: 3, expectedObligationVersion: 5 };
    try {
        await getSelectedCycles(
            'space',
            [second, first],
            'RECEIVABLE',
            'a+b/=',
            signal,
        );
        await getAssignmentOptions('space', first, 'page?2', signal);
        await getOffsetOptions(
            'space',
            { cycleIds: [second, first], obligationIds: [] },
            null,
            signal,
        );
        await getOffsetHistory('space', first, second, null, signal);
        await getWaiverOptions('space', first, signal);
        await getWaiverHistory('space', first, null, signal);
        await getReversalOptions('space', 'TRANSFER', first, signal);
        await getReversalOptions('space', 'OFFSET', second, signal);
        const readCount = calls.length;
        await moveObligation(
            'space',
            first,
            {
                ...body,
                settlement: { mode: 'NONE' },
                expectedCycleVersions: [],
            },
            'csrf',
            'same-key',
            signal,
        );
        await configureSpecificRule(
            'space',
            first,
            {
                expectedSpaceVersion: 3,
                expectedCommitmentVersion: 6,
                rule: { kind: 'MONTHLY_DAY', dayOfMonth: 25 },
            },
            'csrf',
            'same-key',
            signal,
        );
        await finalizeCycle(
            'space',
            first,
            { expectedSpaceVersion: 3, expectedCycleVersion: 9 },
            'csrf',
            'same-key',
            signal,
        );
        await recordOffset(
            'space',
            {
                scope: { cycleIds: [first], obligationIds: [] },
                expectedSpaceVersion: 3,
                factDate: '2026-10-19',
                expectedCycleVersions: [{ cycleId: first, version: 9 }],
                allocations: [
                    {
                        obligationId: first,
                        expectedObligationVersion: 5,
                        amountInCents: 100,
                    },
                    {
                        obligationId: second,
                        expectedObligationVersion: 6,
                        amountInCents: 100,
                    },
                ],
            },
            'csrf',
            'same-key',
            signal,
        );
        await waiveObligation(
            'space',
            first,
            { ...body, amountInCents: 100, factDate: '2026-10-19' },
            'csrf',
            'same-key',
            signal,
        );
        const reversal = {
            expectedSpaceVersion: 3,
            factDate: '2026-10-19',
            expectedObligationVersions: [{ obligationId: first, version: 5 }],
            expectedCycleVersions: [],
            applications: [{ allocationId: second, amountInCents: 100 }],
        };
        await reverseSettlement(
            'space',
            'TRANSFER',
            first,
            reversal,
            'csrf',
            'same-key',
            signal,
        );
        await reverseSettlement(
            'space',
            'OFFSET',
            second,
            reversal,
            'csrf',
            'same-key',
            signal,
        );
        expect(calls[0].url.pathname).toBe(
            '/v2/spaces/space/settlement-cycles/summary',
        );
        expect(calls[0].url.searchParams.get('cycleIds')).toBe(
            `${first},${second}`,
        );
        expect(calls[0].url.searchParams.get('cursor')).toBe('a+b/=');
        expect(calls[1].url.searchParams.get('cursor')).toBe('page?2');
        for (const call of calls.slice(0, readCount)) {
            expect(call.init.method).toBe('GET');
            expect(new Headers(call.init.headers).has('X-CSRF-Token')).toBe(
                false,
            );
        }
        expect(
            calls.slice(readCount).map((c) => [c.init.method, c.url.pathname]),
        ).toEqual([
            [
                'POST',
                `/v2/spaces/space/inter-member-obligations/${first}/settlement-assignment`,
            ],
            [
                'PUT',
                `/v2/spaces/space/financial-commitments/${first}/settlement-rule`,
            ],
            ['POST', `/v2/spaces/space/settlement-cycles/${first}/finalize`],
            ['POST', '/v2/spaces/space/settlement-offsets'],
            [
                'POST',
                `/v2/spaces/space/inter-member-obligations/${first}/waivers`,
            ],
            [
                'POST',
                `/v2/spaces/space/settlement-transfers/${first}/reversals`,
            ],
            ['POST', `/v2/spaces/space/settlement-offsets/${second}/reversals`],
        ]);
        for (const call of calls) {
            expect(call.init.credentials).toBe('include');
            expect(call.init.cache).toBe('no-store');
            expect(call.init.signal).toBe(signal);
        }
        for (const call of calls.slice(readCount)) {
            const headers = new Headers(call.init.headers);
            expect(headers.get('X-CSRF-Token')).toBe('csrf');
            expect(headers.get('Idempotency-Key')).toBe('same-key');
            expect(JSON.parse(String(call.init.body))).toHaveProperty(
                'expectedSpaceVersion',
                3,
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
