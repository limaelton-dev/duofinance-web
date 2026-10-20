import { expect, test } from '@playwright/test';
import {
    spacePreference,
    spacePreferenceKey,
} from '../../src/features/spaces/state/space-preference';
import {
    currentHistoryIndex,
    registerTraversalGuard,
    trackNavigationHistory,
} from '../../src/features/spaces/state/navigation-history';

const person = '11111111-1111-4111-8111-111111111111';
const otherPerson = '22222222-2222-4222-8222-222222222222';
const previousSpace = '33333333-3333-4333-8333-333333333333';
const currentSpace = '44444444-4444-4444-8444-444444444444';
const legacyKey = (id: string) => `prospera-mais:space-context:v1:${id}`;

function withWindow(value: unknown, run: () => void) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value });
    try {
        run();
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
        else Reflect.deleteProperty(globalThis, 'window');
    }
}

function storageFixture() {
    const stored = new Map<string, string>();
    const sessionStorage = {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => {
            stored.set(key, value);
        },
        removeItem: (key: string) => {
            stored.delete(key);
        },
    };
    return { stored, sessionStorage };
}

test('migrates only the current person’s legacy space preference', () => {
    const { stored, sessionStorage } = storageFixture();
    stored.set(legacyKey(person), previousSpace);
    stored.set(legacyKey(otherPerson), currentSpace);
    withWindow({ sessionStorage }, () => {
        expect(spacePreference.read(person)).toBe(previousSpace);
        expect([...stored]).toEqual([
            [legacyKey(otherPerson), currentSpace],
            [spacePreferenceKey(person), previousSpace],
        ]);
        spacePreference.write(person, currentSpace);
        expect(spacePreference.read(person)).toBe(currentSpace);
    });
});

test('the current preference wins over an older selection and logout clears both', () => {
    const { stored, sessionStorage } = storageFixture();
    stored.set(legacyKey(person), previousSpace);
    stored.set(spacePreferenceKey(person), currentSpace);
    stored.set(legacyKey(otherPerson), previousSpace);
    withWindow({ sessionStorage }, () => {
        expect(spacePreference.read(person)).toBe(currentSpace);
        spacePreference.clear(person);
        expect(spacePreference.read(person)).toBeNull();
        expect([...stored]).toEqual([[legacyKey(otherPerson), previousSpace]]);
    });
});

test('does not migrate malformed legacy data or resurrect it over a current key', () => {
    const { stored, sessionStorage } = storageFixture();
    withWindow({ sessionStorage }, () => {
        stored.set(legacyKey(person), '{"spaceId":"secret"}');
        expect(spacePreference.read(person)).toBeNull();
        expect(stored.has(spacePreferenceKey(person))).toBe(false);
        stored.set(legacyKey(person), previousSpace);
        stored.set(spacePreferenceKey(person), 'invalid');
        expect(spacePreference.read(person)).toBeNull();
        expect(stored.get(spacePreferenceKey(person))).toBe('invalid');
    });
});

test('preserves the legacy selection when storage refuses the migration write', () => {
    const { stored, sessionStorage } = storageFixture();
    stored.set(legacyKey(person), previousSpace);
    sessionStorage.setItem = () => {
        throw new Error('Quota exceeded');
    };
    withWindow({ sessionStorage }, () => {
        expect(spacePreference.read(person)).toBe(previousSpace);
        expect([...stored]).toEqual([[legacyKey(person), previousSpace]]);
        spacePreference.clear(person);
        expect(spacePreference.read(person)).toBeNull();
    });
});

test('logout attempts to remove the legacy key even if removing the new key fails', () => {
    const { stored, sessionStorage } = storageFixture();
    stored.set(legacyKey(person), previousSpace);
    sessionStorage.removeItem = (key: string) => {
        if (key === spacePreferenceKey(person)) throw new Error('Blocked');
        stored.delete(key);
    };
    withWindow({ sessionStorage }, () => {
        spacePreference.clear(person);
        expect(stored.has(legacyKey(person))).toBe(false);
    });
});

test('preserves navigation indices and leave guards across legacy history entries', () => {
    let state: Record<string, unknown> = {
        __prosperaHistoryIndex: 4,
        __NA: true,
    };
    let popstate: (event: { stopImmediatePropagation: () => void }) => void;
    const traversals: number[] = [];
    let stopped = 0;
    const history = {
        get state() {
            return state;
        },
        pushState(data: Record<string, unknown>) {
            state = data;
        },
        replaceState(data: Record<string, unknown>) {
            state = data;
        },
        go(delta: number) {
            traversals.push(delta);
        },
    };
    withWindow(
        {
            history,
            location: { href: 'http://localhost/finances' },
            addEventListener(event: string, callback: typeof popstate) {
                expect(event).toBe('popstate');
                popstate = callback;
            },
        },
        () => {
            expect(currentHistoryIndex()).toBe(4);
            trackNavigationHistory();
            expect(history.state).toMatchObject({
                __duofinanceHistoryIndex: 4,
                __NA: true,
            });
            history.pushState({ __NA: true });
            expect(currentHistoryIndex()).toBe(5);
            history.replaceState({ __NA: true });
            expect(currentHistoryIndex()).toBe(5);
            const removeGuard = registerTraversalGuard(() => false);
            try {
                state = { __prosperaHistoryIndex: 3 };
                popstate({ stopImmediatePropagation: () => stopped++ });
                expect(traversals).toEqual([2]);
                expect(stopped).toBe(1);
                state = { __duofinanceHistoryIndex: 5 };
                popstate({ stopImmediatePropagation: () => stopped++ });
                expect(stopped).toBe(2);
            } finally {
                removeGuard();
            }
            state = {
                __duofinanceHistoryIndex: 2,
                __prosperaHistoryIndex: 99,
            };
            expect(currentHistoryIndex()).toBe(2);
            popstate({ stopImmediatePropagation: () => stopped++ });
            expect(traversals).toEqual([2]);
            expect(stopped).toBe(2);
        },
    );
});
