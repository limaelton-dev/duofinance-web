'use client';
import { FinancialLoading } from './financial-loading';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react';
import { getExternalLiabilityOptions } from '@/lib/api/credit-card-purchase';
import { ApiError } from '@/lib/api/api-error';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useExternalLiabilityCommand } from '../hooks/use-external-liability-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type {
    ExternalLiabilityInput,
    ExternalLiabilityOptions,
} from '../types/credit-card-purchase';
import type { Settlement } from '../types/shared-expense';
import { decimalUnits, formatDate, formatMoney } from '../utils/expense-money';
import { isPastOrCurrentCivilDate } from '../utils/personal-expense-date';
import styles from './financial-records.module.css';

export function ExternalLiabilityForm({
    personId,
    spaceId,
    commitmentId,
    onAccessLost,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
    onAccessLost: () => void;
}) {
    const [cursor, setCursor] = useState<string | null>(null);
    const [pages, setPages] = useState<
        NonNullable<ExternalLiabilityOptions['openCycles']>
    >([]);
    const options = useExpenseQuery(
        personId,
        spaceId,
        [
            'finances',
            personId,
            spaceId,
            'external-liability-options',
            commitmentId,
            cursor,
        ],
        true,
        (signal) =>
            getExternalLiabilityOptions(spaceId, commitmentId, signal, cursor),
    );
    const [amount, setAmount] = useState(''),
        [date, setDate] = useState(''),
        [payer, setPayer] = useState('');
    const [mode, setMode] = useState<Settlement['mode']>('NONE');
    const [targetDate, setTargetDate] = useState(''),
        [cycleId, setCycleId] = useState('');
    const [dirty, setDirty] = useState(false),
        [review, setReview] = useState<ExternalLiabilityInput | null>(null),
        [validation, setValidation] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const form = useRef<HTMLFormElement>(null);
    const command = useExternalLiabilityCommand((result) => {
        setDirty(false);
        setReview(null);
        setAmount('');
        setMessage(
            result.replayed
                ? 'A tentativa original foi recuperada.'
                : 'Compra no cartão registrada.',
        );
        void options.refetch();
    }, onAccessLost);
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    useEffect(() => {
        if (
            options.error instanceof ApiError &&
            options.error.code === 'SPACE_NOT_FOUND'
        )
            onAccessLost();
    }, [options.error, onAccessLost]);
    useEffect(() => {
        if (command.fields.length)
            form.current
                ?.querySelector<HTMLElement>(`[name="${command.fields[0]}"]`)
                ?.focus();
    }, [command.fields]);
    const openCycles = [...pages, ...(options.data?.openCycles ?? [])].filter(
        (c, i, list) => list.findIndex((x) => x.id === c.id) === i,
    );
    function change() {
        setDirty(true);
        setReview(null);
        setValidation(null);
        setMessage(null);
    }
    function reject(field: string, text: string) {
        setValidation(text);
        form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    }
    function prepare() {
        const o = options.data;
        if (!o || !o.canAssume || options.isFetching || options.isError || busy)
            return;
        const cents = decimalUnits(amount),
            factDate = date || o.referenceDate;
        if (cents === null || cents <= 0 || cents > o.remainingAmountInCents)
            return reject(
                'amountInCents',
                'Informe um valor positivo com até duas casas decimais, até o restante a realizar.',
            );
        if (!isPastOrCurrentCivilDate(factDate, o.referenceDate))
            return reject(
                'factDate',
                'Informe uma data válida do compra já ocorrida, até hoje.',
            );
        const base = {
            amountInCents: cents,
            factDate,
            expectedCommitmentVersion: o.expectedCommitmentVersion,
        };
        if (o.spaceType === 'PERSONAL') return setReview(base);
        if (
            !o.members?.some((m) => m.memberId === payer) ||
            o.expectedSpaceVersion === undefined
        )
            return reject('holderMemberId', 'Informe de quem é o cartão.');
        let settlement: Settlement = { mode: 'NONE' };
        if (mode === 'DATE') {
            if (!targetDate || targetDate < o.referenceDate)
                return reject(
                    'targetDate',
                    'Escolha uma data-alvo de hoje em diante.',
                );
            settlement = { mode: 'DATE', targetDate };
        } else if (mode === 'CYCLE') {
            if (!openCycles.some((c) => c.id === cycleId))
                return reject('cycleId', 'Escolha um acerto aberto.');
            settlement = { mode: 'CYCLE', cycleId };
        } else if (mode === 'SUGGESTED') {
            if (!o.suggestedTargetDate || !o.defaultSettlementRule?.version)
                return reject('settlement', 'Atualize a sugestão de acerto.');
            settlement = {
                mode: 'SUGGESTED',
                referenceDate: o.referenceDate,
                expectedRuleVersion: o.defaultSettlementRule.version,
            };
        }
        setReview({
            ...base,
            holderMemberId: payer,
            expectedSpaceVersion: o.expectedSpaceVersion,
            settlement,
        });
    }
    const o = options.data;
    return (
        <section className={styles.stack} aria-label="Nova compra no cartão">
            {message && <p role="status">{message}</p>}
            {(options.isPending || options.isFetching) && (
                <FinancialLoading label="Carregando opções de cartão…" />
            )}
            {options.isError && (
                <div className={styles.feedback}>
                    <p role="alert">
                        Não foi possível carregar as opções de cartão.
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void options.refetch()}
                    >
                        Tentar novamente as opções
                    </Button>
                </div>
            )}
            {o && !o.canAssume && (
                <p>
                    Este espaço não permite registrar a compra no cartão agora.
                </p>
            )}
            {o?.canAssume && !options.isError && (
                <form
                    ref={form}
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        prepare();
                    }}
                >
                    <h3>Registrar compra no cartão</h3>
                    <p>
                        Restante a realizar:{' '}
                        {formatMoney(o.remainingAmountInCents)}.
                    </p>
                    <fieldset disabled={busy || options.isFetching}>
                        <legend>Compra realizada</legend>
                        <label>
                            Valor assumido no cartão (R$)
                            <Input
                                name="amountInCents"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => {
                                    change();
                                    setAmount(e.target.value);
                                }}
                                aria-invalid={
                                    command.fields.includes('amountInCents') ||
                                    undefined
                                }
                            />
                        </label>
                        <label>
                            Data da compra
                            <Input
                                name="factDate"
                                type="date"
                                max={o.referenceDate}
                                value={date || o.referenceDate}
                                onChange={(e) => {
                                    change();
                                    setDate(e.target.value);
                                }}
                                aria-invalid={
                                    command.fields.includes('factDate') ||
                                    undefined
                                }
                            />
                        </label>
                        {o.spaceType === 'SHARED' && (
                            <>
                                <label>
                                    De quem é o cartão?
                                    <select
                                        name="holderMemberId"
                                        value={payer}
                                        onChange={(e) => {
                                            change();
                                            setPayer(e.target.value);
                                        }}
                                    >
                                        <option value="">
                                            Escolha uma pessoa
                                        </option>
                                        {o.members?.map((m) => (
                                            <option
                                                key={m.memberId}
                                                value={m.memberId}
                                            >
                                                {m.displayName}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Acerto para nova pendência
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
                                        {!!openCycles.length && (
                                            <option value="CYCLE">
                                                Usar acerto aberto
                                            </option>
                                        )}
                                        {o.suggestedTargetDate && (
                                            <option value="SUGGESTED">
                                                Sugestão:{' '}
                                                {o.suggestedTargetDate}
                                            </option>
                                        )}
                                    </select>
                                </label>
                                {mode === 'DATE' && (
                                    <label>
                                        Data-alvo do acerto
                                        <Input
                                            name="targetDate"
                                            type="date"
                                            min={o.referenceDate}
                                            value={targetDate}
                                            onChange={(e) => {
                                                change();
                                                setTargetDate(e.target.value);
                                            }}
                                            aria-invalid={
                                                command.fields.includes(
                                                    'targetDate',
                                                ) || undefined
                                            }
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
                                                setCycleId(e.target.value);
                                            }}
                                        >
                                            <option value="">Escolha</option>
                                            {openCycles.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.targetDate}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                                {o.nextCursor && (
                                    <Button
                                        variant="outline"
                                        type="button"
                                        disabled={busy || options.isFetching}
                                        onClick={() => {
                                            setPages(openCycles);
                                            setCursor(o.nextCursor!);
                                        }}
                                    >
                                        Carregar mais acertos
                                    </Button>
                                )}
                                <p>
                                    A escolha se aplica quando esta compra no
                                    cartão criar uma nova pendência. Os acertos
                                    existentes são preservados.
                                </p>
                            </>
                        )}
                    </fieldset>
                    {validation && <p role="alert">{validation}</p>}
                    {command.error && (
                        <div className={styles.feedback}>
                            <p role="alert">{command.error}</p>
                            {!busy && (
                                <Button
                                    variant="outline"
                                    type="button"
                                    onClick={() => {
                                        setReview(null);
                                        void options.refetch();
                                    }}
                                >
                                    Atualizar opções e revisar
                                </Button>
                            )}
                        </div>
                    )}
                    <p>
                        Saiu da conta agora: {formatMoney(0)}. O valor assumido
                        permanece como obrigação externa aberta.
                    </p>
                    <Button type="submit" disabled={busy || options.isFetching}>
                        Revisar compra no cartão
                    </Button>
                    {review && (
                        <div
                            role="group"
                            aria-label="Confirmar compra no cartão"
                        >
                            <h3>Confira a compra no cartão</h3>
                            <dl>
                                <dt>Valor assumido no cartão</dt>
                                <dd>{formatMoney(review.amountInCents)}</dd>
                                <dt>Desembolso imediato</dt>
                                <dd>{formatMoney(0)}</dd>
                                <dt>Restante a realizar após o registro</dt>
                                <dd>
                                    {formatMoney(
                                        o.remainingAmountInCents -
                                            review.amountInCents,
                                    )}
                                </dd>
                            </dl>
                            <p>
                                Confirme a compra no cartão de{' '}
                                {formatMoney(review.amountInCents)} em{' '}
                                {formatDate(review.factDate)}
                                {review.holderMemberId
                                    ? ` por ${o.members?.find((m) => m.memberId === review.holderMemberId)?.displayName}`
                                    : ''}
                                .
                            </p>
                            <Button
                                type="button"
                                disabled={busy || options.isFetching}
                                onClick={() =>
                                    command.submit({
                                        id: commitmentId,
                                        input: review,
                                    })
                                }
                            >
                                Confirmar compra no cartão
                            </Button>
                            <Button
                                variant="outline"
                                type="button"
                                disabled={busy}
                                onClick={() => setReview(null)}
                            >
                                Editar
                            </Button>
                        </div>
                    )}
                    {command.canRetry && (
                        <Button
                            variant="outline"
                            type="button"
                            disabled={command.isPending}
                            onClick={command.retry}
                        >
                            Reenviar a mesma tentativa
                        </Button>
                    )}
                    {command.isPending && (
                        <p role="status">Registrando compra no cartão…</p>
                    )}
                </form>
            )}
        </section>
    );
}
