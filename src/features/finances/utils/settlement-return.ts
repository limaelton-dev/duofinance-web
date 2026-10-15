import type { ObligationOrigin } from '../types/inter-member-position';

export function financialOriginPath(
    spaceId: string,
    origin: ObligationOrigin,
    cycleId?: string | null,
) {
    const category = origin.kind === 'INCOME' ? 'incomes' : 'expenses';
    const returnPath = cycleId ? settlementReturnPath(spaceId, cycleId) : null;
    return `/spaces/${spaceId}/${category}/${origin.commitmentId}${returnPath ? `?returnCycle=${cycleId}` : ''}`;
}

export function settlementReturnPath(
    spaceId: string,
    cycleId: unknown,
): string | null {
    if (
        typeof cycleId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            cycleId,
        )
    )
        return null;
    return `/spaces/${spaceId}/finances/settlements/${cycleId.toLowerCase()}`;
}
