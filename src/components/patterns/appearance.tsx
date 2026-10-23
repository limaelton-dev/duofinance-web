'use client';

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import styles from './appearance.module.css';

type Preferences = { theme: 'system' | 'light' | 'dark'; reduced: boolean };
const defaults: Preferences = { theme: 'system', reduced: false };
const key = 'junelo:appearance';
let current = defaults;
const listeners = new Set<() => void>();
function read() {
    try {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null');
        current = {
            theme:
                value?.theme === 'light' || value?.theme === 'dark'
                    ? value.theme
                    : 'system',
            reduced: value?.reduced === true,
        };
    } catch {
        current = defaults;
    }
    listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
function update(value: Preferences) {
    current = value;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* The session preference still works without storage. */
    }
    listeners.forEach((listener) => listener());
}
const AppearanceContext = createContext(defaults);

export function AppearanceProvider({ children }: { children: ReactNode }) {
    const value = useSyncExternalStore(
        subscribe,
        () => current,
        () => defaults,
    );
    useEffect(() => {
        read();
        const changed = (event: StorageEvent) => {
            if (event.key === key || event.key === null) read();
        };
        window.addEventListener('storage', changed);
        return () => window.removeEventListener('storage', changed);
    }, []);
    useEffect(() => {
        const root = document.documentElement;
        if (value.theme === 'system') delete root.dataset.theme;
        else root.dataset.theme = value.theme;
        root.dataset.effects = value.reduced ? 'reduced' : 'full';
    }, [value]);
    return (
        <AppearanceContext.Provider value={value}>
            <link
                rel="icon"
                type="image/svg+xml"
                sizes="any"
                href={`/brand/favicon-${value.theme}.svg`}
            />
            {children}
        </AppearanceContext.Provider>
    );
}

export function AppearanceSettings() {
    const value = useContext(AppearanceContext);
    const dialog = useRef<HTMLDialogElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    return (
        <>
            <Button
                variant="ghost"
                className={styles.trigger}
                onClick={() => {
                    dialog.current?.showModal();
                    heading.current?.focus();
                }}
            >
                Aparência
            </Button>
            <dialog
                ref={dialog}
                className={styles.dialog}
                aria-label="Aparência do Junelo"
                onKeyDown={(event) => {
                    if (event.key !== 'Tab') return;
                    const controls = Array.from(
                        event.currentTarget.querySelectorAll<HTMLElement>(
                            'button:not(:disabled), input:not(:disabled)',
                        ),
                    ).filter(
                        (control) =>
                            !(control instanceof HTMLInputElement) ||
                            control.type !== 'radio' ||
                            control.checked,
                    );
                    const first = controls[0];
                    const last = controls.at(-1);
                    if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first?.focus();
                    } else if (
                        event.shiftKey &&
                        (document.activeElement === first ||
                            document.activeElement === heading.current)
                    ) {
                        event.preventDefault();
                        last?.focus();
                    }
                }}
            >
                <div className={styles.content}>
                    <header className={styles.header}>
                        <h2 ref={heading} tabIndex={-1}>
                            Do seu jeito
                        </h2>
                        <p>Ajuste a leitura e os efeitos neste navegador.</p>
                    </header>
                    <fieldset className={styles.options}>
                        <legend>Tema</legend>
                        {(
                            [
                                ['system', 'Sistema'],
                                ['light', 'Claro'],
                                ['dark', 'Escuro'],
                            ] as const
                        ).map(([theme, label]) => (
                            <label key={theme} className={styles.option}>
                                <input
                                    type="radio"
                                    name="appearance-theme"
                                    checked={value.theme === theme}
                                    onChange={() => update({ ...value, theme })}
                                />
                                <span>{label}</span>
                            </label>
                        ))}
                    </fieldset>
                    <label className={styles.effects}>
                        <input
                            type="checkbox"
                            checked={value.reduced}
                            onChange={(event) =>
                                update({
                                    ...value,
                                    reduced: event.target.checked,
                                })
                            }
                        />
                        <span>
                            <strong>Reduzir efeitos visuais</strong>
                            <small>
                                Superfícies opacas e transições sem movimento.
                            </small>
                        </span>
                    </label>
                    <Button onClick={() => dialog.current?.close()}>
                        Concluir
                    </Button>
                </div>
            </dialog>
        </>
    );
}
