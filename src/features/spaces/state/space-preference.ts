const prefix = 'duofinance:space-context:v1:';
const legacyPrefix = 'prospera-mais:space-context:v1:';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function spacePreferenceKey(personId: string): string {
    return prefix + personId;
}

export function isSpaceId(value: string): boolean {
    return uuid.test(value);
}

export const spacePreference = {
    read(personId: string): string | null {
        try {
            const current = window.sessionStorage.getItem(
                spacePreferenceKey(personId),
            );
            if (current !== null) return isSpaceId(current) ? current : null;

            const legacy = window.sessionStorage.getItem(
                legacyPrefix + personId,
            );
            if (legacy === null || !isSpaceId(legacy)) return null;
            // Keep the selected space usable even when storage rejects migration.
            spacePreference.write(personId, legacy);
            return legacy;
        } catch {
            return null;
        }
    },
    write(personId: string, spaceId: string): void {
        if (!isSpaceId(spaceId)) return;
        try {
            window.sessionStorage.setItem(
                spacePreferenceKey(personId),
                spaceId,
            );
            window.sessionStorage.removeItem(legacyPrefix + personId);
        } catch {
            // Selection remains usable in memory when storage is unavailable.
        }
    },
    clear(personId: string): void {
        for (const key of [
            spacePreferenceKey(personId),
            legacyPrefix + personId,
        ]) {
            try {
                window.sessionStorage.removeItem(key);
            } catch {
                // Storage can be blocked independently of the session.
            }
        }
    },
};
