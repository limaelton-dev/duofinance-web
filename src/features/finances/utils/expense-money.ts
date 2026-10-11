import type { Split } from '../types/shared-expense';
export function decimalUnits(text: string): number | null {
    const value = text.trim();
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.replaceAll('.', '').split(',');
    const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}
export function exactShares(total: number, split: Split) {
    const values = [...split.shares].sort((a, b) =>
        a.memberId.toLowerCase() < b.memberId.toLowerCase() ? -1 : 1,
    );
    if (split.mode === 'AMOUNTS') {
        const shares = values as { memberId: string; amountInCents: number }[];
        if (
            shares.reduce((n, s) => n + BigInt(s.amountInCents), 0n) !==
            BigInt(total)
        )
            throw new Error('A divisão precisa totalizar o valor da despesa.');
        return shares;
    }
    const percentages = values as { memberId: string; basisPoints: number }[];
    if (
        percentages.some((s) => s.basisPoints > 10000) ||
        percentages.reduce((n, s) => n + s.basisPoints, 0) !== 10000
    )
        throw new Error('Os percentuais precisam totalizar 100,00%.');
    const calculated = percentages.map((s) => ({
        memberId: s.memberId,
        amount: (BigInt(total) * BigInt(s.basisPoints)) / 10000n,
        rest: (BigInt(total) * BigInt(s.basisPoints)) % 10000n,
    }));
    let residual =
        BigInt(total) - calculated.reduce((n, s) => n + s.amount, 0n);
    for (const s of [...calculated].sort((a, b) =>
        a.rest === b.rest
            ? a.memberId.toLowerCase() < b.memberId.toLowerCase()
                ? -1
                : 1
            : a.rest > b.rest
              ? -1
              : 1,
    ))
        if (residual > 0n) {
            s.amount++;
            residual--;
        }
    return calculated.map((s) => ({
        memberId: s.memberId,
        amountInCents: Number(s.amount),
    }));
}
export const formatMoney = (cents: number) => {
    const value = BigInt(cents);
    return `R$ ${new Intl.NumberFormat('pt-BR').format(value / 100n)},${String(value % 100n).padStart(2, '0')}`;
};
export const formatDate = (date: string) => date.split('-').reverse().join('/');
export function businessToday() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    return ['year', 'month', 'day']
        .map((kind) => parts.find((p) => p.type === kind)!.value)
        .join('-');
}
