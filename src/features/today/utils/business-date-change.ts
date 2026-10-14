const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export function millisecondsUntilBusinessDateChange(now = Date.now()): number {
    const currentDate = formatter.format(now);
    let before = now;
    let after = now + 36 * 60 * 60 * 1000;
    while (after - before > 1) {
        const middle = Math.floor((before + after) / 2);
        if (formatter.format(middle) === currentDate) before = middle;
        else after = middle;
    }
    return after - now;
}
