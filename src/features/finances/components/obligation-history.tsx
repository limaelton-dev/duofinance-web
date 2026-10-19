import Link from 'next/link';
import type { ExpenseView, Member } from '../types/shared-expense';
import type { IncomeDetail } from '../types/income';
import { formatMoney } from '../utils/expense-money';
import styles from './finances-summary.module.css';

export function ObligationHistory({
    spaceId,
    obligations,
    members = [],
}: {
    spaceId: string;
    obligations: (
        | NonNullable<ExpenseView['obligation']>
        | NonNullable<IncomeDetail['obligation']>
    )[];
    members?: Member[];
}) {
    const name = (id: string) =>
        members.find((m) => m.memberId === id)?.displayName ??
        'Membro do registro';
    if (!obligations.length) return null;
    return (
        <section aria-label="Histórico de pendências" className={styles.stack}>
            <h3>Histórico de pendências</h3>
            <ol className={styles.list}>
                {obligations.map((item) => (
                    <li key={item.id}>
                        <p>
                            {name(item.debtorMemberId)} →{' '}
                            {name(item.creditorMemberId)}
                        </p>
                        <p>
                            Valor original:{' '}
                            {formatMoney(item.originalAmountInCents)}. Valor
                            reconhecido:{' '}
                            {formatMoney(
                                item.recognizedAmountInCents ??
                                    item.originalAmountInCents,
                            )}
                            . Transferido:{' '}
                            {formatMoney(item.transferredAmountInCents ?? 0)}.
                            Falta acertar:{' '}
                            {formatMoney(item.remainingAmountInCents)}.
                        </p>
                        <p>
                            Pendência: {item.id} ·{' '}
                            {
                                {
                                    OPEN: 'Aberta',
                                    PARTIALLY_SETTLED: 'Parcialmente acertada',
                                    SETTLED: 'Acertada',
                                    WAIVED: 'Dispensada pelo credor',
                                    RECONCILED:
                                        'Encerrada por reconciliação dos fatos desta origem; este encerramento não representa uma transferência.',
                                }[item.status]
                            }
                        </p>
                        {item.history
                            ?.filter((event) => event.type === 'RECONCILED')
                            .map((event) => (
                                <p key={event.version}>
                                    Reconciliação: valor reconhecido de{' '}
                                    {formatMoney(
                                        event.snapshot
                                            .previousRecognizedAmountInCents ??
                                            item.originalAmountInCents,
                                    )}{' '}
                                    para{' '}
                                    {formatMoney(
                                        event.snapshot
                                            .recognizedAmountInCents ??
                                            item.recognizedAmountInCents,
                                    )}
                                    ; restante de{' '}
                                    {formatMoney(
                                        event.snapshot
                                            .previousRemainingAmountInCents ??
                                            0,
                                    )}{' '}
                                    para{' '}
                                    {formatMoney(
                                        event.snapshot.remainingAmountInCents ??
                                            item.remainingAmountInCents,
                                    )}
                                    . Atualização pelos fatos da origem, sem
                                    registrar transferência.
                                </p>
                            ))}
                        <Link
                            href={`/spaces/${spaceId}/finances/settlements/transfers?obligationId=${item.id}`}
                        >
                            Ver transferências desta pendência
                        </Link>
                        <Link
                            href={`/spaces/${spaceId}/finances/settlements/obligations/${item.id}`}
                        >
                            Conferir pendência, mudar acerto ou dispensar
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
}
