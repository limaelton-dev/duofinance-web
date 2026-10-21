'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { ArrowLeft } from '@/components/ui/icons';
export {
    SpaceBoundary as PlanningBoundary,
    QueryFeedback,
    CommandFeedback,
} from '@/features/spaces/components/space-operation-shared';
import { useCsrf } from '@/features/auth/hooks/use-csrf';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import {
    getAuthenticatedPersonId,
    getSpacesSessionEpoch,
} from '@/features/spaces/cache/spaces-session';
import { ApiError } from '@/lib/api/api-error';
import type { Member, Settlement, Split } from '../types/shared-expense';
import { decimalUnits, exactShares, formatMoney } from '../utils/expense-money';
import { formatReviewMoney } from '../utils/financial-review';
import styles from './expenses.module.css';

export const planningKey = (
    personId: string,
    spaceId: string,
    ...parts: unknown[]
) => ['finances', personId, spaceId, 'planning', ...parts] as const;
export function PlanningHeading({
    title,
    spaceId,
    children,
}: {
    title: string;
    spaceId: string;
    children?: ReactNode;
}) {
    return (
        <header className={styles.heading}>
            <Link className={styles.back} href={`/spaces/${spaceId}/finances`}>
                <ArrowLeft size={20} aria-hidden="true" />
                Voltar às finanças
            </Link>
            <h1>{title}</h1>
            {children && <p className={styles.help}>{children}</p>}
        </header>
    );
}
// Previews are scoped to the same actor, space, session, and mounted form as commands.
export function usePlanningPreview<Input, Result>(
    spaceId: string,
    request: (
        input: Input,
        token: string,
        signal: AbortSignal,
    ) => Promise<Result>,
) {
    const csrf = useCsrf(),
        context = useSpaceContextInstance(),
        client = useQueryClient();
    const [data, setData] = useState<Result | null>(null),
        [error, setError] = useState<string | null>(null),
        [pending, setPending] = useState(false);
    const controller = useRef<AbortController | null>(null),
        mounted = useRef(false),
        sequence = useRef(0);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);
    function reset() {
        sequence.current++;
        controller.current?.abort();
        setData(null);
        setError(null);
        setPending(false);
    }
    async function preview(input: Input) {
        const capture = context.capture(),
            epoch = getSpacesSessionEpoch(client),
            version = ++sequence.current;
        if (!capture || capture.spaceId !== spaceId) return;
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        const current = () =>
            mounted.current &&
            version === sequence.current &&
            context.isCurrent(capture) &&
            getSpacesSessionEpoch(client) === epoch &&
            getAuthenticatedPersonId(client) === capture.personId;
        setPending(true);
        setData(null);
        setError(null);
        try {
            const token = await csrf.ensureToken();
            if (!current()) return;
            const result = await request(
                structuredClone(input),
                token,
                abort.signal,
            );
            if (current()) setData(result);
        } catch (failure) {
            if (current()) {
                setError(
                    failure instanceof ApiError
                        ? failure.message
                        : 'Não foi possível consultar a prévia. Tente novamente.',
                );
                if (
                    failure instanceof ApiError &&
                    failure.code === 'SPACE_NOT_FOUND'
                )
                    void context.accessLost(spaceId);
                if (failure instanceof ApiError && failure.status === 401)
                    client.setQueryData(['auth', 'me'], null);
            }
        } finally {
            if (current()) setPending(false);
        }
    }
    return { data, error, pending, reset, preview };
}
export function buildPlanningSplit(
    members: Member[],
    mode: Split['mode'],
    entries: Record<string, string>,
    amount: number,
): Split {
    if (!members.length)
        throw new Error('Atualize os participantes do espaço.');
    const values = members.map((member) => ({
        memberId: member.memberId,
        value: decimalUnits(
            entries[member.memberId] ??
                (mode === 'PERCENTAGES'
                    ? members.length === 1
                        ? '100'
                        : '50'
                    : ''),
        ),
    }));
    if (values.some((item) => item.value === null || item.value < 0))
        throw new Error('Informe a participação de cada pessoa.');
    const split: Split =
        mode === 'PERCENTAGES'
            ? {
                  mode,
                  shares: values.map((item) => ({
                      memberId: item.memberId,
                      basisPoints: item.value!,
                  })),
              }
            : {
                  mode,
                  shares: values.map((item) => ({
                      memberId: item.memberId,
                      amountInCents: item.value!,
                  })),
              };
    exactShares(amount, split);
    return split;
}
export function PlanningDistribution({
    members,
    mode,
    entries,
    onMode,
    onEntries,
    expectedMemberId,
    onExpectedMember,
    variable = false,
    income = false,
}: {
    members: Member[];
    mode: Split['mode'];
    entries: Record<string, string>;
    onMode: (mode: Split['mode']) => void;
    onEntries: (value: Record<string, string>) => void;
    expectedMemberId: string;
    onExpectedMember: (id: string) => void;
    variable?: boolean;
    income?: boolean;
}) {
    return (
        <fieldset>
            <legend>
                {income
                    ? 'Participação na receita'
                    : 'Responsabilidade pela despesa'}
            </legend>
            <label>
                Dividir por
                <select
                    value={mode}
                    onChange={(event) =>
                        onMode(event.target.value as Split['mode'])
                    }
                >
                    <option value="PERCENTAGES">Percentual</option>
                    {!variable && <option value="AMOUNTS">Valor</option>}
                </select>
            </label>
            {members.map((member) => (
                <label key={member.memberId}>
                    {member.displayName} ({mode === 'PERCENTAGES' ? '%' : 'R$'})
                    <Input
                        inputMode="decimal"
                        value={
                            entries[member.memberId] ??
                            (mode === 'PERCENTAGES'
                                ? members.length === 1
                                    ? '100'
                                    : '50'
                                : '')
                        }
                        onChange={(event) =>
                            onEntries({
                                ...entries,
                                [member.memberId]: event.target.value,
                            })
                        }
                    />
                </label>
            ))}
            <label>
                {income
                    ? 'Quem deve receber, se previsto'
                    : 'Quem deve pagar, se previsto'}
                <select
                    value={expectedMemberId}
                    onChange={(event) => onExpectedMember(event.target.value)}
                >
                    <option value="">Sem previsão de pessoa</option>
                    {members.map((member) => (
                        <option key={member.memberId} value={member.memberId}>
                            {member.displayName}
                        </option>
                    ))}
                </select>
            </label>
            <p className={styles.help}>
                A participação define a responsabilidade. A pessoa prevista não
                registra pagamento nem recebimento.
            </p>
        </fieldset>
    );
}
export function SettlementFields({
    value,
    onChange,
    options,
}: {
    value: Settlement;
    onChange: (value: Settlement) => void;
    options: {
        suggestedSettlement?: {
            referenceDate: string;
            expectedRuleVersion: number;
            targetDate: string;
        } | null;
        openCycles?: { id: string; targetDate: string }[];
    };
}) {
    return (
        <>
            <label>
                Quando acertar entre vocês
                <select
                    value={value.mode}
                    onChange={(event) => {
                        const mode = event.target.value;
                        if (mode === 'NONE') onChange({ mode });
                        if (mode === 'DATE') onChange({ mode, targetDate: '' });
                        if (mode === 'CYCLE') onChange({ mode, cycleId: '' });
                        if (
                            mode === 'SUGGESTED' &&
                            options.suggestedSettlement
                        ) {
                            const suggested = options.suggestedSettlement;
                            onChange({
                                mode,
                                referenceDate: suggested.referenceDate,
                                expectedRuleVersion:
                                    suggested.expectedRuleVersion,
                            });
                        }
                    }}
                >
                    <option value="NONE">Sem data de acerto</option>
                    <option value="DATE">Escolher data</option>
                    <option value="CYCLE">Acerto aberto</option>
                    {options.suggestedSettlement && (
                        <option value="SUGGESTED">
                            Usar sugestão:{' '}
                            {options.suggestedSettlement.targetDate}
                        </option>
                    )}
                </select>
            </label>
            {value.mode === 'DATE' && (
                <label>
                    Data do acerto
                    <Input
                        type="date"
                        required
                        value={value.targetDate}
                        onChange={(event) =>
                            onChange({
                                mode: 'DATE',
                                targetDate: event.target.value,
                            })
                        }
                    />
                </label>
            )}
            {value.mode === 'CYCLE' && (
                <label>
                    Acerto aberto
                    <select
                        required
                        value={value.cycleId}
                        onChange={(event) =>
                            onChange({
                                mode: 'CYCLE',
                                cycleId: event.target.value,
                            })
                        }
                    >
                        <option value="">Escolha um acerto</option>
                        {options.openCycles?.map((cycle) => (
                            <option key={cycle.id} value={cycle.id}>
                                {cycle.targetDate}
                            </option>
                        ))}
                    </select>
                </label>
            )}
        </>
    );
}
export function EconomicShares({
    shares,
    members,
}: {
    shares: { memberId: string; amountInCents: number }[] | null | undefined;
    members: Member[];
}) {
    return shares?.length ? (
        <dl>
            {shares.map((share) => (
                <div key={share.memberId}>
                    <dt>
                        {members.find(
                            (member) => member.memberId === share.memberId,
                        )?.displayName ?? 'Participante'}
                    </dt>
                    <dd>{formatMoney(share.amountInCents)}</dd>
                </div>
            ))}
        </dl>
    ) : null;
}
export function positiveAmount(value: string) {
    const cents = decimalUnits(value);
    if (cents === null || cents <= 0)
        throw new Error(
            'Informe um valor positivo com até duas casas decimais.',
        );
    return cents;
}
export function signedMoney(value: number | string) {
    const cents = BigInt(value);
    return `${cents < 0n ? '−' : ''}${formatReviewMoney(String(cents < 0n ? -cents : cents))}`;
}
export const planningStatus: Record<string, string> = {
    PENDING: 'Pendente',
    PARTIALLY_FULFILLED: 'Parcialmente realizado',
    FULFILLED: 'Realizado',
    PAID_OFF: 'Quitado',
    CANCELLED: 'Cancelado',
    OPEN: 'Em aberto',
    COMPLETED: 'Concluído',
};
