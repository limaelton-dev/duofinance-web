export function isPastOrCurrentCivilDate(value: string, referenceDate: string) {
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        value.startsWith('0000-') ||
        value > referenceDate
    )
        return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
        Number.isFinite(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
    );
}
