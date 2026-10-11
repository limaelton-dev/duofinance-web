export function formatPositionMoney(cents: string) {
    if (!/^(0|[1-9]\d*)$/.test(cents))
        throw new Error('O valor em centavos é inválido.');
    const value = BigInt(cents);
    return `R$ ${new Intl.NumberFormat('pt-BR').format(value / 100n)},${String(value % 100n).padStart(2, '0')}`;
}
