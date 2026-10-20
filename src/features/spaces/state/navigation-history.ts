const historyIndex = '__juneloHistoryIndex';
const previousHistoryIndex = '__duofinanceHistoryIndex';
const legacyHistoryIndex = '__prosperaHistoryIndex';
let initialized = false;
const guards = new Set<() => boolean>();
export function registerTraversalGuard(value: () => boolean): () => void {
    guards.add(value);
    return () => {
        guards.delete(value);
    };
}
export function currentHistoryIndex(): number | null {
    // Entries created before the rename remain reachable through Back/Forward.
    const value =
        window.history.state?.[historyIndex] ??
        window.history.state?.[previousHistoryIndex] ??
        window.history.state?.[legacyHistoryIndex];
    return typeof value === 'number' ? value : null;
}
export function trackNavigationHistory(): void {
    if (initialized) return;
    initialized = true;
    let restoring = false;
    let position = currentHistoryIndex() ?? 0;
    window.addEventListener(
        'popstate',
        (event) => {
            const destination = currentHistoryIndex();
            if (restoring) {
                restoring = false;
                event.stopImmediatePropagation();
                return;
            }
            if (
                destination !== null &&
                ![...guards].every((guard) => guard())
            ) {
                event.stopImmediatePropagation();
                restoring = true;
                window.history.go(position - destination);
            } else if (destination !== null) position = destination;
        },
        true,
    );
    const push = window.history.pushState.bind(window.history),
        replace = window.history.replaceState.bind(window.history);
    replace(
        { ...window.history.state, [historyIndex]: currentHistoryIndex() ?? 0 },
        '',
        window.location.href,
    );
    window.history.pushState = (data, unused, url) =>
        push(
            {
                ...data,
                [historyIndex]: (position = (currentHistoryIndex() ?? 0) + 1),
            },
            unused,
            url,
        );
    window.history.replaceState = (data, unused, url) =>
        replace(
            { ...data, [historyIndex]: currentHistoryIndex() ?? 0 },
            unused,
            url,
        );
}
