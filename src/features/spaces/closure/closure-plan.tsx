import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/features/finances/utils/expense-money';
import { getClosurePlanReview } from '@/lib/api/space-closure';
import { QueryFeedback } from '../components/space-operation-shared';
import { useSpaceQuery } from '../hooks/use-space-query';
import { useSpaceLeaveGuard } from '../hooks/use-space-leave-guard';
import {
    actionsClass,
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
import type { ClosureView } from './types';

export function ClosurePlan({
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
