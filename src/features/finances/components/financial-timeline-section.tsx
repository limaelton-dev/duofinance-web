'use client';
import { FinancialLoading } from './financial-loading';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    getFinancialForecast,
    getFinancialTimeline,
} from '@/lib/api/financial-review';
import { financesQueryKeys } from '../cache/finances-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useFinancialReviewAccess } from '../hooks/use-financial-review-access';
import type {
    FinancialForecast,
    FinancialForecastItem,
    FinancialReviewItem,
    FinancialReviewItemType,
    FinancialReviewView,
    FinancialTimeline,
} from '../types/financial-review';
import { formatDate, formatMoney } from '../utils/expense-money';
import { formatReviewMoney } from '../utils/financial-review';
import styles from './finances-summary.module.css';

const labels: Record<FinancialReviewItemType, string> = {
    EXPENSE: 'Despesa econômica registrada',
    EXPENSE_DISCOUNT: 'Desconto da despesa',
    EXPENSE_SURCHARGE: 'Acréscimo da despesa',
    EXPENSE_PAYOFF: 'Quitação da despesa',
    EXPENSE_CANCELLATION: 'Cancelamento da despesa',
    INCOME_INCREASE: 'Aumento da receita',
    INCOME_DECREASE: 'Redução da receita',
    INCOME_CANCELLATION: 'Cancelamento da receita',
    EXPECTED_INCOME: 'Receita prevista',
    EXPECTED_EXPENSE: 'Despesa prevista',
    DISBURSEMENT: 'Pagamento direto',
    RECEIPT: 'Recebimento realizado',
    EXTERNAL_LIABILITY: 'Obrigação externa assumida',
    EXTERNAL_SETTLEMENT: 'Liquidação externa',
    INTERNAL_TRANSFER: 'Transferência interna',
    INTERNAL_OFFSET: 'Compensação entre membros',
    INTERNAL_WAIVER: 'Dispensa entre membros',
    INTERNAL_REVERSAL: 'Reversão de resolução entre membros',
    DISBURSEMENT_REVERSAL: 'Reversão de pagamento direto',
    RECEIPT_REVERSAL: 'Reversão de recebimento',
    EXTERNAL_LIABILITY_REVERSAL: 'Reversão de obrigação no cartão',
    EXTERNAL_SETTLEMENT_REVERSAL: 'Reversão de pagamento externo',
};
export function FinancialTimelineSection({
    personId,
    spaceId,
    month,
    memberId,
    referenceDate,
    view,
    onView,
}: {
    personId: string;
    spaceId: string;
    month: string;
    memberId: string | null;
    referenceDate: string;
    view: FinancialReviewView | 'FORECAST';
    onView: (value: FinancialReviewView | 'FORECAST') => void;
}) {
    const [selection, setSelection] = useState<{
        cursor: string | null;
    }>({ cursor: null });
    const current = useRef<typeof selection | null>(selection);
    useLayoutEffect(() => {
        current.current = selection;
    }, [selection]);
    useEffect(
        () => () => {
            current.current = null;
        },
        [],
    );
    const query = useExpenseQuery<FinancialTimeline | FinancialForecast>(
        personId,
        spaceId,
        financesQueryKeys.review(
            personId,
            spaceId,
            view,
            month,
            memberId,
            selection.cursor,
            referenceDate,
        ),
        true,
        (signal) =>
            view === 'FORECAST'
                ? getFinancialForecast(
                      spaceId,
                      month,
                      memberId,
                      selection.cursor,
                      signal,
                  )
                : getFinancialTimeline(
                      spaceId,
                      month,
                      view,
                      memberId,
                      selection.cursor,
                      signal,
                  ),
        () => current.current === selection,
    );
    useFinancialReviewAccess(query.error, spaceId);
    const value = !query.isFetching && !query.isError ? query.data : undefined;
    const forecast = value && 'totals' in value ? value : undefined;
    return (
        <section className={styles.stack} aria-label="Consultas financeiras">
            <h2>Compromissos de {month}</h2>
            {memberId && (
                <p>
                    O filtro seleciona compromissos e fatos ligados ao membro.
                    Cada valor e total mantém o montante original do compromisso
                    ou fato, não a participação econômica individual. O executor
                    indicado pode ser outro membro.
                </p>
            )}
            <div className={styles.filters}>
                <div className={styles.filter}>
                    <label htmlFor="financial-view">Visão financeira</label>
                    <select
                        id="financial-view"
                        value={view}
                        onChange={(event) =>
                            onView(event.target.value as typeof view)
                        }
                    >
                        <option value="CALENDAR">Calendário</option>
                        <option value="HISTORY">Histórico</option>
                        <option value="FORECAST">Previsão</option>
                    </select>
                </div>
                <Button
                    variant="outline"
                    type="button"
                    disabled={query.isFetching}
                    onClick={() =>
                        selection.cursor === null
                            ? void query.refetch()
                            : setSelection({ ...selection, cursor: null })
                    }
                >
                    Atualizar compromissos / Voltar ao início
                </Button>
            </div>
            {view === 'FORECAST' ? (
                <p>
                    Receitas futuras e despesas ainda pendentes no período.
                    Despesas atrasadas mantêm sua data original. Os valores de
                    previsão não representam saldo bancário.
                </p>
            ) : (
                <p>
                    Compromissos e realizações são fatos diferentes. Não some as
                    linhas como novas despesas. O histórico preserva a data real
                    e a data de cadastro.
                </p>
            )}
            {(query.isPending || query.isFetching) && (
                <FinancialLoading label="Carregando consultas financeiras…" />
            )}
            {query.isError && (
                <div className={styles.feedback}>
                    <p role="alert">
                        Não foi possível consultar os compromissos financeiros.
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void query.refetch()}
                    >
                        Tentar novamente os compromissos
                    </Button>
                </div>
            )}
            {value && (
                <>
                    <p>
                        Referência:{' '}
                        <time dateTime={value.referenceDate}>
                            {formatDate(value.referenceDate)}
                        </time>
                        . Totais de todo o recorte, independentes da página.
                    </p>
                    {forecast && (
                        <>
                            <dl
                                className={styles.totals}
                                aria-label="Previsão de receitas"
                            >
                                <div>
                                    <dt>Receitas previstas</dt>
                                    <dd>
                                        {formatReviewMoney(
                                            forecast.totals
                                                .expectedAmountInCents,
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt>
                                        Já recebido dos compromissos previstos
                                    </dt>
                                    <dd>
                                        {formatReviewMoney(
                                            forecast.totals
                                                .receivedAmountInCents,
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Restante futuro conhecido</dt>
                                    <dd>
                                        {formatReviewMoney(
                                            forecast.totals
                                                .remainingAmountInCents,
                                        )}
                                    </dd>
                                </div>
                            </dl>
                            {forecast.totals.expectedExpenseAmountInCents !==
                                undefined && (
                                <dl
                                    className={styles.totals}
                                    aria-label="Previsão de despesas"
                                >
                                    <div>
                                        <dt>Despesas previstas</dt>
                                        <dd>
                                            {formatReviewMoney(
                                                forecast.totals
                                                    .expectedExpenseAmountInCents,
                                            )}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>
                                            Já realizado das despesas previstas
                                        </dt>
                                        <dd>
                                            {formatReviewMoney(
                                                forecast.totals
                                                    .fulfilledExpenseAmountInCents ??
                                                    '0',
                                            )}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>Restante das despesas previstas</dt>
                                        <dd>
                                            {formatReviewMoney(
                                                forecast.totals
                                                    .remainingExpenseAmountInCents ??
                                                    '0',
                                            )}
                                        </dd>
                                    </div>
                                </dl>
                            )}
                            {!!forecast.totals.unknownAmountCount && (
                                <p className={styles.notice}>
                                    {forecast.totals.unknownAmountCount}{' '}
                                    compromisso(s) com valor a definir. Esses
                                    valores não entram nos totais conhecidos.
                                </p>
                            )}
                            {!!forecast.globalCorrections?.length && (
                                <section
                                    className={styles.stack}
                                    aria-label="Correções globais de planos"
                                >
                                    <h3>Correções globais de planos</h3>
                                    <p>
                                        Os valores abrangem o plano inteiro e
                                        não são abatidos das parcelas ou dos
                                        totais mensais. Confira o saldo global
                                        no plano.
                                    </p>
                                    <ul className={styles.list}>
                                        {forecast.globalCorrections.map(
                                            (correction) => (
                                                <li
                                                    key={
                                                        correction.commitmentId
                                                    }
                                                >
                                                    <dl>
                                                        <dt>
                                                            Ajuste global do
                                                            plano
                                                        </dt>
                                                        <dd>
                                                            {formatReviewMoney(
                                                                correction.globalAdjustmentInCents,
                                                            )}
                                                        </dd>
                                                        <dt>
                                                            Restante global do
                                                            plano
                                                        </dt>
                                                        <dd>
                                                            {formatReviewMoney(
                                                                correction.globalRemainingAmountInCents,
                                                            )}
                                                        </dd>
                                                    </dl>
                                                    <Link
                                                        href={`/spaces/${spaceId}/finances/commitments/${correction.commitmentId}`}
                                                    >
                                                        Conferir plano
                                                    </Link>
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                </section>
                            )}
                        </>
                    )}
                    {value.items.length === 0 ? (
                        <p className={styles.empty}>
                            {view === 'FORECAST'
                                ? 'Nenhum compromisso futuro conhecido neste período.'
                                : 'Nenhum fato financeiro neste período para este filtro.'}
                        </p>
                    ) : (
                        <ol
                            className={styles.list}
                            aria-label={
                                view === 'FORECAST'
                                    ? 'Compromissos futuros conhecidos'
                                    : 'Fatos financeiros'
                            }
                        >
                            {value.items.map((item, index) => (
                                <li key={`${item.type}:${item.id}`}>
                                    {view === 'CALENDAR' &&
                                        (index === 0 ||
                                            value.items[index - 1]
                                                .relevantDate !==
                                                item.relevantDate) && (
                                            <h3>
                                                <time
                                                    dateTime={item.relevantDate}
                                                >
                                                    {formatDate(
                                                        item.relevantDate,
                                                    )}
                                                </time>
                                            </h3>
                                        )}
                                    <h3>{item.description}</h3>
                                    <p>
                                        {labels[item.type]}:{' '}
                                        {item.amountInCents === null
                                            ? 'Valor a definir'
                                            : formatMoney(item.amountInCents)}
                                    </p>
                                    {'remainingAmountInCents' in item && (
                                        <ForecastAmounts
                                            item={item as FinancialForecastItem}
                                        />
                                    )}
                                    {item.reason && (
                                        <p>Motivo: {item.reason}</p>
                                    )}
                                    <p>
                                        {item.dateNature === 'EXPECTED'
                                            ? 'Data prevista'
                                            : 'Data real do fato'}
                                        :{' '}
                                        <time dateTime={item.relevantDate}>
                                            {formatDate(item.relevantDate)}
                                        </time>
                                    </p>
                                    <p>
                                        Cadastrado em:{' '}
                                        <time dateTime={item.registeredAt}>
                                            {new Intl.DateTimeFormat('pt-BR', {
                                                timeZone: 'America/Sao_Paulo',
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                            }).format(
                                                new Date(item.registeredAt),
                                            )}
                                        </time>
                                    </p>
                                    <p>
                                        Autor do registro:{' '}
                                        {value.members.find(
                                            (member) =>
                                                member.personId ===
                                                item.recordedByPersonId,
                                        )?.displayName ??
                                            (value.spaceType === 'PERSONAL'
                                                ? 'Você'
                                                : 'Pessoa do espaço')}
                                    </p>
                                    {(item.participantMemberId ||
                                        item.participantPersonId) && (
                                        <p>
                                            {participantLabel(item.type)}:{' '}
                                            {item.participantMemberId
                                                ? (value.members.find(
                                                      (member) =>
                                                          member.memberId ===
                                                          item.participantMemberId,
                                                  )?.displayName ??
                                                  'Membro do espaço')
                                                : 'Você'}
                                        </p>
                                    )}
                                    {item.type === 'EXPECTED_INCOME' &&
                                        !item.participantMemberId &&
                                        !item.participantPersonId && (
                                            <p>
                                                Recebedor previsto: não
                                                informado.
                                            </p>
                                        )}
                                    {item.recipientMemberId && (
                                        <p>
                                            Destinatário da transferência:{' '}
                                            {value.members.find(
                                                (member) =>
                                                    member.memberId ===
                                                    item.recipientMemberId,
                                            )?.displayName ??
                                                'Membro do espaço'}
                                        </p>
                                    )}
                                    <Link href={originPath(spaceId, item)}>
                                        {item.type === 'INTERNAL_TRANSFER'
                                            ? 'Ver transferência'
                                            : item.type.startsWith('INTERNAL_')
                                              ? 'Ver acertos'
                                              : `Ver compromisso: ${item.description}`}
                                    </Link>
                                    {item.externalLiabilityId && (
                                        <Link
                                            href={`/spaces/${spaceId}/expenses/${item.commitmentId}#external-liability-${item.externalLiabilityId}`}
                                        >
                                            Ver obrigação e liquidações na
                                            origem
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                    {value.nextCursor ? (
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() =>
                                setSelection({
                                    ...selection,
                                    cursor: value.nextCursor,
                                })
                            }
                        >
                            Próxima página de compromissos
                        </Button>
                    ) : (
                        value.items.length > 0 && (
                            <p role="status">
                                Fim dos compromissos neste filtro.
                            </p>
                        )
                    )}
                </>
            )}
        </section>
    );
}
function originPath(spaceId: string, item: FinancialReviewItem) {
    if (item.type === 'INTERNAL_TRANSFER')
        return `/spaces/${spaceId}/finances/settlements/transfers/${item.id}`;
    if (!item.commitmentId) return `/spaces/${spaceId}/finances/settlements`;
    return `/spaces/${spaceId}/finances/commitments/${item.commitmentId}`;
}

function ForecastAmounts({ item }: { item: FinancialForecastItem }) {
    return (
        <>
            <p>
                {item.type === 'EXPECTED_EXPENSE' ? 'Realizado' : 'Recebido'}:{' '}
                {formatMoney(
                    item.fulfilledAmountInCents ?? item.receivedAmountInCents,
                )}{' '}
                · Restante:{' '}
                {item.remainingAmountInCents === null
                    ? 'Valor a definir'
                    : formatMoney(item.remainingAmountInCents)}
            </p>
            {item.expectedAmountInCents !== undefined && (
                <p>
                    Previsão original:{' '}
                    {item.expectedAmountInCents === null
                        ? 'Valor a definir'
                        : formatMoney(item.expectedAmountInCents)}
                </p>
            )}
            {item.overdue && (
                <p>Em atraso. A data prevista original foi preservada.</p>
            )}
        </>
    );
}

function participantLabel(type: FinancialReviewItemType) {
    switch (type) {
        case 'EXTERNAL_LIABILITY':
        case 'EXTERNAL_SETTLEMENT':
            return 'Titular';
        case 'EXPECTED_INCOME':
            return 'Recebedor previsto';
        case 'EXPECTED_EXPENSE':
            return 'Pagador previsto';
        case 'RECEIPT':
            return 'Recebedor efetivo';
        case 'DISBURSEMENT':
            return 'Pagador efetivo';
        case 'INTERNAL_TRANSFER':
            return 'Remetente da transferência';
        case 'EXPENSE':
            return 'Responsável econômico';
        default:
            return 'Pessoa vinculada ao fato';
    }
}
