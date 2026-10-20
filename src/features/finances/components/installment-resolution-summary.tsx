import type { Member } from '../types/shared-expense';
import type {
    AnticipationPreview,
    PayoffPreview,
} from '../types/installment-commitment';
import type { SelectedInstallments } from './installment-resolution-fields';
import { formatDate, formatMoney } from '../utils/expense-money';
import { EconomicShares, signedMoney } from './planning-shared';
import layout from './planning.module.css';

export function InstallmentCancellationSummary({
    selected,
    reason,
}: {
    selected: SelectedInstallments;
    reason: string;
}) {
    return (
        <>
            <p>
                Cancelar {Object.keys(selected).length} parcelas futuras.
                Motivo: {reason}.
            </p>
            <ul>
                {Object.values(selected).map((item) => (
                    <li key={item.position}>
                        Parcela {item.position} · {formatDate(item.date)} ·
                        restante {formatMoney(item.remaining)}
                    </li>
                ))}
            </ul>
            <p>
                Os pagamentos já realizados permanecem no histórico. Esta ação
                não registra devolução.
            </p>
        </>
    );
}

export function InstallmentPayoffSummary({
    impact,
    members,
}: {
    impact: PayoffPreview;
    members: Member[];
}) {
    return (
        <>
            <p>
                Previsto em aberto:{' '}
                {formatMoney(impact.expectedRemainingAmountInCents)}
            </p>
            <p>
                Pagamento global informado:{' '}
                {formatMoney(impact.paidAmountInCents)}
            </p>
            <p>Diferença global: {signedMoney(impact.adjustmentInCents)}</p>
            <p>
                {impact.items.length} parcelas serão vinculadas à quitação
                global. Nenhum pagamento individual será inventado.
            </p>
            <EconomicShares
                shares={impact.effectiveEconomicShares}
                members={members}
            />
        </>
    );
}

export function InstallmentAnticipationSummary({
    impact,
    members,
}: {
    impact: AnticipationPreview;
    members: Member[];
}) {
    return (
        <>
            <p>
                Previsto:{' '}
                {signedMoney(impact.totalExpectedRemainingAmountInCents)} ·
                valor real: {signedMoney(impact.totalPaidAmountInCents)}
            </p>
            <p>Diferença: {signedMoney(impact.totalAdjustmentInCents)}</p>
            <ul className={layout.list}>
                {impact.items.map((item) => (
                    <li key={item.installmentId} className={layout.row}>
                        <h3>
                            Parcela {item.position} · vencimento{' '}
                            {formatDate(item.dueDate)}
                        </h3>
                        <p>
                            Restante previsto:{' '}
                            {formatMoney(item.expectedRemainingAmountInCents)} ·
                            pago: {formatMoney(item.paidAmountInCents)} ·
                            diferença: {signedMoney(item.adjustmentInCents)}.
                        </p>
                        <EconomicShares
                            shares={item.effectiveEconomicShares}
                            members={members}
                        />
                    </li>
                ))}
            </ul>
        </>
    );
}
