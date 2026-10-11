export const financesQueryKeys = {
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
