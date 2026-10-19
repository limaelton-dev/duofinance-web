'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getRecurringOptions } from '@/lib/api/recurring-commitment';
import { getInstallmentOptions } from '@/lib/api/installment-commitment';
import { apiRequest } from '@/lib/api/api-client';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useFinancialCommand } from '../hooks/use-financial-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type { Settlement } from '../types/shared-expense';
import type { OccurrenceOptions } from '../types/recurring-commitment';
import type { InstallmentOptions } from '../types/installment-commitment';
import { businessToday, formatDate, formatMoney } from '../utils/expense-money';
import {
    planningKey,
    QueryFeedback,
    CommandFeedback,
    SettlementFields,
    positiveAmount,
} from './planning-shared';
import styles from './expenses.module.css';
import layout from './planning.module.css';

type Target =
    | { type: 'RECURRING'; referenceDate: string }
    | { type: 'INSTALLMENT'; installmentId: string };
type Action =
    | 'VALUE'
    | 'DISBURSEMENT'
    | 'RECEIPT'
    | 'EXTERNAL_LIABILITY'
    | 'SETTLE'
    | 'CANCEL';
type Review = {
    path: `/${string}`;
    body: Record<string, unknown>;
    method: 'POST' | 'PUT';
    action: Action;
    amount: number | null;
    date: string;
    member: string;
};
export function PlannedOccurrenceActions({
    personId,
    spaceId,
    commitmentId,
    target,
    onSaved,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
    target: Target;
    onSaved: () => void;
}) {
    const [cursor, setCursor] = useState<string | null>(null);
    const identifier =
        target.type === 'RECURRING'
            ? target.referenceDate
            : target.installmentId;
    const query = useExpenseQuery<OccurrenceOptions | InstallmentOptions>(
        personId,
        spaceId,
        planningKey(
            personId,
            spaceId,
            'occurrence-options',
            commitmentId,
            identifier,
            cursor,
        ),
        true,
        (signal) =>
            target.type === 'RECURRING'
                ? getRecurringOptions(
                      spaceId,
                      commitmentId,
                      target.referenceDate,
                      cursor,
                      signal,
                  )
                : getInstallmentOptions(
                      spaceId,
                      commitmentId,
                      target.installmentId,
                      cursor,
                      signal,
                  ),
    );
    const [action, setAction] = useState<Action>('DISBURSEMENT'),
        [amount, setAmount] = useState(''),
        [date, setDate] = useState(businessToday),
        [method, setMethod] = useState<'PIX' | 'DEBIT' | 'CASH'>('PIX'),
        [member, setMember] = useState(''),
        [settlement, setSettlement] = useState<Settlement>({ mode: 'NONE' }),
        [liability, setLiability] = useState('');
    const [review, setReview] = useState<Review | null>(null),
        [error, setError] = useState<string | null>(null),
        [message, setMessage] = useState<string | null>(null),
        [dirty, setDirty] = useState(false);
    const form = useRef<HTMLFormElement>(null);
    const command = useFinancialCommand<Review, unknown>({
        execute: (_id, input, token, key, signal) =>
            apiRequest(input.path, {
                method: input.method,
                body: input.body,
                csrfToken: token,
                idempotencyKey: key,
                signal,
            }),
        onSuccess: () => {
            setMessage('Registro confirmado. O histórico foi preservado.');
            setReview(null);
            setDirty(false);
            setAmount('');
            void query.refetch();
            onSaved();
        },
    });
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    const o = !query.isError ? query.data : undefined,
        occurrence = o
            ? 'occurrence' in o
                ? o.occurrence
                : o.installment
            : undefined;
    const income =
        o && 'kind' in o.commitment && o.commitment.kind === 'INCOME';
    const variable =
        o &&
        'valueMode' in o.commitment &&
        o.commitment.valueMode === 'VARIABLE';
    const valuePending = !!(
        occurrence &&
        'valuePending' in occurrence &&
        occurrence.valuePending
    );
    const effectiveAction =
        occurrence &&
        ['FULFILLED', 'CANCELLED', 'PAID_OFF'].includes(occurrence.status)
            ? 'SETTLE'
            : income && action === 'DISBURSEMENT'
              ? 'RECEIPT'
              : valuePending && action !== 'CANCEL'
                ? 'VALUE'
                : action;
    const facts = occurrence?.facts ?? [],
        validFacts =
            occurrence && 'validFacts' in occurrence
                ? (occurrence.validFacts ?? facts)
                : facts;
    const liabilities = validFacts.filter(
        (fact) => fact.kind === 'EXTERNAL_LIABILITY',
    );
    function change() {
        setReview(null);
        setError(null);
        setMessage(null);
        setDirty(true);
    }
    function prepare() {
        if (
            !o ||
            !occurrence ||
            query.isFetching ||
            query.isError ||
            busy ||
            !form.current?.reportValidity()
        )
            return;
        try {
            const selected = effectiveAction,
                cents = selected === 'CANCEL' ? null : positiveAmount(amount);
            if (
                !['VALUE', 'CANCEL'].includes(selected) &&
                date > businessToday()
            )
                throw new Error('A data do fato deve ser de hoje ou anterior.');
            if (
                ['DISBURSEMENT', 'RECEIPT', 'EXTERNAL_LIABILITY'].includes(
                    selected,
                ) &&
                cents! > (occurrence.remainingAmountInCents ?? 0)
            )
                throw new Error(
                    'O valor não pode ultrapassar o restante da ocorrência.',
                );
            const base = `/spaces/${spaceId}/${target.type === 'RECURRING' ? 'recurring-commitments' : 'installment-commitments'}/${commitmentId}/${target.type === 'RECURRING' ? `occurrences/${identifier}` : `installments/${identifier}`}`;
            const versions = {
                expectedCommitmentVersion: o.commitment.version,
                [target.type === 'RECURRING'
                    ? 'expectedOccurrenceVersion'
                    : 'expectedInstallmentVersion']: occurrence.stateVersion,
                ...(o.commitment.scope === 'SHARED'
                    ? { expectedSpaceVersion: o.expectedSpaceVersion }
                    : {}),
            };
            let body: Record<string, unknown> = { ...versions },
                suffix = '';
            if (selected === 'VALUE') {
                body.amountInCents = cents;
                suffix = '/value';
            } else if (selected === 'CANCEL') suffix = '/cancellation';
            else {
                body = { ...body, amountInCents: cents, factDate: date };
                if (selected === 'SETTLE') {
                    if (!liabilities.some((item) => item.id === liability))
                        throw new Error(
                            'Escolha a obrigação externa a liquidar.',
                        );
                    if (target.type === 'RECURRING')
                        delete body.expectedCommitmentVersion;
                    suffix = `/external-liabilities/${liability}/settlements`;
                } else {
                    if (selected === 'DISBURSEMENT') body.method = method;
                    if (o.commitment.scope === 'SHARED') {
                        if (
                            !o.members?.some((item) => item.memberId === member)
                        )
                            throw new Error('Escolha quem realizou o fato.');
                        body[
                            selected === 'RECEIPT'
                                ? 'recipientMemberId'
                                : selected === 'EXTERNAL_LIABILITY'
                                  ? 'holderMemberId'
                                  : 'payerMemberId'
                        ] = member;
                        body.settlement = settlement;
                    }
                    suffix =
                        selected === 'RECEIPT'
                            ? '/receipts'
                            : selected === 'EXTERNAL_LIABILITY'
                              ? '/external-liabilities'
                              : '/disbursements';
                }
            }
            setReview({
                path: `${base}${suffix}` as `/${string}`,
                body,
                method: selected === 'VALUE' ? 'PUT' : 'POST',
                action: selected,
                amount: cents,
                date,
                member,
            });
        } catch (failure) {
            setError((failure as Error).message);
        }
    }
    const closed =
        occurrence &&
        ['FULFILLED', 'CANCELLED', 'PAID_OFF'].includes(occurrence.status);
    return (
        <section className={layout.section}>
            <h3>
                Registrar nesta{' '}
                {target.type === 'RECURRING' ? 'ocorrência' : 'parcela'}
            </h3>
            <QueryFeedback query={query} />
            {message && <p role="status">{message}</p>}
            {o && occurrence && (
                <>
                    <Link
                        href={`/spaces/${spaceId}/finances/commitments/${commitmentId}?${target.type === 'RECURRING' ? `modality=RECURRING&referenceDate=${identifier}` : `modality=INSTALLMENT&installmentId=${identifier}&targetVersion=${occurrence.stateVersion}`}`}
                    >
                        Histórico e correções desta{' '}
                        {target.type === 'RECURRING' ? 'ocorrência' : 'parcela'}
                    </Link>
                    {!closed || liabilities.length > 0 ? (
                        <form
                            className={styles.fields}
                            ref={form}
                            onChange={change}
                            onSubmit={(event) => {
                                event.preventDefault();
                                prepare();
                            }}
                        >
                            <fieldset disabled={busy || query.isFetching}>
                                <legend>Qual fato aconteceu?</legend>
                                <label>
                                    Ação
                                    <select
                                        value={effectiveAction}
                                        onChange={(event) =>
                                            setAction(
                                                event.target.value as Action,
                                            )
                                        }
                                    >
                                        {!closed && !valuePending && (
                                            <>
                                                {income ? (
                                                    <option value="RECEIPT">
                                                        Registrar recebimento
                                                    </option>
                                                ) : (
                                                    <>
                                                        <option value="DISBURSEMENT">
                                                            Registrar pagamento
                                                            direto
                                                        </option>
                                                        <option value="EXTERNAL_LIABILITY">
                                                            Assumir no cartão
                                                        </option>
                                                    </>
                                                )}
                                            </>
                                        )}
                                        {variable &&
                                            !closed &&
                                            !facts.length && (
                                                <option value="VALUE">
                                                    Informar valor da ocorrência
                                                </option>
                                            )}
                                        {liabilities.length > 0 && (
                                            <option value="SETTLE">
                                                Liquidar obrigação do cartão
                                            </option>
                                        )}
                                        {target.type === 'RECURRING' &&
                                            !closed &&
                                            !facts.length && (
                                                <option value="CANCEL">
                                                    Cancelar somente esta
                                                    ocorrência
                                                </option>
                                            )}
                                    </select>
                                </label>
                                {effectiveAction !== 'CANCEL' && (
                                    <label>
                                        {effectiveAction === 'VALUE'
                                            ? 'Valor real da ocorrência (R$)'
                                            : 'Valor realizado (R$)'}
                                        <Input
                                            inputMode="decimal"
                                            name="amountInCents"
                                            required
                                            value={amount}
                                            onChange={(event) =>
                                                setAmount(event.target.value)
                                            }
                                        />
                                    </label>
                                )}
                                {!['VALUE', 'CANCEL'].includes(
                                    effectiveAction,
                                ) && (
                                    <>
                                        <label>
                                            Data do fato
                                            <Input
                                                type="date"
                                                name="factDate"
                                                max={businessToday()}
                                                required
                                                value={date}
                                                onChange={(event) =>
                                                    setDate(event.target.value)
                                                }
                                            />
                                        </label>
                                        {effectiveAction === 'DISBURSEMENT' && (
                                            <label>
                                                Meio de pagamento
                                                <select
                                                    value={method}
                                                    onChange={(event) =>
                                                        setMethod(
                                                            event.target
                                                                .value as typeof method,
                                                        )
                                                    }
                                                >
                                                    <option value="PIX">
                                                        Pix
                                                    </option>
                                                    <option value="DEBIT">
                                                        Débito
                                                    </option>
                                                    <option value="CASH">
                                                        Dinheiro
                                                    </option>
                                                </select>
                                            </label>
                                        )}
                                        {effectiveAction === 'SETTLE' ? (
                                            <label>
                                                Obrigação externa
                                                <select
                                                    required
                                                    value={liability}
                                                    onChange={(event) =>
                                                        setLiability(
                                                            event.target.value,
                                                        )
                                                    }
                                                >
                                                    <option value="">
                                                        Escolha o registro
                                                    </option>
                                                    {liabilities.map((item) => (
                                                        <option
                                                            key={item.id}
                                                            value={item.id}
                                                        >
                                                            {formatDate(
                                                                item.factDate,
                                                            )}{' '}
                                                            ·{' '}
                                                            {formatMoney(
                                                                item.amountInCents,
                                                            )}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        ) : (
                                            o.commitment.scope === 'SHARED' && (
                                                <>
                                                    <label>
                                                        {effectiveAction ===
                                                        'RECEIPT'
                                                            ? 'Quem recebeu'
                                                            : effectiveAction ===
                                                                'EXTERNAL_LIABILITY'
                                                              ? 'Titular do cartão'
                                                              : 'Quem pagou'}
                                                        <select
                                                            required
                                                            value={member}
                                                            onChange={(event) =>
                                                                setMember(
                                                                    event.target
                                                                        .value,
                                                                )
                                                            }
                                                        >
                                                            <option value="">
                                                                Escolha a pessoa
                                                            </option>
                                                            {o.members?.map(
                                                                (item) => (
                                                                    <option
                                                                        key={
                                                                            item.memberId
                                                                        }
                                                                        value={
                                                                            item.memberId
                                                                        }
                                                                    >
                                                                        {
                                                                            item.displayName
                                                                        }
                                                                    </option>
                                                                ),
                                                            )}
                                                        </select>
                                                    </label>
                                                    <SettlementFields
                                                        value={settlement}
                                                        onChange={(value) => {
                                                            change();
                                                            setSettlement(
                                                                value,
                                                            );
                                                        }}
                                                        options={o}
                                                    />
                                                    {o.nextCursor && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => {
                                                                change();
                                                                setCursor(
                                                                    o.nextCursor,
                                                                );
                                                            }}
                                                        >
                                                            Mais acertos abertos
                                                        </Button>
                                                    )}
                                                </>
                                            )
                                        )}
                                    </>
                                )}
                                {effectiveAction === 'CANCEL' && (
                                    <p>
                                        Apenas esta ocorrência será cancelada. A
                                        recorrência continua ativa e seu
                                        histórico permanece consultável.
                                    </p>
                                )}
                            </fieldset>
                            {error && <p role="alert">{error}</p>}
                            <CommandFeedback command={command} />
                            {!review && (
                                <Button
                                    type="submit"
                                    disabled={busy || query.isFetching}
                                >
                                    Revisar registro
                                </Button>
                            )}
                            {review && (
                                <div
                                    className={styles.summary}
                                    aria-label="Confirmar realização"
                                >
                                    <h3>Confira o efeito</h3>
                                    <p>
                                        {review.action === 'VALUE'
                                            ? 'Valor informado, sem pagamento ou recebimento'
                                            : review.action === 'CANCEL'
                                              ? 'Cancelar somente esta ocorrência'
                                              : review.action ===
                                                  'EXTERNAL_LIABILITY'
                                                ? 'Obrigação no cartão, sem desembolso imediato'
                                                : review.action === 'SETTLE'
                                                  ? 'Liquidação da obrigação externa selecionada'
                                                  : review.action === 'RECEIPT'
                                                    ? 'Recebimento real'
                                                    : 'Pagamento direto'}
                                        {review.amount !== null
                                            ? `: ${formatMoney(review.amount)}`
                                            : ''}
                                        .
                                    </p>
                                    {!['VALUE', 'CANCEL'].includes(
                                        review.action,
                                    ) && (
                                        <p>
                                            Data: {formatDate(review.date)}
                                            {review.member
                                                ? ` · ${o.members?.find((item) => item.memberId === review.member)?.displayName}`
                                                : ''}
                                            .
                                        </p>
                                    )}
                                    <div className={styles.actions}>
                                        <Button
                                            type="button"
                                            disabled={busy || query.isFetching}
                                            onClick={() =>
                                                command.submit(review)
                                            }
                                        >
                                            Confirmar registro
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() => setReview(null)}
                                        >
                                            Editar
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </form>
                    ) : (
                        <p>
                            Esta ocorrência já está{' '}
                            {occurrence.status === 'CANCELLED'
                                ? 'cancelada'
                                : 'resolvida'}
                            . Consulte os fatos no histórico.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}
