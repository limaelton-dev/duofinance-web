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
import { decimalUnits, formatDate, formatMoney } from '../utils/expense-money';
import { settlementReturnPath } from '../utils/settlement-return';
import { isPastOrCurrentCivilDate } from '../utils/personal-expense-date';
import styles from './expenses.module.css';
import { ObligationHistory } from './obligation-history';

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
        !!detail.data && detail.data.remainingAmountInCents > 0,
        (signal) => getIncomeReceiptOptions(spaceId, commitmentId, signal),
    );
    const [amount, setAmount] = useState<string | null>(null);
    const [factDate, setFactDate] = useState(''),
        [recipient, setRecipient] = useState('');
    const [mode, setMode] = useState<Settlement['mode']>('NONE'),
        [targetDate, setTargetDate] = useState(''),
        [cycleId, setCycleId] = useState('');
    const [review, setReview] = useState<IncomeReceiptInput | null>(null),
        [result, setResult] = useState<IncomeResult | null>(null);
    const [dirty, setDirty] = useState(false),
        [validation, setValidation] = useState<string | null>(null);
    const form = useRef<HTMLFormElement>(null),
        heading = useRef<HTMLHeadingElement>(null),
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
        setReview(null);
        setAmount(null);
        void detail.refetch();
        void receiptOptions.refetch();
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
    useEffect(() => {
        if (command.fields.length)
            form.current
                ?.querySelector<HTMLElement>(`[name="${command.fields[0]}"]`)
                ?.focus();
    }, [command.fields]);
    function reject(field: string, message: string) {
        setValidation(message);
        form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    }
    function change() {
        setDirty(true);
        setReview(null);
        setValidation(null);
    }
    function prepare() {
        const o = receiptOptions.data;
        if (
            !o ||
            !o.canReceive ||
            busy ||
            receiptOptions.isFetching ||
            receiptOptions.isError
        )
            return;
        const cents =
            amount === null ? o.remainingAmountInCents : decimalUnits(amount);
        if (cents === null || cents <= 0 || cents > o.remainingAmountInCents)
            return reject(
                'amountInCents',
                'Informe um valor positivo com até duas casas decimais, até o restante a receber.',
            );
        const date = factDate || o.referenceDate;
        if (!isPastOrCurrentCivilDate(date, o.referenceDate))
            return reject(
                'factDate',
                'Informe uma data de recebimento já ocorrida, até hoje.',
            );
        if (o.spaceType === 'PERSONAL')
            return setReview({
                expectedCommitmentVersion: o.expectedCommitmentVersion,
                amountInCents: cents,
                factDate: date,
            });
        if (
            !o.members?.some((m) => m.memberId === recipient) ||
            o.expectedSpaceVersion === undefined
        )
            return setValidation('Escolha quem recebeu o recurso.');
        let settlement: Settlement = { mode: 'NONE' };
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
        setReview({
            expectedCommitmentVersion: o.expectedCommitmentVersion,
            amountInCents: cents,
            expectedSpaceVersion: o.expectedSpaceVersion,
            factDate: date,
            recipientMemberId: recipient,
            settlement,
        });
    }
    const value: IncomeDetail | undefined =
        (!detail.isFetching && !detail.isError ? detail.data : undefined) ??
        result ??
        undefined;
    const firstReceipt = value?.receipts[0];
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
                        <div>
                            <dt>Falta receber</dt>
                            <dd>{formatMoney(value.remainingAmountInCents)}</dd>
                        </div>
                    </dl>
                    <p>
                        {value.status === 'PENDING'
                            ? 'Recebimento pendente.'
                            : value.status === 'PARTIALLY_RECEIVED'
                              ? 'Receita parcialmente recebida.'
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
                    <section aria-label="Histórico de recebimentos">
                        <h3>Recebimentos realizados</h3>
                        <ol>
                            {value.receipts.map((fact) => (
                                <li key={fact.id}>
                                    <p>
                                        {formatMoney(fact.amountInCents)} ·{' '}
                                        <time dateTime={fact.factDate}>
                                            {formatDate(fact.factDate)}
                                        </time>
                                    </p>
                                    <p>
                                        Quem recebeu:{' '}
                                        {fact.recipientMemberId
                                            ? (value.members?.find(
                                                  (m) =>
                                                      m.memberId ===
                                                      fact.recipientMemberId,
                                              )?.displayName ??
                                              'Membro do registro')
                                            : fact.recipientPersonId ===
                                                personId
                                              ? 'Você'
                                              : 'Titular'}
                                        .
                                    </p>
                                    <p>
                                        Registrado por:{' '}
                                        {fact.recordedByPersonId === personId
                                            ? 'Você'
                                            : (value.members?.find(
                                                  (m) =>
                                                      m.personId ===
                                                      fact.recordedByPersonId,
                                              )?.displayName ??
                                              'Pessoa do registro')}
                                        .
                                    </p>
                                </li>
                            ))}
                        </ol>
                    </section>
                    <ObligationHistory
                        spaceId={spaceId}
                        obligations={value.obligations}
                        members={value.members}
                    />
                    {firstReceipt && (
                        <>
                            <p>
                                Recebido de fato em{' '}
                                <time dateTime={firstReceipt.factDate}>
                                    {formatDate(firstReceipt.factDate)}
                                </time>
                                .
                            </p>
                            {firstReceipt.recipientMemberId && (
                                <p>
                                    Quem recebeu:{' '}
                                    {value.members?.find(
                                        (m) =>
                                            m.memberId ===
                                            firstReceipt?.recipientMemberId,
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
                    {value.remainingAmountInCents > 0 && (
                        <>
                            <h3>Registrar recebimento</h3>
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
                                    ref={form}
                                    noValidate
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        prepare();
                                    }}
                                >
                                    <fieldset
                                        disabled={
                                            busy || receiptOptions.isFetching
                                        }
                                    >
                                        <legend>Recebimento efetivo</legend>
                                        <p>
                                            Falta receber:{' '}
                                            {formatMoney(
                                                receiptOptions.data
                                                    .remainingAmountInCents,
                                            )}
                                            .
                                        </p>
                                        <label>
                                            Valor recebido agora (R$)
                                            <input
                                                name="amountInCents"
                                                inputMode="decimal"
                                                value={
                                                    amount ??
                                                    formatMoney(
                                                        receiptOptions.data
                                                            .remainingAmountInCents,
                                                    ).slice(3)
                                                }
                                                onChange={(e) => {
                                                    change();
                                                    setAmount(e.target.value);
                                                }}
                                            />
                                        </label>
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
                                                                    key={
                                                                        m.memberId
                                                                    }
                                                                    value={
                                                                        m.memberId
                                                                    }
                                                                >
                                                                    {
                                                                        m.displayName
                                                                    }
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
                                                            Criar acerto por
                                                            data
                                                        </option>
                                                        {(receiptOptions.data
                                                            .openCycles
                                                            ?.length ?? 0) >
                                                            0 && (
                                                            <option value="CYCLE">
                                                                Usar acerto
                                                                aberto
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
                                                                receiptOptions
                                                                    .data
                                                                    .referenceDate
                                                            }
                                                            value={targetDate}
                                                            onChange={(e) => {
                                                                change();
                                                                setTargetDate(
                                                                    e.target
                                                                        .value,
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
                                                                    e.target
                                                                        .value,
                                                                );
                                                            }}
                                                        >
                                                            <option value="">
                                                                Escolha
                                                            </option>
                                                            {receiptOptions.data.openCycles?.map(
                                                                (c) => (
                                                                    <option
                                                                        key={
                                                                            c.id
                                                                        }
                                                                        value={
                                                                            c.id
                                                                        }
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
                                    </fieldset>
                                    {validation && (
                                        <p role="alert">{validation}</p>
                                    )}
                                    {command.error && (
                                        <div>
                                            <p role="alert">{command.error}</p>
                                            {!busy && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setReview(null);
                                                        void detail.refetch();
                                                        void receiptOptions.refetch();
                                                    }}
                                                >
                                                    Atualizar opções e revisar
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={
                                            busy || receiptOptions.isFetching
                                        }
                                    >
                                        Revisar recebimento
                                    </button>
                                    {review && (
                                        <div
                                            role="group"
                                            aria-label="Confirmar recebimento"
                                        >
                                            <p>
                                                Confirme o recebimento de{' '}
                                                {formatMoney(
                                                    review.amountInCents!,
                                                )}{' '}
                                                em {review.factDate}.
                                            </p>
                                            <button
                                                type="button"
                                                disabled={
                                                    busy ||
                                                    receiptOptions.isFetching
                                                }
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
                                                disabled={
                                                    busy ||
                                                    receiptOptions.isFetching
                                                }
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
