'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import {
    businessToday,
    formatDate,
} from '@/features/finances/utils/expense-money';
import { getSpaceDetails } from '@/lib/api/get-space-details';
import { getFinancialContext } from '@/lib/api/shared-expense';
import {
    executeClosure,
    getClosureDiagnostic,
    getClosureFinalSummary,
    getClosureFinancialValidation,
    getClosureHistory,
    getClosurePlanReview,
} from '@/lib/api/space-closure';
import {
    SpaceBoundary,
    QueryFeedback,
    CommandFeedback,
} from '../components/space-operation-shared';
import { useSpaceOperation } from '../hooks/use-space-operation';
import { useSpaceQuery } from '../hooks/use-space-query';
import { useSpaceLeaveGuard } from '../hooks/use-space-leave-guard';
import { ClosureDestinations } from './closure-destinations';
import {
    actionsClass,
    BlockerList,
    closureKey,
    closureVersion,
    ConsentCheck,
    DestinationEffects,
    InformationalEffects,
    memberName,
    OutstandingAmounts,
    panelClass,
    planLabels,
    sectionClass,
    type ClosureActions,
} from './closure-shared';
import type {
    ClosureApplication,
    ClosureBlocker,
    ClosureView,
    ClosureWork,
} from './types';

export function ClosurePage({ spaceId }: { spaceId: string }) {
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <ClosureContent personId={personId} spaceId={spaceId} />
            )}
        </SpaceBoundary>
    );
}
function ClosureContent({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const client = useQueryClient();
    const [message, setMessage] = useState<string | null>(null);
    const query = useSpaceQuery(
        personId,
        spaceId,
        closureKey(personId, spaceId, 'overview'),
        true,
        async (signal) => {
            const details = await getSpaceDetails(spaceId, signal);
            if (details.space.id !== spaceId)
                throw new Error('O espaço foi alterado.');
            const financialContext =
                details.space.type === 'SHARED'
                    ? await getFinancialContext(spaceId, signal)
                    : null;
            if (financialContext && financialContext.spaceId !== spaceId)
                throw new Error('O espaço foi alterado.');
            const diagnostic =
                details.space.type === 'SHARED'
                    ? await getClosureDiagnostic(spaceId, signal)
                    : null;
            if (
                diagnostic?.closure &&
                (diagnostic.closure.spaceVersion !== details.space.version ||
                    diagnostic.closure.spaceStatus !== details.space.status)
            )
                throw new Error(
                    'O estado do espaço mudou. Atualize o diagnóstico.',
                );
            return {
                spaceId,
                details,
                members: financialContext?.members ?? [],
                diagnostic,
            };
        },
    );
    const command = useSpaceOperation<ClosureWork, ClosureView>({
        execute: executeClosure,
        onSuccess: (value) =>
            setMessage(
                value.spaceStatus === 'CLOSED'
                    ? 'Espaço encerrado. O histórico permanece disponível para consulta.'
                    : value.processStatus === 'CANCELLED'
                      ? 'Encerramento cancelado. Os efeitos já registrados foram preservados.'
                      : 'Decisão registrada. Confira o estado atualizado abaixo.',
            ),
        onConflict: () => {
            setMessage(null);
            void client.invalidateQueries({
                queryKey: closureKey(personId, spaceId),
            });
        },
    });
    const busy =
        command.isPending ||
        command.canRetry ||
        query.isFetching ||
        query.isError;
    const actions = {
        busy,
        submit: (work: ClosureWork) => {
            setMessage(null);
            command.submit(work);
        },
    };
    const data = query.data;
    const closure = data?.diagnostic?.closure;
    const open =
        closure?.spaceStatus === 'CLOSING' && closure.processStatus === 'OPEN';
    const closed = data?.details.space.status === 'CLOSED';
    return (
        <section className="mx-auto min-w-0 max-w-[52rem] space-y-8 pb-4 wrap-anywhere [&_button]:max-w-full">
            <header className="space-y-4">
                <Link
                    className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"
                    href={`/spaces/${spaceId}`}
                >
                    <ArrowLeft aria-hidden="true" size={16} />
                    Voltar ao espaço
                </Link>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                        <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.035em]">
                            {closed
                                ? 'Histórico do encerramento'
                                : 'Encerramento do espaço'}
                        </h1>
                        {data && (
                            <p className="break-words text-muted-foreground">
                                {data.details.space.label}
                                {open
                                    ? ' · Em encerramento'
                                    : closed
                                      ? ' · Encerrado'
                                      : ''}
                            </p>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        disabled={
                            command.isPending ||
                            command.canRetry ||
                            query.isFetching
                        }
                        onClick={() => {
                            setMessage(null);
                            void client.invalidateQueries({
                                queryKey: closureKey(personId, spaceId),
                            });
                        }}
                    >
                        <RefreshCw size={16} aria-hidden="true" />
                        Atualizar
                    </Button>
                </div>
                <p className="max-w-[70ch] text-sm text-muted-foreground">
                    Confira pendências, defina o destino dos compromissos e
                    registre os consentimentos necessários. O histórico
                    permanece no espaço original.
                </p>
            </header>
            <QueryFeedback query={query} />
            <CommandFeedback command={command} />
            {message && (
                <p
                    role="status"
                    className="rounded-sm border border-success bg-success-surface p-4 text-success"
                >
                    {message}
                </p>
            )}
            {!data && !query.isError && (
                <p role="status">Carregando diagnóstico do espaço…</p>
            )}
            {data?.details.space.type === 'PERSONAL' && (
                <p>
                    O encerramento se aplica a espaços compartilhados. Seu
                    espaço pessoal continua disponível.
                </p>
            )}
            {data?.diagnostic && (
                <>
                    {closed ? (
                        <p className={panelClass}>
                            Este espaço está encerrado e disponível somente para
                            leitura dos participantes históricos. Ele não será
                            reaberto nem reutilizado com outra pessoa.
                        </p>
                    ) : (
                        <nav
                            aria-label="Etapas do encerramento"
                            className="flex flex-wrap gap-x-5 gap-y-1 text-sm"
                        >
                            {[
                                ['diagnostic', 'Diagnóstico'],
                                ...(open
                                    ? [
                                          ['destinations', 'Destinos'],
                                          ['plan', 'Plano'],
                                          ['finances', 'Resolver finanças'],
                                          ['conclusion', 'Concluir'],
                                      ]
                                    : []),
                                ['history', 'Histórico'],
                            ].map(([id, name]) => (
                                <a
                                    key={id}
                                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                                    href={`#${id}`}
                                >
                                    {name}
                                </a>
                            ))}
                        </nav>
                    )}
                    {!closed && (
                        <section
                            id="diagnostic"
                            className={sectionClass}
                            aria-labelledby="diagnostic-title"
                        >
                            <h2
                                id="diagnostic-title"
                                className="text-xl font-semibold tracking-tight"
                            >
                                Diagnóstico completo
                            </h2>
                            <p>
                                {data.diagnostic.finance.totalCount === 0
                                    ? 'Nenhum bloqueador financeiro foi encontrado nesta consulta.'
                                    : `${data.diagnostic.finance.totalCount} bloqueador(es) financeiro(s) para resolver. Todas as páginas da consulta foram carregadas.`}
                            </p>
                            <OutstandingAmounts
                                finance={data.diagnostic.finance}
                                members={closure?.participants ?? data.members}
                            />
                            <BlockerList
                                spaceId={spaceId}
                                blockers={data.diagnostic.finance.blockers}
                            />
                            <details>
                                <summary className="cursor-pointer py-3 font-semibold">
                                    Efeito na rotina e nas compras
                                </summary>
                                <InformationalEffects
                                    value={data.diagnostic.informational}
                                    spaceId={spaceId}
                                />
                            </details>
                        </section>
                    )}
                    {data.details.space.status === 'ACTIVE' && (
                        <StartClosure
                            key={data.details.space.version}
                            version={data.details.space.version}
                            solo={data.details.activeMemberCount === 1}
                            actions={actions}
                        />
                    )}
                    {open && closure && (
                        <div
                            key={`${closure.processId}:${closure.spaceVersion}:${closure.planRevision}`}
                            className="space-y-8"
                        >
                            <CutoffDate closure={closure} actions={actions} />
                            <ClosureDestinations
                                closure={closure}
                                blockers={data.diagnostic.finance.blockers}
                                actions={actions}
                            />
                            <ClosurePlan
                                personId={personId}
                                closure={closure}
                                actions={actions}
                            />
                            <ClosureFinances
                                personId={personId}
                                closure={closure}
                                actions={actions}
                                blockers={data.diagnostic.finance.blockers}
                            />
                            <ClosureConclusion
                                personId={personId}
                                closure={closure}
                                actions={actions}
                            />
                        </div>
                    )}
                    {closed && closure && (
                        <ClosureReadOnlyEffects
                            personId={personId}
                            closure={closure}
                        />
                    )}
                    {closure && (
                        <ClosureHistorySection
                            personId={personId}
                            spaceId={spaceId}
                            closed={closed}
                        />
                    )}
                </>
            )}
        </section>
    );
}

function StartClosure({
    version,
    solo,
    actions,
}: {
    version: number;
    solo: boolean;
    actions: ClosureActions;
}) {
    const [accepted, setAccepted] = useState(false);
    useSpaceLeaveGuard(accepted, actions.busy, () => setAccepted(false));
    return (
        <section className={sectionClass} aria-labelledby="start-title">
            <h2
                id="start-title"
                className="text-xl font-semibold tracking-tight"
            >
                Solicitar encerramento
            </h2>
            <p>
                Ao iniciar, o espaço passa ao modo de resolução: novos
                compromissos compartilhados ficam impedidos, enquanto os
                registros existentes podem ser resolvidos. O corte inicial é
                hoje, {formatDate(businessToday())}, no horário de São Paulo.
            </p>
            <p className="text-sm text-muted-foreground">
                O convite pendente é invalidado imediatamente. Cancelar o
                processo não reativa o link antigo. O espaço pessoal continua
                utilizável durante todo o processo.
            </p>
            {solo && (
                <p className="text-sm text-muted-foreground">
                    Quem criou pode encerrar sozinho se for o único participante
                    de toda a história do espaço. O servidor verifica essa
                    condição. Diagnóstico, plano e confirmação final continuam
                    necessários.
                </p>
            )}
            <ConsentCheck
                checked={accepted}
                onChange={setAccepted}
                disabled={actions.busy}
            >
                Entendi o corte inicial, as restrições de novos compromissos e a
                invalidação do convite pendente.
            </ConsentCheck>
            <Button
                disabled={actions.busy || !accepted}
                onClick={() =>
                    actions.submit({
                        operation: 'start',
                        input: { expectedSpaceVersion: version },
                    })
                }
            >
                Iniciar encerramento
            </Button>
        </section>
    );
}
function CutoffDate({
    closure,
    actions,
}: {
    closure: ClosureView;
    actions: ClosureActions;
}) {
    const initial = closure.proposedCutoffDate ?? closure.cutoffDate;
    const [date, setDate] = useState(initial),
        [review, setReview] = useState(false),
        [accepted, setAccepted] = useState(false);
    useSpaceLeaveGuard(date !== initial, actions.busy, () => {
        setDate(initial);
        setReview(false);
        setAccepted(false);
    });
    return (
        <section className={sectionClass} aria-labelledby="cutoff-title">
            <h2
                id="cutoff-title"
                className="text-xl font-semibold tracking-tight"
            >
                Data de corte
            </h2>
            <p>
                Corte vigente: <strong>{formatDate(closure.cutoffDate)}</strong>
                . Nenhuma nova responsabilidade recorrente compartilhada pode
                nascer nessa data ou depois dela.
            </p>
            {closure.proposedCutoffDate && (
                <p className="text-sm">
                    Data proposta: {formatDate(closure.proposedCutoffDate)}. Até
                    o consentimento necessário, vale o corte vigente.
                </p>
            )}
            <p className="text-sm text-muted-foreground">
                Uma data futura exige o consentimento aplicável ao plano.
                Aguardar resposta não suspende o corte vigente. Mesmo com corte
                futuro, o espaço já está em modo de resolução.
            </p>
            <form
                className="max-w-[35rem] space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setReview(true);
                    setAccepted(false);
                }}
            >
                <label className="grid gap-2 text-sm font-medium">
                    Nova data de corte
                    <Input
                        type="date"
                        min={closure.cutoffDate}
                        required
                        value={date}
                        disabled={actions.busy || review}
                        onChange={(event) => setDate(event.target.value)}
                    />
                </label>
                {!review && (
                    <Button
                        type="submit"
                        variant="outline"
                        disabled={actions.busy || date === initial}
                    >
                        Conferir nova data
                    </Button>
                )}
            </form>
            {review && (
                <div className={`${panelClass} space-y-4`}>
                    <h3 className="font-semibold">
                        Propor corte em {formatDate(date)}
                    </h3>
                    <p className="text-sm">
                        A alteração material cria uma nova revisão e invalida
                        aprovações e confirmações anteriores. Confira novamente
                        os destinos dos compromissos antes de reapresentar o
                        plano. Pedidos de cancelamento desta revisão também
                        serão retirados.
                    </p>
                    <ConsentCheck
                        checked={accepted}
                        onChange={setAccepted}
                        disabled={actions.busy}
                    >
                        Entendi que a nova data depende de concordância e exige
                        revisar o plano.
                    </ConsentCheck>
                    <div className={actionsClass}>
                        <Button
                            disabled={actions.busy || !accepted}
                            onClick={() =>
                                actions.submit({
                                    operation: 'cutoff-date',
                                    input: {
                                        ...closureVersion(closure),
                                        cutoffDate: date,
                                    },
                                })
                            }
                        >
                            Confirmar proposta de corte
                        </Button>
                        <Button
                            variant="outline"
                            disabled={actions.busy}
                            onClick={() => setReview(false)}
                        >
                            Voltar à data
                        </Button>
                    </div>
                </div>
            )}
        </section>
    );
}

