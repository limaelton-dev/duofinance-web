'use client';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import {
    useSpaceContext,
    useSpaceContextInstance,
} from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
export function SpaceBoundary({
    spaceId,
    children,
}: {
    spaceId: string;
    children: (personId: string) => ReactNode;
}) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    return (
        <div key={`${auth.data.person.id}:${spaceId}:${space.generation}`}>
            {children(auth.data.person.id)}
        </div>
    );
}
export function QueryFeedback({
    query,
}: {
    query: {
        isPending: boolean;
        isFetching: boolean;
        isError: boolean;
        error: unknown;
        refetch: () => unknown;
    };
}) {
    const context = useSpaceContextInstance();
    useEffect(() => {
        if (
            query.error instanceof ApiError &&
            query.error.code === 'SPACE_NOT_FOUND'
        ) {
            const capture = context.capture();
            if (capture) void context.accessLost(capture.spaceId);
        }
    }, [query.error, context]);
    return (
        <>
            {query.isFetching && <p role="status">Atualizando informações…</p>}
            {query.isError && (
                <div role="alert">
                    <p>
                        Não foi possível atualizar esta consulta. Tente
                        novamente antes de confirmar.
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => query.refetch()}
                    >
                        Tentar novamente
                    </Button>
                </div>
            )}
        </>
    );
}
export function CommandFeedback({
    command,
}: {
    command: {
        isPending: boolean;
        canRetry: boolean;
        error: string | null;
        retry: () => void;
    };
}) {
    return (
        <>
            {command.error && <p role="alert">{command.error}</p>}
            {command.isPending && <p role="status">Confirmando registro…</p>}
            {command.canRetry && (
                <Button type="button" variant="outline" onClick={command.retry}>
                    Reenviar a mesma tentativa
                </Button>
            )}
        </>
    );
}
