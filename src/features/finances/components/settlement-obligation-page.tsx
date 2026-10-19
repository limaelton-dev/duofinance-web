'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import {
    getAssignmentOptions,
    getWaiverHistory,
    getWaiverOptions,
    moveObligation,
    waiveObligation,
} from '@/lib/api/settlement-depth';
import { useFinancialCommand } from '../hooks/use-financial-command';
import type {
    AssignmentInput,
    AssignmentOptions,
    AssignmentResult,
    WaiverInput,
    WaiverOptions,
    WaiverResult,
} from '../types/settlement-depth';
import {
    businessToday,
    decimalUnits,
    formatDate,
    formatMoney,
} from '../utils/expense-money';
import { assignmentVersions } from '../utils/settlement-depth';
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

export function SettlementObligationPage({
    spaceId,
    obligationId,
}: {
    spaceId: string;
    obligationId: string;
}) {
    return (
        <SettlementAccess spaceId={spaceId}>
            {(personId) => (
                <ObligationRead
                    key={obligationId}
                    personId={personId}
                    spaceId={spaceId}
                    obligationId={obligationId}
                />
            )}
        </SettlementAccess>
    );
}
function ObligationRead({
    personId,
    spaceId,
    obligationId,
}: {
    personId: string;
    spaceId: string;
    obligationId: string;
}) {
    const [cursor, setCursor] = useState<string | null>(null);
    const space = useSpaceContext();
    const [moveResult, setMoveResult] = useState<AssignmentResult | null>(null),
        [waiverResult, setWaiverResult] = useState<WaiverResult | null>(null);
    const assignment = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-assignment', obligationId, cursor],
        (signal) => getAssignmentOptions(spaceId, obligationId, cursor, signal),
    );
    const waiver = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-waiver-options', obligationId],
        (signal) => getWaiverOptions(spaceId, obligationId, signal),
    );
    const [historyCursor, setHistoryCursor] = useState<string | null>(null);
    const history = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-waivers', obligationId, historyCursor],
        (signal) =>
            getWaiverHistory(spaceId, obligationId, historyCursor, signal),
    );
    const data =
        !assignment.isFetching && !assignment.isError
            ? assignment.data
            : undefined;
    const waiverData =
        !waiver.isFetching && !waiver.isError ? waiver.data : undefined;
    return (
        <section className={styles.stack}>
            <div className={styles.intro}>
                <h1>Pendência entre vocês</h1>
                <p>
                    Mude o acerto ou dispense um valor a receber. A despesa ou
                    receita de origem permanece no histórico.
                </p>
            </div>
            <SettlementNav spaceId={spaceId} />
            {moveResult && (
                <div className={formStyles.receipt} role="status">
                    <h2>Acerto atualizado</h2>
                    <p>
                        {moveResult.settlementCycle
                            ? `Novo acerto: ${formatDate(moveResult.settlementCycle.targetDate)}.`
                            : 'A pendência ficou sem ciclo associado.'}{' '}
                        A data econômica da origem foi preservada.
                    </p>
                    {moveResult.settlementCycle && (
                        <Link
                            href={`/spaces/${spaceId}/finances/settlements/${moveResult.settlementCycle.id}`}
                        >
                            Conferir o acerto
                        </Link>
                    )}
                </div>
            )}
            {waiverResult && (
                <div className={formStyles.receipt} role="status">
                    <h2>Dispensa registrada</h2>
                    <p>
                        Você abriu mão de{' '}
                        {formatMoney(waiverResult.waiver.amountInCents)}.
                        Restante em aberto:{' '}
                        {formatMoney(
                            waiverResult.obligation.remainingAmountInCents,
                        )}
                        .
                    </p>
                    <p>
                        A origem foi preservada. Nenhum dinheiro foi
                        transferido.
                    </p>
                </div>
            )}
            <QueryFeedback query={assignment} label="destinos do acerto" />
            {data && (
                <>
                    <p>
                        Em aberto:{' '}
                        <strong className={formStyles.money}>
                            {formatMoney(
                                data.obligation.remainingAmountInCents,
                            )}
                        </strong>
                    </p>
                    {data.currentCycle ? (
                        <p>
                            Acerto atual:{' '}
                            <Link
                                href={`/spaces/${spaceId}/finances/settlements/${data.currentCycle.id}`}
                            >
                                {formatDate(data.currentCycle.targetDate)}
                            </Link>
                        </p>
                    ) : (
                        <p>Sem ciclo associado</p>
                    )}
                    {!moveResult && (
                        <MoveForm
                            key={`${data.obligation.version}:${data.spaceVersion}:${cursor}`}
                            spaceId={spaceId}
                            data={data}
                            refresh={() => void assignment.refetch()}
                            onSuccess={setMoveResult}
                        />
                    )}
                    {data.nextCursor && (
                        <Button
                            variant="outline"
                            disabled={space.switchBlocked}
                            onClick={() => setCursor(data.nextCursor)}
                        >
                            Ver outros ciclos disponíveis
                        </Button>
                    )}
                    {cursor && (
                        <Button
                            variant="outline"
                            disabled={space.switchBlocked}
                            onClick={() => setCursor(null)}
                        >
                            Voltar aos primeiros ciclos
                        </Button>
                    )}
                </>
            )}
            <QueryFeedback query={waiver} label="permissão de dispensa" />
            {waiverData && !waiverResult && (
                <WaiverForm
                    key={`${waiverData.obligation.version}:${waiverData.spaceVersion}`}
                    data={waiverData}
                    refresh={() => void waiver.refetch()}
                    onSuccess={setWaiverResult}
                />
            )}
            <section
                className={styles.stack}
                aria-label="Histórico de dispensas"
            >
                <h2>Dispensas desta pendência</h2>
                <p className={styles.help}>
                    Dispensar é abrir mão de receber. Não registra pagamento nem
                    compensação.
                </p>
                <QueryFeedback query={history} label="dispensas" />
                {history.data && !history.isFetching && !history.isError && (
                    <>
                        {history.data.items.length ? (
                            <ul className={styles.list}>
                                {history.data.items.map((item) => (
                                    <li key={item.waiver.id}>
                                        <h3>
                                            Dispensado:{' '}
                                            {formatMoney(
                                                item.waiver.amountInCents,
                                            )}
                                        </h3>
                                        <p>
                                            Data:{' '}
                                            {formatDate(item.waiver.factDate)}
                                        </p>
                                        {item.waiver.reason && (
                                            <p>Motivo: {item.waiver.reason}</p>
                                        )}
                                        <p>
                                            Credor responsável:{' '}
                                            {waiverData?.members.find(
                                                (m) =>
                                                    m.memberId ===
                                                    item.waiver
                                                        .creditorMemberId,
                                            )?.displayName ??
                                                'Credor da pendência'}
                                        </p>
                                        <p>
                                            Registro preservado ·{' '}
                                            {new Date(
                                                item.waiver.registeredAt,
                                            ).toLocaleString('pt-BR', {
                                                timeZone: 'America/Sao_Paulo',
                                            })}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p>Nenhuma dispensa registrada.</p>
                        )}
                        {history.data.page.nextCursor && (
                            <Button
                                variant="outline"
                                onClick={() =>
                                    setHistoryCursor(
                                        history.data!.page.nextCursor,
                                    )
                                }
                            >
                                Próximas dispensas
                            </Button>
                        )}
                        {historyCursor && (
                            <Button
                                variant="outline"
                                onClick={() => setHistoryCursor(null)}
                            >
                                Voltar ao início do histórico
                            </Button>
                        )}
                    </>
                )}
            </section>
            <div className={styles.actions}>
                <Link
                    href={`/spaces/${spaceId}/finances/settlements/transfers?obligationId=${obligationId}`}
                >
                    Transferências desta pendência
                </Link>
                <Link
                    href={`/spaces/${spaceId}/finances/settlements/offsets?obligationId=${obligationId}`}
                >
                    Compensações desta pendência
                </Link>
                <Link
                    href={`/spaces/${spaceId}/finances/settlements/offsets/new?obligationIds=${obligationId}`}
                >
                    Conferir compensação
                </Link>
            </div>
        </section>
    );
}
function MoveForm({
    spaceId,
    data,
    refresh,
    onSuccess,
}: {
    spaceId: string;
    data: AssignmentOptions;
    refresh: () => void;
    onSuccess: (result: AssignmentResult) => void;
}) {
    const space = useSpaceContext();
    const [mode, setMode] = useState<'CYCLE' | 'DATE' | 'NONE'>('CYCLE'),
        [cycleId, setCycleId] = useState(''),
        [targetDate, setDate] = useState(data.today),
        [confirmed, setConfirmed] = useState(false),
        [result, setResult] = useState<AssignmentResult | null>(null);
    const command = useFinancialCommand<AssignmentInput, AssignmentResult>({
        execute: (id, input, token, key, signal) =>
            moveObligation(id, data.obligation.id, input, token, key, signal),
        onSuccess: (result) => {
            setResult(result);
            onSuccess(result);
        },
    });
    const busy = command.isPending || command.canRetry || space.switchBlocked;
    if (result)
        return (
            <div className={formStyles.receipt} role="status">
                <h2>Acerto atualizado</h2>
                <p>
                    {result.settlementCycle
                        ? `Novo acerto: ${formatDate(result.settlementCycle.targetDate)}.`
                        : 'A pendência ficou sem ciclo associado.'}{' '}
                    A data econômica da origem foi preservada.
                </p>
                {result.settlementCycle && (
                    <Link
                        href={`/spaces/${spaceId}/finances/settlements/${result.settlementCycle.id}`}
                    >
                        Conferir o acerto
                    </Link>
                )}
            </div>
        );
    return (
        <section className={styles.stack}>
            <h2>Mover para outro acerto</h2>
            {!data.eligible ? (
                <p>{settlementBlockMessage(data.blockingReason)}</p>
            ) : (
                <form
                    className={formStyles.form}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!confirmed || busy) return;
                        const settlement: AssignmentInput['settlement'] =
                            mode === 'CYCLE'
                                ? { mode, cycleId }
                                : mode === 'DATE'
                                  ? { mode, targetDate }
                                  : { mode };
                        command.submit({
                            settlement,
                            expectedSpaceVersion: data.spaceVersion,
                            expectedObligationVersion: data.obligation.version,
                            expectedCycleVersions: assignmentVersions(
                                data,
                                settlement,
                            ),
                        });
                    }}
                >
                    <fieldset disabled={busy}>
                        <label
                            className={formStyles.field}
                            htmlFor="assignment-mode"
                        >
                            Destino da pendência
                            <select
                                id="assignment-mode"
                                value={mode}
                                onChange={(e) => {
                                    setMode(e.target.value as typeof mode);
                                    setConfirmed(false);
                                }}
                            >
                                <option value="CYCLE">
                                    Ciclo aberto existente
                                </option>
                                <option value="DATE">
                                    Acerto em outra data
                                </option>
                                <option value="NONE">Sem ciclo</option>
                            </select>
                        </label>
                        {mode === 'CYCLE' && (
                            <label
                                className={formStyles.field}
                                htmlFor="assignment-cycle"
                            >
                                Novo ciclo
                                <select
                                    id="assignment-cycle"
                                    required
                                    value={cycleId}
                                    onChange={(e) => {
                                        setCycleId(e.target.value);
                                        setConfirmed(false);
                                    }}
                                >
                                    <option value="">Selecione um ciclo</option>
                                    {data.cycles
                                        .filter(
                                            (c) =>
                                                c.status === 'OPEN' &&
                                                c.id !== data.currentCycle?.id,
                                        )
                                        .map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {formatDate(c.targetDate)}
                                            </option>
                                        ))}
                                </select>
                            </label>
                        )}
                        {mode === 'DATE' && (
                            <label
                                className={formStyles.field}
                                htmlFor="assignment-date"
                            >
                                Nova data de acerto
                                <Input
                                    id="assignment-date"
                                    type="date"
                                    required
                                    min={data.today}
                                    value={targetDate}
                                    onChange={(e) => {
                                        setDate(e.target.value);
                                        setConfirmed(false);
                                    }}
                                />
                            </label>
                        )}
                        <p className={styles.help}>
                            Somente o restante em aberto muda de destino. A data
                            econômica e os registros anteriores são preservados.
                            Ciclos finalizados não aceitam alterações.
                        </p>
                        <label className={formStyles.check}>
                            <input
                                type="checkbox"
                                required
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                            />
                            Conferi o destino e quero mover a pendência.
                        </label>
                        <Button type="submit" disabled={!confirmed}>
                            Confirmar mudança de acerto
                        </Button>
                    </fieldset>
                    <CommandFeedback command={command} />
                    <Button
                        variant="outline"
                        type="button"
                        disabled={busy}
                        onClick={refresh}
                    >
                        Atualizar destinos
                    </Button>
                </form>
            )}
        </section>
    );
}
function WaiverForm({
    data,
    refresh,
    onSuccess,
}: {
    data: WaiverOptions;
    refresh: () => void;
    onSuccess: (result: WaiverResult) => void;
}) {
    const space = useSpaceContext();
    const [amount, setAmount] = useState(''),
        [date, setDate] = useState(data.referenceDate ?? businessToday()),
        [reason, setReason] = useState(''),
        [confirmed, setConfirmed] = useState(false),
        [result, setResult] = useState<WaiverResult | null>(null),
        [validation, setValidation] = useState<string | null>(null);
    const command = useFinancialCommand<WaiverInput, WaiverResult>({
        execute: (id, input, token, key, signal) =>
            waiveObligation(id, data.obligation.id, input, token, key, signal),
        onSuccess: (result) => {
            setResult(result);
            onSuccess(result);
        },
    });
    const busy = command.isPending || command.canRetry || space.switchBlocked;
    if (result)
        return (
            <div className={formStyles.receipt} role="status">
                <h2>Dispensa registrada</h2>
                <p>
                    Você abriu mão de {formatMoney(result.waiver.amountInCents)}
                    . Restante em aberto:{' '}
                    {formatMoney(result.obligation.remainingAmountInCents)}.
                </p>
                <p>A origem foi preservada. Nenhum dinheiro foi transferido.</p>
            </div>
        );
    return (
        <section className={styles.stack}>
            <h2>Dispensar valor a receber</h2>
            {!data.canWaive ? (
                <p>{settlementBlockMessage(data.waiverBlockReason)}</p>
            ) : (
                <form
                    className={formStyles.form}
                    onSubmit={(e) => {
                        e.preventDefault();
                        const cents = decimalUnits(amount);
                        if (
                            !cents ||
                            cents > data.obligation.remainingAmountInCents
                        ) {
                            setValidation(
                                'Informe um valor maior que zero e até o restante em aberto.',
                            );
                            return;
                        }
                        if (!confirmed || busy) return;
                        setValidation(null);
                        command.submit({
                            amountInCents: cents,
                            factDate: date,
                            expectedSpaceVersion: data.spaceVersion,
                            expectedObligationVersion: data.obligation.version,
                            ...(reason.trim() ? { reason: reason.trim() } : {}),
                        });
                    }}
                >
                    <fieldset disabled={busy}>
                        <p>
                            Você é o credor desta pendência. Pode dispensar até{' '}
                            {formatMoney(
                                data.obligation.remainingAmountInCents,
                            )}
                            .
                        </p>
                        <div className={formStyles.pair}>
                            <label
                                className={formStyles.field}
                                htmlFor="waiver-amount"
                            >
                                Valor a dispensar (R$)
                                <Input
                                    id="waiver-amount"
                                    inputMode="decimal"
                                    required
                                    value={amount}
                                    onChange={(e) => {
                                        setAmount(e.target.value);
                                        setConfirmed(false);
                                    }}
                                    aria-invalid={!!validation}
                                />
                            </label>
                            <label
                                className={formStyles.field}
                                htmlFor="waiver-date"
                            >
                                Data da dispensa
                                <Input
                                    id="waiver-date"
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
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setAmount(
                                    `${BigInt(data.obligation.remainingAmountInCents) / 100n},${String(BigInt(data.obligation.remainingAmountInCents) % 100n).padStart(2, '0')}`,
                                );
                                setConfirmed(false);
                            }}
                        >
                            Usar todo o valor em aberto
                        </Button>
                        <label
                            className={formStyles.field}
                            htmlFor="waiver-reason"
                        >
                            Motivo (opcional)
                            <Input
                                id="waiver-reason"
                                maxLength={500}
                                value={reason}
                                onChange={(e) => {
                                    setReason(e.target.value);
                                    setConfirmed(false);
                                }}
                            />
                        </label>
                        <label className={formStyles.check}>
                            <input
                                type="checkbox"
                                required
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                            />
                            Confirmo que abro mão deste valor a receber.
                        </label>
                        <Button type="submit" disabled={!confirmed}>
                            Confirmar dispensa
                        </Button>
                    </fieldset>
                    {validation && <p role="alert">{validation}</p>}
                    <CommandFeedback command={command} />
                    <Button
                        variant="outline"
                        type="button"
                        disabled={busy}
                        onClick={refresh}
                    >
                        Atualizar pendência
                    </Button>
                </form>
            )}
        </section>
    );
}
