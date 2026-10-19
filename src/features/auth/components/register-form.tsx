'use client';

import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { useInvitationFlowContext } from '@/features/spaces/context/invitation-flow-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    registerAccount,
    type RegisterAccountInput,
} from '@/lib/api/register-account';

import { useCsrf } from '../hooks/use-csrf';
import { getAuthErrorMessage } from '../utils/get-auth-error-message';
import { setAuthenticatedContext } from '../utils/set-authenticated-context';

import styles from './auth-form.module.css';
import { PasswordField } from './password-field';
import { useAuthRetry } from './use-auth-retry';

export function RegisterForm() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const csrf = useCsrf();
    const invitationFlow = useInvitationFlowContext();
    const formRef = useRef<HTMLFormElement>(null);
    const submittingRef = useRef(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const errorRef = useRef<HTMLDivElement>(null);
    const { retrySeconds, respectRetryAfter } = useAuthRetry();

    useEffect(() => {
        if (errorMessage) errorRef.current?.focus();
    }, [errorMessage]);

    const registration = useMutation({
        mutationFn: async (input: RegisterAccountInput) => {
            const token = await csrf.ensureToken();
            return registerAccount(input, token);
        },
        retry: false,
        networkMode: 'always',
        gcTime: 0,
        onSuccess: async (context) => {
            await setAuthenticatedContext(queryClient, context);
            await csrf.invalidateToken();
            formRef.current?.reset();
            invitationFlow.syncPerson(context.person.id);
            router.replace(
                invitationFlow.hasPendingInvitation() ? '/invitations' : '/',
            );
        },
        onError: async (error) => {
            respectRetryAfter(error);
            setErrorMessage(
                getAuthErrorMessage(
                    error,
                    'Não foi possível concluir o cadastro. Tente novamente.',
                ),
            );

            if (
                error instanceof ApiError &&
                error.status === 403 &&
                error.code === 'INVALID_CSRF_TOKEN'
            ) {
                try {
                    await csrf.refreshToken();
                } catch (refreshError) {
                    setErrorMessage(
                        getAuthErrorMessage(
                            refreshError,
                            'Não foi possível preparar uma nova tentativa. Tente novamente em alguns instantes.',
                        ),
                    );
                }
            }
        },
        onSettled: () => {
            submittingRef.current = false;
        },
    });

    function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        if (
            submittingRef.current ||
            registration.isSuccess ||
            retrySeconds > 0
        ) {
            return;
        }

        setErrorMessage(null);
        setFieldErrors({});

        const data = new FormData(event.currentTarget);
        const displayName = String(data.get('displayName') ?? '').trim();
        const email = String(data.get('email') ?? '').trim();
        const password = String(data.get('password') ?? '');
        const confirmPassword = String(data.get('confirmPassword') ?? '');
        const nameLength = Array.from(displayName).length;
        const passwordLength = Array.from(password).length;
        const errors: Record<string, string> = {};

        if (nameLength < 2 || nameLength > 80) {
            errors.displayName = 'Informe um nome com 2 a 80 caracteres.';
        }

        const emailInput = event.currentTarget.elements.namedItem(
            'email',
        ) as HTMLInputElement;
        if (!email || !emailInput.validity.valid)
            errors.email = 'Informe um e-mail válido.';

        if (passwordLength < 6 || passwordLength > 128) {
            errors.password = 'A senha deve ter de 6 a 128 caracteres.';
        }

        if (password !== confirmPassword) {
            errors.confirmPassword = 'As senhas não coincidem.';
        }

        if (Object.keys(errors).length) {
            setFieldErrors(errors);
            (
                event.currentTarget.elements.namedItem(
                    Object.keys(errors)[0],
                ) as HTMLInputElement
            )?.focus();
            return;
        }

        submittingRef.current = true;
        registration.mutate({ displayName, email, password });
    }

    const isBusy = registration.isPending || registration.isSuccess;
    const visibleError =
        errorMessage ??
        (csrf.error
            ? getAuthErrorMessage(
                  csrf.error,
                  'Não foi possível preparar o cadastro. Tente novamente.',
              )
            : null);

    return (
        <form
            ref={formRef}
            method="post"
            noValidate
            onSubmit={handleSubmit}
            className={styles.form}
            aria-busy={registration.isPending}
        >
            <fieldset
                disabled={isBusy}
                className={styles.fields}
                aria-label="Dados da conta"
            >
                <div className={styles.field}>
                    <Label htmlFor="displayName">Nome</Label>
                    <Input
                        id="displayName"
                        name="displayName"
                        autoComplete="name"
                        aria-invalid={Boolean(fieldErrors.displayName)}
                        aria-describedby={
                            fieldErrors.displayName
                                ? 'displayName-error'
                                : undefined
                        }
                        required
                    />
                    {fieldErrors.displayName && (
                        <p id="displayName-error" className={styles.error}>
                            {fieldErrors.displayName}
                        </p>
                    )}
                </div>

                <div className={styles.field}>
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        maxLength={254}
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        aria-invalid={Boolean(fieldErrors.email)}
                        aria-describedby={
                            fieldErrors.email ? 'email-error' : undefined
                        }
                        required
                    />
                    {fieldErrors.email && (
                        <p id="email-error" className={styles.error}>
                            {fieldErrors.email}
                        </p>
                    )}
                </div>

                <PasswordField
                    id="password"
                    autoComplete="new-password"
                    error={fieldErrors.password}
                    hint="Use de 6 a 128 caracteres."
                />
                <PasswordField
                    id="confirmPassword"
                    label="Confirmar senha"
                    autoComplete="new-password"
                    error={fieldErrors.confirmPassword}
                />
            </fieldset>

            {visibleError && (
                <div
                    ref={errorRef}
                    tabIndex={-1}
                    role="alert"
                    className={styles.errorSummary}
                >
                    <p className={styles.error}>{visibleError}</p>
                </div>
            )}
            {retrySeconds > 0 && (
                <p role="status" className={styles.hint}>
                    Aguarde {retrySeconds} segundos para tentar novamente.
                </p>
            )}

            <Button
                type="submit"
                className={styles.button}
                disabled={isBusy || csrf.isFetching || retrySeconds > 0}
            >
                {registration.isSuccess
                    ? 'Conta criada! Redirecionando...'
                    : registration.isPending
                      ? 'Criando conta...'
                      : csrf.isFetching
                        ? 'Preparando acesso...'
                        : visibleError
                          ? 'Tentar novamente'
                          : 'Criar conta'}
            </Button>
        </form>
    );
}
