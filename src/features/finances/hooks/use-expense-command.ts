'use client';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/features/auth/hooks/use-csrf';
import {
    getAuthenticatedPersonId,
    getSpacesSessionEpoch,
} from '@/features/spaces/cache/spaces-session';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import type { SpaceContextCapture } from '@/features/spaces/state/space-context';
import { ApiError } from '@/lib/api/api-error';
import { recordExpense } from '@/lib/api/shared-expense';
import type { ExpenseInput, ExpenseResult } from '../types/shared-expense';
type Attempt = {
    input: ExpenseInput;
    key: string;
    capture: SpaceContextCapture;
    epoch: number;
};
export function useExpenseCommand(
    onSuccess: (result: ExpenseResult) => void,
    onConflict: () => Promise<unknown>,
    onAccessLost: () => void,
    onFieldError: (fields: string[]) => void,
) {
    const client = useQueryClient(),
        context = useSpaceContextInstance(),
        csrf = useCsrf();
    const attempt = useRef<Attempt | null>(null),
        release = useRef<(() => void) | null>(null),
        controller = useRef<AbortController | null>(null),
        mounted = useRef(false),
        sending = useRef(false),
        retryAt = useRef(0);
    const [isPending, setPending] = useState(false),
        [canRetry, setRetry] = useState(false),
        [error, setError] = useState<string | null>(null),
        [fields, setFields] = useState<string[]>([]);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            controller.current?.abort();
            release.current?.();
        };
    }, []);
    function current(value: Attempt) {
        return (
            mounted.current &&
            context.isCurrent(value.capture) &&
            getAuthenticatedPersonId(client) === value.capture.personId &&
            getSpacesSessionEpoch(client) === value.epoch
        );
    }
    function finish() {
        attempt.current = null;
        release.current?.();
        release.current = null;
        setRetry(false);
    }
    async function execute(value: Attempt) {
        if (sending.current || !current(value)) return;
        if (Date.now() < retryAt.current) {
            setError('Aguarde o prazo indicado antes de tentar novamente.');
            return;
        }
        sending.current = true;
        release.current ??= context.lock();
        attempt.current = value;
        setPending(true);
        setRetry(false);
        setError(null);
        setFields([]);
        controller.current = new AbortController();
        try {
            const token = await csrf.ensureToken();
            if (!current(value)) return;
            const result = await recordExpense(
                value.capture.spaceId,
                value.input,
                token,
                value.key,
                controller.current.signal,
            );
            if (!current(value)) return;
            if (result.spaceId !== value.capture.spaceId)
                throw new Error(
                    'Não foi possível confirmar o destino do registro.',
                );
            finish();
            onSuccess(result);
            void client.invalidateQueries({
                queryKey: [
                    'finances',
                    value.capture.personId,
                    value.capture.spaceId,
                    'shared-cash-expense-options',
                ],
            });
        } catch (failure) {
            if (!current(value)) return;
            if (failure instanceof ApiError && failure.status === 401) {
                await client.cancelQueries(
                    { queryKey: ['auth', 'me'], exact: true },
                    { revert: false },
                );
                if (current(value)) client.setQueryData(['auth', 'me'], null);
                return;
            }
            const csrfRejected =
                failure instanceof ApiError &&
                failure.code === 'INVALID_CSRF_TOKEN';
            const retryable =
                !(failure instanceof ApiError) ||
                failure.status >= 500 ||
                failure.status === 429 ||
                csrfRejected;
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : 'Não foi possível confirmar o resultado. Tente novamente o envio para recuperar a mesma tentativa.',
            );
            setRetry(retryable);
            if (retryable) {
                retryAt.current =
                    failure instanceof ApiError && failure.status === 429
                        ? Date.now() + (failure.retryAfterSeconds ?? 0) * 1000
                        : 0;
                if (csrfRejected)
                    try {
                        await csrf.refreshToken();
                    } catch {
                        if (current(value))
                            setError(
                                'Não foi possível renovar a proteção. Tente novamente o envio.',
                            );
                    }
            } else {
                finish();
                if (failure instanceof ApiError) {
                    const details = failure.details as {
                        fields?: { field: string }[];
                    };
                    const fields = details.fields?.map((f) => f.field) ?? [];
                    onFieldError(fields);
                    setFields(fields);
                    if (failure.code === 'SPACE_NOT_FOUND') onAccessLost();
                    else if (
                        [
                            'EXPENSE_OPTIONS_CHANGED',
                            'SPACE_NOT_ACTIVE',
                            'SETTLEMENT_CYCLE_FINALIZED',
                            'CONCURRENT_MODIFICATION',
                            'SETTLEMENT_CYCLE_NOT_FOUND',
                        ].includes(failure.code)
                    )
                        await onConflict();
                }
            }
        } finally {
            sending.current = false;
            if (mounted.current) setPending(false);
        }
    }
    return {
        isPending,
        canRetry,
        error,
        fields,
        submit(input: ExpenseInput) {
            const capture = context.capture();
            if (!capture || attempt.current || sending.current) return;
            void execute({
                input: structuredClone(input),
                key: crypto.randomUUID(),
                capture: { ...capture },
                epoch: getSpacesSessionEpoch(client),
            });
        },
        retry() {
            if (attempt.current) void execute(attempt.current);
        },
    };
}
