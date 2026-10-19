import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground hover:bg-primary/85',
                destructive:
                    'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                outline:
                    'border border-input bg-card text-foreground hover:bg-accent',
                secondary:
                    'bg-secondary text-secondary-foreground hover:bg-secondary/75',
                ghost: 'text-foreground hover:bg-accent',
                link: 'text-foreground underline-offset-4 hover:underline',
            },
            size: {
                default: '',
                sm: 'min-h-11 px-3 py-2',
                lg: 'min-h-13 px-6',
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
    ...props
}: React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
    const Component = asChild ? Slot.Root : 'button';
    return (
        <Component
            data-slot="button"
            className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    );
}

export { Button, buttonVariants };
