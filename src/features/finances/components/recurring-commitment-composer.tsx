'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getIncomeOptions } from '@/lib/api/income';
import { apiRequest } from '@/lib/api/api-client';
import { recurringRequest } from '@/lib/api/recurring-commitment';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import { useFinancialCommand } from '../hooks/use-financial-command';
import type {
    RecurringRoot,
    RecurringInput,
    RecurringChangeInput,
    RecurringChangePreview,
    RecurringDetail,
} from '../types/recurring-commitment';
import type { Split } from '../types/shared-expense';
import {
    businessToday,
    decimalUnits,
    formatDate,
    formatMoney,
} from '../utils/expense-money';
import {
    PlanningBoundary,
    PlanningHeading,
    PlanningDistribution,
    QueryFeedback,
    CommandFeedback,
    buildPlanningSplit,
    positiveAmount,
    planningKey,
    usePlanningPreview,
    signedMoney,
} from './planning-shared';
import styles from './expenses.module.css';
import layout from './planning.module.css';

export function RecurringCommitmentComposer({ spaceId }: { spaceId: string }) {
    return (
        <PlanningBoundary spaceId={spaceId}>
            {(personId) => (
                <section className={styles.stack}>
                    <PlanningHeading title="Nova recorrência" spaceId={spaceId}>
                        Uma regra de despesa ou receita, com ocorrências
                        independentes.
                    </PlanningHeading>
                    <RecurringConfigurationForm
                        spaceId={spaceId}
                        personId={personId}
                    />
                </section>
            )}
        </PlanningBoundary>
    );
}
export function RecurringConfigurationForm({
    spaceId,
    personId,
    initial,
    onSaved,
}: {
    spaceId: string;
    personId: string;
    initial?: RecurringRoot;
    onSaved?: (proposed: boolean) => void;
}) {
    const options = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'recurring-create-options'),
        true,
        (signal) => getIncomeOptions(spaceId, signal),
    );
    const [description, setDescription] = useState(initial?.description ?? ''),
        [kind, setKind] = useState<'EXPENSE' | 'INCOME'>(
            initial?.kind ?? 'EXPENSE',
        );
    const [valueMode, setValueMode] = useState<'FIXED' | 'VARIABLE'>(
            initial?.valueMode ?? 'FIXED',
        ),
        [amount, setAmount] = useState(
            initial?.expectedAmountInCents
                ? (initial.expectedAmountInCents / 100)
                      .toFixed(2)
                      .replace('.', ',')
                : '',
        );
    const [frequency, setFrequency] = useState<'MONTHLY' | 'ANNUAL'>(
            initial?.recurrence.frequency ?? 'MONTHLY',
        ),
        [day, setDay] = useState(String(initial?.recurrence.dayOfMonth ?? 1)),
        [month, setMonth] = useState(
            String(
                initial?.recurrence.frequency === 'ANNUAL'
                    ? initial.recurrence.monthOfYear
                    : 1,
            ),
        );
    const [start, setStart] = useState(initial ? '' : businessToday()),
        [end, setEnd] = useState(initial?.endsOn ?? '');
    const [splitMode, setSplitMode] = useState<Split['mode']>(
            initial?.distribution?.mode ?? 'PERCENTAGES',
        ),
        [shares, setShares] = useState<Record<string, string>>(() =>
            Object.fromEntries(
                (initial?.distribution?.shares ?? []).map((share) => [
                    share.memberId,
                    (
                        ('basisPoints' in share
                            ? share.basisPoints
                            : share.amountInCents) / 100
                    )
                        .toFixed(2)
                        .replace('.', ','),
                ]),
            ),
        ),
        [member, setMember] = useState(initial?.expectedMemberId ?? '');
    const [review, setReview] = useState<
            RecurringInput | RecurringChangeInput | null
        >(null),
        [error, setError] = useState<string | null>(null),
        [dirty, setDirty] = useState(false),
        [result, setResult] = useState<{
            id: string;
            proposed: boolean;
        } | null>(null);
    const form = useRef<HTMLFormElement>(null);
    const preview = usePlanningPreview<
        RecurringChangeInput,
        RecurringChangePreview
    >(spaceId, (input, token, signal) =>
        recurringRequest(
            spaceId,
            `/${initial!.id}/change-preview`,
            input,
            token,
            undefined,
            signal,
        ),
    );
    const command = useFinancialCommand<
        { input: RecurringInput | RecurringChangeInput; proposed: boolean },
        RecurringDetail | { spaceId: string }
    >({
        execute: (id, input, token, key, signal) =>
            input.proposed
                ? apiRequest(
                      `/spaces/${id}/financial-commitments/${initial!.id}/change-proposals`,
                      {
                          method: 'POST',
                          body: input.input,
                          csrfToken: token,
                          idempotencyKey: key,
                          signal,
                      },
                  )
                : recurringRequest<RecurringDetail>(
                      id,
                      initial ? `/${initial.id}/versions` : '',
                      input.input,
                      token,
                      key,
                      signal,
                  ),
        onSuccess: (value) => {
            setDirty(false);
            setResult({
                id: 'commitment' in value ? value.commitment.id : initial!.id,
                proposed: !!preview.data?.requiresAcceptance,
            });
            onSaved?.(!!preview.data?.requiresAcceptance);
        },
    });
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    function change() {
        setDirty(true);
        setReview(null);
        setError(null);
        preview.reset();
    }
    function prepare() {
        const o = options.data;
        if (
            !o ||
            !o.canCreate ||
            options.isFetching ||
            options.isError ||
            busy ||
            !form.current?.reportValidity()
        )
            return;
        try {
            const cents =
                valueMode === 'FIXED'
                    ? positiveAmount(amount)
                    : amount
                      ? positiveAmount(amount)
                      : null;
            const recurrence =
                frequency === 'MONTHLY'
                    ? ({ frequency, dayOfMonth: Number(day) } as const)
                    : ({
                          frequency,
                          dayOfMonth: Number(day),
                          monthOfYear: Number(month),
                      } as const);
            const value =
                valueMode === 'FIXED'
                    ? ({ valueMode, amountInCents: cents! } as const)
                    : ({ valueMode, expectedAmountInCents: cents } as const);
            const scope =
                o.spaceType === 'PERSONAL'
                    ? ({ scope: 'PERSONAL' } as const)
                    : ({
                          scope: 'SHARED',
                          expectedSpaceVersion: o.version!,
                          expectedMemberId: member || null,
                          distribution: buildPlanningSplit(
                              o.members ?? [],
                              valueMode === 'VARIABLE'
                                  ? 'PERCENTAGES'
                                  : splitMode,
                              shares,
                              cents ?? 10000,
                          ),
                      } as const);
            if (initial && start <= o.referenceDate)
                throw new Error('A nova vigência deve começar depois de hoje.');
            if (end && end < start)
                throw new Error('O fim deve ser igual ou posterior ao início.');
            const input = {
                ...value,
                ...scope,
                kind,
                description: description.trim(),
                recurrence,
                endsOn: end || null,
                ...(initial
                    ? {
                          effectiveFrom: start,
                          expectedCommitmentVersion: initial.version,
                      }
                    : { startsOn: start }),
            } as RecurringInput | RecurringChangeInput;
            setReview(input);
            if (initial) void preview.preview(input as RecurringChangeInput);
        } catch (failure) {
            setError((failure as Error).message);
        }
    }
    if (result)
        return (
            <div className={styles.receipt} role="status">
                <h2>
                    {result.proposed
                        ? 'Alteração aguardando aprovação'
                        : initial
                          ? 'Nova vigência registrada'
                          : 'Recorrência criada'}
                </h2>
                <p>
                    {result.proposed
                        ? 'A regra atual continua válida até a aprovação e a data definida.'
                        : 'O histórico anterior foi preservado. Nenhum pagamento ou recebimento foi registrado por esta configuração.'}
                </p>
                <Button asChild>
                    <Link
                        href={`/spaces/${spaceId}/recurring-commitments/${result.id}`}
                    >
                        Conferir recorrência
                    </Link>
                </Button>
                {result.proposed && (
                    <Link href={`/spaces/${spaceId}/finances/changes`}>
                        Acompanhar alterações
                    </Link>
                )}
            </div>
        );
    return (
        <div className={layout.section}>
            <QueryFeedback query={options} />
            {options.data?.canCreate && !options.isError ? (
                <form
                    className={styles.fields}
                    ref={form}
                    onChange={change}
                    onSubmit={(event) => {
                        event.preventDefault();
                        prepare();
                    }}
                >
                    <fieldset
                        disabled={busy || options.isFetching || preview.pending}
                    >
                        <legend>
                            {initial
                                ? 'Configurar nova vigência'
                                : 'Regra da recorrência'}
                        </legend>
                        <label>
                            Tipo
                            <select
                                value={kind}
                                disabled={!!initial}
                                onChange={(event) =>
                                    setKind(event.target.value as typeof kind)
                                }
                            >
                                <option value="EXPENSE">Despesa</option>
                                <option value="INCOME">Receita</option>
                            </select>
                        </label>
                        <label>
                            Descrição
                            <Input
                                required
                                maxLength={160}
                                name="description"
                                value={description}
                                onChange={(event) =>
                                    setDescription(event.target.value)
                                }
                            />
                        </label>
                        <label>
                            Valor
                            <select
                                value={valueMode}
                                onChange={(event) => {
                                    setValueMode(
                                        event.target.value as typeof valueMode,
                                    );
                                    setSplitMode('PERCENTAGES');
                                    setShares({});
                                }}
                            >
                                <option value="FIXED">Fixo</option>
                                <option value="VARIABLE">
                                    Variável a cada ocorrência
                                </option>
                            </select>
                        </label>
                        <label>
                            {valueMode === 'FIXED'
                                ? 'Valor por ocorrência (R$)'
                                : 'Estimativa por ocorrência (R$, opcional)'}
                            <Input
                                required={valueMode === 'FIXED'}
                                name={
                                    valueMode === 'FIXED'
                                        ? 'amountInCents'
                                        : 'expectedAmountInCents'
                                }
                                inputMode="decimal"
                                value={amount}
                                onChange={(event) =>
                                    setAmount(event.target.value)
                                }
                            />
                        </label>
                        {valueMode === 'VARIABLE' && (
                            <p className={styles.help}>
                                A estimativa é uma previsão. Informe o valor
                                real de cada ocorrência antes de realizá-la.
                            </p>
                        )}
                        <label>
                            Repetir
                            <select
                                value={frequency}
                                onChange={(event) =>
                                    setFrequency(
                                        event.target.value as typeof frequency,
                                    )
                                }
                            >
                                <option value="MONTHLY">Todo mês</option>
                                <option value="ANNUAL">Todo ano</option>
                            </select>
                        </label>
                        <label>
                            Dia do mês
                            <Input
                                type="number"
                                required
                                min={1}
                                max={31}
                                value={day}
                                onChange={(event) => setDay(event.target.value)}
                            />
                        </label>
                        {frequency === 'ANNUAL' && (
                            <label>
                                Mês do ano
                                <Input
                                    type="number"
                                    required
                                    min={1}
                                    max={12}
                                    value={month}
                                    onChange={(event) =>
                                        setMonth(event.target.value)
                                    }
                                />
                            </label>
                        )}
                        <p className={styles.help}>
                            Quando o dia não existir no mês, vale o último dia
                            desse mês.
                        </p>
                        <label>
                            {initial ? 'Nova vigência a partir de' : 'Início'}
                            <Input
                                type="date"
                                required
                                name={initial ? 'effectiveFrom' : 'startsOn'}
                                min={initial ? businessToday() : undefined}
                                value={start}
                                onChange={(event) =>
                                    setStart(event.target.value)
                                }
                            />
                        </label>
                        <label>
                            Fim previsto (opcional)
                            <Input
                                type="date"
                                name="endsOn"
                                min={start}
                                value={end}
                                onChange={(event) => setEnd(event.target.value)}
                            />
                        </label>
                        {options.data.spaceType === 'SHARED' && (
                            <PlanningDistribution
                                members={options.data.members ?? []}
                                mode={
                                    valueMode === 'VARIABLE'
                                        ? 'PERCENTAGES'
                                        : splitMode
                                }
                                variable={valueMode === 'VARIABLE'}
                                income={kind === 'INCOME'}
                                entries={shares}
                                onMode={(value) => {
                                    change();
                                    setSplitMode(value);
                                    setShares({});
                                }}
                                onEntries={(value) => {
                                    change();
                                    setShares(value);
                                }}
                                expectedMemberId={member}
                                onExpectedMember={(value) => {
                                    change();
                                    setMember(value);
                                }}
                            />
                        )}
                    </fieldset>
                    {error && <p role="alert">{error}</p>}
                    {preview.error && <p role="alert">{preview.error}</p>}
                    {preview.pending && (
                        <p role="status">Consultando impacto da alteração…</p>
                    )}
                    <CommandFeedback command={command} />
                    {(!review || (initial && !preview.data)) && (
                        <Button
                            type="submit"
                            disabled={
                                busy || options.isFetching || preview.pending
                            }
                        >
                            Revisar {initial ? 'nova vigência' : 'recorrência'}
                        </Button>
                    )}
                    {review && (!initial || preview.data) && (
                        <div
                            className={styles.summary}
                            aria-label="Confirmar recorrência"
                        >
                            <h3>Confira a regra</h3>
                            <p>
                                {review.description} ·{' '}
                                {kind === 'EXPENSE' ? 'Despesa' : 'Receita'}{' '}
                                {valueMode === 'FIXED'
                                    ? `de ${formatMoney(decimalUnits(amount)!)}`
                                    : amount
                                      ? `variável, estimada em ${formatMoney(decimalUnits(amount)!)}`
                                      : 'variável, valor a informar'}
                            </p>
                            <p>
                                {frequency === 'MONTHLY'
                                    ? 'Todo mês'
                                    : `Todo ano, mês ${month}`}
                                , dia {day}.{' '}
                                {initial ? 'Nova vigência' : 'Início'}:{' '}
                                {formatDate(start)}
                                {end
                                    ? `; fim: ${formatDate(end)}`
                                    : '; sem fim definido'}
                                .
                            </p>
                            {preview.data && (
                                <>
                                    <p>
                                        Ocorrências já materializadas
                                        preservadas:{' '}
                                        {
                                            preview.data
                                                .materializedOccurrencesPreserved
                                                .length
                                        }
                                        .
                                    </p>
                                    <p className={styles.help}>
                                        Impacto avaliado até{' '}
                                        {formatDate(
                                            preview.data.assessmentThrough,
                                        )}
                                        .
                                    </p>
                                    {preview.data.impactByMember.map(
                                        (impact) => (
                                            <div key={impact.memberId}>
                                                <strong>
                                                    {options.data!.members?.find(
                                                        (m) =>
                                                            m.memberId ===
                                                            impact.memberId,
                                                    )?.displayName ??
                                                        'Participante'}
                                                </strong>
                                                <p>
                                                    Fixo no período:{' '}
                                                    {signedMoney(
                                                        impact.currentFixedAmountInCents,
                                                    )}{' '}
                                                    →{' '}
                                                    {signedMoney(
                                                        impact.proposedFixedAmountInCents,
                                                    )}
                                                    . Diferença:{' '}
                                                    {signedMoney(
                                                        impact.fixedDeltaInCents,
                                                    )}
                                                    .
                                                </p>
                                                <p>
                                                    Exposição variável no
                                                    período:{' '}
                                                    {impact.currentVariableWeight /
                                                        100}
                                                    % →{' '}
                                                    {impact.proposedVariableWeight /
                                                        100}
                                                    %.
                                                </p>
                                                {impact.requiresAcceptance && (
                                                    <p>
                                                        Exige aprovação desta
                                                        pessoa.
                                                    </p>
                                                )}
                                            </div>
                                        ),
                                    )}
                                    {preview.data.requiresAcceptance && (
                                        <p>
                                            A regra atual permanece válida. A
                                            mudança será enviada para aprovação.
                                        </p>
                                    )}
                                </>
                            )}
                            <p className={styles.help}>
                                Esta ação configura previsões; pagamentos e
                                recebimentos são registrados por ocorrência.
                            </p>
                            <div className={styles.actions}>
                                <Button
                                    type="button"
                                    disabled={busy || options.isFetching}
                                    onClick={() =>
                                        command.submit({
                                            input: review,
                                            proposed:
                                                !!preview.data
                                                    ?.requiresAcceptance,
                                        })
                                    }
                                >
                                    {preview.data?.requiresAcceptance
                                        ? 'Enviar para aprovação'
                                        : initial
                                          ? 'Confirmar nova vigência'
                                          : 'Criar recorrência'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => {
                                        setReview(null);
                                        preview.reset();
                                    }}
                                >
                                    Editar
                                </Button>
                            </div>
                        </div>
                    )}
                </form>
            ) : options.data && !options.data.canCreate ? (
                <p>Este espaço não permite novas configurações agora.</p>
            ) : null}
        </div>
    );
}
