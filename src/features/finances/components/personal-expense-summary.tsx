import type {
    PersonalExpenseDetail,
    DisbursementMethod,
} from '../types/personal-expense';
import { formatDate, formatMoney } from '../utils/expense-money';
import styles from './expenses.module.css';

export const disbursementMethodLabels: Record<DisbursementMethod, string> = {
    PIX: 'PIX',
    DEBIT: 'Débito',
    CASH: 'Dinheiro',
};
export function PersonalExpenseSummary({
    value,
}: {
    value: PersonalExpenseDetail;
}) {
    const first = value.disbursements[0];
    const card = !!value.externalLiabilities?.length;
    return (
        <div className={styles.summary}>
            <h2>{value.commitment.description}</h2>
            <dl aria-label="Despesa e desembolso">
                <dt>Valor da despesa</dt>
                <dd>{formatMoney(value.commitment.amountInCents)}</dd>
                <dt>Valor desembolsado</dt>
                <dd>{formatMoney(value.paidAmountInCents)}</dd>
                {card && (
                    <>
                        <dt>No seu cartão</dt>
                        <dd>{formatMoney(value.assumedAmountInCents ?? 0)}</dd>
                        <dt>Saiu da conta agora</dt>
                        <dd>{formatMoney(value.paidAmountInCents)}</dd>
                        <dt>Obrigação externa aberta</dt>
                        <dd>
                            {formatMoney(
                                value.externalOutstandingAmountInCents ?? 0,
                            )}
                        </dd>
                        <dt>Suporte acumulado</dt>
                        <dd>
                            {formatMoney(value.supportedAmountInCents ?? 0)}
                        </dd>
                    </>
                )}
                <dt>{card ? 'Restante a realizar' : 'Falta pagar'}</dt>
                <dd>{formatMoney(value.remainingAmountInCents)}</dd>
                <dt>Condição</dt>
                <dd>
                    {card
                        ? value.remainingAmountInCents > 0
                            ? 'Parcialmente realizada'
                            : 'Realizada integralmente'
                        : value.status === 'PARTIALLY_PAID'
                          ? 'Parcialmente paga'
                          : 'Paga integralmente'}
                </dd>
                {first && (
                    <>
                        <dt>Meio do primeiro pagamento</dt>
                        <dd>{disbursementMethodLabels[first.method]}</dd>
                    </>
                )}
                <dt>Data do fato</dt>
                <dd>
                    <time dateTime={value.commitment.factDate}>
                        {formatDate(value.commitment.factDate)}
                    </time>
                </dd>
                {first && (
                    <>
                        <dt>Data do primeiro pagamento</dt>
                        <dd>
                            <time dateTime={first.factDate}>
                                {formatDate(first.factDate)}
                            </time>
                        </dd>
                    </>
                )}
            </dl>
        </div>
    );
}
