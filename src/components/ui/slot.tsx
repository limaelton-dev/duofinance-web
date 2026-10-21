import {
    Children,
    cloneElement,
    isValidElement,
    type HTMLAttributes,
    type ReactElement,
    type ReactNode,
    type Ref,
} from 'react';
import { cn } from '@/lib/utils';

export function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
    if (typeof ref === 'function') return ref(value);
    if (ref) ref.current = value;
}

type SlotProps = HTMLAttributes<HTMLElement> & {
    children?: ReactNode;
    ref?: Ref<HTMLElement>;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
};

/** Compose one semantic child instead of adding a second interactive element. */
export function Slot({ children, ref, ...props }: SlotProps) {
    const child = Children.only(children);
    if (!isValidElement(child)) return null;
    const element = child as ReactElement<SlotProps>;
    const merged: Record<string, unknown> = { ...props, ...element.props };
    for (const key of Object.keys(props)) {
        const parentHandler = (props as Record<string, unknown>)[key];
        const childHandler = (element.props as Record<string, unknown>)[key];
        if (key.startsWith('on') && typeof parentHandler === 'function') {
            merged[key] = (...args: unknown[]) => {
                if (typeof childHandler === 'function') childHandler(...args);
                parentHandler(...args);
            };
        }
    }
    merged.className = cn(props.className, element.props.className);
    merged.style = { ...props.style, ...element.props.style };
    merged.ref = (node: HTMLElement | null) => {
        const parentCleanup = assignRef(ref, node);
        const childCleanup = assignRef(element.props.ref, node);
        return () => {
            if (typeof childCleanup === 'function') childCleanup();
            else assignRef(element.props.ref, null);
            if (typeof parentCleanup === 'function') parentCleanup();
            else assignRef(ref, null);
        };
    };
    return cloneElement(element, merged);
}
