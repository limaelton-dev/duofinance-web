'use client';

import {
    createContext,
    useCallback,
    useContext,
    useId,
    useRef,
    useState,
    type ComponentProps,
    type ReactNode,
    type RefObject,
} from 'react';
import { cn } from '@/lib/utils';
import { Slot, assignRef } from './slot';
import { FloatingLayer, leaveFloatingLayer } from './floating-layer';

const MenuContext = createContext<{
    open: boolean;
    setOpen: (value: boolean) => void;
    dismiss: (restore: boolean) => void;
    trigger: RefObject<HTMLElement | null>;
    first: RefObject<'first' | 'last'>;
    registerTrigger: (node: HTMLElement | null) => void;
    openAt: (position: 'first' | 'last') => void;
    id: string;
} | null>(null);

function useMenu() {
    const context = useContext(MenuContext);
    if (!context)
        throw new Error('DropdownMenu controls require DropdownMenu.');
    return context;
}

export function DropdownMenu({
    children,
    open: controlled,
    defaultOpen = false,
    onOpenChange,
}: {
    children?: ReactNode;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    modal?: boolean;
}) {
    const [internal, setInternal] = useState(defaultOpen);
    const trigger = useRef<HTMLElement>(null);
    const first = useRef<'first' | 'last'>('first');
    const id = useId();
    const setOpen = useCallback(
        (value: boolean) => {
            if (controlled === undefined) setInternal(value);
            onOpenChange?.(value);
        },
        [controlled, onOpenChange],
    );
    const dismiss = useCallback(
        (restore: boolean) => {
            setOpen(false);
            if (restore) trigger.current?.focus({ preventScroll: true });
        },
        [setOpen],
    );
    return (
        <MenuContext
            value={{
                open: controlled ?? internal,
                setOpen,
                dismiss,
                trigger,
                first,
                registerTrigger: (node) => {
                    trigger.current = node;
                },
                openAt: (position) => {
                    first.current = position;
                    setOpen(true);
                },
                id,
            }}
        >
            {children}
        </MenuContext>
    );
}

export function DropdownMenuTrigger({
    asChild = false,
    ref,
    onClick,
    onKeyDown,
    ...props
}: ComponentProps<'button'> & { asChild?: boolean }) {
    const menu = useMenu();
    const Component = asChild ? Slot : 'button';
    return (
        <Component
            {...props}
            ref={(node) => {
                menu.registerTrigger(node);
                return assignRef(ref, node as HTMLButtonElement | null);
            }}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu.open}
            aria-controls={menu.open ? menu.id : undefined}
            onClick={(event) => {
                onClick?.(event as React.MouseEvent<HTMLButtonElement>);
                if (
                    !event.defaultPrevented &&
                    !event.currentTarget.matches(
                        ':disabled,[aria-disabled="true"]',
                    )
                ) {
                    if (menu.open) menu.dismiss(true);
                    else menu.openAt('first');
                }
            }}
            onKeyDown={(event) => {
                onKeyDown?.(event as React.KeyboardEvent<HTMLButtonElement>);
                if (
                    !event.defaultPrevented &&
                    ['ArrowDown', 'ArrowUp'].includes(event.key) &&
                    !event.currentTarget.matches(
                        ':disabled,[aria-disabled="true"]',
                    )
                ) {
                    event.preventDefault();
                    menu.openAt(event.key === 'ArrowUp' ? 'last' : 'first');
                }
            }}
        />
    );
}

function items(element: HTMLElement) {
    return Array.from(
        element.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).filter(
        (item) =>
            !item.matches(':disabled,[aria-disabled="true"]') &&
            item.getClientRects().length > 0,
    );
}

