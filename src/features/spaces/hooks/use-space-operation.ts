'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/features/auth/hooks/use-csrf';
import {
    getAuthenticatedPersonId,
    getSpacesSessionEpoch,
} from '@/features/spaces/cache/spaces-session';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import type { SpaceContextCapture } from '@/features/spaces/state/space-context';
import { ApiError } from '@/lib/api/api-error';

export type SpaceOperationOptions<Input, Result> = {
    execute: (
        spaceId: string,
        input: Input,
        token: string,
        key: string,
        signal: AbortSignal,
    ) => Promise<Result>;
    onSuccess: (
        result: Result,
        capture: SpaceContextCapture,
    ) => void | Promise<unknown>;
    onAccessLost?: () => void;
    onConflict?: () => void;
    onFieldError?: (fields: string[]) => void;
    onRejected?: (failure: ApiError) => void | Promise<unknown>;
    invalidate?: (input: Input) => boolean;
    invalidates?: readonly string[];
};
type Attempt<Input> = {
    input: Input;
    key: string;
    capture: SpaceContextCapture;
    epoch: number;
};

// A command owns its captured destination and key until its outcome is known.
export function useSpaceOperation<Input, Result>(
    options: SpaceOperationOptions<Input, Result>,
) {
    const client = useQueryClient(),
        context = useSpaceContextInstance(),
        csrf = useCsrf();
    const handlers = useRef(options);
    useLayoutEffect(() => {
        handlers.current = options;
    }, [options]);
    const attempt = useRef<Attempt<Input> | null>(null),
        release = useRef<(() => void) | null>(null);
    const controller = useRef<AbortController | null>(null),
        mounted = useRef(false),
        sending = useRef(false),
        retryAt = useRef(0);
    const [isPending, setPending] = useState(false),
        [canRetry, setRetry] = useState(false);
    const [error, setError] = useState<string | null>(null),
        [fields, setFields] = useState<string[]>([]);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            controller.current?.abort();
            release.current?.();
        };
    }, []);
    function current(value: Attempt<Input>) {
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
    async function execute(value: Attempt<Input>) {
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
        let confirmed = false;
        try {
            const token = await csrf.ensureToken();
            if (!current(value)) return;
            const result = await handlers.current.execute(
                value.capture.spaceId,
                value.input,
                token,
                value.key,
                controller.current.signal,
            );
            if (!current(value)) return;
            if (
                result &&
                typeof result === 'object' &&
                'spaceId' in result &&
                result.spaceId !== value.capture.spaceId
            )
                throw new Error(
                    'Não foi possível confirmar o destino do registro.',
                );
            confirmed = true;
            finish();
            if (handlers.current.invalidate?.(value.input) !== false) {
                const families = handlers.current.invalidates ?? [
                    'routine',
                    'shopping',
                    'finances',
                    'today',
                    'spaces',
                    'closure',
                ];
                for (const family of families) {
                    const queryKey =
                        family === 'spaces'
                            ? [family, value.capture.personId]
                            : [
                                  family,
                                  value.capture.personId,
                                  value.capture.spaceId,
                              ];
                    void client.invalidateQueries({ queryKey });
                }
            }
            await handlers.current.onSuccess(result, value.capture);
        } catch (failure) {
            if (!current(value)) return;
            // A failed refresh or success callback cannot undo a confirmed write.
            if (confirmed) {
                setError(
                    'O registro foi confirmado, mas a consulta atual não pôde ser atualizada. Atualize a consulta.',
                );
                return;
            }
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
                    ? failure.status === 409
                        ? `${failure.message} Os dados mudaram. Atualize a consulta e revise antes de confirmar novamente.`
                        : failure.message
                    : 'Ainda não conseguimos confirmar o registro. Reenvie a mesma tentativa para recuperar o resultado.',
            );
            setRetry(retryable);
            if (retryable) {
                retryAt.current =
                    failure instanceof ApiError && failure.status === 429
                        ? Date.now() + (failure.retryAfterSeconds ?? 0) * 1000
                        : 0;
                if (csrfRejected) {
                    try {
                        await csrf.refreshToken();
                    } catch {
                        if (current(value))
                            setError(
                                'Não foi possível renovar a proteção. Tente novamente.',
                            );
                    }
                }
            } else {
                finish();
                if (failure instanceof ApiError) {
                    if (failure.status === 409) handlers.current.onConflict?.();
                    const details = failure.details as {
                        fields?: { field: string }[];
                    } | null;
                    const invalid =
                        details?.fields?.map((field) => field.field) ?? [];
                    if (failure.code === 'SPACE_NOT_FOUND') {
                        if (handlers.current.onAccessLost)
                            handlers.current.onAccessLost();
                        else void context.accessLost(value.capture.spaceId);
                    } else if (handlers.current.onRejected) {
                        try {
                            await handlers.current.onRejected(failure);
                        } catch {
                            if (current(value))
                                setError(
                                    'Não foi possível atualizar a consulta. Atualize e revise antes de confirmar novamente.',
                                );
                        }
                    }
                    // Publish field errors with the final pending=false update,
                    // so focus effects run after disabled controls are unlocked.
                    if (current(value)) {
                        handlers.current.onFieldError?.(invalid);
                        setFields(invalid);
                    }
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
        submit(input: Input) {
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
