'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';

export function useFinancialReviewAccess(error: unknown, spaceId: string) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    useEffect(() => {
        if (!(error instanceof ApiError) || error.code !== 'SPACE_NOT_FOUND')
            return;
        let active = true;
        const request = context.accessLost(spaceId),
            generation = context.getSnapshot().generation;
        void request.then((success) => {
            if (
                success &&
                active &&
                context.getSnapshot().generation === generation &&
                window.location.pathname === `/spaces/${spaceId}/finances`
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
        return () => {
            active = false;
        };
    }, [context, error, router, spaceId]);
}
