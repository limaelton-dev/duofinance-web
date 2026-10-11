const historyIndex = '__prosperaHistoryIndex';
let initialized = false;
let guard: (() => boolean) | null = null;
export function registerTraversalGuard(value: () => boolean): () => void {
    guard = value;
    return () => {
        if (guard === value) guard = null;
    };
}
export function currentHistoryIndex(): number | null {
    const value = window.history.state?.[historyIndex];
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
            if (destination !== null && guard && !guard()) {
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
