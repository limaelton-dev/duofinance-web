import type { Today } from '../types/today';
import styles from './today.module.css';

/** Counts remain independent: the server's blocks can contain overlapping items. */
export function TodayOverview({ today }: { today: Today }) {
    return (
        <dl className={styles.overview} aria-label="Visão do dia">
            {(
                [
                    ['TODAY', 'Para hoje'],
                    ['UPCOMING', 'Próximos'],
                    ['ATTENTION', 'Atenção'],
                ] as const
            ).map(([kind, label]) => {
                const block = today.blocks.find((item) => item.kind === kind);
                const available =
                    block?.status === 'AVAILABLE' && block.totalCount !== null;
                return (
                    <div key={kind}>
                        <dt>{label}</dt>
                        <dd>
                            {available ? (
                                block.totalCount
                            ) : (
                                <span aria-label="Consulta incompleta">—</span>
                            )}
                        </dd>
                        <span className={styles.overviewNote}>
                            {available
                                ? block.totalCount === 1
                                    ? 'item'
                                    : 'itens'
                                : 'Consulta incompleta'}
                        </span>
                    </div>
                );
            })}
        </dl>
    );
}
