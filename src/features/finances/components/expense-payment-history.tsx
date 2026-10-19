import styles from './financial-records.module.css';
import type { PersonalExpenseDetail } from '../types/personal-expense';
import type { ExpenseView, Member } from '../types/shared-expense';
import { formatDate, formatMoney } from '../utils/expense-money';
import { disbursementMethodLabels } from './personal-expense-summary';

export function ExpensePaymentHistory({
    value,
    personId,
    members = [],
}: {
    value: ExpenseView | PersonalExpenseDetail;
    personId: string;
    members?: Member[];
}) {
    const person = (id: string) =>
        id === personId
            ? 'Você'
            : (members.find((m) => m.personId === id)?.displayName ??
              'Pessoa do registro');
    const facts = [
        ...value.disbursements.map((fact) => ({
            ...fact,
            kind: 'CASH' as const,
        })),
        ...(value.externalLiabilities ?? []).map((fact) => ({
            ...fact,
            kind: 'CREDIT_CARD' as const,
        })),
    ].sort(
        (a, b) =>
            (a.sequence ?? 0) - (b.sequence ?? 0) ||
            a.registeredAt.localeCompare(b.registeredAt) ||
            a.id.localeCompare(b.id),
    );
    return (
        <section
            className={styles.stack}
            aria-label={
                value.externalLiabilities?.length
                    ? 'Histórico de realizações'
                    : 'Histórico de pagamentos'
            }
        >
            <h3>
                {value.externalLiabilities?.length
                    ? 'Histórico de realizações'
                    : 'Pagamentos realizados'}
            </h3>
            {facts.length === 0 && (
                <p className={styles.empty}>
                    Nenhum pagamento realizado. Os próximos registros aparecerão
                    aqui.
                </p>
            )}
            <ol>
                {facts.map((fact) => (
                    <li key={fact.id}>
                        <p>
                            {formatMoney(fact.amountInCents)} ·{' '}
                            {fact.kind === 'CREDIT_CARD'
                                ? 'Cartão de crédito'
                                : disbursementMethodLabels[fact.method]}{' '}
                            ·{' '}
                            <time dateTime={fact.factDate}>
                                {formatDate(fact.factDate)}
                            </time>
                        </p>
                        <p>
                            {fact.kind === 'CREDIT_CARD'
                                ? 'No cartão de'
                                : 'payerMemberId' in fact
                                  ? 'Quem pagou'
                                  : 'Titular do pagamento'}
                            :{' '}
                            {fact.kind === 'CREDIT_CARD'
                                ? fact.holderMemberId
                                    ? (members.find(
                                          (m) =>
                                              m.memberId ===
                                              fact.holderMemberId,
                                      )?.displayName ?? 'Membro do registro')
                                    : person(fact.holderPersonId ?? '')
                                : 'payerMemberId' in fact
                                  ? (members.find(
                                        (m) =>
                                            m.memberId === fact.payerMemberId,
                                    )?.displayName ?? 'Membro do registro')
                                  : person(fact.payerPersonId)}
                            .
                        </p>
                        {fact.kind === 'CREDIT_CARD' && (
                            <p>
                                Obrigação externa aberta:{' '}
                                {formatMoney(fact.remainingAmountInCents)}
                            </p>
                        )}
                        <p>
                            Registrado por:{' '}
                            {person(
                                fact.recordedByPersonId ??
                                    value.commitment.createdByPersonId,
                            )}
                            .
                        </p>
                    </li>
                ))}
            </ol>
        </section>
    );
}
