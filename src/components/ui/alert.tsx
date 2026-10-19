import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
    'relative w-full rounded-lg border p-4 text-sm leading-6 [&>svg]:mb-2 [&>svg]:size-5',
    {
        variants: {
            variant: {
                default: 'border-border bg-card text-foreground',
                destructive: 'border-destructive bg-card text-destructive',
                warning: 'border-warning/40 bg-warning-surface text-warning',
                success: 'border-success/40 bg-success-surface text-success',
            },
        },
        defaultVariants: { variant: 'default' },
    },
);

export function Alert({
    className,
    variant,
    ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
    return (
        <div
            data-slot="alert"
            role="alert"
            className={cn(alertVariants({ variant }), className)}
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
            className={cn('text-sm leading-6', className)}
            {...props}
        />
    );
}
