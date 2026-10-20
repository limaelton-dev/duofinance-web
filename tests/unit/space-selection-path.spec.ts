import { expect, test } from '@playwright/test';
import { spaceSelectionPath } from '../../src/features/spaces/utils/space-selection-path';

const oldSpace = '10000000-0000-4000-8000-000000000001';
const newSpace = '10000000-0000-4000-8000-000000000002';
const oldEntity = '20000000-0000-4000-8000-000000000001';

const sections = [
    ['/recurring-commitments', '/recurring-commitments'],
    [`/recurring-commitments/${oldEntity}`, '/recurring-commitments'],
    ['/recurring-commitments/new', '/recurring-commitments/new'],
    ['/installment-commitments', '/installment-commitments'],
    [`/installment-commitments/${oldEntity}`, '/installment-commitments'],
    ['/installment-commitments/new', '/installment-commitments/new'],
    ['/finances/planning', '/finances/planning'],
    [`/finances/planning/${oldEntity}`, '/finances/planning'],
    [`/finances/commitments/${oldEntity}`, '/finances'],
    [
        `/finances/commitments/${oldEntity}?modality=INSTALLMENT&installmentId=${oldEntity}`,
        '/finances',
    ],
    ['/finances', '/finances'],
    ['/expenses/new', '/expenses/new'],
    ['/incomes', '/incomes'],
    ['/routine', '/routine'],
    [`/routine/tasks/${oldEntity}`, '/routine'],
    [
        `/routine/recurrences/${oldEntity}/occurrences/2026-10-19?from=attention`,
        '/routine',
    ],
    [`/shopping/lists/${oldEntity}/items/${oldEntity}`, '/shopping'],
    ['/shopping?status=ARCHIVED', '/shopping'],
] as const;
for (const type of ['PERSONAL', 'SHARED'] as const) {
    test(`troca para ${type}: preserva seção financeira sem transportar IDs ou parâmetros anteriores`, () => {
        for (const [source, destination] of sections) {
            const result = spaceSelectionPath(`/spaces/${oldSpace}${source}`, {
                id: newSpace,
                type,
            });
            expect(result).toBe(`/spaces/${newSpace}${destination}`);
            expect(result).not.toContain(oldSpace);
            expect(result).not.toContain(oldEntity);
            expect(result).not.toMatch(/[?#]/);
        }
    });
}
test('troca compartilhada: mantém acertos, transferências e compensações sem reaproveitar origens', () => {
    for (const [source, destination] of [
        ['/finances/changes', '/finances/changes'],
        [`/finances/settlements/${oldEntity}`, '/finances/settlements'],
        [
            `/finances/settlements/obligations/${oldEntity}`,
            '/finances/settlements',
        ],
        [`/finances/settlements/rules/${oldEntity}`, '/finances/settlements'],
        [
            `/finances/settlements/selected?cycleIds=${oldEntity}`,
            '/finances/settlements',
        ],
        [
            `/finances/settlements/offsets/${oldEntity}/reverse`,
            '/finances/settlements/offsets',
        ],
        [
            `/finances/settlements/offsets?obligationId=${oldEntity}`,
            '/finances/settlements/offsets',
        ],
        [
            `/finances/settlements/transfers/${oldEntity}/reverse`,
            '/finances/settlements/transfers',
        ],
        [
            '/finances/settlements/transfers/new',
            '/finances/settlements/transfers/new',
        ],
        ['/settings', '/settings'],
        ['/closure?processId=old', '/closure'],
    ]) {
        const result = spaceSelectionPath(`/spaces/${oldSpace}${source}`, {
            id: newSpace,
            type: 'SHARED',
        });
        expect(result).toBe(`/spaces/${newSpace}${destination}`);
        expect(result).not.toContain(oldEntity);
        expect(result).not.toContain(oldSpace);
    }
});
test('troca para pessoal: propostas e acertos compartilhados retornam a Finanças', () => {
    for (const source of [
        '/finances/changes',
        '/finances/settlements',
        `/finances/settlements/obligations/${oldEntity}`,
        `/finances/settlements/offsets/${oldEntity}`,
        '/finances/settlements/transfers/new',
    ]) {
        expect(
            spaceSelectionPath(`/spaces/${oldSpace}${source}`, {
                id: newSpace,
                type: 'PERSONAL',
            }),
        ).toBe(`/spaces/${newSpace}/finances`);
    }
    expect(
        spaceSelectionPath(`/spaces/${oldSpace}/settings`, {
            id: newSpace,
            type: 'PERSONAL',
        }),
    ).toBe(`/spaces/${newSpace}`);
    expect(
        spaceSelectionPath(`/spaces/${oldSpace}/closure`, {
            id: newSpace,
            type: 'PERSONAL',
        }),
    ).toBe(`/spaces/${newSpace}`);
});
