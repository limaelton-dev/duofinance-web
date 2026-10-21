'use client';
import Link from 'next/link';
import { FinancialRecordLink } from './financial-record-link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getIncomeOptions } from '@/lib/api/income';
import {
    getRecurringList,
    getRecurringDetail,
    getRecurringOccurrences,
    recurringRequest,
} from '@/lib/api/recurring-commitment';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useFinancialCommand } from '../hooks/use-financial-command';
import type {
    RecurringTerminationInput,
    RecurringTerminationPreview,
    RecurringDetail,
} from '../types/recurring-commitment';
import { businessToday, formatDate, formatMoney } from '../utils/expense-money';
import {
    PlanningBoundary,
    PlanningHeading,
    planningKey,
    QueryFeedback,
    CommandFeedback,
    usePlanningPreview,
    planningStatus,
    signedMoney,
} from './planning-shared';
import { RecurringConfigurationForm } from './recurring-commitment-composer';
import { PlannedOccurrenceActions } from './planned-occurrence-actions';
import styles from './expenses.module.css';
import layout from './planning.module.css';

export function RecurringCommitmentPage({
    spaceId,
    commitmentId,
    initialMonth,
}: {
    spaceId: string;
    commitmentId?: string;
    initialMonth?: string;
}) {
    return (
        <PlanningBoundary spaceId={spaceId}>
            {(personId) =>
                commitmentId ? (
                    <RecurringDetail
                        personId={personId}
                        spaceId={spaceId}
                        commitmentId={commitmentId}
                        initialMonth={initialMonth}
                    />
                ) : (
                    <RecurringList personId={personId} spaceId={spaceId} />
                )
            }
        </PlanningBoundary>
    );
}
function RecurringList({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const [month, setMonth] = useState(() => businessToday().slice(0, 7)),
        [cursor, setCursor] = useState<string | null>(null);
    const query = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'recurring-list', month, cursor),
        /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
        (signal) => getRecurringList(spaceId, month, cursor, signal),
    );
    return (
        <section className={styles.stack}>
            <PlanningHeading title="Recorrências" spaceId={spaceId}>
                Despesas e receitas que se repetem. Cada ocorrência mantém seus
                próprios fatos.
            </PlanningHeading>
            <div className={styles.actions}>
                <Button asChild>
                    <Link href={`/spaces/${spaceId}/recurring-commitments/new`}>
                        Criar recorrência
                    </Link>
                </Button>
                <Link href={`/spaces/${spaceId}/finances/planning`}>
                    Ver planejamento
                </Link>
            </div>
            <label>
                Mês
                <Input
                    type="month"
                    required
                    value={month}
                    onChange={(event) => {
                        setMonth(event.target.value);
                        setCursor(null);
                    }}
                />
            </label>
            <QueryFeedback query={query} />
            {query.data && !query.isError && (
                <>
                    <p>
                        {query.data.totalCount} recorrências ·{' '}
                        {signedMoney(query.data.totalAmountInCents)} em valores
                        conhecidos
                        {query.data.unknownAmountCount
                            ? ` · ${query.data.unknownAmountCount} com valor a informar`
                            : ''}
                        .
                    </p>
                    {query.data.items.length ? (
                        <ul className={layout.list}>
                            {query.data.items.map((item) => (
                                <li
                                    key={`${item.id}:${item.referenceDate}`}
                                    className={layout.row}
                                >
                                    <h2>
                                        <FinancialRecordLink
                                            href={`/spaces/${spaceId}/recurring-commitments/${item.id}?month=${month}`}
                                        >
                                            {item.description}
                                        </FinancialRecordLink>
                                    </h2>
                                    <p>
                                        {item.kind === 'INCOME'
                                            ? 'Receita'
                                            : 'Despesa'}{' '}
                                        · {formatDate(item.referenceDate)}
                                    </p>
                                    <p>
                                        {item.amountInCents !== null
                                            ? formatMoney(item.amountInCents)
                                            : 'Valor variável, a informar'}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>Nenhuma recorrência prevista para este mês.</p>
                    )}
                    <div className={styles.actions}>
                        {cursor && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCursor(null)}
                            >
                                Voltar ao início
                            </Button>
                        )}
                        {query.data.nextCursor && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                    setCursor(query.data!.nextCursor)
                                }
                            >
                                Próxima página
                            </Button>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
function RecurringDetail({
    personId,
    spaceId,
    commitmentId,
    initialMonth,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
    initialMonth?: string;
}) {
    const [month, setMonth] = useState(
            initialMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth)
                ? initialMonth
                : businessToday().slice(0, 7),
        ),
        [selected, setSelected] = useState<string | null>(null),
        [maintenance, setMaintenance] = useState(false),
        [end, setEnd] = useState(''),
        [notice, setNotice] = useState<string | null>(null);
    const root = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'recurring-detail', commitmentId),
        true,
        (signal) => getRecurringDetail(spaceId, commitmentId, signal),
    );
    const occurrences = useExpenseQuery(
        personId,
        spaceId,
        planningKey(
            personId,
            spaceId,
            'recurring-occurrences',
            commitmentId,
            month,
        ),
        /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
        (signal) =>
            getRecurringOccurrences(spaceId, commitmentId, month, signal),
    );
    const options = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'recurring-maintenance-options'),
        true,
        (signal) => getIncomeOptions(spaceId, signal),
    );
    const preview = usePlanningPreview<
        RecurringTerminationInput,
        RecurringTerminationPreview
    >(spaceId, (input, token, signal) =>
        recurringRequest(
            spaceId,
            `/${commitmentId}/termination-preview`,
            input,
            token,
            undefined,
            signal,
        ),
    );
    const [terminationInput, setTerminationInput] =
        useState<RecurringTerminationInput | null>(null);
    const command = useFinancialCommand<
        RecurringTerminationInput,
        RecurringDetail
    >({
        execute: (id, input, token, key, signal) =>
            recurringRequest(
                id,
                `/${commitmentId}/termination`,
                input,
                token,
                key,
                signal,
            ),
        onSuccess: () => {
            setNotice(
                'Recorrência encerrada na data informada. O histórico foi preservado.',
            );
            preview.reset();
            setTerminationInput(null);
            void root.refetch();
            void occurrences.refetch();
        },
    });
    const value = !root.isError ? root.data?.commitment : undefined,
        busy = command.isPending || command.canRetry;
    return (
        <section className={styles.stack}>
            <PlanningHeading title="Recorrência" spaceId={spaceId} />
            <QueryFeedback query={root} />
            {value && (
                <>
                    <div className={styles.receipt}>
                        <h2>{value.description}</h2>
                        <p>
                            {value.kind === 'INCOME' ? 'Receita' : 'Despesa'} ·{' '}
                            {value.recurrence.frequency === 'MONTHLY'
                                ? 'Mensal'
                                : 'Anual'}{' '}
                            · dia {value.recurrence.dayOfMonth}
                        </p>
                        <p>
                            {value.amountInCents !== null
                                ? formatMoney(value.amountInCents)
                                : value.expectedAmountInCents !== null
                                  ? `Variável, estimativa ${formatMoney(value.expectedAmountInCents)}`
                                  : 'Variável, valor a informar por ocorrência'}
                        </p>
                        <p>
                            {value.terminatedOn
                                ? `Encerrada em ${formatDate(value.terminatedOn)}`
                                : value.endsOn
                                  ? `Prevista até ${formatDate(value.endsOn)}`
                                  : 'Sem fim definido'}
                        </p>
                        <Link
                            href={`/spaces/${spaceId}/finances/commitments/${commitmentId}?modality=RECURRING`}
                        >
                            Histórico e correções
                        </Link>
                    </div>
                    <section className={layout.section}>
                        <h2>Ocorrências</h2>
                        <label>
                            Mês
                            <Input
                                type="month"
                                required
                                value={month}
                                onChange={(event) => {
                                    setMonth(event.target.value);
                                    setSelected(null);
                                }}
                            />
                        </label>
                        <QueryFeedback query={occurrences} />
                        {occurrences.data && !occurrences.isError && (
                            <>
                                {occurrences.data.items.length ? (
                                    <ul className={layout.list}>
                                        {occurrences.data.items.map((item) => (
                                            <li
                                                key={item.referenceDate}
                                                className={layout.row}
                                            >
                                                <h3>
                                                    {formatDate(
                                                        item.referenceDate,
                                                    )}{' '}
                                                    ·{' '}
                                                    {
                                                        planningStatus[
                                                            item.status
                                                        ]
                                                    }
                                                </h3>
                                                <p>
                                                    {item.valuePending
                                                        ? item.expectedAmountInCents
                                                            ? `Valor a informar · estimativa ${formatMoney(item.expectedAmountInCents)}`
                                                            : 'Valor a informar'
                                                        : item.amountInCents ===
                                                            null
                                                          ? 'Sem valor'
                                                          : formatMoney(
                                                                item.amountInCents,
                                                            )}
                                                </p>
                                                <p>
                                                    Realizado:{' '}
                                                    {formatMoney(
                                                        item.fulfilledAmountInCents,
                                                    )}
                                                    {item.remainingAmountInCents ===
                                                    null
                                                        ? ''
                                                        : ` · Restante: ${formatMoney(item.remainingAmountInCents)}`}
                                                    .
                                                </p>
                                                {item.valueHistory.length >
                                                    0 && (
                                                    <details>
                                                        <summary>
                                                            Histórico dos
                                                            valores informados
                                                        </summary>
                                                        {item.valueHistory.map(
                                                            (change) => (
                                                                <p
                                                                    key={
                                                                        change.version
                                                                    }
                                                                >
                                                                    {change.previousAmountInCents ===
                                                                    null
                                                                        ? 'Valor a informar'
                                                                        : formatMoney(
                                                                              change.previousAmountInCents,
                                                                          )}{' '}
                                                                    →{' '}
                                                                    {formatMoney(
                                                                        change.amountInCents,
                                                                    )}{' '}
                                                                    ·{' '}
                                                                    {new Date(
                                                                        change.registeredAt,
                                                                    ).toLocaleString(
                                                                        'pt-BR',
                                                                        {
                                                                            timeZone:
                                                                                'America/Sao_Paulo',
                                                                        },
                                                                    )}
                                                                </p>
                                                            ),
                                                        )}
                                                    </details>
                                                )}
                                                {item.facts.length > 0 && (
                                                    <details>
                                                        <summary>
                                                            Fatos registrados
                                                        </summary>
                                                        {item.facts.map(
                                                            (fact) => (
                                                                <p
                                                                    key={
                                                                        fact.id
                                                                    }
                                                                >
                                                                    {fact.kind ===
                                                                    'EXTERNAL_LIABILITY'
                                                                        ? 'Obrigação no cartão'
                                                                        : fact.kind ===
                                                                            'RECEIPT'
                                                                          ? 'Recebimento'
                                                                          : 'Pagamento'}{' '}
                                                                    ·{' '}
                                                                    {formatMoney(
                                                                        fact.amountInCents,
                                                                    )}{' '}
                                                                    ·{' '}
                                                                    {formatDate(
                                                                        fact.factDate,
                                                                    )}
                                                                </p>
                                                            ),
                                                        )}
                                                    </details>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() =>
                                                        setSelected(
                                                            selected ===
                                                                item.referenceDate
                                                                ? null
                                                                : item.referenceDate,
                                                        )
                                                    }
                                                >
                                                    {selected ===
                                                    item.referenceDate
                                                        ? 'Fechar ocorrência'
                                                        : 'Abrir ocorrência'}
                                                </Button>
                                                {selected ===
                                                    item.referenceDate && (
                                                    <div className="col-span-full">
                                                        <PlannedOccurrenceActions
                                                            key={
                                                                item.referenceDate
                                                            }
                                                            personId={personId}
                                                            spaceId={spaceId}
                                                            commitmentId={
                                                                commitmentId
                                                            }
                                                            target={{
                                                                type: 'RECURRING',
                                                                referenceDate:
                                                                    item.referenceDate,
                                                            }}
                                                            onSaved={() => {
                                                                void root.refetch();
                                                                void occurrences.refetch();
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p>
                                        Nenhuma ocorrência neste mês. Consulte
                                        outro mês ou confira a vigência.
                                    </p>
                                )}
                            </>
                        )}
                    </section>
                    <section className={layout.section}>
                        <h2>Vigências e manutenção</h2>
                        <ol className={layout.list}>
                            {value.versions.map((version) => (
                                <li
                                    className={layout.row}
                                    key={version.version}
                                >
                                    <h3>
                                        Versão {version.version} · desde{' '}
                                        {formatDate(version.effectiveFrom)}
                                    </h3>
                                    <p>
                                        {version.description} ·{' '}
                                        {version.valueMode === 'FIXED'
                                            ? formatMoney(
                                                  version.amountInCents!,
                                              )
                                            : 'Valor variável'}
                                    </p>
                                </li>
                            ))}
                        </ol>
                        <QueryFeedback query={options} />
                        {options.data?.canCreate &&
                            !value.terminatedOn &&
                            !options.isError && (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            setMaintenance(!maintenance)
                                        }
                                    >
                                        {maintenance
                                            ? 'Fechar nova vigência'
                                            : 'Criar nova vigência'}
                                    </Button>
                                    {maintenance && (
                                        <RecurringConfigurationForm
                                            key={value.version}
                                            initial={value}
                                            personId={personId}
                                            spaceId={spaceId}
                                            onSaved={(proposed) => {
                                                if (!proposed) {
                                                    setMaintenance(false);
                                                    setNotice(
                                                        'Nova vigência registrada. O histórico anterior foi preservado.',
                                                    );
                                                }
                                                void root.refetch();
                                                void occurrences.refetch();
                                            }}
                                        />
                                    )}
                                    <form
                                        className={styles.fields}
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            if (
                                                !root.data ||
                                                !options.data ||
                                                root.isFetching ||
                                                options.isFetching ||
                                                busy
                                            )
                                                return;
                                            const input = {
                                                expectedCommitmentVersion:
                                                    value.version,
                                                endsOn: end,
                                                ...(value.scope === 'SHARED'
                                                    ? {
                                                          expectedSpaceVersion:
                                                              options.data
                                                                  .version,
                                                      }
                                                    : {}),
                                            };
                                            setTerminationInput(input);
                                            void preview.preview(input);
                                        }}
                                    >
                                        <fieldset
                                            disabled={
                                                busy ||
                                                preview.pending ||
                                                root.isFetching ||
                                                options.isFetching
                                            }
                                        >
                                            <legend>
                                                Encerrar a repetição
                                            </legend>
                                            <label>
                                                Último dia de vigência
                                                <Input
                                                    type="date"
                                                    required
                                                    min={businessToday()}
                                                    value={end}
                                                    onChange={(event) => {
                                                        setEnd(
                                                            event.target.value,
                                                        );
                                                        preview.reset();
                                                        setTerminationInput(
                                                            null,
                                                        );
                                                    }}
                                                />
                                            </label>
                                            <p className={styles.help}>
                                                Impede novas projeções após a
                                                data. Ocorrências já
                                                materializadas permanecem no
                                                histórico.
                                            </p>
                                            <Button
                                                variant="outline"
                                                type="submit"
                                            >
                                                Revisar encerramento
                                            </Button>
                                        </fieldset>
                                        {preview.pending && (
                                            <p role="status">
                                                Consultando impacto…
                                            </p>
                                        )}
                                        {preview.error && (
                                            <p role="alert">{preview.error}</p>
                                        )}
                                        {preview.data && terminationInput && (
                                            <div className={styles.summary}>
                                                <h3>
                                                    Encerrar após{' '}
                                                    {formatDate(
                                                        preview.data.endsOn,
                                                    )}
                                                </h3>
                                                <p>
                                                    {
                                                        preview.data
                                                            .materializedOccurrencesPreserved
                                                            .length
                                                    }{' '}
                                                    ocorrências já
                                                    materializadas serão
                                                    preservadas.
                                                </p>
                                                <Button
                                                    type="button"
                                                    disabled={
                                                        busy ||
                                                        root.isFetching ||
                                                        options.isFetching
                                                    }
                                                    onClick={() =>
                                                        command.submit(
                                                            terminationInput,
                                                        )
                                                    }
                                                >
                                                    Confirmar encerramento da
                                                    recorrência
                                                </Button>
                                            </div>
                                        )}
                                        <CommandFeedback command={command} />
                                        {notice && (
                                            <p role="status">{notice}</p>
                                        )}
                                    </form>
                                </>
                            )}
                    </section>
                    <Link href={`/spaces/${spaceId}/recurring-commitments`}>
                        Ver recorrências
                    </Link>
                </>
            )}
        </section>
    );
}
