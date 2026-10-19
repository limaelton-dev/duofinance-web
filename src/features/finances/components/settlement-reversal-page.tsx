'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    getReversalOptions,
    reverseSettlement,
} from '@/lib/api/settlement-depth';
import { getSettlementCycles } from '@/lib/api/settlement-cycles';
import { useFinancialCommand } from '../hooks/use-financial-command';
import type {
    AssignmentCycle,
    ResolutionKind,
    ReversalInput,
    ReversalResult,
} from '../types/settlement-depth';
import { businessToday, formatDate, formatMoney } from '../utils/expense-money';
import { reversalInput } from '../utils/settlement-depth';
import {
    CommandFeedback,
    QueryFeedback,
    SettlementAccess,
    SettlementNav,
    settlementBlockMessage,
    useSettlementQuery,
} from './settlement-depth-shared';
import styles from './finances-summary.module.css';
import formStyles from './settlement-depth.module.css';

export function SettlementReversalPage({
    spaceId,
    kind,
    resolutionId,
}: {
    spaceId: string;
    kind: ResolutionKind;
    resolutionId: string;
}) {
    return (
        <SettlementAccess spaceId={spaceId}>
            {(personId) => (
                <ReversalRead
                    key={`${kind}:${resolutionId}`}
                    personId={personId}
                    spaceId={spaceId}
                    kind={kind}
                    resolutionId={resolutionId}
                />
            )}
        </SettlementAccess>
    );
}
function ReversalRead({
    personId,
    spaceId,
    kind,
    resolutionId,
}: {
    personId: string;
    spaceId: string;
    kind: ResolutionKind;
    resolutionId: string;
}) {
    const query = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-reversal-options', kind, resolutionId],
        (signal) => getReversalOptions(spaceId, kind, resolutionId, signal),
    );
    const [date, setDate] = useState(businessToday()),
        [confirmed, setConfirmed] = useState(false),
        [result, setResult] = useState<ReversalResult | null>(null),
        [correction, setCorrection] = useState<AssignmentCycle | undefined>(
            undefined,
        ),
        [cursor, setCursor] = useState<string | null>(null);
    const data = !query.isError ? query.data : undefined;
    const cycles = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-cycles', 'OPEN', cursor],
        (signal) => getSettlementCycles(spaceId, 'OPEN', cursor, signal),
        !!data?.requiresCorrectionCycle,
    );
    const command = useFinancialCommand<ReversalInput, ReversalResult>({
        execute: (id, input, token, key, signal) =>
            reverseSettlement(
                id,
                kind,
                resolutionId,
                input,
                token,
                key,
                signal,
            ),
        onSuccess: setResult,
    });
    const busy = command.isPending || command.canRetry;
    const base = `/spaces/${spaceId}/finances/settlements/${kind === 'TRANSFER' ? 'transfers' : 'offsets'}`;
    const allowed =
        data &&
        (data.canReverse ||
            (data.requiresCorrectionCycle &&
                data.spaceStatus !== 'CLOSED' &&
                !data.previousReversals.length));
    const name = (id: string | null) =>
        data?.members.find((m) => m.memberId === id)?.displayName ??
        'Membro do espaço';
    return (
        <section className={styles.stack}>
            <div className={styles.intro}>
                <h1>
                    Reverter{' '}
                    {kind === 'TRANSFER' ? 'transferência' : 'compensação'}
                </h1>
                <p>
                    A reversão cria um registro vinculado e recompõe os valores
                    aplicáveis. O fato original permanece visível.
                </p>
            </div>
            <SettlementNav spaceId={spaceId} />
            <Link href={`${base}/${resolutionId}`}>
                Voltar ao registro original
            </Link>
            {result ? (
                <div className={formStyles.receipt} role="status">
                    <h2>Reversão registrada</h2>
                    <p>
                        {formatMoney(result.reversal.amountInCents)} revertidos.
                        O registro original e esta correção estão preservados no
                        histórico.
                    </p>
                    {result.effects.map((effect) => (
                        <p key={effect.obligationId}>
                            Restante da pendência:{' '}
                            {formatMoney(effect.remainingAmountInCents)}.
                            {effect.cycleId && (
                                <>
                                    {' '}
                                    <Link
                                        href={`/spaces/${spaceId}/finances/settlements/${effect.cycleId}`}
                                    >
                                        Conferir ciclo atualizado
                                    </Link>
                                </>
                            )}
                        </p>
                    ))}
                    <Link href={`${base}/${resolutionId}`}>
                        Conferir registro com a reversão
                    </Link>
                    <Link href={`/spaces/${spaceId}/finances`}>
                        Conferir posição atual
                    </Link>
                </div>
            ) : (
                <>
                    <QueryFeedback query={query} label="opções de reversão" />
                    {data && (
                        <>
                            <h2>
                                Registro original:{' '}
                                {formatMoney(data.original.amountInCents)}
                            </h2>
                            <p>
                                Data do fato:{' '}
                                {formatDate(data.original.factDate)}. Registrado
                                em{' '}
                                {new Date(
                                    data.original.registeredAt,
                                ).toLocaleString('pt-BR', {
                                    timeZone: 'America/Sao_Paulo',
                                })}
                                .
                            </p>
                            <p className={styles.help}>
                                {kind === 'TRANSFER'
                                    ? 'Esta correção altera o registro no Prospera Mais. Ela não desfaz uma transferência na sua instituição financeira.'
                                    : 'Esta correção desfaz a compensação registrada, sem criar transferência de dinheiro.'}
                            </p>
                            {data.previousReversals.length > 0 && (
                                <>
                                    <h2>Reversões vinculadas</h2>
                                    <ul className={styles.list}>
                                        {data.previousReversals.map((item) => (
                                            <li key={item.id}>
                                                <h3>
                                                    Revertido:{' '}
                                                    {formatMoney(
                                                        item.amountInCents,
                                                    )}
                                                </h3>
                                                <p>
                                                    Data:{' '}
                                                    {formatDate(item.factDate)}
                                                </p>
                                                <p>
                                                    O registro original
                                                    permanece no histórico.
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                            {!allowed ? (
                                <p>
                                    {settlementBlockMessage(
                                        data.reversalBlockReason,
                                    )}
                                </p>
                            ) : (
                                <>
                                    <h2>Confira o efeito da reversão</h2>
                                    <ul
                                        className={styles.list}
                                        aria-label="Efeito da reversão"
                                    >
                                        {data.impact.map((impact, index) => (
                                            <li
                                                key={`${impact.originCommitmentId}:${index}`}
                                            >
                                                <p>
                                                    {name(
                                                        impact.debtorMemberId,
                                                    )}{' '}
                                                    deve a{' '}
                                                    {name(
                                                        impact.creditorMemberId,
                                                    )}{' '}
                                                    após a correção.
                                                </p>
                                                <p>
                                                    Valor em aberto:{' '}
                                                    <strong
                                                        className={
                                                            formStyles.money
                                                        }
                                                    >
                                                        {formatMoney(
                                                            impact.remainingAmountInCents,
                                                        )}
                                                    </strong>
                                                </p>
                                                {impact.requiresCorrectionCycle && (
                                                    <p>
                                                        A correção será
                                                        registrada em um ciclo
                                                        aberto. O ciclo
                                                        finalizado conserva sua
                                                        composição.
                                                    </p>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                    {data.requiresCorrectionCycle && (
                                        <p className={formStyles.note}>
                                            {settlementBlockMessage(
                                                'CORRECTION_CYCLE_REQUIRED',
                                            )}
                                        </p>
                                    )}
                                    <form
                                        className={formStyles.form}
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            if (
                                                !confirmed ||
                                                busy ||
                                                query.isFetching ||
                                                (data.requiresCorrectionCycle &&
                                                    !correction)
                                            )
                                                return;
                                            command.submit(
                                                reversalInput(
                                                    data,
                                                    date,
                                                    correction,
                                                ),
                                            );
                                        }}
                                    >
                                        <fieldset
                                            disabled={busy || query.isFetching}
                                        >
                                            {data.requiresCorrectionCycle && (
                                                <>
                                                    <QueryFeedback
                                                        query={cycles}
                                                        label="ciclos para correção"
                                                    />
                                                    <label
                                                        className={
                                                            formStyles.field
                                                        }
                                                        htmlFor="reversal-correction-cycle"
                                                    >
                                                        Ciclo aberto para a
                                                        correção
                                                        <select
                                                            id="reversal-correction-cycle"
                                                            required
                                                            value={
                                                                correction?.id ??
                                                                ''
                                                            }
                                                            onChange={(e) => {
                                                                const chosen =
                                                                    cycles.data?.items.find(
                                                                        (c) =>
                                                                            c.id ===
                                                                            e
                                                                                .target
                                                                                .value,
                                                                    );
                                                                setCorrection(
                                                                    chosen,
                                                                );
                                                                setConfirmed(
                                                                    false,
                                                                );
                                                            }}
                                                        >
                                                            <option value="">
                                                                Selecione um
                                                                ciclo aberto
                                                            </option>
                                                            {correction &&
                                                                !cycles.data?.items.some(
                                                                    (c) =>
                                                                        c.id ===
                                                                        correction.id,
                                                                ) && (
                                                                    <option
                                                                        value={
                                                                            correction.id
                                                                        }
                                                                    >
                                                                        {formatDate(
                                                                            correction.targetDate,
                                                                        )}
                                                                    </option>
                                                                )}
                                                            {!cycles.isFetching &&
                                                                cycles.data?.items
                                                                    .filter(
                                                                        (c) =>
                                                                            c.status ===
                                                                            'OPEN',
                                                                    )
                                                                    .map(
                                                                        (c) => (
                                                                            <option
                                                                                key={
                                                                                    c.id
                                                                                }
                                                                                value={
                                                                                    c.id
                                                                                }
                                                                            >
                                                                                {formatDate(
                                                                                    c.targetDate,
                                                                                )}
                                                                            </option>
                                                                        ),
                                                                    )}
                                                        </select>
                                                    </label>
                                                    {cycles.data?.page
                                                        .nextCursor && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => {
                                                                setCursor(
                                                                    cycles.data!
                                                                        .page
                                                                        .nextCursor,
                                                                );
                                                                setConfirmed(
                                                                    false,
                                                                );
                                                            }}
                                                        >
                                                            Outros ciclos para
                                                            correção
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                            <label
                                                className={formStyles.field}
                                                htmlFor="reversal-date"
                                            >
                                                Data da reversão
                                                <Input
                                                    id="reversal-date"
                                                    type="date"
                                                    max={data.referenceDate}
                                                    required
                                                    value={date}
                                                    onChange={(e) => {
                                                        setDate(e.target.value);
                                                        setConfirmed(false);
                                                    }}
                                                />
                                            </label>
                                            <label className={formStyles.check}>
                                                <input
                                                    type="checkbox"
                                                    required
                                                    checked={confirmed}
                                                    onChange={(e) =>
                                                        setConfirmed(
                                                            e.target.checked,
                                                        )
                                                    }
                                                />
                                                Conferi os efeitos e quero
                                                reverter integralmente este
                                                registro de{' '}
                                                {formatMoney(
                                                    data.original.amountInCents,
                                                )}
                                                .
                                            </label>
                                            <Button
                                                type="submit"
                                                disabled={
                                                    !confirmed ||
                                                    (data.requiresCorrectionCycle &&
                                                        !correction)
                                                }
                                            >
                                                Confirmar reversão
                                            </Button>
                                        </fieldset>
                                    </form>
                                </>
                            )}
                        </>
                    )}
                    <CommandFeedback command={command} />
                    <Button
                        variant="outline"
                        disabled={busy || query.isFetching}
                        onClick={() => {
                            setConfirmed(false);
                            setCorrection(undefined);
                            void query.refetch();
                            if (data?.requiresCorrectionCycle)
                                void cycles.refetch();
                        }}
                    >
                        Atualizar antes de reverter
                    </Button>
                </>
            )}
        </section>
    );
}
