'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getIncomeOptions } from '@/lib/api/income';
import {
    getAnticipationOptions,
    getResolutionOptions,
    installmentRequest,
} from '@/lib/api/installment-commitment';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useFinancialCommand } from '../hooks/use-financial-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type { Settlement } from '../types/shared-expense';
import type {
    AnticipationOptions,
    AnticipationPreview,
    ResolutionOptions,
    PayoffPreview,
    InstallmentDetail,
    InstallmentVersions,
} from '../types/installment-commitment';
import { businessToday, formatDate, formatMoney } from '../utils/expense-money';
import {
    planningKey,
    QueryFeedback,
    CommandFeedback,
    SettlementFields,
    positiveAmount,
    signedMoney,
    usePlanningPreview,
    EconomicShares,
} from './planning-shared';
import styles from './expenses.module.css';
import layout from './planning.module.css';

type Mode = 'ANTICIPATE' | 'PAYOFF' | 'CANCEL';
type Draft = { mode: Mode; body: Record<string, unknown> };
export function InstallmentResolutionForm({
    spaceId,
    personId,
    commitmentId,
    shared,
    mode,
    onSaved,
}: {
    spaceId: string;
    personId: string;
    commitmentId: string;
    shared: boolean;
    mode: Mode;
    onSaved: (message: string) => void;
}) {
    const [cursor, setCursor] = useState<string | null>(null),
        [selectionMode, setSelectionMode] = useState<'IDS' | 'FROM_END'>('IDS'),
        [quantity, setQuantity] = useState('1');
    const options = useExpenseQuery<AnticipationOptions | ResolutionOptions>(
        personId,
        spaceId,
        planningKey(
            personId,
            spaceId,
            'installment-resolution',
            mode,
            commitmentId,
            cursor,
        ),
        true,
        (signal) =>
            mode === 'ANTICIPATE'
                ? getAnticipationOptions(spaceId, commitmentId, cursor, signal)
                : getResolutionOptions(spaceId, commitmentId, cursor, signal),
    );
    const members = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'installment-payment-members'),
        true,
        (signal) => getIncomeOptions(spaceId, signal),
    );
    const [selected, setSelected] = useState<
        Record<
            string,
            {
                version: number;
                position: number;
                date: string;
                remaining: number;
            }
        >
    >({});
    const [amounts, setAmounts] = useState<Record<string, string>>({}),
        [amount, setAmount] = useState(''),
        [date, setDate] = useState(businessToday),
        [payer, setPayer] = useState(''),
        [method, setMethod] = useState<'PIX' | 'DEBIT' | 'CASH'>('PIX'),
        [settlement, setSettlement] = useState<Settlement>({ mode: 'NONE' }),
        [reason, setReason] = useState('');
    const [draft, setDraft] = useState<Draft | null>(null),
        [error, setError] = useState<string | null>(null),
        [dirty, setDirty] = useState(false);
    const form = useRef<HTMLFormElement>(null);
    const preview = usePlanningPreview<
        Draft,
        AnticipationPreview | PayoffPreview
    >(spaceId, (input, token, signal) =>
        installmentRequest(
            spaceId,
            `/${commitmentId}/${input.mode === 'ANTICIPATE' ? 'anticipation-preview' : 'payoff-preview'}`,
            input.body,
            token,
            undefined,
            signal,
        ),
    );
    const [resolved, setResolved] = useState<AnticipationPreview | null>(null);
    const resolve = usePlanningPreview<
        Record<string, unknown>,
        AnticipationPreview
    >(spaceId, (input, token, signal) =>
        installmentRequest(
            spaceId,
            `/${commitmentId}/anticipation-preview`,
            input,
            token,
            undefined,
            signal,
        ),
    );
    const command = useFinancialCommand<Draft, InstallmentDetail>({
        execute: (id, input, token, key, signal) =>
            installmentRequest(
                id,
                `/${commitmentId}/${input.mode === 'ANTICIPATE' ? 'anticipations' : input.mode === 'PAYOFF' ? 'payoffs' : 'future-installment-cancellations'}`,
                input.body,
                token,
                key,
                signal,
            ),
        onSuccess: () => {
            setDirty(false);
            onSaved(
                mode === 'CANCEL'
                    ? 'Parcelas futuras canceladas. Os fatos anteriores foram preservados.'
                    : mode === 'PAYOFF'
                      ? 'Quitação global registrada. As parcelas realizadas continuam no histórico.'
                      : 'Antecipação registrada nas parcelas selecionadas.',
            );
        },
    });
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    function change(clearResolved = false) {
        setDirty(true);
        setDraft(null);
        setError(null);
        preview.reset();
        if (clearResolved) {
            resolve.reset();
            setResolved(null);
            setAmounts({});
        }
    }
    function paymentBody() {
        const o = options.data;
        if (!o) throw new Error('Atualize as opções do plano.');
        if (!date || date > businessToday())
            throw new Error('Informe a data real, de hoje ou anterior.');
        if (
            shared &&
            (!members.data?.members?.some(
                (member) => member.memberId === payer,
            ) ||
                !o.expectedSpaceVersion)
        )
            throw new Error('Escolha quem pagou e atualize os participantes.');
        return {
            expectedCommitmentVersion: o.expectedCommitmentVersion,
            factDate: date,
            method,
            ...(shared
                ? {
                      expectedSpaceVersion: o.expectedSpaceVersion,
                      payerMemberId: payer,
                      settlement,
                  }
                : {}),
        };
    }
    function selectedVersions(): InstallmentVersions {
        return Object.entries(selected).map(([installmentId, item]) => ({
            installmentId,
            expectedInstallmentVersion: item.version,
        }));
    }
    async function resolveSelection() {
        if (
            busy ||
            options.isError ||
            options.isFetching ||
            !form.current?.reportValidity()
        )
            return;
        try {
            const selection =
                selectionMode === 'IDS'
                    ? { mode: 'IDS', installmentIds: Object.keys(selected) }
                    : { mode: 'FROM_END', quantity: Number(quantity) };
            if (selectionMode === 'IDS' && !Object.keys(selected).length)
                throw new Error('Escolha ao menos uma parcela futura.');
            if (
                selectionMode === 'FROM_END' &&
                (!Number.isInteger(Number(quantity)) || Number(quantity) < 1)
            )
                throw new Error('Informe quantas parcelas do final antecipar.');
            await resolve.preview({ ...paymentBody(), selection });
        } catch (failure) {
            setError((failure as Error).message);
        }
    }
    function prepare() {
        if (
            busy ||
            options.isError ||
            options.isFetching ||
            members.isError ||
            members.isFetching ||
            !form.current?.reportValidity()
        )
            return;
        try {
            let body: Record<string, unknown>;
            if (mode === 'CANCEL') {
                const o = options.data;
                const items = selectedVersions();
                if (!o || !items.length || !reason.trim())
                    throw new Error(
                        'Selecione as parcelas futuras e informe o motivo.',
                    );
                if (!date || date > businessToday())
                    throw new Error(
                        'Informe a data real, de hoje ou anterior.',
                    );
                body = {
                    expectedCommitmentVersion: o.expectedCommitmentVersion,
                    ...(shared
                        ? { expectedSpaceVersion: o.expectedSpaceVersion }
                        : {}),
                    installments: items,
                    reason: reason.trim(),
                    factDate: date,
                };
            } else if (mode === 'PAYOFF')
                body = {
                    ...paymentBody(),
                    paidAmountInCents: positiveAmount(amount),
                };
            else {
                const selectedPreview = resolved ?? resolve.data;
                if (!selectedPreview)
                    throw new Error(
                        'Consulte as parcelas selecionadas primeiro.',
                    );
                const selection =
                    selectionMode === 'IDS'
                        ? {
                              mode: 'IDS',
                              installmentIds: selectedPreview.items.map(
                                  (item) => item.installmentId,
                              ),
                          }
                        : { mode: 'FROM_END', quantity: Number(quantity) };
                body = {
                    ...paymentBody(),
                    selection,
                    values: selectedPreview.items.map((item) => ({
                        installmentId: item.installmentId,
                        expectedInstallmentVersion:
                            item.expectedInstallmentVersion,
                        paidAmountInCents: positiveAmount(
                            amounts[item.installmentId] ?? '',
                        ),
                    })),
                };
            }
            const input = { mode, body };
            setDraft(input);
            if (mode !== 'CANCEL') void preview.preview(input);
        } catch (failure) {
            setError((failure as Error).message);
        }
    }
    const selectionPreview = resolved ?? resolve.data;
    const title =
        mode === 'ANTICIPATE'
            ? 'Antecipar parcelas'
            : mode === 'PAYOFF'
              ? 'Quitar todo o restante'
              : 'Cancelar parcelas futuras';
    function confirm() {
        if (!draft) return;
        if (mode === 'PAYOFF') {
            const impact = preview.data as PayoffPreview;
            command.submit({
                ...draft,
                body: {
                    ...draft.body,
                    installments: impact.items.map((item) => ({
                        installmentId: item.installmentId,
                        expectedInstallmentVersion:
                            item.expectedInstallmentVersion,
                    })),
                    expectedCommitmentVersion: impact.expectedCommitmentVersion,
                    ...(shared
                        ? { expectedSpaceVersion: impact.expectedSpaceVersion }
                        : {}),
                },
            });
        } else command.submit(draft);
    }
    return (
        <section className={layout.section}>
            <h2>{title}</h2>
            <p className={styles.help}>
                {mode === 'CANCEL'
                    ? 'Use quando a obrigação externa deixou de existir. Pagamentos já registrados e demais fatos permanecem consultáveis.'
                    : mode === 'PAYOFF'
                      ? 'Informe o valor real global negociado. O pagamento será registrado uma única vez, sem ratear descontos entre parcelas.'
                      : 'Escolha parcelas futuras abertas e informe o valor real de cada uma. Nenhum desconto é calculado automaticamente.'}
            </p>
            <QueryFeedback query={options} />
            <QueryFeedback query={members} />
            {options.data &&
                !options.isError &&
                members.data &&
                !members.isError && (
                    <form
                        ref={form}
                        className={styles.fields}
                        onSubmit={(event) => {
                            event.preventDefault();
                            prepare();
                        }}
                    >
                        <fieldset
                            disabled={
                                busy ||
                                preview.pending ||
                                resolve.pending ||
                                options.isFetching ||
                                members.isFetching
                            }
                        >
                            <legend>
                                {mode === 'PAYOFF'
                                    ? 'Valor global e pagamento'
                                    : 'Seleção de parcelas'}
                            </legend>
                            {mode === 'ANTICIPATE' && (
                                <label>
                                    Selecionar parcelas
                                    <select
                                        value={selectionMode}
                                        onChange={(event) => {
                                            change(true);
                                            setSelected({});
                                            setSelectionMode(
                                                event.target
                                                    .value as typeof selectionMode,
                                            );
                                        }}
                                    >
                                        <option value="IDS">
                                            Escolher uma a uma
                                        </option>
                                        <option value="FROM_END">
                                            Das últimas para as primeiras
                                        </option>
                                    </select>
                                </label>
                            )}
                            {mode === 'ANTICIPATE' &&
                                selectionMode === 'FROM_END' && (
                                    <label>
                                        Quantidade a partir do final
                                        <Input
                                            type="number"
                                            required
                                            min={1}
                                            max={1200}
                                            value={quantity}
                                            onChange={(event) => {
                                                change(true);
                                                setQuantity(event.target.value);
                                            }}
                                        />
                                    </label>
                                )}
                            {mode !== 'PAYOFF' &&
                                (mode === 'CANCEL' ||
                                    selectionMode === 'IDS') && (
                                    <>
                                        <ul className={layout.list}>
                                            {options.data.items.map((item) => {
                                                const anticipation =
                                                        'selectionEligible' in
                                                        item,
                                                    id = anticipation
                                                        ? item.id
                                                        : item.installmentId,
                                                    eligible = anticipation
                                                        ? item.selectionEligible
                                                        : item.cancellationEligible,
                                                    version = anticipation
                                                        ? item.stateVersion
                                                        : item.expectedInstallmentVersion,
                                                    remaining = anticipation
                                                        ? item.remainingAmountInCents
                                                        : item.expectedRemainingAmountInCents;
                                                return (
                                                    <li
                                                        key={id}
                                                        className={layout.row}
                                                    >
                                                        <label
                                                            className={
                                                                layout.check
                                                            }
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                disabled={
                                                                    !eligible
                                                                }
                                                                checked={
                                                                    !!selected[
                                                                        id
                                                                    ]
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) => {
                                                                    change(
                                                                        true,
                                                                    );
                                                                    setSelected(
                                                                        (
                                                                            previous,
                                                                        ) => {
                                                                            const next =
                                                                                {
                                                                                    ...previous,
                                                                                };
                                                                            if (
                                                                                event
                                                                                    .target
                                                                                    .checked
                                                                            )
                                                                                next[
                                                                                    id
                                                                                ] =
                                                                                    {
                                                                                        version,
                                                                                        remaining,
                                                                                        position:
                                                                                            item.position,
                                                                                        date: item.dueDate,
                                                                                    };
                                                                            else
                                                                                delete next[
                                                                                    id
                                                                                ];
                                                                            return next;
                                                                        },
                                                                    );
                                                                }}
                                                            />
                                                            Parcela{' '}
                                                            {item.position} ·{' '}
                                                            {formatDate(
                                                                item.dueDate,
                                                            )}{' '}
                                                            ·{' '}
                                                            {formatMoney(
                                                                remaining,
                                                            )}
                                                        </label>
                                                        {!eligible && (
                                                            <p
                                                                className={
                                                                    styles.help
                                                                }
                                                            >
                                                                {item.blockingReason ===
                                                                'EXTERNAL_LIABILITY_EXISTS'
                                                                    ? 'Há obrigação externa assumida. Preserve esse fato.'
                                                                    : item.blockingReason ===
                                                                        'INSTALLMENT_NOT_FUTURE'
                                                                      ? 'O vencimento já chegou.'
                                                                      : 'Esta parcela já foi resolvida.'}
                                                            </p>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        <p>
                                            {Object.keys(selected).length}{' '}
                                            parcelas selecionadas.
                                        </p>
                                        <div className={styles.actions}>
                                            {cursor && (
                                                <Button
                                                    variant="outline"
                                                    type="button"
                                                    onClick={() =>
                                                        setCursor(null)
                                                    }
                                                >
                                                    Primeira página de parcelas
                                                </Button>
                                            )}
                                            {options.data.nextCursor && (
                                                <Button
                                                    variant="outline"
                                                    type="button"
                                                    onClick={() =>
                                                        setCursor(
                                                            options.data!
                                                                .nextCursor,
                                                        )
                                                    }
                                                >
                                                    Mais parcelas
                                                </Button>
                                            )}
                                        </div>
                                    </>
                                )}
                            {mode === 'PAYOFF' && (
                                <>
                                    <p>
                                        {'totalOpenCount' in options.data
                                            ? options.data.totalOpenCount
                                            : 0}{' '}
                                        parcelas abertas · previsto restante:{' '}
                                        {signedMoney(
                                            'totalExpectedRemainingAmountInCents' in
                                                options.data
                                                ? options.data
                                                      .totalExpectedRemainingAmountInCents
                                                : '0',
                                        )}
                                        .
                                    </p>
                                    <label>
                                        Valor real global da quitação (R$)
                                        <Input
                                            inputMode="decimal"
                                            name="paidAmountInCents"
                                            required
                                            value={amount}
                                            onChange={(event) => {
                                                change();
                                                setAmount(event.target.value);
                                            }}
                                        />
                                    </label>
                                </>
                            )}
                            <label>
                                Data do fato
                                <Input
                                    type="date"
                                    name="factDate"
                                    required
                                    max={businessToday()}
                                    value={date}
                                    onChange={(event) => {
                                        change(true);
                                        setDate(event.target.value);
                                    }}
                                />
                            </label>
                            {mode === 'CANCEL' ? (
                                <label>
                                    Motivo do cancelamento
                                    <Input
                                        required
                                        name="reason"
                                        maxLength={500}
                                        value={reason}
                                        onChange={(event) => {
                                            change();
                                            setReason(event.target.value);
                                        }}
                                    />
                                </label>
                            ) : (
                                <>
                                    <label>
                                        Meio de pagamento
                                        <select
                                            value={method}
                                            onChange={(event) => {
                                                change();
                                                setMethod(
                                                    event.target
                                                        .value as typeof method,
                                                );
                                            }}
                                        >
                                            <option value="PIX">Pix</option>
                                            <option value="DEBIT">
                                                Débito
                                            </option>
                                            <option value="CASH">
                                                Dinheiro
                                            </option>
                                        </select>
                                    </label>
                                    {shared && (
                                        <>
                                            <label>
                                                Quem pagou
                                                <select
                                                    required
                                                    value={payer}
                                                    onChange={(event) => {
                                                        change();
                                                        setPayer(
                                                            event.target.value,
                                                        );
                                                    }}
                                                >
                                                    <option value="">
                                                        Escolha a pessoa
                                                    </option>
                                                    {members.data.members?.map(
                                                        (member) => (
                                                            <option
                                                                key={
                                                                    member.memberId
                                                                }
                                                                value={
                                                                    member.memberId
                                                                }
                                                            >
                                                                {
                                                                    member.displayName
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
                                                    setSettlement(value);
                                                }}
                                                options={{
                                                    openCycles:
                                                        members.data.openCycles,
                                                }}
                                            />
                                        </>
                                    )}
                                </>
                            )}
                            {mode === 'ANTICIPATE' && (
                                <>
                                    <Button
                                        variant="outline"
                                        type="button"
                                        onClick={() => void resolveSelection()}
                                    >
                                        Conferir parcelas selecionadas
                                    </Button>
                                    {selectionPreview && (
                                        <>
                                            <p>
                                                Informe quanto foi pago por cada
                                                parcela, mantendo o vencimento
                                                original.
                                            </p>
                                            {selectionPreview.items.map(
                                                (item) => (
                                                    <label
                                                        key={item.installmentId}
                                                    >
                                                        Parcela {item.position}{' '}
                                                        ·{' '}
                                                        {formatDate(
                                                            item.dueDate,
                                                        )}{' '}
                                                        · restante{' '}
                                                        {formatMoney(
                                                            item.expectedRemainingAmountInCents,
                                                        )}
                                                        <Input
                                                            required
                                                            inputMode="decimal"
                                                            aria-label={`Valor real da parcela ${item.position}`}
                                                            value={
                                                                amounts[
                                                                    item
                                                                        .installmentId
                                                                ] ?? ''
                                                            }
                                                            onChange={(
                                                                event,
                                                            ) => {
                                                                if (!resolved)
                                                                    setResolved(
                                                                        selectionPreview,
                                                                    );
                                                                change();
                                                                setAmounts(
                                                                    (
                                                                        previous,
                                                                    ) => ({
                                                                        ...previous,
                                                                        [item.installmentId]:
                                                                            event
                                                                                .target
                                                                                .value,
                                                                    }),
                                                                );
                                                            }}
                                                        />
                                                    </label>
                                                ),
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </fieldset>
                        {error && <p role="alert">{error}</p>}
                        {resolve.error && <p role="alert">{resolve.error}</p>}
                        {preview.error && <p role="alert">{preview.error}</p>}
                        {(resolve.pending || preview.pending) && (
                            <p role="status">
                                Consultando impacto nas parcelas…
                            </p>
                        )}
                        <CommandFeedback command={command} />
                        {(!draft || (mode !== 'CANCEL' && !preview.data)) && (
                            <Button
                                type="submit"
                                disabled={
                                    busy ||
                                    preview.pending ||
                                    resolve.pending ||
                                    options.isFetching ||
                                    (mode === 'ANTICIPATE' && !selectionPreview)
                                }
                            >
                                Revisar{' '}
                                {mode === 'PAYOFF'
                                    ? 'quitação'
                                    : mode === 'CANCEL'
                                      ? 'cancelamento'
                                      : 'antecipação'}
                            </Button>
                        )}
                        {draft && (mode === 'CANCEL' || preview.data) && (
                            <section
                                className={styles.summary}
                                aria-label="Confirmar resolução do parcelamento"
                            >
                                <h3>Confira antes de confirmar</h3>
                                {mode === 'CANCEL' ? (
                                    <>
                                        <p>
                                            Cancelar{' '}
                                            {Object.keys(selected).length}{' '}
                                            parcelas futuras. Motivo: {reason}.
                                        </p>
                                        <ul>
                                            {Object.values(selected).map(
                                                (item) => (
                                                    <li key={item.position}>
                                                        Parcela {item.position}{' '}
                                                        ·{' '}
                                                        {formatDate(item.date)}{' '}
                                                        · restante{' '}
                                                        {formatMoney(
                                                            item.remaining,
                                                        )}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                        <p>
                                            Os pagamentos já realizados
                                            permanecem no histórico. Esta ação
                                            não registra devolução.
                                        </p>
                                    </>
                                ) : mode === 'PAYOFF' ? (
                                    <>
                                        <p>
                                            Previsto em aberto:{' '}
                                            {formatMoney(
                                                (preview.data as PayoffPreview)
                                                    .expectedRemainingAmountInCents,
                                            )}
                                        </p>
                                        <p>
                                            Pagamento global informado:{' '}
                                            {formatMoney(
                                                (preview.data as PayoffPreview)
                                                    .paidAmountInCents,
                                            )}
                                        </p>
                                        <p>
                                            Diferença global:{' '}
                                            {signedMoney(
                                                (preview.data as PayoffPreview)
                                                    .adjustmentInCents,
                                            )}
                                        </p>
                                        <p>
                                            {preview.data!.items.length}{' '}
                                            parcelas serão vinculadas à quitação
                                            global. Nenhum pagamento individual
                                            será inventado.
                                        </p>
                                        <EconomicShares
                                            shares={
                                                (preview.data as PayoffPreview)
                                                    .effectiveEconomicShares
                                            }
                                            members={members.data.members ?? []}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <p>
                                            Previsto:{' '}
                                            {signedMoney(
                                                (
                                                    preview.data as AnticipationPreview
                                                )
                                                    .totalExpectedRemainingAmountInCents,
                                            )}{' '}
                                            · valor real:{' '}
                                            {signedMoney(
                                                (
                                                    preview.data as AnticipationPreview
                                                ).totalPaidAmountInCents,
                                            )}
                                        </p>
                                        <p>
                                            Diferença:{' '}
                                            {signedMoney(
                                                (
                                                    preview.data as AnticipationPreview
                                                ).totalAdjustmentInCents,
                                            )}
                                        </p>
                                        <ul className={layout.list}>
                                            {(
                                                preview.data as AnticipationPreview
                                            ).items.map((item) => (
                                                <li
                                                    key={item.installmentId}
                                                    className={layout.row}
                                                >
                                                    <h3>
                                                        Parcela {item.position}{' '}
                                                        · vencimento{' '}
                                                        {formatDate(
                                                            item.dueDate,
                                                        )}
                                                    </h3>
                                                    <p>
                                                        Restante previsto:{' '}
                                                        {formatMoney(
                                                            item.expectedRemainingAmountInCents,
                                                        )}{' '}
                                                        · pago:{' '}
                                                        {formatMoney(
                                                            item.paidAmountInCents,
                                                        )}{' '}
                                                        · diferença:{' '}
                                                        {signedMoney(
                                                            item.adjustmentInCents,
                                                        )}
                                                        .
                                                    </p>
                                                    <EconomicShares
                                                        shares={
                                                            item.effectiveEconomicShares
                                                        }
                                                        members={
                                                            members.data!
                                                                .members ?? []
                                                        }
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                                <p>
                                    Data do fato: {formatDate(date)}
                                    {shared && mode !== 'CANCEL'
                                        ? ` · ${members.data.members?.find((member) => member.memberId === payer)?.displayName}`
                                        : ''}
                                    .
                                </p>
                                <div className={styles.actions}>
                                    <Button
                                        type="button"
                                        disabled={
                                            busy ||
                                            options.isFetching ||
                                            members.isFetching
                                        }
                                        onClick={confirm}
                                    >
                                        {mode === 'PAYOFF'
                                            ? 'Confirmar quitação global'
                                            : mode === 'CANCEL'
                                              ? 'Confirmar cancelamento das parcelas'
                                              : 'Confirmar antecipação'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => {
                                            setDraft(null);
                                            preview.reset();
                                        }}
                                    >
                                        Editar
                                    </Button>
                                </div>
                            </section>
                        )}
                    </form>
                )}
        </section>
    );
}
