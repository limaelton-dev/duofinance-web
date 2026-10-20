import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    businessToday,
    formatDate,
} from '@/features/finances/utils/expense-money';
import { useSpaceLeaveGuard } from '../hooks/use-space-leave-guard';
import {
    actionsClass,
    closureVersion,
    ConsentCheck,
    panelClass,
    sectionClass,
    type ClosureActions,
} from './closure-shared';
import type { ClosureView } from './types';

export function StartClosure({
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

export function CutoffDate({
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
