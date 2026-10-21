'use client';

import {
    useLayoutEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight } from './icons';
import {
    civilValue,
    isCivilValueAllowed,
    type DateConstraints,
} from '@/lib/civil-date';
import styles from './date-input.module.css';

// Internal picker contract. The native input and its events remain in DateInput.
type DateCalendarProps = {
    titleId: string;
    monthOnly: boolean;
    initialDate: Date;
    selected?: Date;
    today: Date;
    min?: Date;
    max?: Date;
    constraints: DateConstraints;
    required: boolean;
    onChoose: (value: string) => void;
};

function calendarDate(year: number, month: number, day = 1) {
    const date = new Date(0);
    date.setFullYear(year, month, day);
    date.setHours(12, 0, 0, 0);
    return date;
}

export function DateCalendar({
    titleId,
    monthOnly,
    initialDate,
    selected,
    today,
    min,
    max,
    constraints,
    required,
    onChoose: choose,
}: DateCalendarProps) {
    const [month, setMonth] = useState(() =>
        calendarDate(initialDate.getFullYear(), initialDate.getMonth()),
    );
    const [focused, setFocused] = useState(() =>
        civilValue(initialDate, monthOnly),
    );
    const pendingFocus = useRef(false);
    const allowed = (value: string) =>
        isCivilValueAllowed(value, monthOnly, constraints);
    useLayoutEffect(() => {
        if (!pendingFocus.current) return;
        pendingFocus.current = false;
        document.getElementById(`${titleId}-${focused}`)?.focus();
    }, [focused, titleId]);

    function calendarKeyboard(
        event: KeyboardEvent<HTMLButtonElement>,
        date: Date,
    ) {
        const target = calendarDate(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
        );
        const key = event.key;
        const columns = monthOnly
            ? getComputedStyle(
                  event.currentTarget.closest('[role="group"]')!,
              ).gridTemplateColumns.split(' ').length
            : 7;
        const monthDelta = monthOnly ? 1 : 0;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
            const delta =
                key === 'ArrowLeft'
                    ? -1
                    : key === 'ArrowRight'
                      ? 1
                      : key === 'ArrowUp'
                        ? -columns
                        : columns;
            if (monthOnly) target.setMonth(target.getMonth() + delta);
            else target.setDate(target.getDate() + delta);
        } else if (key === 'Home' || key === 'End') {
            if (monthOnly) target.setMonth(key === 'Home' ? 0 : 11);
            else
                target.setDate(
                    target.getDate() +
                        (key === 'Home'
                            ? -target.getDay()
                            : 6 - target.getDay()),
                );
        } else if (key === 'PageUp' || key === 'PageDown') {
            const direction = key === 'PageUp' ? -1 : 1;
            const destination = calendarDate(
                date.getFullYear(),
                date.getMonth() +
                    direction * (event.shiftKey || monthDelta ? 12 : 1),
            );
            target.setDate(1);
            target.setFullYear(
                destination.getFullYear(),
                destination.getMonth(),
                Math.min(
                    date.getDate(),
                    calendarDate(
                        destination.getFullYear(),
                        destination.getMonth() + 1,
                        0,
                    ).getDate(),
                ),
            );
        } else return;
        event.preventDefault();
        if (target.getFullYear() < 1 || target.getFullYear() > 9999) return;
        const direction = target < date ? -1 : 1;
        // Skip disabled dates while respecting min/max and step, including
        // keyboard movement across month/year boundaries and leap days.
        for (let attempt = 0; attempt < 3660; attempt++) {
            const value = civilValue(target, monthOnly);
            if (allowed(value)) {
                setMonth(calendarDate(target.getFullYear(), target.getMonth()));
                setFocused(value);
                pendingFocus.current = true;
                return;
            }
            if ((min && target < min) || (max && target > max)) return;
            if (monthOnly) target.setMonth(target.getMonth() + direction);
            else target.setDate(target.getDate() + direction);
        }
    }

    const firstDay = calendarDate(month.getFullYear(), month.getMonth());
    const lastDay = calendarDate(month.getFullYear(), month.getMonth() + 1, 0);
    const cellCount =
        Math.ceil((firstDay.getDay() + lastDay.getDate()) / 7) * 7;
    const days = Array.from({ length: cellCount }, (_, index) => {
        const day = index - firstDay.getDay() + 1;
        return day >= 1 && day <= lastDay.getDate()
            ? calendarDate(month.getFullYear(), month.getMonth(), day)
            : null;
    });
    const previous = calendarDate(
        month.getFullYear() - (monthOnly ? 1 : 0),
        month.getMonth() - (monthOnly ? 0 : 1),
    );
    const next = calendarDate(
        month.getFullYear() + (monthOnly ? 1 : 0),
        month.getMonth() + (monthOnly ? 0 : 1),
    );
    const label = monthOnly
        ? String(month.getFullYear())
        : new Intl.DateTimeFormat('pt-BR', {
              month: 'long',
              year: 'numeric',
          }).format(month);
    const visibleChoices = monthOnly
        ? Array.from({ length: 12 }, (_, index) =>
              calendarDate(month.getFullYear(), index),
          )
        : days.filter((date): date is Date => date !== null);
    const viewFocus = visibleChoices.some(
        (date) => civilValue(date, monthOnly) === focused && allowed(focused),
    )
        ? focused
        : visibleChoices
              .map((date) => civilValue(date, monthOnly))
              .find(allowed);
    const renderChoice = (date: Date, text: string) => {
        const value = civilValue(date, monthOnly);
        const active = selected && value === civilValue(selected, monthOnly);
        return (
            <button
                id={`${titleId}-${value}`}
                type="button"
                disabled={!allowed(value)}
                aria-pressed={Boolean(active)}
                aria-current={
                    value === civilValue(today, monthOnly) ? 'date' : undefined
                }
                aria-label={
                    monthOnly
                        ? undefined
                        : new Intl.DateTimeFormat('pt-BR', {
                              dateStyle: 'full',
                          }).format(date)
                }
                tabIndex={value === viewFocus ? 0 : -1}
                onFocus={() => setFocused(value)}
                onKeyDown={(event) => calendarKeyboard(event, date)}
                onClick={() => choose(value)}
            >
                {text}
            </button>
        );
    };

    return (
        <>
            <h2 id={titleId} className={styles.title}>
                {monthOnly ? 'Escolher mês' : 'Escolher data'}
            </h2>
            <div className={styles.monthHeader}>
                <button
                    type="button"
                    aria-label={monthOnly ? 'Ano anterior' : 'Mês anterior'}
                    disabled={
                        previous.getFullYear() < 1 ||
                        Boolean(
                            min &&
                            (monthOnly
                                ? previous.getFullYear() < min.getFullYear()
                                : civilValue(previous, true) <
                                  civilValue(min, true)),
                        )
                    }
                    onClick={() => setMonth(previous)}
                >
                    <ChevronLeft size={20} aria-hidden="true" />
                </button>
                <span aria-live="polite">{label}</span>
                <button
                    type="button"
                    aria-label={monthOnly ? 'Próximo ano' : 'Próximo mês'}
                    disabled={
                        next.getFullYear() > 9999 ||
                        Boolean(
                            max &&
                            (monthOnly
                                ? next.getFullYear() > max.getFullYear()
                                : civilValue(next, true) >
                                  civilValue(max, true)),
                        )
                    }
                    onClick={() => setMonth(next)}
                >
                    <ChevronRight size={20} aria-hidden="true" />
                </button>
            </div>
            {monthOnly ? (
                <div
                    className={styles.monthGrid}
                    role="group"
                    aria-label="Meses"
                >
                    {Array.from({ length: 12 }, (_, index) => {
                        const date = calendarDate(month.getFullYear(), index);
                        return (
                            <span key={index}>
                                {renderChoice(
                                    date,
                                    new Intl.DateTimeFormat('pt-BR', {
                                        month: 'short',
                                    }).format(date),
                                )}
                            </span>
                        );
                    })}
                </div>
            ) : (
                <DayGrid
                    days={days}
                    label={label}
                    selected={selected}
                    renderChoice={renderChoice}
                />
            )}
            <div className={styles.actions}>
                <button
                    type="button"
                    disabled={required}
                    onClick={() => choose('')}
                >
                    Limpar
                </button>
                <button
                    type="button"
                    disabled={!allowed(civilValue(today, monthOnly))}
                    onClick={() => choose(civilValue(today, monthOnly))}
                >
                    {monthOnly ? 'Mês atual' : 'Hoje'}
                </button>
            </div>
        </>
    );
}

