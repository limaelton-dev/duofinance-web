'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { ExpenseView, Member } from '../types/shared-expense';
import type { PersonalExpenseDetail } from '../types/personal-expense';
import { formatDate, formatMoney } from '../utils/expense-money';
import { ExternalLiabilitySettlementForm } from './external-liability-settlement-form';

export function ExternalLiabilityHistory({
    value,
    personId,
    members = [],
    onAccessLost,
}: {
    value: ExpenseView | PersonalExpenseDetail;
    personId: string;
    members?: Member[];
    onAccessLost: () => void;
}) {
    const [selected, setSelected] = useState<string | null>(null),
        [message, setMessage] = useState<string | null>(null);
    const ownMember = members.find((m) => m.personId === personId)?.memberId;
    const person = (id: string) =>
        id === personId
            ? 'Você'
            : (members.find((m) => m.personId === id)?.displayName ??
              'Pessoa do registro');
    if (!value.externalLiabilities?.length) return null;
    return (
        <section aria-label="Obrigações externas e liquidações">
            <h3>Obrigações externas e liquidações</h3>
            {message && <p role="status">{message}</p>}
            <p>
                Pagamentos diretos da despesa:{' '}
                {formatMoney(value.paidAmountInCents)}. Pagamentos posteriores
                ao credor externo:{' '}
                {formatMoney(value.externalSettledAmountInCents ?? 0)}.
            </p>
            <ul>
                {value.externalLiabilities.map((liability) => {
                    const own =
                        liability.holderPersonId === personId ||
                        (!!ownMember && liability.holderMemberId === ownMember);
                    return (
                        <li
                            key={liability.id}
                            id={`external-liability-${liability.id}`}
                        >
                            <h4>
                                Cartão de{' '}
                                {liability.holderMemberId
                                    ? (members.find(
                                          (m) =>
                                              m.memberId ===
                                              liability.holderMemberId,
                                      )?.displayName ?? 'Membro do registro')
                                    : person(
                                          liability.holderPersonId ?? '',
                                      )}{' '}
                                · {formatDate(liability.factDate)}
                            </h4>
                            <p>
                                Valor assumido:{' '}
                                {formatMoney(liability.amountInCents)}. Já
                                liquidado:{' '}
                                {formatMoney(
                                    liability.amountInCents -
                                        liability.remainingAmountInCents,
                                )}
                                . Saldo externo aberto:{' '}
                                {formatMoney(liability.remainingAmountInCents)}.
                            </p>
                            {liability.remainingAmountInCents === 0 && (
                                <p>Obrigação externa quitada.</p>
                            )}
                            <h5>Histórico de pagamentos externos</h5>
                            {!liability.settlements?.length ? (
                                <p>Nenhum pagamento externo registrado.</p>
                            ) : (
                                <ol>
                                    {liability.settlements.map((fact) => (
                                        <li key={fact.id}>
                                            <p>
                                                {formatMoney(
                                                    fact.amountInCents,
                                                )}{' '}
                                                ·{' '}
                                                <time dateTime={fact.factDate}>
                                                    {formatDate(fact.factDate)}
                                                </time>
                                                . Registrado por:{' '}
                                                {person(
                                                    fact.recordedByPersonId,
                                                )}
                                                .
                                            </p>
                                            <p>
                                                Registrado em:{' '}
                                                <time
                                                    dateTime={fact.registeredAt}
                                                >
                                                    {new Intl.DateTimeFormat(
                                                        'pt-BR',
                                                        {
                                                            timeZone:
                                                                'America/Sao_Paulo',
                                                            dateStyle: 'short',
                                                            timeStyle: 'short',
                                                        },
                                                    ).format(
                                                        new Date(
                                                            fact.registeredAt,
                                                        ),
                                                    )}
                                                </time>
                                                .
                                            </p>
                                        </li>
                                    ))}
                                </ol>
                            )}
                            {own &&
                                liability.remainingAmountInCents > 0 &&
                                selected !== liability.id && (
                                    <button
                                        type="button"
                                        disabled={selected !== null}
                                        onClick={() => {
                                            setMessage(null);
                                            setSelected(liability.id);
                                        }}
                                    >
                                        Registrar pagamento
                                    </button>
                                )}
                            {selected === liability.id && (
                                <ExternalLiabilitySettlementForm
                                    key={liability.id}
                                    personId={personId}
                                    spaceId={value.spaceId}
                                    commitmentId={value.commitment.id}
                                    liabilityId={liability.id}
                                    onAccessLost={onAccessLost}
                                    onCancel={() => setSelected(null)}
                                    onSuccess={(replayed) => {
                                        setSelected(null);
                                        setMessage(
                                            replayed
                                                ? 'A tentativa original foi recuperada.'
                                                : 'Pagamento externo registrado.',
                                        );
                                    }}
                                />
                            )}
                        </li>
                    );
                })}
            </ul>
            <Link
                href={`/spaces/${value.spaceId}/finances/external-liabilities`}
            >
                Ver obrigações externas em meu nome
            </Link>
        </section>
    );
}
