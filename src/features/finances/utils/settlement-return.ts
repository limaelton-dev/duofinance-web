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