function DayGrid({
    days,
    label,
    selected,
    renderChoice,
}: {
    days: (Date | null)[];
    label: string;
    selected?: Date;
    renderChoice: (date: Date, text: string) => ReactNode;
}) {
    const selectedValue = selected ? civilValue(selected, false) : undefined;
    const weekdays = Array.from({ length: 7 }, (_, index) =>
        calendarDate(2026, 9, 18 + index),
    );
    const weekdayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
    const weekdayText = new Intl.DateTimeFormat('pt-BR', { weekday: 'narrow' });
    return (
        <div className={styles.calendarScroll}>
            <table className={styles.calendar} role="grid" aria-label={label}>
                <thead>
                    <tr>
                        {weekdays.map((date, index) => (
                            <th
                                key={index}
                                scope="col"
                                aria-label={weekdayLabel.format(date)}
                            >
                                {weekdayText.format(date)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: days.length / 7 }, (_, week) => (
                        <tr key={week}>
                            {days
                                .slice(week * 7, week * 7 + 7)
                                .map((date, index) => {
                                    const value = date
                                        ? civilValue(date, false)
                                        : undefined;
                                    return (
                                        <td
                                            key={index}
                                            data-day={value}
                                            aria-selected={Boolean(
                                                value &&
                                                value === selectedValue,
                                            )}
                                        >
                                            {date &&
                                                renderChoice(
                                                    date,
                                                    String(date.getDate()),
                                                )}
                                        </td>
                                    );
                                })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
