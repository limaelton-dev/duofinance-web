import type { IntegrityPreview } from '../types/financial-integrity';
import type { RecurringChangeImpact } from '../types/recurring-commitment';
import type { Member } from '../types/shared-expense';
import { formatDate, formatMoney } from '../utils/expense-money';
import { formatReviewMoney } from '../utils/financial-review';
import styles from './expenses.module.css';

const participationFormat = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
});

export const financialFactLabels = {
    DISBURSEMENT: 'Pagamento',
    RECEIPT: 'Recebimento',
    EXTERNAL_LIABILITY: 'Obrigação no cartão',
    EXTERNAL_SETTLEMENT: 'Liquidação do cartão',
};

export function FinancialImpact({
    value,
    members,
    pendingApproval = true,
}: {
    value: IntegrityPreview | RecurringChangeImpact;
    members: Member[];
    pendingApproval?: boolean;
}) {
    const recurring = 'assessmentThrough' in value;
    return (
        <div className={styles.summary}>
            <h2>Confira o efeito</h2>
            {recurring && (
                <div className={styles.receiptSection}>
                    <h3>Impacto das ocorrências futuras</h3>
                    <p>
                        Período avaliado: {formatDate(value.effectiveFrom)} até{' '}
                        {formatDate(value.assessmentThrough)}.
                    </p>
                    <p>
                        Ocorrências previstas: {value.currentOccurrences.length}{' '}
                        antes · {value.proposedOccurrences.length} depois.
                    </p>
                    <p>
                        Ocorrências já registradas preservadas:{' '}
                        {value.materializedOccurrencesPreserved.length}.
                    </p>
                </div>
            )}
            {!recurring && value.original && (
                <div className={styles.receiptSection}>
                    <h3>{financialFactLabels[value.original.kind]} original</h3>
                    <p>
                        {formatDate(value.original.factDate)} ·{' '}
                        {formatMoney(value.original.amountInCents)}
                    </p>
                    <p>
                        Disponível para reversão:{' '}
                        {formatMoney(value.original.reversibleAmountInCents)}.
                    </p>
                </div>
            )}
            {!recurring && (
                <dl>
                    {value.currentAmountInCents !== undefined && (
                        <>
                            <dt>Valor atual</dt>
                            <dd>
                                {formatReviewMoney(value.currentAmountInCents)}
                            </dd>
                        </>
                    )}
                    {value.amountInCents !== undefined &&
                        value.amountInCents !== null && (
                            <>
                                <dt>Valor da operação</dt>
                                <dd>{formatMoney(value.amountInCents)}</dd>
                            </>
                        )}
                    {value.proposedAmountInCents !== undefined && (
                        <>
                            <dt>Novo valor</dt>
                            <dd>
                                {formatReviewMoney(
                                    String(value.proposedAmountInCents),
                                )}
                            </dd>
                        </>
                    )}
                    {value.resultingRemainingAmountInCents !== undefined &&
                        value.resultingRemainingAmountInCents !== null && (
                            <>
                                <dt>Restante após a reversão</dt>
                                <dd>
                                    {formatMoney(
                                        value.resultingRemainingAmountInCents,
                                    )}
                                </dd>
                            </>
                        )}
                    {value.proposedRemainingAmountInCents !== undefined && (
                        <>
                            <dt>Novo restante</dt>
                            <dd>
                                {formatMoney(
                                    value.proposedRemainingAmountInCents,
                                )}
                            </dd>
                        </>
                    )}
                    {value.cashImpactInCents !== undefined && (
                        <>
                            <dt>Efeito no caixa registrado</dt>
                            <dd>
                                {formatReviewMoney(value.cashImpactInCents)}
                            </dd>
                        </>
                    )}
                    {value.externalOutstandingImpactInCents !== undefined && (
                        <>
                            <dt>Variação da obrigação externa</dt>
                            <dd>
                                {formatReviewMoney(
                                    value.externalOutstandingImpactInCents,
                                )}
                            </dd>
                        </>
                    )}
                </dl>
            )}
            {value.impactByMember?.map((row) => (
                <div key={row.memberId} className={styles.receiptSection}>
                    <h3>
                        {members.find((m) => m.memberId === row.memberId)
                            ?.displayName ?? 'Participante'}
                    </h3>
                    {'currentFixedAmountInCents' in row ? (
                        <dl>
                            <dt>Total fixo antes</dt>
                            <dd>
                                {formatReviewMoney(
                                    row.currentFixedAmountInCents,
                                )}
                            </dd>
                            <dt>Total fixo depois</dt>
                            <dd>
                                {formatReviewMoney(
                                    row.proposedFixedAmountInCents,
                                )}
                            </dd>
                            <dt>Diferença fixa</dt>
                            <dd>{formatReviewMoney(row.fixedDeltaInCents)}</dd>
                            <dt>
                                Soma das participações nas ocorrências — antes
                            </dt>
                            <dd>
                                {participationFormat.format(
                                    row.currentVariableWeight / 100,
                                )}
                                %
                            </dd>
                            <dt>
                                Soma das participações nas ocorrências — depois
                            </dt>
                            <dd>
                                {participationFormat.format(
                                    row.proposedVariableWeight / 100,
                                )}
                                %
                            </dd>
                            <dt>Diferença das participações</dt>
                            <dd>
                                {participationFormat.format(
                                    row.variableWeightDelta / 100,
                                )}{' '}
                                pontos percentuais
                            </dd>
                            <dt>Ocorrências antes</dt>
                            <dd>{row.currentOccurrenceCount}</dd>
                            <dt>Ocorrências depois</dt>
                            <dd>{row.proposedOccurrenceCount}</dd>
                        </dl>
                    ) : (
                        <dl>
                            <dt>Antes</dt>
                            <dd>
                                {formatReviewMoney(row.currentAmountInCents)}
                            </dd>
                            <dt>Depois</dt>
                            <dd>
                                {formatReviewMoney(row.proposedAmountInCents)}
                            </dd>
                            <dt>Diferença</dt>
                            <dd>{formatReviewMoney(row.deltaInCents)}</dd>
                        </dl>
                    )}
                    {'currentVariableWeight' in row &&
                        (row.currentVariableWeight !== 0 ||
                            row.proposedVariableWeight !== 0) && (
                            <p className={styles.help}>
                                A soma considera as participações em todas as
                                ocorrências do período e pode ultrapassar 100%.
                                O valor em reais depende do valor informado em
                                cada ocorrência.
                            </p>
                        )}
                    {row.requiresAcceptance && pendingApproval && (
                        <p>Depende do aceite desta pessoa.</p>
                    )}
                </div>
            ))}
            {!recurring && value.targets?.length ? (
                <section className={styles.receiptSection}>
                    <h3>Registros incluídos: {value.targets.length}</h3>
                    <ul>
                        {value.targets.map((target, index) => (
                            <li key={target.id}>
                                <p>
                                    {target.dueDate
                                        ? `Vencimento: ${formatDate(target.dueDate)}`
                                        : `Registro ${index + 1}`}
                                </p>
                                <p>
                                    Antes: {formatMoney(target.amountInCents)}
                                    {target.proposed
                                        ? ` · Depois: ${formatMoney(target.proposed.amountInCents)}`
                                        : ''}
                                </p>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
            {value.requiresAcceptance && pendingApproval && (
                <p>
                    A alteração ficará aguardando aprovação. A condição anterior
                    permanece até o aceite.
                </p>
            )}
            {!recurring && value.eligible === false && (
                <p role="alert">
                    {value.requiresFullReversal
                        ? 'Esta quitação global exige reversão integral. Informe o valor completo do pagamento original e revise novamente.'
                        : value.reconciliation?.requiresOpenCycle
                          ? 'Esta correção precisa de um acerto aberto. Escolha outro ciclo ou uma data de acerto e revise novamente. A composição do ciclo finalizado será preservada.'
                          : 'Esta operação está bloqueada pelas condições atuais. Atualize o registro e confira as resoluções relacionadas antes de tentar novamente.'}
                </p>
            )}
            <p className={styles.help}>
                O aplicativo registra fatos externos. Nenhuma movimentação
                bancária será feita.
            </p>
        </div>
    );
}
