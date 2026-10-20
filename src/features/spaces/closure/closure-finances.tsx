import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { getClosureFinancialValidation } from '@/lib/api/space-closure';
import { QueryFeedback } from '../components/space-operation-shared';
import { useSpaceQuery } from '../hooks/use-space-query';
import {
    actionsClass,
    closureKey,
    ConsentCheck,
    memberName,
    OutstandingAmounts,
    panelClass,
    sectionClass,
    type ClosureActions,
} from './closure-shared';
import type { ClosureApplication, ClosureBlocker, ClosureView } from './types';

export function ClosureFinances({
    personId,
    closure,
    actions,
    blockers,
}: {
    personId: string;
    closure: ClosureView;
    actions: ClosureActions;
    blockers: ClosureBlocker[];
}) {
    const query = useSpaceQuery(
        personId,
        closure.spaceId,
        closureKey(
            personId,
            closure.spaceId,
            'financial',
            closure.spaceVersion,
        ),
        true,
        (signal) => getClosureFinancialValidation(closure.spaceId, signal),
    );
    const data =
        !query.isFetching &&
        !query.isError &&
        query.data?.spaceVersion === closure.spaceVersion &&
        query.data?.planRevision === closure.planRevision
            ? query.data
            : undefined;
    return (
        <section
            id="finances"
            className={sectionClass}
            aria-labelledby="financial-title"
        >
            <h2
                id="financial-title"
                className="text-xl font-semibold tracking-tight"
            >
                Resolver o financeiro
            </h2>
            <p className="text-sm text-muted-foreground">
                Registre somente fatos reais. Transferência registra dinheiro
                transferido fora do produto; compensação reduz pendências nas
                duas direções; dispensa pertence ao credor. Os mecanismos
                existentes preservam as origens.
            </p>
            <QueryFeedback query={query} />
            {data && (
                <>
                    <p className={panelClass}>
                        {data.financiallyReady
                            ? 'As condições financeiras estão satisfeitas nesta consulta.'
                            : `Há ${data.totalCount} bloqueador(es) financeiro(s) e ${data.missingDestinationOriginIds.length} destino(s) futuro(s) sem tratamento válido.`}
                        {!data.planApproved &&
                            ' O plano ainda precisa das concordâncias exigidas.'}{' '}
                        A conclusão continua exigindo confirmação explícita.
                    </p>
                    <OutstandingAmounts
                        finance={data}
                        members={closure.participants}
                    />
                    <div className={actionsClass}>
                        <Button asChild variant="outline">
                            <Link
                                href={`/spaces/${closure.spaceId}/finances/settlements/transfers/new`}
                            >
                                Registrar transferência
                            </Link>
                        </Button>
                        <Link
                            className="inline-flex min-h-12 items-center underline underline-offset-4"
                            href="#diagnostic"
                        >
                            Escolher pendência para dispensa ou resolução
                        </Link>
                    </div>
                    <ClosureCompensation
                        spaceId={closure.spaceId}
                        blockers={blockers}
                        closure={closure}
                        busy={actions.busy}
                    />
                    <AppliedDestinations
                        closure={closure}
                        applications={data.appliedDestinations}
                        personId={personId}
                    />
                    {data.resolutions.length > 0 && (
                        <details>
                            <summary className="cursor-pointer py-3 font-semibold">
                                Resoluções vinculadas ao processo (
                                {data.resolutions.length})
                            </summary>
                            <ul className="divide-y divide-border">
                                {data.resolutions.map((resolution) => (
                                    <li
                                        key={`${resolution.kind}:${resolution.id}`}
                                        className="space-y-1 py-3"
                                    >
                                        <p>
                                            {
                                                {
                                                    TRANSFER: 'Transferência',
                                                    OFFSET: 'Compensação',
                                                    WAIVER: 'Dispensa',
                                                    REVERSAL: 'Reversão',
                                                    ASSIGNMENT: 'Atribuição',
                                                    CYCLE_FINALIZATION:
                                                        'Finalização de ciclo',
                                                }[resolution.kind]
                                            }{' '}
                                            · revisão {resolution.planRevision}
                                        </p>
                                        {resolution.obligationIds.map((id) => (
                                            <Link
                                                key={id}
                                                className="mr-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                                                href={`/spaces/${closure.spaceId}/finances/settlements/obligations/${id}`}
                                            >
                                                Consultar pendência de origem
                                            </Link>
                                        ))}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                    <Button
                        variant="outline"
                        disabled={actions.busy || query.isFetching}
                        onClick={() => void query.refetch()}
                    >
                        Validar financeiro novamente
                    </Button>
                </>
            )}
        </section>
    );
}

function ClosureCompensation({
    spaceId,
    blockers,
    closure,
    busy,
}: {
    spaceId: string;
    blockers: ClosureBlocker[];
    closure: ClosureView;
    busy: boolean;
}) {
    const obligations = blockers.filter(
        (item) => item.type === 'INTER_MEMBER_OBLIGATION',
    );
    const [selected, setSelected] = useState<string[]>([]);
    return obligations.length ? (
        <div className="space-y-3">
            <details>
                <summary className="cursor-pointer py-3 font-semibold">
                    Escolher pendências para compensação
                </summary>
                <p className="text-sm text-muted-foreground">
                    Selecione até 50 pendências, com ou sem ciclo de acerto. A
                    próxima tela confere os valores nas duas direções antes do
                    registro.
                </p>
                {obligations.length <= 50 && (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                            setSelected(
                                selected.length === obligations.length
                                    ? []
                                    : obligations.map((item) => item.originId),
                            )
                        }
                    >
                        {selected.length === obligations.length
                            ? 'Limpar seleção'
                            : 'Selecionar todas as pendências'}
                    </Button>
                )}
                <ul className="divide-y divide-border">
                    {obligations.map((item) => (
                        <li key={item.originId}>
                            <ConsentCheck
                                checked={selected.includes(item.originId)}
                                disabled={
                                    busy ||
                                    (!selected.includes(item.originId) &&
                                        selected.length >= 50)
                                }
                                onChange={(checked) =>
                                    setSelected((value) =>
                                        checked
                                            ? [...value, item.originId]
                                            : value.filter(
                                                  (id) => id !== item.originId,
                                              ),
                                    )
                                }
                            >
                                {item.description ?? 'Pendência'} ·{' '}
                                {memberName(
                                    closure.participants,
                                    item.debtorMemberId ?? '',
                                )}{' '}
                                deve a{' '}
                                {memberName(
                                    closure.participants,
                                    item.creditorMemberId ?? '',
                                )}
                            </ConsentCheck>
                        </li>
                    ))}
                </ul>
            </details>
            <p className="text-sm text-muted-foreground">
                {selected.length} pendência(s) selecionada(s).
            </p>
            {selected.length ? (
                <Button asChild variant="outline">
                    <Link
                        href={`/spaces/${spaceId}/finances/settlements/offsets/new?obligationIds=${selected.join(',')}`}
                    >
                        Registrar compensação
                    </Link>
                </Button>
            ) : (
                <Button variant="outline" disabled>
                    Registrar compensação
                </Button>
            )}
        </div>
    ) : null;
}

function AppliedDestinations({
    closure,
    applications,
    personId,
}: {
    closure: ClosureView;
    applications: ClosureApplication[];
    personId: string;
}) {
    const auth = useAuthenticatedContext({ enabled: false });
    return applications.length ? (
        <div className="space-y-3">
            <h3 className="font-semibold">Destinos aplicados</h3>
            <ul className="divide-y divide-border">
                {applications.map((item) => {
                    const destination = closure.futureDestinations.find(
                        (choice) => choice.originId === item.originId,
                    );
                    const own =
                        closure.participants.find(
                            (member) =>
                                member.memberId ===
                                destination?.assigneeMemberId,
                        )?.personId === personId;
                    return (
                        <li key={item.effectId} className="space-y-2 py-3">
                            <p>
                                {destination?.originSnapshot.description ??
                                    'Compromisso de origem'}{' '}
                                · efeito preservado no histórico
                            </p>
                            <Link
                                className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                                href={`/spaces/${closure.spaceId}/${destination?.originType === 'RECURRING' ? 'recurring-commitments' : 'installment-commitments'}/${item.originId}`}
                            >
                                Consultar origem compartilhada
                            </Link>
                            {item.successorCommitmentId &&
                                (own && auth.data ? (
                                    <Link
                                        className="ml-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                                        href={`/spaces/${auth.data.personalSpace.id}/${destination?.originType === 'RECURRING' ? 'recurring-commitments' : 'installment-commitments'}/${item.successorCommitmentId}`}
                                    >
                                        Consultar sucessor no meu espaço
                                    </Link>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        Sucessor registrado no espaço pessoal de{' '}
                                        {memberName(
                                            closure.participants,
                                            destination?.assigneeMemberId ?? '',
                                        )}
                                        . O acesso pessoal permanece restrito.
                                    </p>
                                ))}
                            {item.agreementObligationId && (
                                <Link
                                    className="ml-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                                    href={`/spaces/${closure.spaceId}/finances/settlements/obligations/${item.agreementObligationId}`}
                                >
                                    Consultar acordo para acerto
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    ) : null;
}

export function ClosureReadOnlyEffects({
    personId,
    closure,
}: {
    personId: string;
    closure: ClosureView;
}) {
    const query = useSpaceQuery(
        personId,
        closure.spaceId,
        closureKey(
            personId,
            closure.spaceId,
            'closed-effects',
            closure.processId,
        ),
        true,
        (signal) => getClosureFinancialValidation(closure.spaceId, signal),
    );
    return (
        <section
            className={sectionClass}
            aria-labelledby="preserved-effects-title"
        >
            <h2
                id="preserved-effects-title"
                className="text-xl font-semibold tracking-tight"
            >
                Efeitos financeiros preservados
            </h2>
            <QueryFeedback query={query} />
            {!query.isError && !query.isFetching && query.data && (
                <AppliedDestinations
                    closure={closure}
                    personId={personId}
                    applications={query.data.appliedDestinations}
                />
            )}
        </section>
    );
}
