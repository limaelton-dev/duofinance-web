'use client';
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
    EXPECTED_INCOME: 'Receita prevista',
    DISBURSEMENT: 'Pagamento direto',
    RECEIPT: 'Recebimento realizado',
    EXTERNAL_LIABILITY: 'Obrigação externa assumida',
    EXTERNAL_SETTLEMENT: 'Liquidação externa',
    INTERNAL_TRANSFER: 'Transferência interna',
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
            <div className={styles.actions}>
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
                <button
                    type="button"
                    disabled={query.isFetching}
                    onClick={() =>
                        selection.cursor === null
                            ? void query.refetch()
                            : setSelection({ ...selection, cursor: null })
                    }
                >
                    Atualizar compromissos / Voltar ao início
                </button>
            </div>
            {view === 'FORECAST' ? (
                <p>
                    Somente o restante de compromissos futuros conhecidos, a
                    partir da referência de São Paulo. Atrasados não são
                    reprogramados.
                </p>
            ) : (
                <p>
                    Compromissos e realizações são fatos diferentes. Não some as
                    linhas como novas despesas. O histórico preserva a data real
                    e a data de cadastro.
                </p>
            )}
            {(query.isPending || query.isFetching) && (
                <p role="status" aria-busy="true">
                    Carregando consultas financeiras…
                </p>
            )}
            {query.isError && (
                <div>
                    <p role="alert">
                        Não foi possível consultar os compromissos financeiros.
                    </p>
                    <button type="button" onClick={() => void query.refetch()}>
                        Tentar novamente os compromissos
                    </button>
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
                        <dl
                            className={styles.totals}
                            aria-label="Previsão de receitas"
                        >
                            <div>
                                <dt>Receitas previstas</dt>
                                <dd>
                                    {formatReviewMoney(
                                        forecast.totals.expectedAmountInCents,
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt>Já recebido dos compromissos previstos</dt>
                                <dd>
                                    {formatReviewMoney(
                                        forecast.totals.receivedAmountInCents,
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt>Restante futuro conhecido</dt>
                                <dd>
                                    {formatReviewMoney(
                                        forecast.totals.remainingAmountInCents,
                                    )}
                                </dd>
                            </div>
                        </dl>
                    )}
                    {value.items.length === 0 ? (
                        <p>
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
                                        {formatMoney(item.amountInCents)}
                                    </p>
                                    {'remainingAmountInCents' in item && (
                                        <p>
                                            Recebido:{' '}
                                            {formatMoney(
                                                (item as FinancialForecastItem)
                                                    .receivedAmountInCents,
                                            )}{' '}
                                            · Restante:{' '}
                                            {formatMoney(
                                                (item as FinancialForecastItem)
                                                    .remainingAmountInCents,
                                            )}
                                        </p>
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
                                            : `Ver ${item.type === 'EXPECTED_INCOME' || item.type === 'RECEIPT' ? 'receita' : 'despesa'}: ${item.description}`}
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
                        <button
                            type="button"
                            onClick={() =>
                                setSelection({
                                    ...selection,
                                    cursor: value.nextCursor,
                                })
                            }
                        >
                            Próxima página de compromissos
                        </button>
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
    return `/spaces/${spaceId}/${item.type === 'EXPECTED_INCOME' || item.type === 'RECEIPT' ? 'incomes' : 'expenses'}/${item.commitmentId}`;
}

function participantLabel(type: FinancialReviewItemType) {
    switch (type) {
        case 'EXTERNAL_LIABILITY':
        case 'EXTERNAL_SETTLEMENT':
            return 'Titular';
        case 'EXPECTED_INCOME':
            return 'Recebedor previsto';
        case 'RECEIPT':
            return 'Recebedor efetivo';
        case 'DISBURSEMENT':
            return 'Pagador efetivo';
        case 'INTERNAL_TRANSFER':
            return 'Remetente da transferência';
        case 'EXPENSE':
            return 'Responsável econômico';
    }
}
