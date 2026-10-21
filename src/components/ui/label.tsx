'use client';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: ComponentProps<'label'>) {
    return (
        <label
            data-slot="label"
            className={cn(
                'text-[length:var(--type-secondary)] font-semibold leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
                className,
            )}
            {...props}
        />
    );
}
