import { expect, test } from '@playwright/test';
import { formatPositionMoney } from '../../src/features/finances/utils/position-money';

test('A06: totais decimais de centavos acima do inteiro seguro mantêm precisão', () => {
    expect(formatPositionMoney('18014398509481983')).toBe(
        'R$ 180.143.985.094.819,83',
    );
    expect(formatPositionMoney('0')).toBe('R$ 0,00');
    expect(formatPositionMoney('101')).toBe('R$ 1,01');
    for (const value of ['-1', '1.1', '1e3', '', 'NaN', '01'])
        expect(() => formatPositionMoney(value)).toThrow();
});
