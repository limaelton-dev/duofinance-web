import Link from 'next/link';
import type {
    FinancialOverview,
    FinancialReviewMetrics,
} from '../types/financial-review';
import { formatReviewMoney } from '../utils/financial-review';
import { formatDate } from '../utils/expense-money';
import styles from './finances-summary.module.css';

function Metrics({
    value,
    member = false,
    personal = false,
}: {
    value: FinancialReviewMetrics;
    member?: boolean;
    personal?: boolean;
}) {
    return (
        <>
            <h3>Resultado econômico do mês</h3>
            <dl
                className={styles.totals}
                aria-label="Resultado econômico do mês"
            >
                <Metric
                    label={
                        member
                            ? 'Responsabilidade original nas despesas'
                            : 'Despesas econômicas registradas'
                    }
                    value={value.expenseAmountInCents}
                />
                <Metric
                    label={
                        member
                            ? 'Participação econômica em receitas realizadas'
                            : 'Receitas realizadas'
                    }
                    value={value.realizedIncomeAmountInCents}
                />
                <Metric
                    label="Resultado econômico: receitas realizadas menos despesas"
                    value={value.economicResultInCents}
                />
            </dl>
            <h3>Caixa, cartão e suporte do mês</h3>
            <dl
                className={styles.totals}
                aria-label="Caixa, cartão e suporte do mês"
            >
                <Metric
                    label="Pagamentos diretos de despesas"
                    value={value.paidAmountInCents}
                />
                <Metric
                    label="Liquidações externas"
                    value={value.externalSettledAmountInCents}
                />
                <Metric
                    label="Desembolsado em despesas e liquidações"
                    value={value.disbursedAmountInCents}
                />
                <Metric
                    label="Dinheiro recebido diretamente"
                    value={value.receivedAmountInCents}
                />
                <Metric
                    label="Obrigações externas assumidas no cartão"
                    value={value.assumedAmountInCents}
                />
                <Metric
                    label="Valor suportado: pagamentos diretos e obrigações assumidas"
                    value={value.supportedAmountInCents}
                />
            </dl>
            {!personal && (
                <>
                    <h3>Transferências internas do mês</h3>
                    <dl
                        className={styles.totals}
                        aria-label="Transferências internas do mês"
                    >
                        <Metric
                            label="Transferências internas enviadas"
                            value={value.internalTransfersSentAmountInCents}
                        />
                        <Metric
                            label="Transferências internas recebidas"
                            value={value.internalTransfersReceivedAmountInCents}
                        />
                    </dl>
                </>
            )}
        </>
    );
}
function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt>{label}</dt>
            <dd>{formatReviewMoney(value)}</dd>
        </div>
    );
}
export function FinancialOverviewSection({
    value,
    shared,
}: {
    value: FinancialOverview;
    shared: boolean;
}) {
    const memberName = (id: string) =>
        value.members.find((member) => member.memberId === id)?.displayName ??
        'Membro do espaço';
    return (
        <section className={styles.stack} aria-label="Resumo financeiro do mês">
            <h2>Resumo de {value.month}</h2>
            {value.memberId && (
                <p>
                    Recorte de {memberName(value.memberId)}: responsabilidade e
                    participação econômica próprias; caixa pelos fatos
                    executados e cartão pelo titular.
                </p>
            )}
            <p>
                Referência da consulta:{' '}
                <time dateTime={value.referenceDate}>
                    {formatDate(value.referenceDate)}
                </time>
                . Valores em reais (BRL) de todo o período.
            </p>
            <Metrics
                value={value.totals}
                member={value.memberId !== null}
                personal={!shared}
            />
            <p>
                A responsabilidade original da despesa é reconhecida uma vez.
                Receitas realizadas seguem a data dos recebimentos. Liquidações
                não criam outra despesa. O valor suportado mantém o que foi pago
                diretamente ou assumido no cartão.
            </p>
            {shared && (
                <p>
                    Transferências internas são exibidas separadamente do
                    resultado econômico, do desembolso em despesas e do valor
                    suportado.
                </p>
            )}
            {shared &&
                value.memberId === null &&
                value.byMember.map((member) => (
                    <section
                        className={styles.stack}
                        key={member.memberId}
                        aria-label={`Valores de ${memberName(member.memberId)}`}
                    >
                        <h2>{memberName(member.memberId)}</h2>
                        <Metrics value={member} member />
                    </section>
                ))}
            <section
                className={styles.stack}
                aria-label="Obrigações externas em aberto agora"
            >
                <h2>Em aberto agora</h2>
                <p>
                    Obrigações externas de todas as datas, na referência de{' '}
                    <time
                        dateTime={
                            value.currentExternalLiabilities.referenceDate
                        }
                    >
                        {formatDate(
                            value.currentExternalLiabilities.referenceDate,
                        )}
                    </time>
                    . Este quadro não representa o saldo no fim do mês
                    selecionado.
                </p>
                <dl className={styles.totals}>
                    <Metric
                        label="Obrigações externas abertas agora"
                        value={
                            value.currentExternalLiabilities
                                .outstandingAmountInCents
                        }
                    />
                </dl>
                {shared &&
                    value.currentExternalLiabilities.byMember.map((member) => (
                        <div key={member.memberId}>
                            <p>
                                {memberName(member.memberId)}:{' '}
                                {formatReviewMoney(
                                    member.outstandingAmountInCents,
                                )}
                            </p>
                            <Link
                                href={`/spaces/${value.spaceId}/finances/external-liabilities?memberId=${member.memberId}`}
                            >
                                Ver obrigações de {memberName(member.memberId)}
                            </Link>
                        </div>
                    ))}
                <p>
                    O aberto atual diminui com a liquidação; o histórico de
                    assunção e o valor suportado são preservados.
                </p>
            </section>
        </section>
    );
}
