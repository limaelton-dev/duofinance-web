import Link from 'next/link';
import {
    formatDate,
    formatMoney,
} from '@/features/finances/utils/expense-money';
import { formatPositionMoney } from '@/features/finances/utils/position-money';
import type {
    ClosureBlocker,
    ClosureDestination,
    ClosureFinancialDiagnostic,
    ClosureInformational,
    ClosureParticipant,
    ClosureView,
    ClosureWork,
} from './types';

export const closureKey = (
    personId: string,
    spaceId: string,
    ...parts: unknown[]
) => ['closure', personId, spaceId, ...parts] as const;
export type ClosureActions = {
    busy: boolean;
    submit: (work: ClosureWork) => void;
};
export const closureVersion = (closure: ClosureView) => ({
    expectedSpaceVersion: closure.spaceVersion,
    expectedPlanRevision: closure.planRevision,
});
export const memberName = (members: ClosureParticipant[], id: string) =>
    members.find((member) => member.memberId === id)?.displayName ??
    'Participante';
export const moneyOrVariable = (cents: string | null) =>
    cents === null
        ? 'Valor variável, definido por ocorrência'
        : formatPositionMoney(cents);
export const destinationLabels = {
    TERMINATE: 'Encerrar o futuro compartilhado',
    PERSONAL_SUCCESSOR: 'Continuar em um espaço pessoal',
    SETTLE_BEFORE_CLOSURE: 'Combinar acerto antes de encerrar',
};
export const planLabels = {
    DRAFT: 'Rascunho',
    PROPOSED: 'Aguardando resposta',
    APPROVED: 'Aprovado',
    REJECTED: 'Rejeitado',
};
const blockerLabels: Record<ClosureBlocker['type'], string> = {
    INTER_MEMBER_OBLIGATION: 'Pendência entre pessoas',
    PENDING_FINANCIAL_CHANGE: 'Alteração aguardando decisão',
    OPEN_ONE_TIME_COMMITMENT: 'Compromisso avulso em aberto',
    OPEN_EXTERNAL_LIABILITY: 'Obrigação com terceiro',
    ACTIVE_RECURRENCE: 'Recorrência com futuro compartilhado',
    OPEN_RECURRING_OCCURRENCE: 'Ocorrência em aberto',
    UNRESOLVED_INSTALLMENT: 'Parcela com valor remanescente',
    OPEN_SETTLEMENT_CYCLE: 'Ciclo de acerto aberto',
};
export function blockerPath(spaceId: string, blocker: ClosureBlocker) {
    const base = `/spaces/${spaceId}`;
    if (blocker.type === 'INTER_MEMBER_OBLIGATION')
        return `${base}/finances/settlements/obligations/${blocker.originId}`;
    if (blocker.type === 'OPEN_SETTLEMENT_CYCLE')
        return `${base}/finances/settlements/${blocker.originId}`;
    if (blocker.type === 'PENDING_FINANCIAL_CHANGE')
        return `${base}/finances/changes`;
    if (
        blocker.type === 'ACTIVE_RECURRENCE' ||
        blocker.type === 'OPEN_RECURRING_OCCURRENCE'
    )
        return `${base}/recurring-commitments/${blocker.commitmentId ?? blocker.originId}`;
    if (blocker.type === 'UNRESOLVED_INSTALLMENT')
        return `${base}/installment-commitments/${blocker.commitmentId}`;
    return `${base}/finances/commitments/${blocker.commitmentId ?? blocker.originId}`;
}
export function OutstandingAmounts({
    finance,
    members,
}: {
    finance: ClosureFinancialDiagnostic;
    members: ClosureParticipant[];
}) {
    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Valores em aberto em cada direção. Uma posição líquida zero
                ainda exige registrar a compensação ou resolver cada pendência.
            </p>
            {finance.outstandingAmounts.length ? (
                <dl className="divide-y divide-border">
                    {finance.outstandingAmounts.map((item) => (
                        <div
                            key={`${item.debtorMemberId}:${item.creditorMemberId}`}
                            className="flex flex-wrap justify-between gap-2 py-3"
                        >
                            <dt>
                                {memberName(members, item.debtorMemberId)} deve
                                a {memberName(members, item.creditorMemberId)}
                            </dt>
                            <dd className="font-semibold tabular-nums">
                                {formatPositionMoney(item.amountInCents)}
                            </dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p>
                    Sem pendência entre pessoas nesta consulta. Obrigações
                    externas e os demais bloqueadores são verificados
                    separadamente.
                </p>
            )}
        </div>
    );
}
export function InformationalEffects({
    value,
    spaceId,
}: {
    value: ClosureInformational;
    spaceId: string;
}) {
    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Na conclusão, as tarefas pendentes serão canceladas, as
                recorrências de tarefas encerradas e as listas de compras ativas
                arquivadas. Os fatos e o histórico permanecem. Esses itens não
                bloqueiam o financeiro nem são migrados para o pessoal.
            </p>
            <dl className="divide-y divide-border">
                <div className="flex flex-wrap justify-between gap-2 py-3">
                    <dt>
                        <Link
                            className="underline underline-offset-4"
                            href={`/spaces/${spaceId}/routine`}
                        >
                            Tarefas pendentes
                        </Link>
                    </dt>
                    <dd className="tabular-nums">
                        {value.routine.pendingTaskCount}
                    </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 py-3">
                    <dt>Recorrências de tarefas ativas</dt>
                    <dd className="tabular-nums">
                        {value.routine.activeRecurrenceCount}
                    </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 py-3">
                    <dt>
                        <Link
                            className="underline underline-offset-4"
                            href={`/spaces/${spaceId}/shopping`}
                        >
                            Listas de compras ativas
                        </Link>
                    </dt>
                    <dd className="tabular-nums">
                        {value.shopping.activeListCount}
                    </dd>
                </div>
            </dl>
        </div>
    );
}
export function BlockerList({
    spaceId,
    blockers,
}: {
    spaceId: string;
    blockers: ClosureBlocker[];
}) {
    return (
        <ul className="divide-y divide-border">
            {blockers.map((blocker) => (
                <li
                    key={`${blocker.type}:${blocker.originId}`}
                    className="space-y-2 py-5"
                >
                    <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="font-semibold">
                            {blocker.description ?? blockerLabels[blocker.type]}
                        </h3>
                        {blocker.amountInCents != null && (
                            <span className="font-semibold tabular-nums">
                                {formatPositionMoney(blocker.amountInCents)}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {blockerLabels[blocker.type]}
                        {blocker.referenceDate &&
                            ` · ${formatDate(blocker.referenceDate)}`}
                    </p>
                    <p className="text-sm">{blocker.action}</p>
                    <Link
                        className="inline-flex min-h-11 items-center underline underline-offset-4"
                        href={blockerPath(spaceId, blocker)}
                    >
                        Consultar e resolver origem
                    </Link>
                </li>
            ))}
        </ul>
    );
}
export function DestinationEffects({
    value,
    members,
}: {
    value: ClosureDestination;
    members: ClosureParticipant[];
}) {
    return (
        <div className="space-y-4">
            <p>
                {destinationLabels[value.destination]}
                {value.assigneeMemberId
                    ? ` · ${memberName(members, value.assigneeMemberId)}`
                    : ''}
                .
            </p>
            <p className="text-sm text-muted-foreground">
                A partir de {formatDate(value.cutoffDate)}. Os valores já
                realizados permanecem na origem compartilhada.
            </p>
            {value.originType === 'INSTALLMENT' && (
                <dl className="divide-y divide-border">
                    {value.impactByMember.map((impact) => (
                        <div key={impact.memberId} className="py-2">
                            <dt className="font-medium">
                                {memberName(members, impact.memberId)}
                            </dt>
                            <dd className="text-sm tabular-nums">
                                Antes: {moneyOrVariable(impact.beforeInCents)} ·
                                Depois: {moneyOrVariable(impact.afterInCents)}
                                {impact.requiresAcceptance
                                    ? ' · Exige concordância'
                                    : ''}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
            {value.originSnapshot.recurringImpacts?.map((configuration) => (
                <div
                    key={`${configuration.economicVersion}:${configuration.effectiveFrom}`}
                    className="space-y-2"
                >
                    <p className="font-medium">
                        Por ocorrência, desde{' '}
                        {formatDate(configuration.effectiveFrom)}:{' '}
                        {configuration.amountInCents === null
                            ? 'valor variável'
                            : formatMoney(configuration.amountInCents)}
                    </p>
                    <dl>
                        {configuration.impactByMember.map((impact) => (
                            <div key={impact.memberId} className="py-2">
                                <dt>{memberName(members, impact.memberId)}</dt>
                                <dd className="text-sm tabular-nums">
                                    {impact.beforeInCents === null
                                        ? `${((impact.beforeBasisPoints ?? 0) / 100).toLocaleString('pt-BR')}%`
                                        : formatPositionMoney(
                                              impact.beforeInCents,
                                          )}{' '}
                                    antes ·{' '}
                                    {impact.afterInCents === null
                                        ? `${(impact.afterBasisPoints / 100).toLocaleString('pt-BR')}%`
                                        : formatPositionMoney(
                                              impact.afterInCents,
                                          )}{' '}
                                    depois
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            ))}
            {value.agreement && (
                <p className="text-sm">
                    O acordo cria {formatMoney(value.agreement.amountInCents)}{' '}
                    de {memberName(members, value.agreement.debtorMemberId)}{' '}
                    para {memberName(members, value.agreement.creditorMemberId)}
                    . Ele ainda precisa ser resolvido pelos mecanismos de
                    acerto.
                </p>
            )}
            <details>
                <summary className="cursor-pointer py-2 font-medium">
                    Futuro abrangido ({value.originSnapshot.futureItems.length})
                </summary>
                <ul className="divide-y divide-border">
                    {value.originSnapshot.futureItems.map((item, index) => (
                        <li
                            key={`${item.originItemId ?? 'future'}:${item.referenceDate}:${index}`}
                            className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                        >
                            <span>{formatDate(item.referenceDate)}</span>
                            <span className="tabular-nums">
                                {item.remainingInCents === null
                                    ? 'Valor ainda não definido'
                                    : formatMoney(item.remainingInCents)}
                            </span>
                        </li>
                    ))}
                </ul>
            </details>
        </div>
    );
}
export const sectionClass = 'scroll-mt-6 space-y-5 border-t border-border pt-8';
export const panelClass = 'rounded-lg border border-border bg-card p-5 sm:p-6';
export const actionsClass = 'flex flex-col gap-3 sm:flex-row sm:flex-wrap';
export const selectClass =
    'min-h-12 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-2 text-base';
export function ConsentCheck({
    checked,
    onChange,
    children,
    disabled = false,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    children: React.ReactNode;
    disabled?: boolean;
}) {
    return (
        <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2 text-sm">
            <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-primary"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                disabled={disabled}
            />
            <span>{children}</span>
        </label>
    );
}