function ClosurePlan({
    personId,
    closure,
    actions,
}: {
    personId: string;
    closure: ClosureView;
    actions: ClosureActions;
}) {
    const query = useSpaceQuery(
        personId,
        closure.spaceId,
        closureKey(personId, closure.spaceId, 'review', closure.spaceVersion),
        true,
        (signal) => getClosurePlanReview(closure.spaceId, signal),
    );
    const [decision, setDecision] = useState<
            'proposal' | 'approval' | 'rejection' | null
        >(null),
        [accepted, setAccepted] = useState(false);
    const [snapshotFingerprint, setSnapshotFingerprint] = useState('');
    useSpaceLeaveGuard(decision !== null, actions.busy, () => {
        setDecision(null);
        setAccepted(false);
    });
    const data =
        !query.isFetching &&
        !query.isError &&
        query.data?.closure.spaceVersion === closure.spaceVersion &&
        query.data?.closure.planRevision === closure.planRevision
            ? query.data
            : undefined;
    const memberId = closure.participants.find(
        (member) => member.personId === personId,
    )?.memberId;
    const pendingCancellation = !!closure.cancellationConsents?.length;
    const proposalObsolete =
        closure.planStatus === 'PROPOSED' &&
        data &&
        closure.proposalSnapshot?.financialFingerprint !==
            data.finance.fingerprint;
    const canDecide =
        closure.planStatus === 'PROPOSED' &&
        closure.approvals[0]?.memberId !== memberId &&
        !pendingCancellation;
    const canPropose =
        closure.planStatus === 'DRAFT' ||
        closure.planStatus === 'REJECTED' ||
        proposalObsolete ||
        pendingCancellation;
    const busy = actions.busy || !data;
    return (
        <section
            id="plan"
            className={sectionClass}
            aria-labelledby="plan-title"
        >
            <h2
                id="plan-title"
                className="text-xl font-semibold tracking-tight"
            >
                Plano de encerramento
            </h2>
            <p>
                Revisão {closure.planRevision} ·{' '}
                {planLabels[closure.planStatus]} ·{' '}
                {closure.requiredMemberIds.length === 1
                    ? 'Consentimento do único participante'
                    : 'Concordância das duas pessoas'}
            </p>
            <QueryFeedback query={query} />
            {data && (
                <>
                    <p className="text-sm text-muted-foreground">
                        A aprovação aplica os destinos futuros. Ela não conclui
                        o encerramento: o financeiro e a confirmação final são
                        etapas distintas.
                    </p>
                    <ul className="divide-y divide-border">
                        {closure.requiredMemberIds.map((id) => (
                            <li
                                key={id}
                                className="flex flex-wrap justify-between gap-2 py-3"
                            >
                                <span>
                                    {memberName(closure.participants, id)}
                                </span>
                                <span className="text-sm">
                                    {closure.approvals.some(
                                        (consent) =>
                                            consent.memberId === id &&
                                            consent.planRevision ===
                                                closure.planRevision,
                                    )
                                        ? 'Concordância registrada'
                                        : 'Concordância pendente'}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {!!data.finance.missingDestinationOriginIds.length && (
                        <p role="alert" className="text-sm text-warning">
                            Falta definir ou atualizar o destino de{' '}
                            {data.finance.missingDestinationOriginIds.length}{' '}
                            compromisso(s). Revise os destinos antes de propor
                            ou aprovar.
                        </p>
                    )}
                    {proposalObsolete && (
                        <p role="alert" className="text-sm text-warning">
                            O financeiro mudou desde a proposta. As decisões
                            precisam partir de uma nova revisão conferida.
                            Reapresente o plano.
                        </p>
                    )}
                    {pendingCancellation && (
                        <p className="text-sm text-warning">
                            Há um pedido de cancelamento. Para retomar o
                            encerramento, reapresente o plano e registre novas
                            concordâncias.
                        </p>
                    )}
                    <details>
                        <summary className="cursor-pointer py-3 font-semibold">
                            Revisar todas as consequências
                        </summary>
                        <div className="space-y-6 pt-3">
                            <p>
                                Corte considerado nesta revisão:{' '}
                                {formatDate(
                                    closure.proposedCutoffDate ??
                                        closure.cutoffDate,
                                )}
                                .
                            </p>
                            <OutstandingAmounts
                                finance={data.finance.diagnostic}
                                members={closure.participants}
                            />
                            <p>
                                Bloqueadores financeiros atuais:{' '}
                                {data.finance.diagnostic.totalCount}. Eles
                                precisam ser resolvidos para a confirmação
                                final.
                            </p>
                            {closure.futureDestinations.map((destination) => (
                                <div
                                    key={destination.originId}
                                    className="space-y-3 border-t border-border pt-4"
                                >
                                    <h3 className="font-semibold">
                                        {destination.originSnapshot.description}
                                    </h3>
                                    <DestinationEffects
                                        value={destination}
                                        members={closure.participants}
                                    />
                                </div>
                            ))}
                            <InformationalEffects
                                value={data.informational}
                                spaceId={closure.spaceId}
                            />
                        </div>
                    </details>
                    <div className={actionsClass}>
                        {canPropose && (
                            <Button
                                disabled={
                                    busy ||
                                    !!data.finance.missingDestinationOriginIds
                                        .length ||
                                    !!decision
                                }
                                onClick={() => {
                                    setDecision('proposal');
                                    setSnapshotFingerprint(
                                        data.finance.fingerprint,
                                    );
                                    setAccepted(false);
                                }}
                            >
                                {closure.requiredMemberIds.length === 1
                                    ? 'Revisar meu consentimento'
                                    : 'Revisar envio do plano'}
                            </Button>
                        )}
                        {canDecide && (
                            <>
                                <Button
                                    disabled={
                                        busy ||
                                        !!data.finance
                                            .missingDestinationOriginIds
                                            .length ||
                                        !!proposalObsolete ||
                                        !!decision
                                    }
                                    onClick={() => {
                                        setDecision('approval');
                                        setSnapshotFingerprint(
                                            data.finance.fingerprint,
                                        );
                                        setAccepted(false);
                                    }}
                                >
                                    Revisar aprovação
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={busy || !!decision}
                                    onClick={() => {
                                        setDecision('rejection');
                                        setSnapshotFingerprint(
                                            data.finance.fingerprint,
                                        );
                                        setAccepted(false);
                                    }}
                                >
                                    Revisar rejeição
                                </Button>
                            </>
                        )}
                    </div>
                    {closure.planStatus === 'PROPOSED' &&
                        closure.approvals[0]?.memberId === memberId &&
                        !proposalObsolete &&
                        !pendingCancellation && (
                            <p role="status">
                                Sua concordância está registrada. Aguardando a
                                resposta da outra pessoa para esta revisão.
                            </p>
                        )}
                    {decision && (
                        <div className={`${panelClass} space-y-4`}>
                            <h3 className="font-semibold">
                                {decision === 'rejection'
                                    ? 'Rejeitar esta revisão'
                                    : decision === 'approval'
                                      ? 'Aprovar esta revisão'
                                      : closure.requiredMemberIds.length === 1
                                        ? 'Registrar meu consentimento'
                                        : 'Enviar plano para concordância'}
                            </h3>
                            <p>
                                {decision === 'rejection'
                                    ? 'A rejeição mantém o espaço em encerramento e o corte vigente. O plano poderá ser revisto e reapresentado.'
                                    : `Sua concordância se refere ao corte em ${formatDate(closure.proposedCutoffDate ?? closure.cutoffDate)}, aos destinos listados e às consequências de Rotina e Compras. ${closure.requiredMemberIds.length === 1 || decision === 'approval' ? 'A aprovação aplica os destinos futuros previstos.' : 'A outra pessoa precisa concordar com a mesma revisão.'}`}
                            </p>
                            <ConsentCheck
                                checked={accepted}
                                onChange={setAccepted}
                                disabled={busy}
                            >
                                Conferi as consequências desta revisão e quero
                                registrar esta decisão.
                            </ConsentCheck>
                            {snapshotFingerprint !==
                                data.finance.fingerprint && (
                                <p role="alert">
                                    O financeiro mudou desde a conferência.
                                    Volte à revisão e confira novamente.
                                </p>
                            )}
                            <div className={actionsClass}>
                                <Button
                                    disabled={
                                        busy ||
                                        !accepted ||
                                        snapshotFingerprint !==
                                            data.finance.fingerprint
                                    }
                                    onClick={() =>
                                        actions.submit(
                                            decision === 'rejection'
                                                ? {
                                                      operation: decision,
                                                      input: closureVersion(
                                                          closure,
                                                      ),
                                                  }
                                                : {
                                                      operation: decision,
                                                      input: {
                                                          ...closureVersion(
                                                              closure,
                                                          ),
                                                          expectedFinancialFingerprint:
                                                              snapshotFingerprint,
                                                      },
                                                  },
                                        )
                                    }
                                >
                                    {decision === 'rejection'
                                        ? 'Confirmar rejeição'
                                        : decision === 'approval'
                                          ? 'Confirmar aprovação'
                                          : closure.requiredMemberIds.length ===
                                              1
                                            ? 'Consentir e aprovar meu plano'
                                            : 'Enviar plano'}
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={actions.busy}
                                    onClick={() => setDecision(null)}
                                >
                                    Voltar à revisão
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

function ClosureFinances({
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

function ClosureConclusion({
    personId,
    closure,
    actions,
}: {
    personId: string;
    closure: ClosureView;
    actions: ClosureActions;
}) {
    const query = useSpaceQuery(
        personId,
        closure.spaceId,
        closureKey(personId, closure.spaceId, 'final', closure.spaceVersion),
        true,
        (signal) => getClosureFinalSummary(closure.spaceId, signal),
    );
    const [decision, setDecision] = useState<
            'confirmation' | 'cancellation' | null
        >(null),
        [accepted, setAccepted] = useState(false);
    const [snapshotFingerprint, setSnapshotFingerprint] = useState('');
    useSpaceLeaveGuard(decision !== null, actions.busy, () => {
        setDecision(null);
        setAccepted(false);
    });
    const data =
        !query.isFetching &&
        !query.isError &&
        query.data?.spaceVersion === closure.spaceVersion &&
        query.data?.planRevision === closure.planRevision
            ? query.data
            : undefined;
    const actorMemberId = closure.participants.find(
        (member) => member.personId === personId,
    )?.memberId;
    const bilateralCancel =
        closure.requiredMemberIds.length === 2 &&
        (closure.hasBilateralApproval ||
            closure.approvals.some(
                (approval) => approval.memberId !== closure.requestedByMemberId,
            ));
    const alreadyRequested = closure.cancellationConsents?.some(
        (consent) =>
            consent.memberId === actorMemberId &&
            consent.planRevision === closure.planRevision &&
            consent.spaceVersion === closure.spaceVersion,
    );
    const canCancel =
        !alreadyRequested &&
        (bilateralCancel || actorMemberId === closure.requestedByMemberId);
    const busy = actions.busy || !data;
    return (
        <section
            id="conclusion"
            className={sectionClass}
            aria-labelledby="conclusion-title"
        >
            <h2
                id="conclusion-title"
                className="text-xl font-semibold tracking-tight"
            >
                Confirmação final
            </h2>
            <QueryFeedback query={query} />
            {data && (
                <>
                    <p>
                        {data.confirmedCount} de {data.requiredConfirmations}{' '}
                        confirmação(ões) válida(s) para esta revisão e para o
                        mesmo estado financeiro.
                    </p>
                    <ul className="divide-y divide-border">
                        {closure.requiredMemberIds.map((id) => (
                            <li
                                key={id}
                                className="flex flex-wrap justify-between gap-2 py-3"
                            >
                                <span>
                                    {memberName(closure.participants, id)}
                                </span>
                                <span className="text-sm">
                                    {data.validConfirmations.some(
                                        (confirmation) =>
                                            confirmation.memberId === id,
                                    )
                                        ? 'Confirmou encerramento'
                                        : 'Confirmação pendente'}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {data.actorConfirmed && (
                        <p role="status">
                            Você já confirmou este estado. Aguardando a
                            confirmação da outra pessoa.
                        </p>
                    )}
                    {!data.canConfirm && !data.actorConfirmed && (
                        <p className="text-sm text-muted-foreground">
                            Resolva os bloqueadores financeiros, confira todos
                            os destinos e obtenha as concordâncias do plano
                            antes da confirmação. Um pedido de cancelamento
                            também impede a conclusão.
                        </p>
                    )}
                    <div className={actionsClass}>
                        <Button
                            disabled={busy || !data.canConfirm || !!decision}
                            onClick={() => {
                                setDecision('confirmation');
                                setSnapshotFingerprint(
                                    data.financialFingerprint,
                                );
                                setAccepted(false);
                            }}
                        >
                            Revisar confirmação final
                        </Button>
                        {canCancel && (
                            <Button
                                variant="outline"
                                disabled={busy || !!decision}
                                onClick={() => {
                                    setDecision('cancellation');
                                    setAccepted(false);
                                }}
                            >
                                {bilateralCancel
                                    ? 'Revisar cancelamento em conjunto'
                                    : 'Revisar cancelamento do processo'}
                            </Button>
                        )}
                    </div>
                    {alreadyRequested && (
                        <p role="status">
                            Seu pedido de cancelamento está registrado.
                            Aguardando a concordância da outra pessoa no mesmo
                            estado.
                        </p>
                    )}
                    {decision && (
                        <div className={`${panelClass} space-y-4`}>
                            <h3 className="font-semibold">
                                {decision === 'confirmation'
                                    ? 'Confira antes de confirmar'
                                    : 'Confira antes de cancelar'}
                            </h3>
                            {decision === 'confirmation' ? (
                                <>
                                    <p>
                                        O plano da revisão{' '}
                                        {closure.planRevision} está aprovado e o
                                        financeiro foi validado. Com{' '}
                                        {data.requiredConfirmations === 1
                                            ? 'a sua confirmação'
                                            : 'as duas confirmações válidas'}
                                        , o espaço será encerrado e ficará
                                        somente para leitura.
                                    </p>
                                    <InformationalEffects
                                        value={data.informational}
                                        spaceId={closure.spaceId}
                                    />
                                </>
                            ) : (
                                <>
                                    <p>
                                        {bilateralCancel
                                            ? 'O cancelamento exige a concordância das duas pessoas no mesmo estado. O primeiro consentimento mantém o processo em encerramento e invalida confirmações finais anteriores.'
                                            : 'Seu consentimento cancela o processo e devolve o espaço ao estado ativo.'}
                                    </p>
                                    <p>
                                        Transferências, compensações, dispensas
                                        e sucessores já registrados permanecem.
                                        Origens encerradas e convites
                                        invalidados não são reativados. Se
                                        elegível, será necessário emitir um novo
                                        convite no espaço ativo.
                                    </p>
                                </>
                            )}
                            <ConsentCheck
                                checked={accepted}
                                onChange={setAccepted}
                                disabled={busy}
                            >
                                Conferi os efeitos e quero{' '}
                                {decision === 'confirmation'
                                    ? 'registrar minha confirmação final'
                                    : 'registrar meu consentimento de cancelamento'}
                                .
                            </ConsentCheck>
                            {decision === 'confirmation' &&
                                snapshotFingerprint !==
                                    data.financialFingerprint && (
                                    <p role="alert">
                                        O financeiro mudou desde a conferência.
                                        Volte ao resumo e confira novamente.
                                    </p>
                                )}
                            <div className={actionsClass}>
                                <Button
                                    disabled={
                                        busy ||
                                        !accepted ||
                                        (decision === 'confirmation' &&
                                            (!data.canConfirm ||
                                                snapshotFingerprint !==
                                                    data.financialFingerprint))
                                    }
                                    onClick={() =>
                                        actions.submit(
                                            decision === 'confirmation'
                                                ? {
                                                      operation: decision,
                                                      input: {
                                                          ...closureVersion(
                                                              closure,
                                                          ),
                                                          expectedFinancialFingerprint:
                                                              snapshotFingerprint,
                                                      },
                                                  }
                                                : {
                                                      operation: decision,
                                                      input: closureVersion(
                                                          closure,
                                                      ),
                                                  },
                                        )
                                    }
                                >
                                    {decision === 'confirmation'
                                        ? 'Confirmar encerramento'
                                        : 'Confirmar cancelamento'}
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={actions.busy}
                                    onClick={() => setDecision(null)}
                                >
                                    Voltar ao resumo
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

function ClosureReadOnlyEffects({
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

function ClosureHistorySection({
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
