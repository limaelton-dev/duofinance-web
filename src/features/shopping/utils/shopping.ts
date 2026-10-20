export function shoppingQuantity(value: string, zero = false): string {
    const normalized = value.trim().replace(',', '.');
    if (!/^\d{1,12}(?:\.\d{1,3})?$/.test(normalized))
        throw new Error('Informe uma quantidade com até três casas decimais.');
    const [whole, fraction = ''] = normalized.split('.');
    const scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
    if (scaled > 999999999999999n || (!zero && scaled === 0n))
        throw new Error(
            'Informe uma quantidade positiva de até 999.999.999.999,999.',
        );
    const decimals = String(scaled % 1000n)
        .padStart(3, '0')
        .replace(/0+$/, '');
    return `${scaled / 1000n}${decimals ? `.${decimals}` : ''}`;
}
export function formatQuantity(value: string, unit?: string | null) {
    return `${value.replace('.', ',')}${unit ? ` ${unit}` : ''}`;
}
export function shoppingDate(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
    }).format(new Date(value));
}
export const shoppingStatus: Record<string, string> = {
    ACTIVE: 'Ativa',
    ARCHIVED: 'Arquivada',
    PENDING: 'Pendente',
    PARTIALLY_PURCHASED: 'Compra parcial',
    PURCHASED: 'Comprado',
    REMOVED: 'Removido',
    COMPLETED: 'Concluída',
    CANCELLED: 'Cancelada',
};
export function shoppingHistoryDetail(
    type: string,
    data: Record<string, unknown>,
) {
    const record = (value: unknown): Record<string, unknown> =>
        typeof value === 'object' && value !== null
            ? (value as Record<string, unknown>)
            : {};
    const amount = (value: Record<string, unknown>, key = 'quantity') =>
        typeof value[key] === 'string'
            ? formatQuantity(
                  value[key] as string,
                  typeof value.unit === 'string' ? value.unit : null,
              )
            : null;
    if (type === 'RENAMED')
        return `De ${String(data.before ?? 'Lista sem nome')} para ${String(data.after ?? 'Lista sem nome')}`;
    if (type === 'ITEM_ADDED') {
        const item = record(data.item),
            quantity = amount(item, 'desiredQuantity');
        return `${String(item.description ?? 'Item')}${quantity ? ` · Desejado: ${quantity}` : ''}`;
    }
    if (type === 'ITEM_NEED_CHANGED') {
        const before = amount(record(data.before), 'desiredQuantity'),
            after = amount(record(data.after), 'desiredQuantity');
        return before && after ? `De ${before} para ${after}` : null;
    }
    if (type === 'PURCHASE_RECORDED') {
        const quantity = amount(record(data.purchase));
        return quantity ? `Quantidade registrada: ${quantity}` : null;
    }
    if (type === 'PURCHASE_CORRECTED') {
        const correction = record(data.correction),
            before = amount(correction, 'previousQuantity'),
            after = amount(correction);
        return before && after
            ? `De ${before} para ${after}. Registro original preservado.`
            : null;
    }
    return null;
}
