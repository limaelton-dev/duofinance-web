'use client';

import Link from 'next/link';
import { ArrowRight, Check, Plus, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';

import { useSpaces } from '../hooks/use-spaces';
import { getSpacesErrorMessage } from '../utils/get-spaces-error-message';
import styles from './spaces.module.css';
import { useSpaceContext } from '../hooks/use-space-context';

const statuses = {
    ACTIVE: 'Ativo',
    CLOSING: 'Em encerramento',
    CLOSED: 'Encerrado',
} as const;

export function SpacesListPage() {
    const auth = useAuthenticatedContext({ enabled: false });
    const query = useSpaces(auth.data?.person.id ?? null);
    const context = useSpaceContext();

    if (!auth.data) {
        return null;
    }

    return (
        <section className={styles.stack}>
            <header className={styles.header}>
                <div className={styles.stack}>
                    <h1 className={styles.title}>Meus espaços</h1>
                    <p className={styles.muted}>
                        Seus registros pessoais e compartilhados, cada um no seu
                        lugar.
                    </p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/spaces/new">
                        <Plus size={18} aria-hidden="true" />
                        Criar espaço compartilhado
                    </Link>
                </Button>
            </header>

            {query.isPending && (
                <div className={styles.stack} role="status" aria-busy="true">
                    <p>Carregando espaços...</p>
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                </div>
            )}

            {query.isError && (
                <div className={styles.stack}>
                    <p role="alert" className={styles.error}>
                        {getSpacesErrorMessage(query.error)}
                    </p>

                    <Button
                        type="button"
                        variant="outline"
                        disabled={query.isFetching}
                        onClick={() => void query.refetch()}
                    >
                        Tentar novamente
                    </Button>
                </div>
            )}

            {query.data && (
                <>
                    <ul className={styles.list}>
                        {query.data.items.map((space) => (
                            <li key={space.id}>
                                <Link
                                    href={`/spaces/${space.id}`}
                                    className={styles.spaceRow}
                                    aria-labelledby={`space-name-${space.id}`}
                                    aria-describedby={`space-context-${space.id}`}
                                    aria-current={
                                        context.activeSpaceId === space.id
                                            ? 'true'
                                            : undefined
                                    }
                                >
                                    <span
                                        className={styles.spaceIcon}
                                        aria-hidden="true"
                                    >
                                        {space.type === 'PERSONAL' ? (
                                            <UserRound size={20} />
                                        ) : (
                                            <Users size={20} />
                                        )}
                                    </span>
                                    <span className={styles.spaceCopy}>
                                        <span
                                            id={`space-name-${space.id}`}
                                            className={styles.spaceName}
                                        >
                                            {space.label}
                                        </span>
                                        <span
                                            id={`space-context-${space.id}`}
                                            className={styles.muted}
                                        >
                                            {space.type === 'PERSONAL'
                                                ? 'Pessoal'
                                                : 'Compartilhado'}
                                            {' · '}
                                            {statuses[space.status]}
                                        </span>
                                        {context.activeSpaceId === space.id && (
                                            <span className={styles.selected}>
                                                <Check
                                                    size={14}
                                                    aria-hidden="true"
                                                />
                                                Espaço selecionado
                                            </span>
                                        )}
                                    </span>
                                    <ArrowRight
                                        className={styles.rowArrow}
                                        size={18}
                                        aria-hidden="true"
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                    {!query.data.items.some(
                        (space) => space.type === 'SHARED',
                    ) && (
                        <p className={styles.muted}>
                            Você ainda não possui espaços compartilhados.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}
