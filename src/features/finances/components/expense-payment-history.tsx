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
    return (
        <section aria-label="Histórico de pagamentos">
            <h3>Pagamentos realizados</h3>
            <ol>
                {value.disbursements.map((fact) => (
                    <li key={fact.id}>
                        <p>
                            {formatMoney(fact.amountInCents)} ·{' '}
                            {disbursementMethodLabels[fact.method]} ·{' '}
                            <time dateTime={fact.factDate}>
                                {formatDate(fact.factDate)}
                            </time>
                        </p>
                        <p>
                            Quem pagou:{' '}
                            {'payerMemberId' in fact
                                ? (members.find(
                                      (m) => m.memberId === fact.payerMemberId,
                                  )?.displayName ?? 'Membro do registro')
                                : person(fact.payerPersonId)}
                            .
                        </p>
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
