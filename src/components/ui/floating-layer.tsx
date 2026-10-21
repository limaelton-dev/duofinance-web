'use client';

import {
    useLayoutEffect,
    useRef,
    useSyncExternalStore,
    type ComponentProps,
    type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { assignRef } from './slot';

type Props = ComponentProps<'div'> & {
    anchor: RefObject<HTMLElement | null>;
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    initialFocus?: (element: HTMLDivElement) => HTMLElement | null;
    onDismiss: (restoreFocus: boolean) => void;
};

const subscribe = () => () => {};

/** A non-modal, anchored task surface; viewport collision never hides actions. */
export function FloatingLayer({
    anchor,
    align = 'start',
    sideOffset = 8,
    initialFocus,
    onDismiss,
    style,
    ref,
    ...props
}: Props) {
    const hydrated = useSyncExternalStore(
        subscribe,
        () => true,
        () => false,
    );
    const layer = useRef<HTMLDivElement>(null);
    const callbacks = useRef({ initialFocus, onDismiss });
    useLayoutEffect(() => {
        callbacks.current = { initialFocus, onDismiss };
    });
    useLayoutEffect(() => {
        const element = layer.current;
        const target = anchor.current;
        if (!element || !target) return;
        const position = () => {
            const viewport = window.visualViewport;
            const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
            const topEdge = (viewport?.offsetTop ?? 0) + 8;
            const rightEdge =
                leftEdge + (viewport?.width ?? window.innerWidth) - 16;
            const bottomEdge =
                topEdge + (viewport?.height ?? window.innerHeight) - 16;
            const rect = target.getBoundingClientRect();
            element.style.maxWidth = `${rightEdge - leftEdge}px`;
            const availableBelow = bottomEdge - rect.bottom - sideOffset;
            const availableAbove = rect.top - topEdge - sideOffset;
            const naturalHeight = element.scrollHeight;
            const above =
                naturalHeight > availableBelow &&
                availableAbove > availableBelow;
            const available = Math.max(
                44,
                above ? availableAbove : availableBelow,
            );
            element.style.maxHeight = `${Math.min(bottomEdge - topEdge, available)}px`;
            const box = element.getBoundingClientRect();
            const intendedLeft =
                align === 'end'
                    ? rect.right - box.width
                    : align === 'center'
                      ? rect.left + (rect.width - box.width) / 2
                      : rect.left;
            element.style.left = `${Math.max(leftEdge, Math.min(intendedLeft, rightEdge - box.width))}px`;
            element.style.top = `${Math.max(topEdge, Math.min(above ? rect.top - sideOffset - box.height : rect.bottom + sideOffset, bottomEdge - box.height))}px`;
            element.dataset.side = above ? 'top' : 'bottom';
            element.style.visibility = 'visible';
        };
        position();
        const focusTarget =
            callbacks.current.initialFocus?.(element) ?? element;
        focusTarget.focus({ preventScroll: true });
        focusTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const outside = (event: PointerEvent | FocusEvent) => {
            if (
                event.target instanceof Node &&
                !element.contains(event.target) &&
                !target.contains(event.target)
            )
                callbacks.current.onDismiss(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
                event.preventDefault();
                callbacks.current.onDismiss(true);
            }
        };
        const resize = new ResizeObserver(position);
        resize.observe(element);
        resize.observe(target);
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('focusin', outside);
        document.addEventListener('keydown', escape);
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        window.visualViewport?.addEventListener('resize', position);
        window.visualViewport?.addEventListener('scroll', position);
        return () => {
            resize.disconnect();
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('focusin', outside);
            document.removeEventListener('keydown', escape);
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
            window.visualViewport?.removeEventListener('resize', position);
            window.visualViewport?.removeEventListener('scroll', position);
        };
    }, [anchor, align, sideOffset, hydrated]);
    if (!hydrated) return null;
    return createPortal(
        <div
            {...props}
            ref={(element) => {
                layer.current = element;
                return assignRef(ref, element);
            }}
            tabIndex={-1}
            style={{ ...style, position: 'fixed', visibility: 'hidden' }}
        />,
        document.body,
    );
}

/** Continue the page's tab order from the anchor, rather than the portal. */
export function leaveFloatingLayer(
    anchor: HTMLElement | null,
    backwards: boolean,
) {
    const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
            'a[href],button,input,select,textarea,[tabindex]',
        ),
    ).filter(
        (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled,[aria-disabled="true"]') &&
            element.getClientRects().length > 0 &&
            !element.closest('[data-floating-layer]'),
    );
    const index = candidates.indexOf(anchor!);
    const next = candidates[index + (backwards ? -1 : 1)];
    (next ?? anchor)?.focus();
}
