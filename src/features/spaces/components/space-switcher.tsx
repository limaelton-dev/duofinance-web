'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import { Settings2, Plus, UsersRound, UserRound } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContextInstance } from '../context/space-context-provider';
import { useSpaceContext } from '../hooks/use-space-context';
import { useSpaces } from '../hooks/use-spaces';
import styles from './space-switcher.module.css';
import { spaceSelectionPath } from '../utils/space-selection-path';

const statuses = {
    ACTIVE: 'Ativo',
    CLOSING: 'Em encerramento',
    CLOSED: 'Encerrado',
} as const;

export function SpaceSwitcher() {
    const router = useRouter();
    const pathname = usePathname();
    const currentPath = useRef(pathname);
    useLayoutEffect(() => {
        currentPath.current = pathname;
    }, [pathname]);
    const auth = useAuthenticatedContext({ enabled: false });
    const context = useSpaceContextInstance();
    const space = useSpaceContext();
    const list = useSpaces(
        space.phase === 'initializing' ? null : (auth.data?.person.id ?? null),
    );
    async function finishSelection(request: Promise<boolean>) {
        const originPath = currentPath.current;
        const generation = context.getSnapshot().generation;
        if (
            !(await request) ||
            context.getSnapshot().generation !== generation ||
            currentPath.current !== originPath
        )
            return;
        const selected = context.getSnapshot().currentSpace;
        if (
            /^\/spaces\/(?!new$)[^/]+(?:\/.*)?$/.test(currentPath.current) &&
            selected
        ) {
            router.replace(spaceSelectionPath(currentPath.current, selected));
        }
    }
    const loading =
        space.phase === 'initializing' || space.phase === 'switching';
    return (
        <section aria-label="Contexto do espaço" className={styles.context}>
            <div className={styles.selection}>
                <label htmlFor="active-space" className={styles.label}>
                    Espaço atual
                </label>
                <select
                    id="active-space"
                    aria-describedby={
                        space.currentSpace ? 'active-space-status' : undefined
                    }
                    value={space.activeSpaceId ?? ''}
                    className={styles.select}
                    disabled={
                        space.switchBlocked ||
                        space.items.length === 0 ||
                        space.phase === 'session'
                    }
                    onChange={(event) =>
                        void finishSelection(context.select(event.target.value))
                    }
                >
                    {!space.activeSpaceId && (
                        <option value="" disabled>
                            {space.phase === 'initializing'
                                ? 'Carregando espaços…'
                                : space.phase === 'switching'
                                  ? 'Trocando espaço…'
                                  : 'Selecione um espaço'}
                        </option>
                    )}
                    {[...space.items]
                        .sort((left, right) =>
                            left.type === right.type
                                ? 0
                                : left.type === 'PERSONAL'
                                  ? -1
                                  : 1,
                        )
                        .map((item) => (
                            <option value={item.id} key={item.id}>
                                {item.id === space.activeSpaceId
                                    ? item.label
                                    : `${item.label} · ${item.type === 'PERSONAL' ? 'Pessoal' : 'Compartilhado'} · ${statuses[item.status]}`}
                            </option>
                        ))}
                </select>
            </div>
            {space.currentSpace && (
                <p id="active-space-status" className={styles.current}>
                    {space.currentSpace.type === 'PERSONAL' ? (
                        <UserRound size={14} aria-hidden="true" />
                    ) : (
                        <UsersRound size={14} aria-hidden="true" />
                    )}
                    {space.currentSpace.type === 'PERSONAL'
                        ? 'Pessoal'
                        : 'Compartilhado'}{' '}
                    · {statuses[space.currentSpace.status]}
                </p>
            )}
            <div className={styles.manage}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Gerenciar espaços"
                            disabled={space.switchBlocked}
                        >
                            <Settings2 aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                            <Link href="/spaces">
                                <UsersRound aria-hidden="true" />
                                Meus espaços
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href="/spaces/new">
                                <Plus aria-hidden="true" />
                                Criar espaço compartilhado
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {loading && (
                <p role="status" aria-busy="true">
                    {space.phase === 'initializing'
                        ? 'Carregando espaços…'
                        : 'Trocando espaço…'}
                </p>
            )}
            {space.phase === 'error' && (
                <>
                    <p role="alert">{space.message}</p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void finishSelection(context.retry())}
                    >
                        Tentar novamente o espaço
                    </Button>
                </>
            )}
            {space.phase === 'ready' && space.message && (
                <p role="status">{space.message}</p>
            )}
            {space.switchBlocked && (
                <p role="status">
                    Conclua o envio ou resolva a tentativa pendente antes de
                    trocar de espaço.
                </p>
            )}
            {list.isError && space.phase === 'ready' && (
                <>
                    <p role="alert">Não foi possível atualizar os espaços.</p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void list.refetch()}
                    >
                        Tentar novamente a lista de espaços
                    </Button>
                </>
            )}
        </section>
    );
}
