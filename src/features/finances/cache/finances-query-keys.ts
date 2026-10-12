export const financesQueryKeys = {
    cycles: (
        personId: string,
        spaceId: string,
        view: string,
        cursor: string | null,
    ) =>
        [
            'finances',
            personId,
            spaceId,
            'settlement-cycles',
            view,
            cursor,
        ] as const,
    cycle: (
        personId: string,
        spaceId: string,
        cycleId: string,
        direction: string,
        cursor: string | null,
    ) =>
        [
            'finances',
            personId,
            spaceId,
            'settlement-cycle',
            cycleId,
            direction,
            cursor,
        ] as const,
    position: (
        personId: string,
        spaceId: string,
        direction: string,
        cursor: string | null,
    ) =>
        [
            'finances',
            personId,
            spaceId,
            'inter-member-position',
            direction,
            cursor,
        ] as const,
    rule: (personId: string, spaceId: string) =>
        ['finances', personId, spaceId, 'default-settlement-rule'] as const,
};
