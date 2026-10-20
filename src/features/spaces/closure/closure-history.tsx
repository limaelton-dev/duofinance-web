import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/features/finances/utils/expense-money';
import { getClosureHistory } from '@/lib/api/space-closure';
import { QueryFeedback } from '../components/space-operation-shared';
import { useSpaceQuery } from '../hooks/use-space-query';
import {
    actionsClass,
    closureKey,
    DestinationEffects,
    memberName,
    planLabels,
    sectionClass,
} from './closure-shared';

export function ClosureHistorySection({
    personId,
    spaceId,
    closed,
}: {
    personId: string;
    spaceId: string;
    closed: boolean;
}) {
    const [cursors, setCursors] = useState<(string | null)[]>([null]);
    const cursor = cursors.at(-1)!;
    const query = useSpaceQuery(
        personId,
        spaceId,
        closureKey(personId, spaceId, 'history', cursor),
        true,
        (signal) => getClosureHistory(spaceId, cursor, signal),
    );
    const data = !query.isFetching && !query.isError ? query.data : undefined;
    const historyLabels: Record<string, string> = {
        START_CLOSURE: 'Encerramento solicitado',
        PROPOSE_CLOSURE_CUTOFF: 'Data de corte proposta',
        UPSERT_CLOSURE_DESTINATION: 'Destino futuro definido',
        PROPOSE_CLOSURE_PLAN: 'Plano proposto',
        APPROVE_CLOSURE_PLAN: 'Plano aprovado',
        REJECT_CLOSURE_PLAN: 'Plano rejeitado',
        CONFIRM_SPACE_CLOSURE: 'Confirmação final',
        CANCEL_SPACE_CLOSURE: 'Consentimento de cancelamento',
    };
    return (
        <section
            id="history"
            className={sectionClass}
            aria-labelledby="history-title"
        >
            <h2
                id="history-title"
                className="text-xl font-semibold tracking-tight"
            >
                Histórico preservado
            </h2>
            <QueryFeedback query={query} />
            {data && (
                <>
                    {!data.items.length && (
                        <p>
                            Nenhuma decisão registrada nesta página do
                            histórico.
                        </p>
                    )}
                    <ol className="divide-y divide-border">
                        {data.items.map((item) => (
                            <li key={item.id} className="space-y-3 py-5">
                                <h3 className="font-semibold">
                                    {historyLabels[item.action] ??
                                        'Decisão registrada'}{' '}
                                    · revisão {item.planRevision}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {memberName(
                                        item.snapshot.participants,
                                        item.actorMemberId,
                                    )}{' '}
                                    ·{' '}
                                    <time dateTime={item.recordedAt}>
                                        {new Intl.DateTimeFormat('pt-BR', {
                                            dateStyle: 'short',
                                            timeStyle: 'short',
                                            timeZone: 'America/Sao_Paulo',
                                        }).format(new Date(item.recordedAt))}
                                    </time>
                                </p>
                                <details>
                                    <summary className="cursor-pointer py-2 text-sm font-medium">
                                        Consultar estado registrado
                                    </summary>
                                    <div className="space-y-4 pt-3">
                                        <p>
                                            Plano{' '}
                                            {planLabels[
                                                item.snapshot.planStatus
                                            ].toLowerCase()}{' '}
                                            · Corte em{' '}
                                            {formatDate(
                                                item.snapshot.cutoffDate,
                                            )}
                                            {item.snapshot.proposedCutoffDate
                                                ? ` · Proposta de corte em ${formatDate(item.snapshot.proposedCutoffDate)}`
                                                : ''}
                                            .
                                        </p>
                                        {item.snapshot.futureDestinations.map(
                                            (destination) => (
                                                <div
                                                    key={destination.originId}
                                                    className="space-y-3 border-t border-border pt-4"
                                                >
                                                    <h4 className="font-semibold">
                                                        {
                                                            destination
                                                                .originSnapshot
                                                                .description
                                                        }
                                                    </h4>
                                                    <DestinationEffects
                                                        value={destination}
                                                        members={
                                                            item.snapshot
                                                                .participants
                                                        }
                                                    />
                                                </div>
                                            ),
                                        )}
                                    </div>
                                </details>
                            </li>
                        ))}
                    </ol>
                    <div className={actionsClass}>
                        <Button
                            variant="outline"
                            disabled={cursors.length < 2 || query.isFetching}
                            onClick={() =>
                                setCursors((value) => value.slice(0, -1))
                            }
                        >
                            Página anterior
                        </Button>
                        <Button
                            variant="outline"
                            disabled={!data.nextCursor || query.isFetching}
                            onClick={() => {
                                if (data.nextCursor)
                                    setCursors((value) => [
                                        ...value,
                                        data.nextCursor,
                                    ]);
                            }}
                        >
                            Próxima página
                        </Button>
                    </div>
                </>
            )}
            {closed && (
                <div className={actionsClass}>
                    <Link
                        className="inline-flex min-h-11 items-center underline underline-offset-4"
                        href={`/spaces/${spaceId}/finances`}
                    >
                        Consultar finanças
                    </Link>
                    <Link
                        className="inline-flex min-h-11 items-center underline underline-offset-4"
                        href={`/spaces/${spaceId}/routine`}
                    >
                        Consultar rotina
                    </Link>
                    <Link
                        className="inline-flex min-h-11 items-center underline underline-offset-4"
                        href={`/spaces/${spaceId}/shopping`}
                    >
                        Consultar compras
                    </Link>
                </div>
            )}
        </section>
    );
}
