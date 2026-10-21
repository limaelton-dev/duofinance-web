'use client';

import { useEffect, type RefObject } from 'react';

/** Measure actual chrome, including enlarged labels; zoom is never treated as a keyboard. */
export function useShellViewport(
    header: RefObject<HTMLElement | null>,
    navigation: RefObject<HTMLElement | null>,
) {
    useEffect(() => {
        const root = document.documentElement;
        const viewport = window.visualViewport;
        let frame = 0;
        const measure = () => {
            const active = document.activeElement;
            const editing =
                active instanceof HTMLTextAreaElement ||
                (active instanceof HTMLInputElement &&
                    !['checkbox', 'radio', 'button', 'submit'].includes(
                        active.type,
                    ));
            const keyboard = Boolean(
                viewport &&
                viewport.scale === 1 &&
                editing &&
                window.innerHeight - viewport.height - viewport.offsetTop > 120,
            );
            root.dataset.keyboard = keyboard ? 'open' : 'closed';
            const top = header.current;
            const bottom = navigation.current;
            const occupiedTop =
                top && getComputedStyle(top).position === 'sticky'
                    ? top.getBoundingClientRect().height
                    : 0;
            const occupiedBottom =
                bottom &&
                getComputedStyle(bottom).display !== 'none' &&
                !keyboard
                    ? bottom.getBoundingClientRect().height +
                      Math.max(0, parseFloat(getComputedStyle(bottom).bottom))
                    : 0;
            root.style.setProperty('--top-occupied', `${occupiedTop}px`);
            root.style.setProperty('--bottom-occupied', `${occupiedBottom}px`);
        };
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        };
        const observer = new ResizeObserver(schedule);
        if (header.current) observer.observe(header.current);
        if (navigation.current) observer.observe(navigation.current);
        window.addEventListener('resize', schedule);
        viewport?.addEventListener('resize', schedule);
        viewport?.addEventListener('scroll', schedule);
        document.addEventListener('focusin', schedule);
        document.addEventListener('focusout', schedule);
        measure();
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', schedule);
            viewport?.removeEventListener('resize', schedule);
            viewport?.removeEventListener('scroll', schedule);
            document.removeEventListener('focusin', schedule);
            document.removeEventListener('focusout', schedule);
            root.style.removeProperty('--top-occupied');
            root.style.removeProperty('--bottom-occupied');
            delete root.dataset.keyboard;
        };
    }, [header, navigation]);
}
