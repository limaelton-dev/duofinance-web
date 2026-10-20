const prefix = 'junelo:space-context:v1:';
const legacyPrefixes = [
    'duofinance:space-context:v1:',
    'prospera-mais:space-context:v1:',
];
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

            for (const legacyPrefix of legacyPrefixes) {
                const legacy = window.sessionStorage.getItem(
                    legacyPrefix + personId,
                );
                if (legacy === null) continue;
                if (!isSpaceId(legacy)) return null;
                // Keep the selected space usable even when storage rejects migration.
                spacePreference.write(personId, legacy);
                return legacy;
            }
            return null;
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
        } catch {
            // Selection remains usable in memory when storage is unavailable.
            return;
        }
        for (const legacyPrefix of legacyPrefixes) {
            try {
                window.sessionStorage.removeItem(legacyPrefix + personId);
            } catch {
                // Attempt cleanup of each legacy key independently.
            }
        }
    },
    clear(personId: string): void {
        for (const key of [
            spacePreferenceKey(personId),
            ...legacyPrefixes.map((legacyPrefix) => legacyPrefix + personId),
        ]) {
            try {
                window.sessionStorage.removeItem(key);
            } catch {
                // Storage can be blocked independently of the session.
            }
        }
    },
};
