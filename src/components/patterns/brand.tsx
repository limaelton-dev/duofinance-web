import { cn } from '@/lib/utils';
import { brandPaths } from './brand-artwork';
import styles from './brand.module.css';

export function Brand({
    className,
    variant = 'full',
}: {
    className?: string;
    variant?: 'full' | 'ju';
}) {
    const full = variant === 'full';
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={full ? '-16 -16 478 450' : '-16 -16 452 294'}
            width={full ? 96 : 52}
            height={full ? 90.38 : 33.82}
            fill="currentColor"
            fillRule="evenodd"
            role="img"
            aria-label="Junelo"
            focusable="false"
            className={cn(styles.brand, !full && styles.ju, className)}
        >
            <g transform={full ? 'translate(13 0)' : undefined}>
                <path d={brandPaths.J} />
                <path d={brandPaths.u} />
            </g>
            {full && (
                <>
                    <path d={brandPaths.n} />
                    <path d={brandPaths.e} />
                    <path d={brandPaths.l} />
                    <path d={brandPaths.o} />
                </>
            )}
        </svg>
    );
}
