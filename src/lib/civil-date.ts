/** Civil dates stay in local calendar coordinates, never parsed as UTC. */
export function civilDate(value: string): Date | undefined {
    const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
    if (!match || Number(match[1]) === 0) return undefined;
    const date = new Date(0);
    date.setFullYear(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3] ?? 1),
    );
    date.setHours(12, 0, 0, 0);
    return civilValue(date, !match[3]) === value ? date : undefined;
}

export function civilValue(date: Date, monthOnly: boolean) {
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}${monthOnly ? '' : `-${String(date.getDate()).padStart(2, '0')}`}`;
}

export type DateConstraints = {
    min?: string;
    max?: string;
    step?: string;
    base?: string;
};

/** Also enforces month constraints when the browser falls back to text inputs. */
export function isCivilValueAllowed(
    value: string,
    monthOnly: boolean,
    constraints: DateConstraints,
) {
    if (!civilDate(value) || value.length !== (monthOnly ? 7 : 10))
        return false;
    const { min, max, step, base } = constraints;
    if (min && civilDate(min) && value < min) return false;
    if (max && civilDate(max) && value > max) return false;
    if (step === 'any') return true;
    const interval = Number(step) > 0 ? Number(step) : 1;
    const origin =
        min && civilDate(min)
            ? min
            : base && civilDate(base)
              ? base
              : monthOnly
                ? '1970-01'
                : '1970-01-01';
    const ordinal = (date: string) =>
        monthOnly
            ? Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
            : Date.parse(`${date}T12:00:00Z`) / 86_400_000;
    const steps = (ordinal(value) - ordinal(origin)) / interval;
    return Math.abs(steps - Math.round(steps)) < 1e-7;
}
