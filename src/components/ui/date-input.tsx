'use client';

import { useId, useRef, useState, type ComponentProps } from 'react';
import { CalendarDays } from './icons';
import { DateCalendar } from './date-calendar';
import { FloatingLayer, leaveFloatingLayer } from './floating-layer';
import { assignRef } from './slot';
import { businessToday } from '@/features/finances/utils/expense-money';
import {
    civilDate,
    isCivilValueAllowed,
    type DateConstraints,
} from '@/lib/civil-date';
import styles from './date-input.module.css';

export function DateInput({ ref, type, ...props }: ComponentProps<'input'>) {
    const input = useRef<HTMLInputElement>(null);
    const anchor = useRef<HTMLSpanElement>(null);
    const [constraints, setConstraints] = useState<DateConstraints>({});
    const [open, setOpen] = useState(false);
    const [required, setRequired] = useState(Boolean(props.required));
    const [selected, setSelected] = useState<Date>();
    const [initialDate, setInitialDate] = useState(() =>
        civilDate(businessToday())!,
    );
    const titleId = useId();
    const monthOnly = type === 'month';
    const min = civilDate(String(props.min ?? ''));
    const max = civilDate(String(props.max ?? ''));
    const today = civilDate(businessToday())!;

    function dismiss(restore: boolean) {
        setOpen(false);
        if (restore) {
            input.current?.focus({ preventScroll: true });
            input.current?.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
            });
        }
    }

    function changeOpen() {
        const element = input.current;
        if (!element || element.matches(':disabled') || element.readOnly)
            return;
        if (open) {
            dismiss(true);
            return;
        }
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        setConstraints({
            min: element.min,
            max: element.max,
            step: element.step,
            base: element.getAttribute('value') ?? undefined,
        });
        setRequired(element.required);
        const date = civilDate(element.value);
        setSelected(date);
        const initial = date ?? today;
        const clamped =
            min && initial < min ? min : max && initial > max ? max : initial;
        setInitialDate(clamped);
        setOpen(true);
    }

    function choose(value: string) {
        const element = input.current;
        if (
            !element ||
            element.matches(':disabled') ||
            element.readOnly ||
            (!value && element.required)
        )
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
        // The original input remains the source of truth for React handlers,
        // dirty tracking, native validation and normal form submission.
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        dismiss(true);
    }

    return (
        <>
            <span ref={anchor} className={styles.field}>
                <input
                    {...props}
                    type={type}
                    data-slot="input"
                    data-date-field=""
                    ref={(element) => {
                        input.current = element;
                        return assignRef(ref, element);
                    }}
                    onKeyDown={(event) => {
                        props.onKeyDown?.(event);
                        if (
                            !event.defaultPrevented &&
                            event.altKey &&
                            event.key === 'ArrowDown'
                        ) {
                            event.preventDefault();
                            changeOpen();
                        }
                    }}
                />
                <button
                    type="button"
                    data-slot="date-trigger"
                    className={styles.trigger}
                    disabled={props.disabled || props.readOnly}
                    aria-label={monthOnly ? 'Escolher mês' : 'Abrir calendário'}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={open ? `${titleId}-dialog` : undefined}
                    onClick={(event) => {
                        event.stopPropagation();
                        changeOpen();
                    }}
                >
                    <CalendarDays size={20} aria-hidden="true" />
                </button>
            </span>
            {open && (
                <FloatingLayer
                    id={`${titleId}-dialog`}
                    anchor={anchor}
                    className={styles.popover}
                    role="dialog"
                    aria-labelledby={titleId}
                    data-floating-layer="calendar"
                    onDismiss={dismiss}
                    initialFocus={(element) =>
                        element.querySelector<HTMLButtonElement>(
                            '[aria-pressed][tabindex="0"]:not(:disabled)',
                        ) ??
                        element.querySelector<HTMLButtonElement>(
                            'button:not(:disabled)',
                        )
                    }
                    onKeyDown={(event) => {
                        if (event.key !== 'Tab') return;
                        const buttons = Array.from(
                            event.currentTarget.querySelectorAll<HTMLButtonElement>(
                                'button:not(:disabled)',
                            ),
                        );
                        if (
                            (event.shiftKey &&
                                document.activeElement === buttons[0]) ||
                            (!event.shiftKey &&
                                document.activeElement === buttons.at(-1))
                        ) {
                            event.preventDefault();
                            dismiss(false);
                            leaveFloatingLayer(input.current, event.shiftKey);
                        }
                    }}
                >
                    <DateCalendar
                        titleId={titleId}
                        monthOnly={monthOnly}
                        initialDate={initialDate}
                        selected={selected}
                        today={today}
                        min={min}
                        max={max}
                        constraints={constraints}
                        required={required}
                        onChoose={choose}
                    />
                </FloatingLayer>
            )}
        </>
    );
}
