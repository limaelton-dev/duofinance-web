'use client';

import { useSyncExternalStore } from 'react';

const changeEvent = 'junelo:url-preferences';

function subscribe(notify: () => void) {
    window.addEventListener('popstate', notify);
    window.addEventListener(changeEvent, notify);
    return () => {
        window.removeEventListener('popstate', notify);
        window.removeEventListener(changeEvent, notify);
    };
}

/** Non-sensitive list filters only. Form inputs and command attempts stay local. */
export function useUrlPreferences<T extends Record<string, string>>(
    defaults: T,
    validators: { [K in keyof T]: (value: string) => boolean },
): [T, (values: Partial<T>) => void] {
    const search = useSyncExternalStore(
        subscribe,
        () => window.location.search,
        () => '',
    );
    const params = new URLSearchParams(search);
    const values = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
        const value = params.get(key);
        if (value !== null && validators[key](value))
            values[key] = value as T[typeof key];
    }
    function update(next: Partial<T>) {
        const url = new URL(window.location.href);
        for (const key of Object.keys(next) as (keyof T & string)[]) {
            const value = next[key];
            if (value === undefined || !validators[key](value)) continue;
            if (value === defaults[key]) url.searchParams.delete(key);
            else url.searchParams.set(key, value);
        }
        // Retain Next's router state and the existing traversal-guard index.
        window.history.replaceState(
            window.history.state,
            '',
            `${url.pathname}${url.search}${url.hash}`,
        );
        window.dispatchEvent(new Event(changeEvent));
    }
    return [values, update];
}
