import type {
    Member,
    ExpenseOptions,
    Settlement,
} from '../types/shared-expense';
import { formatDate, formatMoney } from '../utils/expense-money';

import styles from './expenses.module.css';

export function ExpenseLiveSummary({
    description,
    total,
    spaceLabel,
    calculated,
    actorMemberId,
    members,
    residualRecipient,
    method,
    actualPayer,
    paid,
    expected,
    selectedMode,
    suggested,
    targetDate,
    cycleId,
    openCycles,
}: {
    description: string;
    total: number | null;
    spaceLabel: string | undefined;
    calculated: { memberId: string; amountInCents: number }[];
    actorMemberId: string | undefined;
    members: Member[];
    residualRecipient: { memberId: string } | null | undefined;
    method: '' | 'PIX' | 'DEBIT' | 'CASH' | 'CREDIT_CARD';
    actualPayer: string;
    paid: number | null;
    expected: string | null;
    selectedMode: Settlement['mode'];
    suggested: string | null;
    targetDate: string;
    cycleId: string;
    openCycles: ExpenseOptions['openCycles'];
}) {
    const creditCard = method === 'CREDIT_CARD';
    return (
        <aside className={styles.summary} aria-label="Resumo vivo">
            <h2>Confira sua despesa</h2>
            <p>{description.trim() || 'Sua despesa'}</p>
            <p className={styles.amount}>
                {total !== null && total > 0 ? formatMoney(total) : 'R$ 0,00'}
            </p>
            <p className={styles.context}>{spaceLabel}</p>
            <div className={styles.receiptSection}>
                {calculated.length ? (
                    calculated.map((share) => (
                        <p key={share.memberId}>
                            {share.memberId === actorMemberId
                                ? 'Sua parte'
                                : 'Parte de ' +
                                  members.find(
                                      (m) => m.memberId === share.memberId,
                                  )?.displayName}
                            :{' '}
                            <strong>{formatMoney(share.amountInCents)}</strong>
                        </p>
                    ))
                ) : (
                    <p className={styles.help}>
                        Preencha o valor para conferir a divisão.
                    </p>
                )}
                {residualRecipient && (
                    <p className={styles.help}>
                        O centavo residual foi atribuído a{' '}
                        {
                            members.find(
                                (member) =>
                                    member.memberId ===
                                    residualRecipient.memberId,
                            )?.displayName
                        }{' '}
                        e está incluído na parte acima.
                    </p>
                )}
            </div>
            <div className={styles.receiptSection}>
                {!method ? (
                    <p className={styles.help}>
                        Escolha como a despesa foi realizada para conferir o
                        pagamento e o acerto.
                    </p>
                ) : (
                    <>
                        <p>
                            {creditCard ? 'No cartão de' : 'Pago por'}:{' '}
                            <strong>
                                {members.find((m) => m.memberId === actualPayer)
                                    ?.displayName ?? 'Escolha a pessoa'}
                            </strong>
                        </p>
                        <p>
                            {creditCard
                                ? 'Valor assumido no cartão'
                                : 'Valor pago agora'}
                            :{' '}
                            <strong>
                                {paid !== null && paid > 0
                                    ? formatMoney(paid)
                                    : 'Confira o valor'}
                            </strong>
                        </p>
                        {!creditCard && (
                            <p className={styles.help}>
                                Forma:{' '}
                                {
                                    {
                                        PIX: 'PIX',
                                        DEBIT: 'Débito',
                                        CASH: 'Dinheiro',
                                    }[method]
                                }
                            </p>
                        )}
                        {creditCard && (
                            <p>Saiu da conta agora: {formatMoney(0)}.</p>
                        )}
                        {paid !== null && paid > 0 && paid === total ? (
                            <p>
                                {creditCard
                                    ? 'O valor informado no cartão cobre o total da despesa.'
                                    : 'O pagamento informado cobre o total da despesa.'}
                            </p>
                        ) : (
                            <p>
                                {creditCard
                                    ? 'Restante a realizar'
                                    : 'Falta pagar'}
                                :{' '}
                                {total !== null &&
                                paid !== null &&
                                paid < total &&
                                paid > 0
                                    ? formatMoney(total - paid)
                                    : 'Confira os valores'}
                                .
                            </p>
                        )}
                        {paid !== null &&
                            total !== null &&
                            paid > 0 &&
                            paid <= total &&
                            actualPayer &&
                            calculated.length > 0 && (
                                <p>
                                    <strong>Falta acertar: </strong>
                                    {members
                                        .filter(
                                            (m) => m.memberId !== actualPayer,
                                        )
                                        .map((m) => {
                                            const payerShare =
                                                calculated.find(
                                                    (share) =>
                                                        share.memberId ===
                                                        actualPayer,
                                                )?.amountInCents ?? 0;
                                            const excess = Math.max(
                                                0,
                                                paid - payerShare,
                                            );
                                            return excess > 0
                                                ? m.displayName +
                                                      ' deve ' +
                                                      formatMoney(excess) +
                                                      ' a ' +
                                                      members.find(
                                                          (holder) =>
                                                              holder.memberId ===
                                                              actualPayer,
                                                      )?.displayName
                                                : 'Não há valor a acertar';
                                        })
                                        .join('; ') || 'Não há valor a acertar'}
                                    .
                                </p>
                            )}
                    </>
                )}
                {expected && (
                    <p className={styles.help}>
                        Responsável previsto:{' '}
                        {members.find((m) => m.memberId === expected)
                            ?.displayName ?? 'Membro do registro'}
                    </p>
                )}
            </div>
            <p>
                Acerto:{' '}
                {selectedMode === 'SUGGESTED' && suggested
                    ? formatDate(suggested)
                    : selectedMode === 'DATE' && targetDate
                      ? formatDate(targetDate)
                      : selectedMode === 'CYCLE' && cycleId
                        ? formatDate(
                              openCycles.find((c) => c.id === cycleId)
                                  ?.targetDate ?? '',
                          )
                        : 'Sem data de acerto'}
            </p>
            <p className={styles.preview}>
                Esta é uma prévia. Ao salvar, confira o resultado confirmado da
                despesa.
            </p>
        </aside>
    );
}
