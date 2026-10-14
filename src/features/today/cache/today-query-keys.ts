export const todayQueryKeys = {
    all: ['today'] as const,
    space: (personId: string, spaceId: string) =>
        ['today', personId, spaceId] as const,
};
