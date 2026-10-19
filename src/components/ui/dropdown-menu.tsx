'use client';
import type { ComponentProps } from 'react';
import { DropdownMenu as Primitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;

export function DropdownMenuContent({
    className,
    sideOffset = 8,
    ...props
}: ComponentProps<typeof Primitive.Content>) {
    return (
        <Primitive.Portal>
            <Primitive.Content
                sideOffset={sideOffset}
                className={cn(
                    'z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md',
                    className,
                )}
                {...props}
            />
        </Primitive.Portal>
    );
}
export function DropdownMenuItem({
    className,
    ...props
}: ComponentProps<typeof Primitive.Item>) {
    return (
        <Primitive.Item
            className={cn(
                'relative flex min-h-12 cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
                className,
            )}
            {...props}
        />
    );
}
export function DropdownMenuLabel({
    className,
    ...props
}: ComponentProps<typeof Primitive.Label>) {
    return (
        <Primitive.Label
            className={cn('px-3 py-2 text-sm font-semibold', className)}
            {...props}
        />
    );
}
export function DropdownMenuSeparator({
    className,
    ...props
}: ComponentProps<typeof Primitive.Separator>) {
    return (
        <Primitive.Separator
            className={cn('my-1 h-px bg-border', className)}
            {...props}
        />
    );
}