export function DropdownMenuContent({
    className,
    align = 'start',
    sideOffset = 8,
    onKeyDown,
    ...props
}: ComponentProps<'div'> & {
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
}) {
    const menu = useMenu();
    const search = useRef({ text: '', time: 0 });
    if (!menu.open) return null;
    return (
        <FloatingLayer
            {...props}
            anchor={menu.trigger}
            align={align}
            sideOffset={sideOffset}
            id={menu.id}
            role="menu"
            aria-orientation="vertical"
            data-floating-layer="menu"
            onDismiss={menu.dismiss}
            initialFocus={(element) => {
                const all = items(element);
                return (
                    (menu.first.current === 'last' ? all.at(-1) : all[0]) ??
                    element
                );
            }}
            className={cn(
                'z-50 w-56 min-w-0 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-[var(--shadow-menu)] [overflow-wrap:anywhere]',
                className,
            )}
            onKeyDown={(event) => {
                onKeyDown?.(event);
                if (event.defaultPrevented) return;
                const all = items(event.currentTarget);
                const index = all.indexOf(
                    document.activeElement as HTMLElement,
                );
                let next: HTMLElement | undefined;
                if (event.key === 'Tab') {
                    event.preventDefault();
                    menu.dismiss(false);
                    leaveFloatingLayer(menu.trigger.current, event.shiftKey);
                    return;
                }
                if (event.key === 'ArrowDown')
                    next = all[(index + 1) % all.length];
                else if (event.key === 'ArrowUp')
                    next = all[(index - 1 + all.length) % all.length];
                else if (event.key === 'Home') next = all[0];
                else if (event.key === 'End') next = all.at(-1);
                else if (
                    event.key.length === 1 &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey &&
                    event.key !== ' '
                ) {
                    const now = Date.now();
                    search.current.text =
                        now - search.current.time > 700
                            ? event.key
                            : search.current.text + event.key;
                    search.current.time = now;
                    const normalize = (text: string) =>
                        text
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .toLocaleLowerCase('pt-BR');
                    const query = normalize(search.current.text);
                    const repeated = [...query].every(
                        (character) => character === query[0],
                    );
                    next = [
                        ...all.slice(index + 1),
                        ...all.slice(0, index + 1),
                    ].find((item) =>
                        normalize(item.textContent?.trim() ?? '').startsWith(
                            repeated ? query[0] : query,
                        ),
                    );
                }
                if (next) {
                    event.preventDefault();
                    next.focus();
                    next.scrollIntoView({ block: 'nearest' });
                }
            }}
        />
    );
}

export function DropdownMenuItem({
    asChild = false,
    disabled = false,
    className,
    onSelect,
    onClick,
    onKeyDown,
    onPointerMove,
    ref,
    ...props
}: Omit<ComponentProps<'button'>, 'onSelect'> & {
    asChild?: boolean;
    disabled?: boolean;
    onSelect?: (event: Event) => void;
}) {
    const menu = useMenu();
    const Component = asChild ? Slot : 'button';
    return (
        <Component
            {...props}
            ref={(node) => assignRef(ref, node as HTMLButtonElement | null)}
            role="menuitem"
            tabIndex={-1}
            type={asChild ? undefined : 'button'}
            disabled={asChild ? undefined : disabled}
            aria-disabled={disabled || undefined}
            data-disabled={disabled ? '' : undefined}
            className={cn(
                'relative flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-[length:var(--type-secondary)] leading-snug select-none hover:bg-accent focus-visible:bg-accent focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-ring aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
                className,
            )}
            onClick={(event) => {
                if (disabled) {
                    event.preventDefault();
                    return;
                }
                onClick?.(event as React.MouseEvent<HTMLButtonElement>);
                if (event.defaultPrevented) return;
                const selection = new Event('select', { cancelable: true });
                event.currentTarget.dispatchEvent(selection);
                onSelect?.(selection);
                if (!selection.defaultPrevented) menu.dismiss(true);
            }}
            onKeyDown={(event) => {
                onKeyDown?.(event as React.KeyboardEvent<HTMLButtonElement>);
                if (
                    !event.defaultPrevented &&
                    event.key === ' ' &&
                    event.currentTarget.tagName === 'A'
                ) {
                    event.preventDefault();
                    event.currentTarget.click();
                }
            }}
            onPointerMove={(event) => {
                onPointerMove?.(event as React.PointerEvent<HTMLButtonElement>);
                if (
                    !event.defaultPrevented &&
                    !disabled &&
                    event.pointerType !== 'touch'
                )
                    event.currentTarget.focus({ preventScroll: true });
            }}
        />
    );
}

export function DropdownMenuLabel({
    className,
    ...props
}: ComponentProps<'div'>) {
    return (
        <div
            {...props}
            className={cn(
                'px-3 py-2 text-[length:var(--type-caption)] font-semibold text-muted-foreground',
                className,
            )}
        />
    );
}
export function DropdownMenuSeparator({
    className,
    ...props
}: ComponentProps<'div'>) {
    return (
        <div
            {...props}
            role="separator"
            className={cn('my-1 h-px bg-border', className)}
        />
    );
}
