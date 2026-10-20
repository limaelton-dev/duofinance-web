'use client';

import { useId, useRef, useState, type ComponentProps } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover } from 'radix-ui';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';
import { businessToday } from '@/features/finances/utils/expense-money';
import styles from './date-input.module.css';
import {
    civilDate,
    civilValue,
    isCivilValueAllowed,
    type DateConstraints,
} from '@/lib/civil-date';

export function DateInput({ ref, type, ...props }: ComponentProps<'input'>) {
    const input = useRef<HTMLInputElement>(null);
    const restoreFocus = useRef(true);
    const [constraints, setConstraints] = useState<DateConstraints>({});
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<Date>();
    const [month, setMonth] = useState<Date>(() => civilDate(businessToday())!);
    const titleId = useId();
    const monthOnly = type === 'month';
    const min = civilDate(String(props.min ?? ''));
    const max = civilDate(String(props.max ?? ''));
    const today = civilDate(businessToday())!;
    const yearMonth = (year: number, index = 0) =>
        civilDate(
            `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`,
        )!;

    function allowed(value: string) {
        return isCivilValueAllowed(value, monthOnly, constraints);
    }

    function changeOpen(next: boolean) {
        if (next) {
            if (input.current?.matches(':disabled') || props.readOnly) return;
            // WebKit may focus a segmented date input without scrolling it into
            // view. Position the anchor before measuring the floating calendar.
            input.current?.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
            });
            restoreFocus.current = true;
            setConstraints({
                min: input.current?.min,
                max: input.current?.max,
                step: input.current?.step,
                base: input.current?.getAttribute('value') ?? undefined,
            });
            const date = civilDate(input.current?.value ?? '');
            setSelected(date);
            const initial = date ?? today;
            setMonth(
                min && initial < min
                    ? min
                    : max && initial > max
                      ? max
                      : initial,
            );
        }
        setOpen(next);
    }

    function choose(value: string) {
        const element = input.current;
        if (!element || element.matches(':disabled') || element.readOnly)
            return;
        if (
            value &&
            !isCivilValueAllowed(value, monthOnly, {
                min: element.min,
                max: element.max,
                step: element.step,
                base: element.getAttribute('value') ?? undefined,
            })
        )
            return;
        // Use a real input event so existing React handlers, dirty tracking and
        // form submission continue to receive the original HTMLInputElement.
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        setOpen(false);
    }

    return (
        <Popover.Root open={open} onOpenChange={changeOpen}>
            <Popover.Anchor asChild>
                <span className={styles.field}>
                    <input
                        {...props}
                        type={type}
                        data-slot="input"
                        data-date-field=""
                        ref={(element) => {
                            input.current = element;
                            if (typeof ref === 'function') return ref(element);
                            if (ref) ref.current = element;
                        }}
                        onKeyDown={(event) => {
                            props.onKeyDown?.(event);
                            if (
                                !event.defaultPrevented &&
                                event.altKey &&
                                event.key === 'ArrowDown'
                            ) {
                                event.preventDefault();
                                changeOpen(true);
                            }
                        }}
                    />
                    <Popover.Trigger asChild>
                        <button
                            type="button"
                            data-slot="date-trigger"
                            className={styles.trigger}
                            disabled={props.disabled || props.readOnly}
                            aria-label={
                                monthOnly ? 'Escolher mês' : 'Abrir calendário'
                            }
                            onClick={(event) => event.stopPropagation()}
                        >
                            <CalendarDays size={20} aria-hidden="true" />
                        </button>
                    </Popover.Trigger>
                </span>
            </Popover.Anchor>
            <Popover.Portal>
                <Popover.Content
                    className={styles.popover}
                    sideOffset={8}
                    collisionPadding={12}
                    align="start"
                    aria-labelledby={titleId}
                    onInteractOutside={() => {
                        restoreFocus.current = false;
                    }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        if (restoreFocus.current) {
                            input.current?.focus({ preventScroll: true });
                            input.current?.scrollIntoView({
                                block: 'nearest',
                                inline: 'nearest',
                            });
                        }
                    }}
                >
                    <h2 id={titleId} className={styles.title}>
                        {monthOnly ? 'Escolher mês' : 'Escolher data'}
                    </h2>
                    {monthOnly ? (
                        <>
                            <div className={styles.monthHeader}>
                                <button
                                    type="button"
                                    aria-label="Ano anterior"
                                    disabled={
                                        month.getFullYear() <=
                                        (min?.getFullYear() ?? 1)
                                    }
                                    onClick={() =>
                                        setMonth(
                                            yearMonth(month.getFullYear() - 1),
                                        )
                                    }
                                >
                                    <ChevronLeft size={20} aria-hidden="true" />
                                </button>
                                <span aria-live="polite">
                                    {month.getFullYear()}
                                </span>
                                <button
                                    type="button"
                                    aria-label="Próximo ano"
                                    disabled={
                                        month.getFullYear() >=
                                        (max?.getFullYear() ?? 9999)
                                    }
                                    onClick={() =>
                                        setMonth(
                                            yearMonth(month.getFullYear() + 1),
                                        )
                                    }
                                >
                                    <ChevronRight
                                        size={20}
                                        aria-hidden="true"
                                    />
                                </button>
                            </div>
                            <div
                                className={styles.monthGrid}
                                role="group"
                                aria-label="Meses"
                            >
                                {Array.from({ length: 12 }, (_, index) => {
                                    const date = yearMonth(
                                        month.getFullYear(),
                                        index,
                                    );
                                    const value = civilValue(date, true);
                                    return (
                                        <button
                                            key={index}
                                            type="button"
                                            disabled={!allowed(value)}
                                            aria-pressed={
                                                selected
                                                    ? value ===
                                                      civilValue(selected, true)
                                                    : false
                                            }
                                            onClick={() => choose(value)}
                                        >
                                            {new Intl.DateTimeFormat('pt-BR', {
                                                month: 'short',
                                            }).format(date)}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <DayPicker
                            mode="single"
                            required
                            navLayout="after"
                            locale={ptBR}
                            today={today}
                            autoFocus
                            month={month}
                            onMonthChange={setMonth}
                            selected={selected}
                            startMonth={min}
                            endMonth={max}
                            disabled={(date) =>
                                !allowed(civilValue(date, false))
                            }
                            onSelect={(date) =>
                                date && choose(civilValue(date, false))
                            }
                            className={styles.calendar}
                            formatters={{
                                formatWeekdayName: (date) =>
                                    new Intl.DateTimeFormat('pt-BR', {
                                        weekday: 'narrow',
                                    }).format(date),
                            }}
                            labels={{
                                labelNext: () => 'Próximo mês',
                                labelPrevious: () => 'Mês anterior',
                            }}
                        />
                    )}
                    <div className={styles.actions}>
                        <button
                            type="button"
                            disabled={props.required}
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
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
