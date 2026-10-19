import type { ExpenseView, Member } from '../types/shared-expense';
import { formatMoney, formatDate } from '../utils/expense-money';
import styles from './expenses.module.css';

export function ExpenseSummary({
    value,
    members,
    personId,
}: {
    value: ExpenseView;
    members: Member[];
    personId: string;
}) {
    const label = (id: string) =>
        members.find((m) => m.memberId === id)?.displayName ??
        'Membro do registro';
    const first = value.disbursements[0];
    const card = !!value.externalLiabilities?.length;
    const own = members.find((m) => m.personId === personId)?.memberId;
    const openObligations = value.obligations.filter(
        (item) => item.remainingAmountInCents > 0,
    );
    const condition = card
        ? value.remainingAmountInCents > 0
            ? 'Parcialmente realizada'
            : 'Realizada integralmente'
        : value.status === 'PARTIALLY_PAID'
          ? 'Parcialmente paga'
          : 'Paga integralmente';
    return (
        <section className={styles.receipt} aria-label="Resumo da despesa">
            <h2>{value.commitment.description}</h2>
            <p className={styles.amount}>
                {formatMoney(value.commitment.amountInCents)}
            </p>
            <p className={styles.status}>{condition}</p>
            <p className={styles.help}>
                {card ? 'Data do fato' : 'Data do pagamento'}:{' '}
                <time dateTime={value.commitment.factDate}>
                    {formatDate(value.commitment.factDate)}
                </time>
            </p>
            <div className={styles.receiptSection}>
                <h3>Divisão da despesa</h3>
                <p>
                    Sua parte:{' '}
                    <strong>
                        {formatMoney(
                            value.commitment.responsibilitySplit.calculatedShares.find(
                                (s) => s.memberId === own,
                            )?.amountInCents ?? 0,
                        )}
                    </strong>
                </p>
                {value.commitment.responsibilitySplit.calculatedShares
                    .filter((s) => s.memberId !== own)
                    .map((s) => (
                        <p key={s.memberId}>
                            {label(s.memberId)}:{' '}
                            <strong>{formatMoney(s.amountInCents)}</strong>
                        </p>
                    ))}
                {value.commitment.expectedPayerMemberId && (
                    <p className={styles.help}>
                        Responsável previsto:{' '}
                        {label(value.commitment.expectedPayerMemberId)}
                    </p>
                )}
            </div>
            <div className={styles.receiptSection}>
                <h3>{card ? 'Cartão e pagamentos' : 'Pagamento'}</h3>
                <p>
                    {card ? 'Pagamentos diretos da despesa' : 'Pago acumulado'}:{' '}
                    <strong>{formatMoney(value.paidAmountInCents)}</strong>
                </p>
                {value.remainingAmountInCents > 0 && (
                    <p>
                        {card ? 'Restante a realizar' : 'Falta pagar'}:{' '}
                        <strong>
                            {formatMoney(value.remainingAmountInCents)}
                        </strong>
                    </p>
                )}
                {card && (
                    <>
                        <p>
                            Pago ao credor do cartão:{' '}
                            {formatMoney(
                                value.externalSettledAmountInCents ?? 0,
                            )}
                        </p>
                        {value.externalLiabilities?.map((fact) => (
                            <p key={fact.id}>
                                No cartão de {label(fact.holderMemberId ?? '')}:{' '}
                                {formatMoney(fact.amountInCents)}
                            </p>
                        ))}
                        <p>
                            Obrigação externa aberta:{' '}
                            {formatMoney(
                                value.externalOutstandingAmountInCents ?? 0,
                            )}
                        </p>
                        <p>
                            Suporte acumulado:{' '}
                            {formatMoney(value.supportedAmountInCents ?? 0)}
                        </p>
                    </>
                )}
                {first && (
                    <>
                        <p>
                            Primeiro pagamento por: {label(first.payerMemberId)}{' '}
                            · {formatMoney(first.amountInCents)}
                        </p>
                        <p className={styles.help}>
                            Forma:{' '}
                            {
                                {
                                    PIX: 'PIX',
                                    DEBIT: 'Débito',
                                    CASH: 'Dinheiro',
                                }[first.method]
                            }
                        </p>
                    </>
                )}
            </div>
            <div className={styles.receiptSection}>
                <h3>Acerto entre vocês</h3>
                {openObligations.length > 0 ? (
                    openObligations.map((item) => (
                        <p key={item.id}>
                            Falta acertar: {label(item.debtorMemberId)} deve{' '}
                            <strong>
                                {formatMoney(item.remainingAmountInCents)}
                            </strong>{' '}
                            a {label(item.creditorMemberId)}
                        </p>
                    ))
                ) : (
                    <p>Não há valor a acertar</p>
                )}
                <p className={styles.help}>
                    Acerto:{' '}
                    {value.settlementCycle
                        ? formatDate(value.settlementCycle.targetDate)
                        : 'Sem data de acerto'}
                </p>
                {value.settlementCycle?.status === 'FINALIZED' && (
                    <p>Acerto finalizado</p>
                )}
            </div>
        </section>
    );
}
