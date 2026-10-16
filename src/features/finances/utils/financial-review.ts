import { formatPositionMoney } from './position-money';
export { businessToday as financialReferenceDate } from './expense-money';

export function formatReviewMoney(cents: string) {
    if (!/^(0|-?[1-9]\d*)$/.test(cents))
        throw new Error('O valor em centavos é inválido.');
    return cents.startsWith('-')
        ? `-${formatPositionMoney(cents.slice(1))}`
        : formatPositionMoney(cents);
}
