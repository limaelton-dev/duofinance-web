import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ChevronRight } from '@/components/ui/icons';
import styles from './financial-records.module.css';

export function FinancialRecordLink({
    children,
    className = '',
    ...props
}: ComponentProps<typeof Link>) {
    return (
        <Link {...props} className={`${styles.recordLink} ${className}`}>
            <span>{children}</span>
            <ChevronRight aria-hidden="true" size={20} />
        </Link>
    );
}
