import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member } from '../types/shared-expense';
import { businessToday } from '../utils/expense-money';

import styles from './expenses.module.css';

export function ExpensePaymentFields({
    busy,
    members,
    method,
    actualPayer,
    paidAmount,
    amount,
    factDate,
    referenceDate,
    planningOpen,
    planned,
    invalid,
    mark,
    setMethod,
    setPayer,
    setPaidAmount,
    setFactDate,
    setPlanningOpen,
    setPlanned,
}: {
    busy: boolean;
    members: Member[];
    method: '' | 'PIX' | 'DEBIT' | 'CASH' | 'CREDIT_CARD';
    actualPayer: string;
    paidAmount: string | null;
    amount: string;
    factDate: string;
    referenceDate: string | undefined;
    planningOpen: boolean;
    planned: string;
    invalid: (field: string) => boolean;
    mark: () => void;
    setMethod: (method: '' | 'PIX' | 'DEBIT' | 'CASH' | 'CREDIT_CARD') => void;
    setPayer: (payer: string) => void;
    setPaidAmount: (amount: string) => void;
    setFactDate: (date: string) => void;
    setPlanningOpen: (open: boolean) => void;
    setPlanned: (payer: string) => void;
}) {
    const creditCard = method === 'CREDIT_CARD';
    const supportAmountField = creditCard
        ? 'externalLiability.amountInCents'
        : 'disbursement.amountInCents';
    return (
        <>
            <fieldset disabled={busy}>
                <legend>O pagamento já aconteceu?</legend>
                <p className={styles.help}>
                    Escolha a forma de um pagamento ocorrido ou de uma compra no
                    cartão. O registro de despesa ainda não paga não está
                    disponível nesta tela.
                </p>
                <label>
                    Forma de pagamento
                    <select
                        name="disbursement.method"
                        aria-invalid={invalid('disbursement.method')}
                        aria-describedby={
                            invalid('disbursement.method')
                                ? 'expense-error'
                                : undefined
                        }
                        aria-label="Forma de pagamento"
                        value={method}
                        onChange={(e) => {
                            mark();
                            setMethod(e.target.value as typeof method);
                        }}
                    >
                        <option value="">Escolha uma forma</option>
                        <option value="PIX">PIX</option>
                        <option value="DEBIT">Débito</option>
                        <option value="CASH">Dinheiro</option>
                        <option value="CREDIT_CARD">Cartão de crédito</option>
                    </select>
                </label>
                {method && (
                    <>
                        <label>
                            {creditCard ? 'De quem é o cartão?' : 'Quem pagou?'}
                            <select
                                aria-label={
                                    creditCard
                                        ? 'De quem é o cartão?'
                                        : 'Quem pagou?'
                                }
                                name={
                                    creditCard
                                        ? 'externalLiability.holderMemberId'
                                        : 'disbursement.payerMemberId'
                                }
                                value={actualPayer}
                                onChange={(e) => {
                                    mark();
                                    setPayer(e.target.value);
                                }}
                            >
                                {creditCard && (
                                    <option value="">Escolha o titular</option>
                                )}
                                {members.map((m) => (
                                    <option key={m.memberId} value={m.memberId}>
                                        {m.displayName}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            {creditCard
                                ? 'Valor assumido no cartão (R$)'
                                : 'Valor pago agora (R$)'}
                            <Input
                                name={supportAmountField}
                                aria-invalid={invalid(supportAmountField)}
                                aria-describedby={
                                    invalid(supportAmountField)
                                        ? 'expense-error'
                                        : undefined
                                }
                                inputMode="decimal"
                                value={paidAmount ?? amount}
                                onChange={(event) => {
                                    mark();
                                    setPaidAmount(event.target.value);
                                }}
                            />
                        </label>
                        <label>
                            {creditCard
                                ? 'Data da compra'
                                : 'Data do pagamento'}
                            <Input
                                name="factDate"
                                aria-invalid={invalid('factDate')}
                                aria-describedby={
                                    invalid('factDate')
                                        ? 'expense-error'
                                        : undefined
                                }
                                type="date"
                                value={factDate}
                                max={referenceDate ?? businessToday()}
                                onChange={(e) => {
                                    mark();
                                    setFactDate(e.target.value);
                                }}
                            />
                        </label>
                    </>
                )}
            </fieldset>
            <div className={styles.planning}>
                <Button
                    type="button"
                    variant="outline"
                    className={styles.planningToggle}
                    disabled={busy}
                    aria-expanded={planningOpen}
                    aria-controls="payment-planning"
                    onClick={() => setPlanningOpen(!planningOpen)}
                >
                    Previsão de pagamento (opcional)
                </Button>
                <fieldset
                    id="payment-planning"
                    hidden={!planningOpen}
                    disabled={busy}
                >
                    <legend>Previsão de pagamento</legend>
                    <p id="payment-planning-help">
                        Informe apenas se havia uma pessoa combinada para pagar.
                        Isso não altera a divisão nem o acerto.
                    </p>
                    <label>
                        Quem era previsto pagar?
                        <select
                            aria-label="Quem era previsto pagar?"
                            name="expectedPayerMemberId"
                            aria-invalid={invalid('expectedPayerMemberId')}
                            aria-describedby={
                                invalid('expectedPayerMemberId')
                                    ? 'expense-error'
                                    : 'payment-planning-help'
                            }
                            value={planned}
                            onChange={(e) => {
                                mark();
                                setPlanned(e.target.value);
                            }}
                        >
                            <option value="">Não informado</option>
                            {members.map((m) => (
                                <option key={m.memberId} value={m.memberId}>
                                    {m.displayName}
                                </option>
                            ))}
                        </select>
                    </label>
                </fieldset>
            </div>
        </>
    );
}
