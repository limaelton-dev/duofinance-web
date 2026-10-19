'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { registerTraversalGuard } from '@/features/spaces/state/navigation-history';
export function useSpaceLeaveGuard(
    dirty: boolean,
    busy: boolean,
    discard: () => void,
) {
    const context = useSpaceContextInstance();
    const state = useRef({ dirty, busy, discard });
    useLayoutEffect(() => {
        state.current = { dirty, busy, discard };
    }, [dirty, busy, discard]);
    useEffect(() => {
        const allow = () => {
            const value = state.current;
            if (value.busy) return false;
            if (!value.dirty) return true;
            if (!window.confirm('Sair sem salvar?')) return false;
            value.discard();
            state.current.dirty = false;
            return true;
        };
        const unregister = context.registerLeaveGuard(allow);
        const unload = (event: BeforeUnloadEvent) => {
            if (state.current.dirty || state.current.busy) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', unload);
        // Cancel traversal before the router changes the mounted form. No history entries are added.
        const navigation = (window as Window & { navigation?: EventTarget })
            .navigation;
        const navigate = (event: Event) => {
            const traversal = event as Event & { navigationType?: string };
            if (
                traversal.navigationType === 'traverse' &&
                event.cancelable &&
                !allow()
            )
                event.preventDefault();
        };
        navigation?.addEventListener('navigate', navigate);
        const unguard = registerTraversalGuard(allow);
        return () => {
            unregister();
            unguard();
            window.removeEventListener('beforeunload', unload);
            navigation?.removeEventListener('navigate', navigate);
        };
    }, [context]);
}
