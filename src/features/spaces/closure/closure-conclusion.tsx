import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getClosureFinalSummary } from '@/lib/api/space-closure';
import { QueryFeedback } from '../components/space-operation-shared';
import { useSpaceQuery } from '../hooks/use-space-query';
import { useSpaceLeaveGuard } from '../hooks/use-space-leave-guard';
import {
    actionsClass,
    closureKey,
    closureVersion,
    ConsentCheck,
    InformationalEffects,
    memberName,
    panelClass,
    sectionClass,
    type ClosureActions,
} from './closure-shared';
import type { ClosureView } from './types';

export function ClosureConclusion({
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
