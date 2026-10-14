'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryInFinancialContext } from '@/features/finances/cache/financial-context-query';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { getToday } from '@/lib/api/get-today';
import { todayQueryKeys } from '../cache/today-query-keys';
import { millisecondsUntilBusinessDateChange } from '../utils/business-date-change';

export function useToday(personId: string, spaceId: string) {
    const client = useQueryClient();
    const context = useSpaceContextInstance();
    const mounted = useRef(false);
    useLayoutEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const query = useQuery({
        queryKey: todayQueryKeys.space(personId, spaceId),
        queryFn: ({ signal }) => {
            const capture = context.capture();
            if (!capture || capture.spaceId !== spaceId)
                throw new Error('O espaço foi alterado.');
            return queryInFinancialContext(
                client,
                personId,
                spaceId,
                () => mounted.current && context.isCurrent(capture),
                () => getToday(spaceId, signal),
            );
        },
        staleTime: 0,
        retry: false,
        networkMode: 'always',
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
    });
    const { refetch } = query;
    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        const schedule = () => {
            timer = setTimeout(() => {
                void refetch().finally(() => {
                    if (active) schedule();
                });
            }, millisecondsUntilBusinessDateChange());
        };
        schedule();
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [refetch]);
    return query;
}
