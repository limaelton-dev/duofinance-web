'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSpaceLeaveGuard } from '../hooks/use-space-leave-guard';
import {
    decimalUnits,
    formatDate,
    formatMoney,
} from '@/features/finances/utils/expense-money';
import type {
    ClosureBlocker,
    ClosureDestination,
    ClosureDestinationInput,
    ClosureView,
} from './types';
import {
    actionsClass,
    closureVersion,
    ConsentCheck,
    DestinationEffects,
    destinationLabels,
    memberName,
    panelClass,
    sectionClass,
    selectClass,
    type ClosureActions,
} from './closure-shared';

type FutureOrigin = {
    originType: ClosureDestination['originType'];
    originId: string;
    version: number;
    description: string;
    eligible: boolean;
};
export function ClosureDestinations({
    closure,
    blockers,
    actions,
}: {
    closure: ClosureView;
    blockers: ClosureBlocker[];
    actions: ClosureActions;
}) {
    const origins = new Map<string, FutureOrigin>();
    const cutoff = closure.proposedCutoffDate ?? closure.cutoffDate;
    for (const blocker of blockers) {
        const recurring =
            blocker.type === 'ACTIVE_RECURRENCE' ||
            (blocker.type === 'OPEN_RECURRING_OCCURRENCE' &&
                !!blocker.referenceDate &&
                blocker.referenceDate >= cutoff);
        const installment =
            blocker.type === 'UNRESOLVED_INSTALLMENT' &&
            !!blocker.referenceDate &&
            blocker.referenceDate >= cutoff;
        if ((!recurring && !installment) || !blocker.version) continue;
        const originId = blocker.commitmentId ?? blocker.originId;
        origins.set(originId, {
            originType: recurring ? 'RECURRING' : 'INSTALLMENT',
            originId,
            version: blocker.version,
            eligible: true,
            description:
                blocker.description ??
                (recurring ? 'Recorrência' : 'Parcelamento'),
        });
    }
    for (const destination of closure.futureDestinations)
        if (!origins.has(destination.originId))
            origins.set(destination.originId, {
                originType: destination.originType,
                originId: destination.originId,
                version: destination.expectedOriginVersion,
                eligible: false,
                description: destination.originSnapshot.description,
            });
    return (
        <section
            id="destinations"
            className={sectionClass}
            aria-labelledby="destinations-title"
        >
            <h2
                id="destinations-title"
                className="text-xl font-semibold tracking-tight"
            >
                Destinos dos compromissos futuros
            </h2>
            <p className="max-w-[70ch] text-sm text-muted-foreground">
                Escolha explicitamente o destino de cada recorrência ou
                parcelamento elegível. A continuidade pessoal encerra a origem
                compartilhada e cria um sucessor rastreável, sem repetir
                pagamentos, recebimentos ou parcelas já realizadas. As escolhas
                são aplicadas com a aprovação do plano.
            </p>
            {!origins.size && (
                <p>
                    Nenhum compromisso futuro elegível foi encontrado nesta
                    consulta.
                </p>
            )}
            <ul className="divide-y divide-border">
                {Array.from(origins.values()).map((origin) => {
                    const saved = closure.futureDestinations.find(
                        (choice) => choice.originId === origin.originId,
                    );
                    return (
                        <li key={origin.originId} className="space-y-4 py-6">
                            <h3 className="font-semibold">
                                {origin.description}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {origin.originType === 'RECURRING'
                                    ? 'Recorrência'
                                    : 'Parcelamento'}{' '}
                                · corte em {formatDate(cutoff)}
                            </p>
                            {saved && (
                                <DestinationEffects
                                    value={saved}
                                    members={closure.participants}
                                />
                            )}
                            {origin.eligible ? (
                                <DestinationForm
                                    key={`${origin.originId}:${origin.version}:${closure.planRevision}`}
                                    origin={origin}
                                    closure={closure}
                                    saved={saved}
                                    actions={actions}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    O destino está preservado no plano. Não há
                                    futuro elegível remanescente nesta origem
                                    para uma nova escolha.
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
function DestinationForm({
    origin,
    closure,
    saved,
    actions,
}: {
    origin: FutureOrigin;
    closure: ClosureView;
    saved?: ClosureDestination;
    actions: ClosureActions;
}) {
    const [editing, setEditing] = useState(!saved),
        [destination, setDestination] = useState(''),
        [memberId, setMemberId] = useState(''),
        [amount, setAmount] = useState(''),
        [review, setReview] = useState<ClosureDestinationInput | null>(null),
        [accepted, setAccepted] = useState(false),
        [error, setError] = useState<string | null>(null);
    const applied = closure.planStatus === 'APPROVED';
    const dirty = !!destination || !!memberId || !!amount;
    function reset() {
        setDestination('');
        setMemberId('');
        setAmount('');
        setReview(null);
        setAccepted(false);
        setEditing(!saved);
    }
    useSpaceLeaveGuard(dirty, actions.busy, reset);
    function prepare(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        const base = {
            ...closureVersion(closure),
            originType: origin.originType,
            originId: origin.originId,
            expectedOriginVersion: origin.version,
        };
        if (destination === 'TERMINATE') setReview({ ...base, destination });
        else if (
            !closure.participants.some((member) => member.memberId === memberId)
        )
            setError('Escolha a pessoa que assumirá o futuro.');
        else if (destination === 'PERSONAL_SUCCESSOR')
            setReview({ ...base, destination, assigneeMemberId: memberId });
        else if (destination === 'SETTLE_BEFORE_CLOSURE') {
            const cents = decimalUnits(amount);
            if (!cents || cents < 1)
                setError(
                    'Informe um valor positivo com até duas casas decimais.',
                );
            else
                setReview({
                    ...base,
                    destination,
                    assigneeMemberId: memberId,
                    amountInCents: cents,
                });
        } else setError('Escolha um destino para este compromisso.');
        setAccepted(false);
    }
    if (!editing)
        return (
            <Button
                variant="outline"
                disabled={actions.busy}
                onClick={() => setEditing(true)}
            >
                Revisar destino
            </Button>
        );
    return (
        <div className="space-y-4">
            {applied && (
                <p className="text-sm text-muted-foreground">
                    Os efeitos já aplicados permanecem. Alterar a revisão exige
                    novo consentimento; o servidor verifica se ainda há futuro
                    elegível na origem.
                </p>
            )}
            <form onSubmit={prepare} className="max-w-[35rem] space-y-4">
                <fieldset
                    disabled={actions.busy || !!review}
                    className="min-w-0 space-y-4"
                >
                    <label className="grid gap-2 text-sm font-medium">
                        Destino de {origin.description}
                        <select
                            required
                            className={selectClass}
                            value={destination}
                            onChange={(event) =>
                                setDestination(event.target.value)
                            }
                        >
                            <option value="">Escolha um destino</option>
                            {Object.entries(destinationLabels)
                                .filter(
                                    ([value]) =>
                                        value !== 'SETTLE_BEFORE_CLOSURE' ||
                                        closure.requiredMemberIds.length === 2,
                                )
                                .map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                        </select>
                    </label>
                    {destination && destination !== 'TERMINATE' && (
                        <label className="grid gap-2 text-sm font-medium">
                            Pessoa que assumirá o futuro
                            <select
                                className={selectClass}
                                required
                                value={memberId}
                                onChange={(event) =>
                                    setMemberId(event.target.value)
                                }
                            >
                                <option value="">Escolha uma pessoa</option>
                                {closure.participants.map((member) => (
                                    <option
                                        key={member.memberId}
                                        value={member.memberId}
                                    >
                                        {member.displayName}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {destination === 'SETTLE_BEFORE_CLOSURE' && (
                        <label className="grid gap-2 text-sm font-medium">
                            Valor do acordo entre vocês (R$)
                            <Input
                                required
                                inputMode="decimal"
                                value={amount}
                                onChange={(event) =>
                                    setAmount(event.target.value)
                                }
                            />
                        </label>
                    )}
                    <Button type="submit" variant="outline">
                        Conferir escolha
                    </Button>
                </fieldset>
            </form>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {review && (
                <div className={`${panelClass} space-y-4`}>
                    <h4 className="font-semibold">Confira a escolha</h4>
                    <p>
                        {destinationLabels[review.destination]}
                        {'assigneeMemberId' in review
                            ? ` · ${memberName(closure.participants, review.assigneeMemberId)}`
                            : ''}
                        .
                    </p>
                    {review.destination === 'SETTLE_BEFORE_CLOSURE' && (
                        <p>
                            Acordo de {formatMoney(review.amountInCents)}. A
                            pessoa escolhida assume o futuro; o plano registrará
                            a direção do acordo de acordo com a despesa ou
                            receita. Ele ainda precisará ser resolvido.
                        </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                        Salvar atualiza o rascunho e invalida as aprovações e
                        confirmações anteriores. Confira o impacto calculado
                        para cada pessoa antes de propor o plano. Pedidos de
                        cancelamento desta revisão também serão retirados.
                    </p>
                    <ConsentCheck
                        checked={accepted}
                        onChange={setAccepted}
                        disabled={actions.busy}
                    >
                        Conferi o destino e entendi que a revisão exigirá nova
                        concordância.
                    </ConsentCheck>
                    <div className={actionsClass}>
                        <Button
                            disabled={actions.busy || !accepted}
                            onClick={() =>
                                actions.submit({
                                    operation: 'future-destinations',
                                    input: review,
                                })
                            }
                        >
                            Salvar destino no plano
                        </Button>
                        <Button
                            variant="outline"
                            disabled={actions.busy}
                            onClick={() => {
                                setReview(null);
                                setAccepted(false);
                            }}
                        >
                            Voltar à escolha
                        </Button>
                    </div>
                </div>
            )}
            {saved && (
                <Link
                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                    href="#plan"
                >
                    Conferir o plano completo
                </Link>
            )}
        </div>
    );
}
