'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import { getIncomeDetail, getIncomeReceiptOptions } from '@/lib/api/income';
import { incomeQueryKeys } from '../cache/income-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import { useIncomeCommand } from '../hooks/use-income-command';
import type {
    IncomeDetail,
    IncomeReceiptInput,
    IncomeResult,
} from '../types/income';
import type { Settlement } from '../types/shared-expense';
import { formatDate, formatMoney } from '../utils/expense-money';
import { settlementReturnPath } from '../utils/settlement-return';
import styles from './expenses.module.css';

export function IncomeDetailPage({
    spaceId,
    commitmentId,
    returnCycle,
}: {
    spaceId: string;
    commitmentId: string;
    returnCycle?: string;
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
        <Detail
            key={`${auth.data.person.id}:${spaceId}:${space.generation}:${commitmentId}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
            commitmentId={commitmentId}
            returnCycle={returnCycle}
        />
    );
}

function Detail({
    personId,
    spaceId,
    commitmentId,
    returnCycle,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
    returnCycle?: string;
}) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    const detail = useExpenseQuery(
        personId,
        spaceId,
        incomeQueryKeys.detail(personId, spaceId, commitmentId),
        true,
        (signal) => getIncomeDetail(spaceId, commitmentId, signal),
    );
    const receiptOptions = useExpenseQuery(
        personId,
        spaceId,
        incomeQueryKeys.receiptOptions(personId, spaceId, commitmentId),
        !!detail.data && detail.data.status === 'PENDING',
        (signal) => getIncomeReceiptOptions(spaceId, commitmentId, signal),
    );
    const [factDate, setFactDate] = useState(''),
        [recipient, setRecipient] = useState('');
    const [mode, setMode] = useState<Settlement['mode']>('NONE'),
        [targetDate, setTargetDate] = useState(''),
        [cycleId, setCycleId] = useState('');
    const [review, setReview] = useState<IncomeReceiptInput | null>(null),
        [result, setResult] = useState<IncomeResult | null>(null);
    const [dirty, setDirty] = useState(false),
        [validation, setValidation] = useState<string | null>(null);
    const heading = useRef<HTMLHeadingElement>(null),
        mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    function accessLost() {
        const capture = context.capture();
        if (!capture || capture.spaceId !== spaceId) return;
        const generation = context.getSnapshot().generation;
        void context.accessLost(spaceId).then((success) => {
            if (
                success &&
                mounted.current &&
                context.getSnapshot().generation === generation &&
                window.location.pathname ===
                    `/spaces/${spaceId}/incomes/${commitmentId}`
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
    }
    const command = useIncomeCommand((value) => {
        setResult(value);
        setDirty(false);
        void detail.refetch();
    }, accessLost);
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    useEffect(() => {
        if (
            (detail.error instanceof ApiError &&
                detail.error.code === 'SPACE_NOT_FOUND') ||
            (receiptOptions.error instanceof ApiError &&
                receiptOptions.error.code === 'SPACE_NOT_FOUND')
        )
            accessLost();
    });
    useEffect(() => {
        if (result) heading.current?.focus();
    }, [result]);
    function change() {
        setDirty(true);
        setReview(null);
        setValidation(null);
    }
    function prepare() {
        const o = receiptOptions.data;
        if (!o || !o.canReceive || busy) return;
        const date = factDate || o.referenceDate;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > o.referenceDate)
            return setValidation(
                'Informe uma data de recebimento já ocorrida, até hoje.',
            );
        if (o.spaceType === 'PERSONAL')
            return setReview({
                expectedCommitmentVersion: o.expectedCommitmentVersion,
                factDate: date,
            });
        if (
            !o.members?.some((m) => m.memberId === recipient) ||
            o.expectedSpaceVersion === undefined
        )
            return setValidation('Escolha quem recebeu o recurso.');
        const excess =
            o.participationSplit?.calculatedShares.find(
                (s) => s.memberId !== recipient,
            )?.amountInCents ?? 0;
        let settlement: Settlement = { mode: 'NONE' };
        if (excess > 0) {
            if (mode === 'DATE') {
                if (!targetDate || targetDate < o.referenceDate)
                    return setValidation(
                        'Escolha uma data-alvo de hoje em diante.',
                    );
                settlement = { mode: 'DATE', targetDate };
            } else if (mode === 'CYCLE') {
                if (!o.openCycles?.some((c) => c.id === cycleId))
                    return setValidation('Escolha um acerto aberto.');
                settlement = { mode: 'CYCLE', cycleId };
            } else if (mode === 'SUGGESTED') {
                if (!o.suggestedTargetDate || !o.defaultSettlementRule?.version)
                    return setValidation('Atualize a sugestão de acerto.');
                settlement = {
                    mode: 'SUGGESTED',
                    referenceDate: o.referenceDate,
                    expectedRuleVersion: o.defaultSettlementRule.version,
                };
            }
        }
        setReview({
            expectedCommitmentVersion: o.expectedCommitmentVersion,
            expectedSpaceVersion: o.expectedSpaceVersion,
            factDate: date,
            recipientMemberId: recipient,
            settlement,
        });
    }
    const value: IncomeDetail | undefined =
        result ??
        (!detail.isFetching && !detail.isError ? detail.data : undefined);
    return (
        <section className={styles.stack}>
            <h1 ref={heading} tabIndex={-1}>
                Receita
            </h1>
            <Link href={`/spaces/${spaceId}/incomes`}>Voltar às receitas</Link>
            {returnCycle && settlementReturnPath(spaceId, returnCycle) && (
                <Link href={settlementReturnPath(spaceId, returnCycle)!}>
                    Voltar ao acerto
                </Link>
            )}
            {(detail.isPending || detail.isFetching) && !result && (
                <p role="status">Carregando receita…</p>
            )}
            {detail.isError && (
                <div>
                    <p role="alert">Não foi possível consultar a receita.</p>
                    <button type="button" onClick={() => void detail.refetch()}>
                        Tentar novamente
                    </button>
                </div>
            )}
            {value && (
                <>
                    <h2>{value.commitment.description}</h2>
                    <dl>
                        <div>
                            <dt>Valor previsto</dt>
                            <dd>
                                {formatMoney(value.commitment.amountInCents)}
                            </dd>
                        </div>
                        <div>
                            <dt>Data prevista</dt>
                            <dd>
                                <time
                                    dateTime={
                                        value.commitment.expectedReceiptDate
                                    }
                                >
                                    {formatDate(
                                        value.commitment.expectedReceiptDate,
                                    )}
                                </time>
                            </dd>
                        </div>
                        <div>
                            <dt>Recebido</dt>
                            <dd>{formatMoney(value.receivedAmountInCents)}</dd>
                        </div>
                    </dl>
                    <p>
                        {value.status === 'PENDING'
                            ? 'Recebimento pendente.'
                            : 'Receita recebida integralmente.'}
                    </p>
                    {value.commitment.participationSplit && (
                        <>
                            <h3>Participação econômica</h3>
                            <ul>
                                {value.commitment.participationSplit.calculatedShares.map(
                                    (s) => (
                                        <li key={s.memberId}>
                                            {value.members?.find(
                                                (m) =>
                                                    m.memberId === s.memberId,
                                            )?.displayName ?? 'Membro'}
                                            : {formatMoney(s.amountInCents)}
                                        </li>
                                    ),
                                )}
                            </ul>
                            <p>
                                Recebedor previsto:{' '}
                                {value.members?.find(
                                    (m) =>
                                        m.memberId ===
                                        value.commitment
                                            .expectedRecipientMemberId,
                                )?.displayName ?? 'Não definido'}
                                .
                            </p>
                        </>
                    )}
                    {value.receipt && (
                        <>
                            <p>
                                Recebido de fato em{' '}
                                <time dateTime={value.receipt.factDate}>
                                    {formatDate(value.receipt.factDate)}
                                </time>
                                .
                            </p>
                            {value.receipt.recipientMemberId && (
                                <p>
                                    Quem recebeu:{' '}
                                    {value.members?.find(
                                        (m) =>
                                            m.memberId ===
                                            value.receipt?.recipientMemberId,
                                    )?.displayName ?? 'Membro do espaço'}
                                    .
                                </p>
                            )}
                        </>
                    )}
                    {value.obligation && (
                        <>
                            <h3>Repasse de receita</h3>
                            <p>
                                {value.members?.find(
                                    (m) =>
                                        m.memberId ===
                                        value.obligation?.debtorMemberId,
                                )?.displayName ?? 'Quem recebeu'}{' '}
                                deve repassar{' '}
                                {formatMoney(
                                    value.obligation.remainingAmountInCents,
                                )}{' '}
                                a{' '}
                                {value.members?.find(
                                    (m) =>
                                        m.memberId ===
                                        value.obligation?.creditorMemberId,
                                )?.displayName ?? 'outro membro'}
                                .
                            </p>
                            <Link
                                href={`/spaces/${spaceId}/finances/settlements/transfers/new`}
                            >
                                Registrar transferência
                            </Link>
                        </>
                    )}
                    {result?.replayed && (
                        <p>A tentativa original foi recuperada.</p>
                    )}
                    {value.status === 'PENDING' && (
                        <>
                            <h3>Registrar recebimento integral</h3>
                            {receiptOptions.isPending && (
                                <p role="status">
                                    Carregando opções de recebimento…
                                </p>
                            )}
                            {receiptOptions.isError && (
                                <div>
                                    <p role="alert">
                                        Não foi possível carregar as opções.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void receiptOptions.refetch()
                                        }
                                    >
                                        Tentar novamente
                                    </button>
                                </div>
                            )}
                            {receiptOptions.data &&
                                !receiptOptions.data.canReceive && (
                                    <p>
                                        Este espaço não permite registrar o
                                        recebimento agora.
                                    </p>
                                )}
                            {receiptOptions.data?.canReceive && (
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        prepare();
                                    }}
                                >
                                    <p>
                                        Valor integral:{' '}
                                        {formatMoney(
                                            receiptOptions.data.amountInCents,
                                        )}
                                        .
                                    </p>
                                    <label>
                                        Data do recebimento efetivo
                                        <input
                                            name="factDate"
                                            type="date"
                                            max={
                                                receiptOptions.data
                                                    .referenceDate
                                            }
                                            value={
                                                factDate ||
                                                receiptOptions.data
                                                    .referenceDate
                                            }
                                            onChange={(e) => {
                                                change();
                                                setFactDate(e.target.value);
                                            }}
                                        />
                                    </label>
                                    {receiptOptions.data.spaceType ===
                                        'SHARED' && (
                                        <>
                                            <label>
                                                Quem recebeu de fato
                                                <select
                                                    name="recipientMemberId"
                                                    value={recipient}
                                                    onChange={(e) => {
                                                        change();
                                                        setRecipient(
                                                            e.target.value,
                                                        );
                                                    }}
                                                >
                                                    <option value="">
                                                        Escolha
                                                    </option>
                                                    {receiptOptions.data.members?.map(
                                                        (m) => (
                                                            <option
                                                                key={m.memberId}
                                                                value={
                                                                    m.memberId
                                                                }
                                                            >
                                                                {m.displayName}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </label>
                                            <label>
                                                Repasse de receita
                                                <select
                                                    name="settlement"
                                                    value={mode}
                                                    onChange={(e) => {
                                                        change();
                                                        setMode(
                                                            e.target
                                                                .value as Settlement['mode'],
                                                        );
                                                    }}
                                                >
                                                    <option value="NONE">
                                                        Sem acerto associado
                                                    </option>
                                                    <option value="DATE">
                                                        Criar acerto por data
                                                    </option>
                                                    {(receiptOptions.data
                                                        .openCycles?.length ??
                                                        0) > 0 && (
                                                        <option value="CYCLE">
                                                            Usar acerto aberto
                                                        </option>
                                                    )}
                                                    {receiptOptions.data
                                                        .suggestedTargetDate && (
                                                        <option value="SUGGESTED">
                                                            Sugestão:{' '}
                                                            {
                                                                receiptOptions
                                                                    .data
                                                                    .suggestedTargetDate
                                                            }
                                                        </option>
                                                    )}
                                                </select>
                                            </label>
                                            {mode === 'DATE' && (
                                                <label>
                                                    Data-alvo
                                                    <input
                                                        name="targetDate"
                                                        type="date"
                                                        min={
                                                            receiptOptions.data
                                                                .referenceDate
                                                        }
                                                        value={targetDate}
                                                        onChange={(e) => {
                                                            change();
                                                            setTargetDate(
                                                                e.target.value,
                                                            );
                                                        }}
                                                    />
                                                </label>
                                            )}
                                            {mode === 'CYCLE' && (
                                                <label>
                                                    Acerto aberto
                                                    <select
                                                        name="cycleId"
                                                        value={cycleId}
                                                        onChange={(e) => {
                                                            change();
                                                            setCycleId(
                                                                e.target.value,
                                                            );
                                                        }}
                                                    >
                                                        <option value="">
                                                            Escolha
                                                        </option>
                                                        {receiptOptions.data.openCycles?.map(
                                                            (c) => (
                                                                <option
                                                                    key={c.id}
                                                                    value={c.id}
                                                                >
                                                                    {
                                                                        c.targetDate
                                                                    }
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </label>
                                            )}
                                        </>
                                    )}
                                    {validation && (
                                        <p role="alert">{validation}</p>
                                    )}
                                    {command.error && (
                                        <p role="alert">{command.error}</p>
                                    )}
                                    <button type="submit" disabled={busy}>
                                        Revisar recebimento
                                    </button>
                                    {review && (
                                        <div
                                            role="group"
                                            aria-label="Confirmar recebimento"
                                        >
                                            <p>
                                                Confirme o recebimento integral
                                                de{' '}
                                                {formatMoney(
                                                    receiptOptions.data
                                                        .amountInCents,
                                                )}{' '}
                                                em {review.factDate}.
                                            </p>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    command.submit({
                                                        kind: 'RECEIVE',
                                                        id: commitmentId,
                                                        input: review,
                                                    })
                                                }
                                            >
                                                Confirmar recebimento
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => setReview(null)}
                                            >
                                                Editar
                                            </button>
                                        </div>
                                    )}
                                    {command.canRetry && (
                                        <button
                                            type="button"
                                            onClick={command.retry}
                                        >
                                            Reenviar a mesma tentativa
                                        </button>
                                    )}
                                    {command.isPending && (
                                        <p role="status">
                                            Registrando recebimento…
                                        </p>
                                    )}
                                </form>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
}
