'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import {
    useSpaceContext,
    useSpaceContextInstance,
} from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import styles from './finances-summary.module.css';

export function SettlementAccess({
    spaceId,
    children,
}: {
    spaceId: string;
    children: (personId: string) => ReactNode;
}) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    useExpenseLeaveGuard(false, space.switchBlocked, () => {});
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    if (space.currentSpace?.type !== 'SHARED')
        return (
            <section className={styles.stack}>
                <h1>Acertos</h1>
                <p>Acertos se aplicam somente a espaços compartilhados.</p>
                <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
            </section>
        );
    return (
        <div key={`${auth.data.person.id}:${spaceId}:${space.generation}`}>
            {children(auth.data.person.id)}
        </div>
    );
}

export function useSettlementQuery<T extends { spaceId: string }>(
    personId: string,
    spaceId: string,
    identity: readonly unknown[],
    request: (signal: AbortSignal) => Promise<T>,
    enabled = true,
) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    const serialized = JSON.stringify(identity),
        current = useRef<string | null>(serialized);
    useLayoutEffect(() => {
        current.current = serialized;
        return () => {
            current.current = null;
        };
    }, [serialized]);
    const query = useExpenseQuery(
        personId,
        spaceId,
        ['finances', personId, spaceId, ...identity],
        enabled,
        request,
        () => current.current === serialized,
    );
    useEffect(() => {
        if (
            !(query.error instanceof ApiError) ||
            query.error.code !== 'SPACE_NOT_FOUND'
        )
            return;
        let active = true;
        const path = window.location.pathname;
        const pending = context.accessLost(spaceId),
            generation = context.getSnapshot().generation;
        void pending.then((success) => {
            if (
                success &&
                active &&
                generation === context.getSnapshot().generation &&
                window.location.pathname === path
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
        return () => {
            active = false;
        };
    }, [query.error, context, router, spaceId]);
    return query;
}

export function QueryFeedback({
    query,
    label,
}: {
    query: {
        isPending: boolean;
        isFetching: boolean;
        isError: boolean;
        error: unknown;
        refetch: () => unknown;
    };
    label: string;
}) {
    return (
        <>
            {(query.isPending || query.isFetching) && (
                <p role="status" aria-busy="true">
                    Carregando {label}…
                </p>
            )}
            {query.isError && (
                <div className={styles.stack}>
                    <p role="alert">
                        {query.error instanceof ApiError
                            ? query.error.message
                            : `Não foi possível consultar ${label}.`}
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void query.refetch()}
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
        error: string | null;
        isPending: boolean;
        canRetry: boolean;
        retry: () => void;
    };
}) {
    return (
        <>
            {command.isPending && (
                <p role="status" aria-busy="true">
                    Confirmando o registro…
                </p>
            )}
            {command.error && <p role="alert">{command.error}</p>}
            {command.canRetry && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={command.retry}
                    disabled={command.isPending}
                >
                    Reenviar a mesma tentativa
                </Button>
            )}
        </>
    );
}

export const settlementBlockMessage = (reason: string | null) =>
    ({
        SPACE_CLOSED:
            'Este espaço foi encerrado. O histórico continua disponível para consulta.',
        SETTLEMENT_CYCLE_FINALIZED:
            'Este ciclo está finalizado. Sua composição histórica está preservada.',
        OBLIGATION_ALREADY_RESOLVED: 'Esta pendência não tem valor em aberto.',
        CREDITOR_REQUIRED:
            'Somente a pessoa que tem a receber pode dispensar esta pendência.',
        NO_RECIPROCAL_OBLIGATIONS:
            'Não há valores recíprocos disponíveis para compensar neste recorte.',
        OPEN_OBLIGATIONS:
            'Resolva os valores em aberto antes de finalizar este ciclo.',
        ALREADY_REVERSED:
            'Este registro já foi revertido. O fato original continua no histórico.',
        CORRECTION_CYCLE_REQUIRED:
            'A origem pertence a um ciclo finalizado. Selecione um ciclo aberto para registrar a correção, preservando o histórico.',
    })[reason ?? ''] ??
    'Esta alteração não está disponível agora. Atualize os dados para conferir.';

export function SettlementNav({ spaceId }: { spaceId: string }) {
    return (
        <nav aria-label="Navegação dos acertos" className={styles.actions}>
            <Link href={`/spaces/${spaceId}/finances/settlements`}>
                Acertos
            </Link>
            <Link href={`/spaces/${spaceId}/finances/settlements/transfers`}>
                Transferências
            </Link>
            <Link href={`/spaces/${spaceId}/finances/settlements/offsets`}>
                Compensações
            </Link>
        </nav>
    );
}
