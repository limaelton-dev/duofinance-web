import type { ExpenseView, Member } from '../types/shared-expense';
import { formatMoney, formatDate } from '../utils/expense-money';
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
    const own = members.find((m) => m.personId === personId)?.memberId;
    return (
        <section aria-label="Resumo da despesa">
            <h2>Resumo</h2>
            <p>
                {value.commitment.description} ·{' '}
                {formatMoney(value.commitment.amountInCents)}
            </p>
            <p>Pago acumulado: {formatMoney(value.paidAmountInCents)}</p>
            <p>Falta pagar: {formatMoney(value.remainingAmountInCents)}</p>
            <p>
                {value.status === 'PARTIALLY_PAID'
                    ? 'Parcialmente paga'
                    : 'Paga integralmente'}
            </p>
            <p>
                Sua parte:{' '}
                {formatMoney(
                    value.commitment.responsibilitySplit.calculatedShares.find(
                        (s) => s.memberId === own,
                    )?.amountInCents ?? 0,
                )}
            </p>
            {value.commitment.responsibilitySplit.calculatedShares.map((s) => (
                <p key={s.memberId}>
                    {label(s.memberId)}: {formatMoney(s.amountInCents)}
                </p>
            ))}
            {value.commitment.expectedPayerMemberId && (
                <p>
                    Responsável previsto:{' '}
                    {label(value.commitment.expectedPayerMemberId)}
                </p>
            )}
            <p>
                Primeiro pagamento por: {label(first.payerMemberId)} ·{' '}
                {formatMoney(first.amountInCents)}
            </p>
            <p>
                Forma:{' '}
                {
                    { PIX: 'PIX', DEBIT: 'Débito', CASH: 'Dinheiro' }[
                        first.method
                    ]
                }
            </p>
            {value.obligation && value.obligation.remainingAmountInCents > 0 ? (
                <p>
                    Falta acertar: {label(value.obligation.debtorMemberId)} deve{' '}
                    {formatMoney(value.obligation.remainingAmountInCents)} a{' '}
                    {label(value.obligation.creditorMemberId)}
                </p>
            ) : (
                <p>Não há valor a acertar</p>
            )}
            <p>
                Acerto:{' '}
                {value.settlementCycle
                    ? formatDate(value.settlementCycle.targetDate)
                    : 'Sem data de acerto'}
            </p>
            {value.settlementCycle?.status === 'FINALIZED' && (
                <p>Acerto finalizado</p>
            )}
        </section>
    );
}
