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
import { settleExternalLiability } from '@/lib/api/external-liability-settlement';
import { invalidateIncomeQueries } from '../cache/income-query-keys';
import type { SettleExternalLiabilityResult } from '../types/external-liability-settlement';

import type { SettleExternalLiabilityInput } from '../types/external-liability-settlement';

type Work = {
    id: string;
    liabilityId: string;
    input: SettleExternalLiabilityInput;
};
type Attempt = {
    work: Work;
    key: string;
    capture: SpaceContextCapture;
    epoch: number;
};

export function useExternalLiabilitySettlementCommand(
    onSuccess: (result: SettleExternalLiabilityResult) => void,
    onAccessLost: () => void,
) {
    const client = useQueryClient(),
        context = useSpaceContextInstance(),
        csrf = useCsrf();
    const attempt = useRef<Attempt | null>(null),
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
            const work = value.work;
            const result = await settleExternalLiability(
                value.capture.spaceId,
                work.id,
                work.liabilityId,
                work.input,
                token,
                value.key,
                controller.current.signal,
            );
            if (!current(value)) return;
            if (
                result.spaceId !== value.capture.spaceId ||
                result.commitment.kind !== 'EXPENSE' ||
                result.commitment.id !== work.id ||
                result.settlement.externalLiabilityId !== work.liabilityId
            )
                throw new Error(
                    'Não foi possível confirmar o destino do registro.',
                );
            finish();
            invalidateIncomeQueries(
                client,
                value.capture.personId,
                value.capture.spaceId,
            );
            onSuccess(result);
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
                    : 'Não foi possível confirmar o resultado. Tente novamente para recuperar a mesma tentativa.',
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
                    const details = failure.details as {
                        fields?: { field: string }[];
                    };
                    setFields(
                        details.fields?.map((field) => field.field) ?? [],
                    );
                    if (failure.code === 'SPACE_NOT_FOUND') onAccessLost();
                }
            }
        } finally {
            sending.current = false;
            if (mounted.current) setPending(false);
        }
    }
    function submit(work: Work) {
        const capture = context.capture();
        if (!capture || attempt.current || sending.current) return;
        void execute({
            work: structuredClone(work),
            key: crypto.randomUUID(),
            capture: { ...capture },
            epoch: getSpacesSessionEpoch(client),
        });
    }
    return {
        isPending,
        canRetry,
        error,
        fields,
        submit,
        retry: () => {
            if (attempt.current) void execute(attempt.current);
        },
    };
}
