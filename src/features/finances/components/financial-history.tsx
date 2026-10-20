import { Button } from '@/components/ui/button';
import type {
    FinancialReversal,
    VersionHistory,
} from '../types/financial-integrity';
import { formatDate, formatMoney } from '../utils/expense-money';
import { financialFactLabels } from './financial-impact';
import styles from './expenses.module.css';

export function FinancialVersionHistory({
    versions,
}: {
    versions: { data?: VersionHistory; isPending: boolean; isError: boolean };
}) {
    const entries =
        versions.data?.versions ?? versions.data?.commitment?.versions ?? [];
    return (
        <section className={styles.fields}>
            <h2>Versões do compromisso</h2>
            {versions.isPending && <p role="status">Carregando versões…</p>}
            {versions.isError && (
                <p role="alert">
                    Não foi possível consultar o histórico de versões.
                </p>
            )}
            {versions.data &&
                entries.map((v) => (
                    <div key={v.version} className={styles.receiptSection}>
                        <h3>
                            Versão {v.version} · {formatDate(v.effectiveFrom)}
                        </h3>
                        <p>
                            {v.description}
                            {v.amountInCents != null
                                ? ` · ${formatMoney(v.amountInCents)}`
                                : ''}
                        </p>
                    </div>
                ))}
            {versions.data && !entries.length && (
                <p className={styles.help}>
                    Nenhuma alteração de versão neste registro.
                </p>
            )}
        </section>
    );
}

export function FinancialReversalHistory({
    reversals,
    cursor,
    busy,
    onPageChange,
}: {
    reversals: {
        data?: { items: FinancialReversal[]; nextCursor: string | null };
        isPending: boolean;
        isError: boolean;
    };
    cursor: string | null;
    busy: boolean;
    onPageChange: (cursor: string | null) => void;
}) {
    return (
        <section className={styles.fields}>
            <h2>Reversões registradas</h2>
            {reversals.isPending && <p role="status">Carregando reversões…</p>}
            {reversals.isError && (
                <p role="alert">
                    Não foi possível consultar as reversões. Atualize o
                    registro.
                </p>
            )}
            {reversals.data?.items.map((r) => (
                <div key={r.id} className={styles.receiptSection}>
                    <h3>
                        {financialFactLabels[r.originalKind]} ·{' '}
                        {formatMoney(r.amountInCents)}
                    </h3>
                    <p>
                        {formatDate(r.factDate)} · {r.reason}
                    </p>
                    <details className={styles.details}>
                        <summary>Origem e autoria</summary>
                        <p>Fato original: {r.originalId}</p>
                        <p>Registrado por: {r.actorId}</p>
                    </details>
                </div>
            ))}
            {reversals.data?.items.length === 0 && (
                <p className={styles.help}>
                    Nenhuma reversão registrada nesta página.
                </p>
            )}
            <div className={styles.actions}>
                {reversals.data?.nextCursor && (
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => onPageChange(reversals.data!.nextCursor)}
                    >
                        Próxima página de reversões
                    </Button>
                )}
                {cursor && (
                    <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onPageChange(null)}
                    >
                        Voltar ao início
                    </Button>
                )}
            </div>
        </section>
    );
}
