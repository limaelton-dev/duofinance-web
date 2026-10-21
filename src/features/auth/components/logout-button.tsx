'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { logout } from '@/lib/api/logout';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { LogOut } from '@/components/ui/icons';
import { useInvitationFlowContext } from '@/features/spaces/context/invitation-flow-provider';
import { useOptionalSpaceContextInstance } from '@/features/spaces/context/space-context-provider';

import { authenticatedContextQueryOptions } from '../hooks/use-authenticated-context';
import { useCsrf } from '../hooks/use-csrf';
import { getAuthErrorMessage } from '../utils/get-auth-error-message';
import formStyles from './auth-form.module.css';
import styles from './logout-button.module.css';

export function LogoutButton({ menuItem = false }: { menuItem?: boolean }) {
    const queryClient = useQueryClient();
    const csrf = useCsrf();
    const invitationFlow = useInvitationFlowContext();
    const spaceContext = useOptionalSpaceContextInstance();
    const switchBlocked = useSyncExternalStore(
        spaceContext?.subscribe ?? (() => () => {}),
        () => spaceContext?.getSnapshot().switchBlocked ?? false,
        () => false,
    );
    const submittingRef = useRef(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    async function clearSession(): Promise<void> {
        await csrf.invalidateToken();

        await queryClient.cancelQueries({
            queryKey: authenticatedContextQueryOptions.queryKey,
            exact: true,
        });

        queryClient.setQueryData(
            authenticatedContextQueryOptions.queryKey,
            null,
        );
    }

    const signOut = useMutation({
        mutationFn: async () => {
            const token = await csrf.ensureToken();
            await logout(token);
        },
        retry: false,
        networkMode: 'always',
        gcTime: 0,
        onSuccess: clearSession,
        onError: async (error) => {
            if (error instanceof ApiError && error.status === 401) {
                await clearSession();
                return;
            }

            setErrorMessage(
                getAuthErrorMessage(
                    error,
                    'Não foi possível sair. Tente novamente.',
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

    function handleLogout() {
        if (submittingRef.current || signOut.isSuccess) {
            return;
        }
        if (spaceContext && !spaceContext.canLeave()) return;

        setErrorMessage(null);
        invitationFlow.clear();
        submittingRef.current = true;
        signOut.mutate();
    }

    const isBusy = signOut.isPending || signOut.isSuccess;
    const visibleError =
        errorMessage ??
        (csrf.error
            ? getAuthErrorMessage(
                  csrf.error,
                  'Não foi possível preparar a saída. Tente novamente.',
              )
            : null);

    const disabled = isBusy || csrf.isFetching || switchBlocked;
    const button = (
        <Button
            type="button"
            variant="ghost"
            className={styles.button}
            onClick={handleLogout}
            disabled={disabled}
        >
            <LogOut aria-hidden="true" size={18} />
            {signOut.isSuccess
                ? 'Saída confirmada...'
                : signOut.isPending
                  ? 'Saindo...'
                  : csrf.isFetching
                    ? 'Preparando...'
                    : visibleError
                      ? 'Tentar novamente'
                      : 'Sair'}
        </Button>
    );

    return (
        <div className={styles.actions} aria-busy={signOut.isPending}>
            {visibleError && (
                <p role="alert" className={formStyles.error}>
                    {visibleError}
                </p>
            )}
            {menuItem ? (
                <DropdownMenuItem
                    asChild
                    disabled={disabled}
                    onSelect={(event) => event.preventDefault()}
                >
                    {button}
                </DropdownMenuItem>
            ) : (
                button
            )}
        </div>
    );
}
