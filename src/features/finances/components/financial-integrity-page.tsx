'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import { getIncomeOptions } from '@/lib/api/income';
import {
    executeIntegrity,
    getFinancialReversals,
    getIntegrityOrigin,
    getIntegrityVersions,
    type IntegrityOperation,
    type IntegrityWork,
} from '@/lib/api/financial-integrity';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useFinancialCommand } from '../hooks/use-financial-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type {
    ChangeInput,
    CorrectionInput,
    IntegrityFact,
    IntegrityPreview,
    OriginModality,
} from '../types/financial-integrity';
import {
    businessToday,
    decimalUnits,
    formatDate,
    formatMoney,
} from '../utils/expense-money';
import { FinancialImpact, financialFactLabels } from './financial-impact';
import styles from './expenses.module.css';
import {
    FinancialVersionHistory,
    FinancialReversalHistory,
} from './financial-history';

export function FinancialIntegrityPage({
    spaceId,
    commitmentId,
    modality = 'AUTO',
    referenceDate,
    installmentId,
}: {
    spaceId: string;
    commitmentId: string;
    modality?: OriginModality;
    referenceDate?: string;
    installmentId?: string;
}) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    return (
        <IntegrityContent
            key={`${auth.data.person.id}:${spaceId}:${space.generation}:${commitmentId}:${modality}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
            commitmentId={commitmentId}
            modality={modality}
            referenceDate={referenceDate}
            installmentId={installmentId}
        />
    );
}

function IntegrityContent({
    personId,
    spaceId,
    commitmentId,
    modality: routeModality,
    referenceDate,
    installmentId,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
    modality: OriginModality;
    referenceDate?: string;
    installmentId?: string;
}) {
    const [month, setMonth] = useState(
        (referenceDate ?? businessToday()).slice(0, 7),
    );
    const spaceContext = useSpaceContextInstance();
    const key = [
        'finances',
        personId,
        spaceId,
        'integrity',
        commitmentId,
        routeModality,
        month,
    ] as const;
    const origin = useExpenseQuery(personId, spaceId, key, true, (signal) =>
        getIntegrityOrigin(spaceId, commitmentId, routeModality, month, signal),
    );
    const context = useExpenseQuery(
        personId,
        spaceId,
        ['finances', personId, spaceId, 'integrity-context'],
        true,
        (signal) => getIncomeOptions(spaceId, signal),
    );
    const versions = useExpenseQuery(
        personId,
        spaceId,
        [...key, 'versions'],
        true,
        (signal) => getIntegrityVersions(spaceId, commitmentId, signal),
    );
    const [cursor, setCursor] = useState<string | null>(null);
    const reversals = useExpenseQuery(
        personId,
        spaceId,
        [...key, 'reversals', cursor],
        true,
        (signal) =>
            getFinancialReversals(spaceId, commitmentId, cursor, signal),
    );
    const [operation, setOperation] = useState<IntegrityOperation>('ADJUST');
    const [selectedTarget, setSelectedTarget] = useState(
        installmentId ?? referenceDate ?? '',
    );
    const [factId, setFactId] = useState(''),
        [amount, setAmount] = useState(''),
        [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>(
            'DECREASE',
        );
    const [reason, setReason] = useState(''),
        [factDate, setFactDate] = useState(businessToday),
        [description, setDescription] = useState(''),
        [effectiveFrom, setEffectiveFrom] = useState('');
    const [shares, setShares] = useState<Record<string, string>>({});
    const [settlementMode, setSettlementMode] = useState<
        'NONE' | 'DATE' | 'CYCLE'
    >('NONE');
    const [settlementDate, setSettlementDate] = useState(''),
        [settlementCycle, setSettlementCycle] = useState('');
    const [dirty, setDirty] = useState(false),
        [validation, setValidation] = useState<string | null>(null);
    const [review, setReview] = useState<{
        work: IntegrityWork;
        value: IntegrityPreview;
    } | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const activeWork = useRef<IntegrityWork | null>(null),
        formRef = useRef<HTMLFormElement>(null),
        statusRef = useRef<HTMLHeadingElement>(null);
    const [activePhase, setActivePhase] = useState<'PREVIEW' | 'CONFIRM'>(
        'PREVIEW',
    );
    const command = useFinancialCommand({
        execute: executeIntegrity,
        invalidate: (work) => work.phase === 'CONFIRM',
        onConflict() {
            setReview(null);
            void origin.refetch();
            void context.refetch();
        },
        onSuccess(value) {
            if (activeWork.current?.phase === 'PREVIEW') {
                setReview({ work: structuredClone(activeWork.current), value });
                return;
            }
            setDirty(false);
            setReview(null);
            setReason('');
            setAmount('');
            setNotice(
                value.proposal
                    ? 'Proposta registrada. Aguardando o aceite da outra pessoa.'
                    : 'Operação registrada. O histórico foi preservado.',
            );
            void origin.refetch();
            void versions.refetch();
            void reversals.refetch();
        },
    });
    const busy = command.isPending || command.canRetry;
    useEffect(() => {
        if (
            [origin.error, context.error, versions.error, reversals.error].some(
                (error) =>
                    error instanceof ApiError &&
                    error.code === 'SPACE_NOT_FOUND',
            )
        )
            void spaceContext.accessLost(spaceId);
    }, [
        origin.error,
        context.error,
        versions.error,
        reversals.error,
        spaceContext,
        spaceId,
    ]);
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    useEffect(() => {
        if (notice) statusRef.current?.focus();
    }, [notice]);
    useEffect(() => {
        if (command.fields[0]) {
            const field = formRef.current?.elements.namedItem(
                command.fields[0],
            );
            if (field instanceof HTMLElement) field.focus();
        }
    }, [command.fields]);
    const data =
        !origin.isFetching && !origin.isError ? origin.data : undefined;
    const modality = data?.commitment.modality ?? routeModality;
    const ctx =
        !context.isFetching && !context.isError ? context.data : undefined;
    const target = data?.targets.find(
        (t) => (t.referenceDate ?? t.id) === selectedTarget,
    );
    const facts: IntegrityFact[] =
        modality === 'ONE_TIME'
            ? (data?.facts ?? [])
            : [
                  ...(target?.facts ?? []),
                  ...(target?.externalSettlements ?? []).map((f) => ({
                      ...f,
                      kind: 'EXTERNAL_SETTLEMENT' as const,
                  })),
              ];
    const selectedFact = facts.find((f) => f.id === factId);
    const members = ctx?.members ?? [];
    function changed() {
        setDirty(true);
        setReview(null);
        setValidation(null);
        setNotice(null);
    }
    function run(work: IntegrityWork) {
        activeWork.current = work;
        setActivePhase(work.phase);
        command.submit(work);
    }
    function prepare() {
        setValidation(null);
        if (!data || !ctx || busy) return;
        if (modality !== 'ONE_TIME' && !target)
            return setValidation(
                'Escolha a ocorrência ou parcela que deseja corrigir.',
            );
        if (target?.globalPayoff && operation !== 'REVERSE')
            return setValidation(
                'Para corrigir uma quitação global, escolha Reverter um fato realizado.',
            );
        const common: CorrectionInput = {
            expectedCommitmentVersion: data.commitment.version,
            ...(ctx.spaceType === 'SHARED'
                ? { expectedSpaceVersion: ctx.version }
                : {}),
            reason: reason.trim(),
            factDate,
        };
        if (modality === 'RECURRING' && target) {
            common.referenceDate = target.referenceDate;
            common.expectedOccurrenceVersion = target.stateVersion ?? 1;
        }
        if (modality === 'INSTALLMENT' && target?.id && !target.globalPayoff) {
            common.installmentId = target.id;
            common.expectedOccurrenceVersion = target.stateVersion ?? 1;
        }
        const cents = decimalUnits(amount);
        if (operation === 'CHANGE') {
            if (
                !description.trim() ||
                !effectiveFrom ||
                effectiveFrom <= businessToday() ||
                cents === null ||
                cents <= 0
            )
                return setValidation(
                    'Informe descrição, valor positivo e uma data de vigência futura.',
                );
            const input: ChangeInput = {
                scope: ctx.spaceType,
                kind: data.commitment.kind,
                description: description.trim(),
                amountInCents: cents,
                effectiveFrom,
                expectedCommitmentVersion: data.commitment.version,
            };
            if (ctx.spaceType === 'SHARED') {
                const entries = members.map((m) => ({
                    memberId: m.memberId,
                    amountInCents: decimalUnits(shares[m.memberId] ?? ''),
                }));
                if (
                    entries.some((e) => e.amountInCents === null) ||
                    entries.reduce(
                        (sum, e) => sum + BigInt(e.amountInCents ?? 0),
                        0n,
                    ) !== BigInt(cents)
                )
                    return setValidation(
                        'A divisão de cada participante precisa somar o novo valor total.',
                    );
                input.expectedSpaceVersion = ctx.version;
                input.distribution = {
                    mode: 'AMOUNTS',
                    shares: entries.map((e) => ({
                        memberId: e.memberId,
                        amountInCents: e.amountInCents!,
                    })),
                };
            }
            if (modality === 'INSTALLMENT' && target?.id)
                input.installmentIds = [target.id];
            return run({
                id: commitmentId,
                operation,
                phase: 'PREVIEW',
                input,
            });
        }
        if (!common.reason || !factDate || factDate > businessToday())
            return setValidation(
                'Informe o motivo e uma data do fato já ocorrida, até hoje.',
            );
        if (operation !== 'CANCEL') {
            if (cents === null || cents <= 0)
                return setValidation(
                    'Informe um valor positivo em reais, com até duas casas decimais.',
                );
            common.amountInCents = cents;
        }
        if (operation === 'ADJUST') common.direction = direction;
        if (operation === 'REVERSE') {
            if (!selectedFact)
                return setValidation(
                    'Escolha o fato original que deseja reverter.',
                );
            if (factDate < selectedFact.factDate)
                return setValidation(
                    'A data da reversão deve ser igual ou posterior à data do fato original.',
                );
            common.originalId = selectedFact.id;
            common.originalKind = selectedFact.kind;
        }
        if (ctx.spaceType === 'SHARED' && operation !== 'CANCEL') {
            if (settlementMode === 'DATE') {
                if (!settlementDate || settlementDate < businessToday())
                    return setValidation(
                        'Escolha uma data de acerto de hoje em diante.',
                    );
                common.settlement = {
                    mode: 'DATE',
                    targetDate: settlementDate,
                };
            } else if (settlementMode === 'CYCLE') {
                if (
                    !ctx.openCycles?.some(
                        (cycle) => cycle.id === settlementCycle,
                    )
                )
                    return setValidation(
                        'Escolha um acerto aberto para a correção.',
                    );
                common.settlement = { mode: 'CYCLE', cycleId: settlementCycle };
            } else common.settlement = { mode: 'NONE' };
        }
        run({ id: commitmentId, operation, phase: 'PREVIEW', input: common });
    }
    return (
        <section className={styles.stack}>
            <header className={styles.heading}>
                <h1 ref={statusRef} tabIndex={-1}>
                    Histórico e correções
                </h1>
                <p className={styles.help}>
                    Ajuste, cancele ou reverta um registro com seu histórico
                    preservado.
                </p>
            </header>
            <div className={styles.actions}>
                <Button variant="outline" asChild>
                    <Link href={`/spaces/${spaceId}/finances`}>
                        Voltar às Finanças
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    disabled={busy || origin.isFetching}
                    onClick={() => {
                        setReview(null);
                        void origin.refetch();
                        void context.refetch();
                        void versions.refetch();
                        void reversals.refetch();
                    }}
                >
                    Atualizar registro
                </Button>
            </div>
            {notice && (
                <p role="status" className={styles.success}>
                    {notice}
                </p>
            )}
            {(origin.isPending || origin.isFetching || context.isPending) && (
                <div role="status" aria-busy="true">
                    <p>Consultando o registro…</p>
                    <Skeleton className="mt-4 h-24 w-full" />
                </div>
            )}
            {(origin.isError || context.isError) && (
                <p role="alert">
                    Não foi possível consultar o registro e suas permissões.
                    Atualize para tentar novamente.
                </p>
            )}
            {data && (
                <>
                    <div className={styles.receipt}>
                        <h2>{data.commitment.description}</h2>
                        <p>
                            {data.commitment.kind === 'EXPENSE'
                                ? 'Despesa'
                                : 'Receita'}{' '}
                            ·{' '}
                            {modality === 'ONE_TIME'
                                ? 'Avulsa'
                                : modality === 'RECURRING'
                                  ? 'Recorrente'
                                  : 'Parcelada'}
                        </p>
                        {data.commitment.amountInCents != null && (
                            <p className={styles.amount}>
                                {formatMoney(data.commitment.amountInCents)}
                            </p>
                        )}
                        {data.cancellation && (
                            <p>
                                Cancelado em{' '}
                                {formatDate(data.cancellation.factDate)}:{' '}
                                {data.cancellation.reason}
                            </p>
                        )}
                    </div>
                    {modality === 'RECURRING' && (
                        <label>
                            Mês das ocorrências
                            <Input
                                type="month"
                                value={month}
                                disabled={busy}
                                onChange={(e) => {
                                    changed();
                                    setMonth(e.target.value);
                                    setSelectedTarget('');
                                }}
                            />
                        </label>
                    )}
                    {ctx && (
                        <form
                            ref={formRef}
                            className={`${styles.fields} ${styles.settings}`}
                            onSubmit={(e) => {
                                e.preventDefault();
                                prepare();
                            }}
                        >
                            <fieldset
                                disabled={busy || ctx.status !== 'ACTIVE'}
                            >
                                <legend>O que precisa corrigir?</legend>
                                {ctx.status !== 'ACTIVE' && (
                                    <p>
                                        Este espaço não permite novas alterações
                                        nesta tela. O histórico continua
                                        disponível.
                                    </p>
                                )}
                                <label>
                                    Operação
                                    <select
                                        value={operation}
                                        onChange={(e) => {
                                            changed();
                                            setOperation(
                                                e.target
                                                    .value as IntegrityOperation,
                                            );
                                        }}
                                    >
                                        <option value="ADJUST">
                                            Registrar acréscimo ou desconto
                                        </option>
                                        <option value="REVERSE">
                                            Reverter um fato realizado
                                        </option>
                                        {modality === 'ONE_TIME' && (
                                            <option value="CANCEL">
                                                Cancelar compromisso sem
                                                realização
                                            </option>
                                        )}
                                        {modality !== 'RECURRING' && (
                                            <option value="CHANGE">
                                                Alterar valor ou divisão futura
                                            </option>
                                        )}
                                    </select>
                                </label>
                                {modality !== 'ONE_TIME' && (
                                    <label>
                                        {modality === 'RECURRING'
                                            ? 'Ocorrência'
                                            : 'Parcela'}
                                        <select
                                            value={selectedTarget}
                                            onChange={(e) => {
                                                changed();
                                                setSelectedTarget(
                                                    e.target.value,
                                                );
                                                setFactId('');
                                            }}
                                        >
                                            <option value="">Escolha</option>
                                            {data.targets.map((t) => (
                                                <option
                                                    key={
                                                        t.id ?? t.referenceDate
                                                    }
                                                    value={
                                                        t.referenceDate ??
                                                        t.id ??
                                                        ''
                                                    }
                                                >
                                                    {t.globalPayoff
                                                        ? 'Quitação global · '
                                                        : t.position
                                                          ? `Parcela ${t.position} · `
                                                          : ''}
                                                    {formatDate(
                                                        t.referenceDate ??
                                                            t.dueDate ??
                                                            '',
                                                    )}{' '}
                                                    ·{' '}
                                                    {t.amountInCents === null
                                                        ? 'Valor a informar'
                                                        : formatMoney(
                                                              t.amountInCents,
                                                          )}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                                {operation === 'CHANGE' ? (
                                    <>
                                        <label>
                                            Nova descrição
                                            <Input
                                                name="description"
                                                maxLength={160}
                                                value={description}
                                                onChange={(e) => {
                                                    changed();
                                                    setDescription(
                                                        e.target.value,
                                                    );
                                                }}
                                                required
                                            />
                                        </label>
                                        <label>
                                            Vigência futura
                                            <Input
                                                name="effectiveFrom"
                                                type="date"
                                                value={effectiveFrom}
                                                onChange={(e) => {
                                                    changed();
                                                    setEffectiveFrom(
                                                        e.target.value,
                                                    );
                                                }}
                                                required
                                            />
                                        </label>
                                    </>
                                ) : (
                                    <>
                                        <label>
                                            Data do fato
                                            <Input
                                                name="factDate"
                                                type="date"
                                                max={businessToday()}
                                                value={factDate}
                                                onChange={(e) => {
                                                    changed();
                                                    setFactDate(e.target.value);
                                                }}
                                                required
                                            />
                                        </label>
                                        <label>
                                            Motivo
                                            <Input
                                                name="reason"
                                                maxLength={500}
                                                value={reason}
                                                onChange={(e) => {
                                                    changed();
                                                    setReason(e.target.value);
                                                }}
                                                required
                                            />
                                        </label>
                                    </>
                                )}
                                {operation === 'ADJUST' && (
                                    <label>
                                        Tipo do ajuste
                                        <select
                                            value={direction}
                                            onChange={(e) => {
                                                changed();
                                                setDirection(
                                                    e.target
                                                        .value as typeof direction,
                                                );
                                            }}
                                        >
                                            <option value="DECREASE">
                                                Desconto
                                            </option>
                                            <option value="INCREASE">
                                                Acréscimo
                                            </option>
                                        </select>
                                        <span className={styles.help}>
                                            Informe somente a diferença. O
                                            ajuste não registra pagamento ou
                                            recebimento.
                                        </span>
                                    </label>
                                )}
                                {operation === 'REVERSE' && (
                                    <label>
                                        Fato original
                                        <select
                                            name="originalId"
                                            value={factId}
                                            onChange={(e) => {
                                                changed();
                                                setFactId(e.target.value);
                                            }}
                                            required
                                        >
                                            <option value="">
                                                Escolha o registro
                                            </option>
                                            {facts.map((f) => (
                                                <option key={f.id} value={f.id}>
                                                    {
                                                        financialFactLabels[
                                                            f.kind
                                                        ]
                                                    }{' '}
                                                    · {formatDate(f.factDate)} ·{' '}
                                                    {formatMoney(
                                                        f.amountInCents,
                                                    )}
                                                </option>
                                            ))}
                                        </select>
                                        {facts.length === 0 && (
                                            <span className={styles.help}>
                                                Não há fatos realizados neste
                                                recorte para reverter.
                                            </span>
                                        )}
                                    </label>
                                )}
                                {operation !== 'CANCEL' && (
                                    <label>
                                        {operation === 'CHANGE'
                                            ? 'Novo valor total (R$)'
                                            : operation === 'REVERSE'
                                              ? 'Valor a reverter (R$)'
                                              : 'Valor da diferença (R$)'}
                                        <Input
                                            name="amountInCents"
                                            inputMode="decimal"
                                            value={amount}
                                            onChange={(e) => {
                                                changed();
                                                setAmount(e.target.value);
                                            }}
                                            placeholder="0,00"
                                            required
                                        />
                                    </label>
                                )}
                                {operation === 'CHANGE' &&
                                    ctx.spaceType === 'SHARED' &&
                                    members.map((m) => (
                                        <label key={m.memberId}>
                                            Parte de {m.displayName} (R$)
                                            <Input
                                                inputMode="decimal"
                                                value={shares[m.memberId] ?? ''}
                                                onChange={(e) => {
                                                    changed();
                                                    setShares({
                                                        ...shares,
                                                        [m.memberId]:
                                                            e.target.value,
                                                    });
                                                }}
                                                required
                                            />
                                        </label>
                                    ))}
                                {operation === 'CANCEL' && (
                                    <p>
                                        O cancelamento só é permitido sem
                                        realização. O histórico e os fatos
                                        relacionados serão preservados.
                                    </p>
                                )}
                                {ctx.spaceType === 'SHARED' &&
                                    (operation === 'REVERSE' ||
                                        operation === 'ADJUST') && (
                                        <>
                                            <label>
                                                Acerto para a correção
                                                <select
                                                    value={settlementMode}
                                                    onChange={(event) => {
                                                        changed();
                                                        setSettlementMode(
                                                            event.target
                                                                .value as typeof settlementMode,
                                                        );
                                                    }}
                                                >
                                                    <option value="NONE">
                                                        Sem acerto associado
                                                    </option>
                                                    <option value="DATE">
                                                        Definir data para o
                                                        acerto
                                                    </option>
                                                    {Boolean(
                                                        ctx.openCycles?.length,
                                                    ) && (
                                                        <option value="CYCLE">
                                                            Usar acerto aberto
                                                        </option>
                                                    )}
                                                </select>
                                            </label>
                                            {settlementMode === 'DATE' && (
                                                <label>
                                                    Data do acerto corretivo
                                                    <Input
                                                        type="date"
                                                        min={businessToday()}
                                                        value={settlementDate}
                                                        onChange={(event) => {
                                                            changed();
                                                            setSettlementDate(
                                                                event.target
                                                                    .value,
                                                            );
                                                        }}
                                                        required
                                                    />
                                                </label>
                                            )}
                                            {settlementMode === 'CYCLE' && (
                                                <label>
                                                    Acerto aberto
                                                    <select
                                                        value={settlementCycle}
                                                        onChange={(event) => {
                                                            changed();
                                                            setSettlementCycle(
                                                                event.target
                                                                    .value,
                                                            );
                                                        }}
                                                        required
                                                    >
                                                        <option value="">
                                                            Escolha o ciclo
                                                        </option>
                                                        {ctx.openCycles?.map(
                                                            (cycle) => (
                                                                <option
                                                                    key={
                                                                        cycle.id
                                                                    }
                                                                    value={
                                                                        cycle.id
                                                                    }
                                                                >
                                                                    {formatDate(
                                                                        cycle.targetDate,
                                                                    )}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </label>
                                            )}
                                            <p className={styles.help}>
                                                Se o ciclo de origem estiver
                                                finalizado, os efeitos
                                                corretivos ficam em outro ciclo
                                                aberto.
                                            </p>
                                        </>
                                    )}
                                {validation && <p role="alert">{validation}</p>}
                                <Button
                                    type="submit"
                                    disabled={
                                        origin.isFetching || context.isFetching
                                    }
                                >
                                    Revisar efeito
                                </Button>
                            </fieldset>
                            {review && (
                                <div className={styles.confirmation}>
                                    <FinancialImpact
                                        value={review.value}
                                        members={members}
                                    />
                                    <p>
                                        {operation === 'CHANGE'
                                            ? `Vigência: ${formatDate((review.work.input as ChangeInput).effectiveFrom)}.`
                                            : `Motivo: ${(review.work.input as CorrectionInput).reason}. Data: ${formatDate((review.work.input as CorrectionInput).factDate)}.`}
                                    </p>
                                    <div className={styles.actions}>
                                        <Button
                                            type="button"
                                            disabled={
                                                busy ||
                                                review.value.eligible === false
                                            }
                                            onClick={() =>
                                                run({
                                                    ...review.work,
                                                    phase: 'CONFIRM',
                                                    requiresAcceptance:
                                                        review.value
                                                            .requiresAcceptance,
                                                })
                                            }
                                        >
                                            {review.value.requiresAcceptance
                                                ? 'Enviar para aprovação'
                                                : 'Confirmar operação'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() => setReview(null)}
                                        >
                                            Voltar à edição
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {command.error && (
                                <p role="alert">{command.error}</p>
                            )}
                            {command.isPending && (
                                <p role="status">
                                    {activePhase === 'PREVIEW'
                                        ? 'Conferindo o efeito…'
                                        : 'Registrando operação…'}
                                </p>
                            )}
                            {command.canRetry && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={command.retry}
                                >
                                    Reenviar a mesma tentativa
                                </Button>
                            )}
                        </form>
                    )}
                    {data.adjustments?.length ? (
                        <section className={styles.fields}>
                            <h2>Ajustes registrados</h2>
                            {data.adjustments.map((a) => (
                                <p key={a.id}>
                                    {a.direction === 'INCREASE'
                                        ? 'Acréscimo'
                                        : 'Desconto'}{' '}
                                    de {formatMoney(a.amountInCents)} ·{' '}
                                    {formatDate(a.factDate)} · {a.reason}
                                </p>
                            ))}
                        </section>
                    ) : null}
                </>
            )}
            <FinancialVersionHistory versions={versions} />
            <FinancialReversalHistory
                reversals={reversals}
                cursor={cursor}
                busy={busy}
                onPageChange={setCursor}
            />
        </section>
    );
}
