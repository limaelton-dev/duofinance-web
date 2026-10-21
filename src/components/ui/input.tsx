import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { DateInput } from './date-input';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
    const Component = type === 'date' || type === 'month' ? DateInput : 'input';
    return (
        <Component
            type={type}
            data-slot="input"
            className={cn(
                'flex min-h-12 w-full min-w-0 rounded-md border border-input bg-card px-4 py-3 text-[length:var(--type-body)] text-foreground caret-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:outline-destructive',
                className,
            )}
            {...props}
        />
    );
}
