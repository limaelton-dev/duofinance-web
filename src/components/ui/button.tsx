'use client';

import * as React from 'react';
import { Slot, assignRef } from './slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-5 py-3 text-[length:var(--type-heading)] font-semibold leading-snug transition-colors duration-[var(--motion-base)] focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/90',
                destructive:
                    'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/85',
                outline:
                    'border border-input bg-card text-foreground hover:bg-accent active:bg-secondary',
                ghost: 'text-foreground hover:bg-accent active:bg-secondary',
            },
            size: {
                default: '',
                sm: 'min-h-11 px-3 py-2',
                icon: 'size-12 p-0',
            },
        },
        defaultVariants: { variant: 'default', size: 'default' },
    },
);

function Button({
    className,
    variant,
    size,
    asChild = false,
    ref,
    ...props
}: React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
    const Component = asChild ? Slot : 'button';
    return (
        <Component
            data-slot="button"
            className={cn(buttonVariants({ variant, size, className }))}
            ref={(node) => assignRef(ref, node as HTMLButtonElement | null)}
            {...props}
        />
    );
}

export { Button };
