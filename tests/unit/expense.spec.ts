import { expect, test } from '@playwright/test';
import {
    decimalUnits,
    exactShares,
    formatMoney,
    businessToday,
} from '../../src/features/finances/utils/expense-money';
test('decimal pt-BR e precisão máxima são exatos sem notação exponencial', () => {
    expect(decimalUnits('90.071.992.547.409,91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(formatMoney(Number.MAX_SAFE_INTEGER)).toBe(
        'R$ 90.071.992.547.409,91',
    );
    for (const value of [
        'NaN',
        '1e3',
        '1,001',
        '1.23',
        '-1',
        'Infinity',
        '90.071.992.547.409,92',
    ])
        expect(decimalUnits(value)).toBeNull();
    expect(decimalUnits('1.234,56')).toBe(123456);
    expect(businessToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
test('maior resto e ordem UUID preservam centavos e a entrada original', () => {
    const a = '00000000-0000-4000-8000-000000000001',
        b = '00000000-0000-4000-8000-000000000002';
    const input = {
        mode: 'PERCENTAGES' as const,
        shares: [
            { memberId: b, basisPoints: 5000 },
            { memberId: a, basisPoints: 5000 },
        ],
    };
    expect(exactShares(101, input)).toEqual([
        { memberId: a, amountInCents: 51 },
        { memberId: b, amountInCents: 50 },
    ]);
    expect(exactShares(1, input)).toEqual([
        { memberId: a, amountInCents: 1 },
        { memberId: b, amountInCents: 0 },
    ]);
    expect(input.shares[0].memberId).toBe(b);
    expect(() =>
        exactShares(100, {
            mode: 'AMOUNTS',
            shares: [{ memberId: a, amountInCents: 99 }],
        }),
    ).toThrow();
});
