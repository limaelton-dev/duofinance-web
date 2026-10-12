'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef } from 'react';
import { queryInFinancialContext } from '../cache/financial-context-query';
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
    const mounted = useRef(false);
    useLayoutEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    return useQuery({
        queryKey: key,
        enabled,
        queryFn: ({ signal }) => {
            const capture = context.capture();
            if (!capture || capture.spaceId !== spaceId)
                throw new Error('O espaço foi alterado.');
            return queryInFinancialContext(
                client,
                personId,
                spaceId,
                () =>
                    mounted.current &&
                    context.isCurrent(capture) &&
                    isRequestCurrent(),
                () => request(signal),
            );
        },
        staleTime: 0,
        retry: false,
        networkMode: 'always',
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
}
