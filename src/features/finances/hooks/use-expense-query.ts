'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryInSpacesSession } from '@/features/spaces/cache/spaces-session';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
export function useExpenseQuery<T extends { spaceId: string }>(
    personId: string,
    spaceId: string,
    key: readonly unknown[],
    enabled: boolean,
    request: (signal: AbortSignal) => Promise<T>,
    isRequestCurrent: () => boolean = () => true,
) {
    const client = useQueryClient(),
        context = useSpaceContextInstance();
    return useQuery({
        queryKey: key,
        enabled,
        queryFn: ({ signal }) => {
            const capture = context.capture();
            if (!capture || capture.spaceId !== spaceId)
                throw new Error('O espaço foi alterado.');
            return queryInSpacesSession(client, personId, async () => {
                try {
                    const result = await request(signal);
                    if (
                        !context.isCurrent(capture) ||
                        !isRequestCurrent() ||
                        result.spaceId !== spaceId
                    )
                        throw new Error('O espaço foi alterado.');
                    return result;
                } catch (error) {
                    if (!context.isCurrent(capture) || !isRequestCurrent())
                        throw new Error('O espaço foi alterado.');
                    throw error;
                }
            });
        },
        staleTime: 0,
        retry: false,
        networkMode: 'always',
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
}
