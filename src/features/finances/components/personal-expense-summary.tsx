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
    return (
        <div className={styles.summary}>
            <h2>{value.commitment.description}</h2>
            <dl aria-label="Despesa e desembolso">
                <dt>Valor da despesa</dt>
                <dd>{formatMoney(value.commitment.amountInCents)}</dd>
                <dt>Valor desembolsado</dt>
                <dd>{formatMoney(value.disbursement.amountInCents)}</dd>
                <dt>Meio do desembolso</dt>
                <dd>{disbursementMethodLabels[value.disbursement.method]}</dd>
                <dt>Data do fato</dt>
                <dd>
                    <time dateTime={value.commitment.factDate}>
                        {formatDate(value.commitment.factDate)}
                    </time>
                </dd>
                <dt>Data do desembolso</dt>
                <dd>
                    <time dateTime={value.disbursement.factDate}>
                        {formatDate(value.disbursement.factDate)}
                    </time>
                </dd>
            </dl>
        </div>
    );
}
