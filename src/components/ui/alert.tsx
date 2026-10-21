import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Alert({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert"
            role="alert"
            className={cn(
                'relative w-full rounded-lg border border-border bg-card p-4 text-[length:var(--type-secondary)] leading-relaxed text-foreground [&>svg]:mb-2 [&>svg]:size-5',
                className,
            )}
            {...props}
        />
    );
}
export function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-title"
            className={cn('mb-1 font-semibold', className)}
            {...props}
        />
    );
}
export function AlertDescription({
    className,
    ...props
}: ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-description"
            className={cn(
                'text-[length:var(--type-secondary)] leading-relaxed',
                className,
            )}
            {...props}
        />
    );
}
