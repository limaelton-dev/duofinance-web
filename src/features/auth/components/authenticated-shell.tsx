'use client';

import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Wallet, Settings2, UserRound } from 'lucide-react';
import { Brand } from '@/components/patterns/brand';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { LogoutButton } from './logout-button';
import { useAuthenticatedContext } from '../hooks/use-authenticated-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { SpaceSwitcher } from '@/features/spaces/components/space-switcher';
import styles from './authenticated-shell.module.css';

export function AuthenticatedShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const currentPath = useRef(pathname);
    useLayoutEffect(() => {
        currentPath.current = pathname;
    }, [pathname]);
    const context = useSpaceContextInstance();
    const space = useSpaceContext();
    const auth = useAuthenticatedContext({ enabled: false });
    const visitedPath = useRef<string | null>(null);
    const [validatedPath, setValidatedPath] = useState<string | null>(null);
    const [renderedPath, setRenderedPath] = useState(pathname);
    if (renderedPath !== pathname) {
        setRenderedPath(pathname);
        setValidatedPath(null);
    }
    const detailId = /^\/spaces\/([^/]+)(?:\/.*)?$/.exec(pathname)?.[1];
    const routeSpaceId = detailId && detailId !== 'new' ? detailId : null;
    useEffect(() => {
        if (space.phase !== 'ready') return;
        if (visitedPath.current === pathname) {
            if (
                routeSpaceId &&
                space.activeSpaceId &&
                space.activeSpaceId !== routeSpaceId &&
                space.accessFallback
            ) {
                const generation = context.getSnapshot().generation;
                void Promise.resolve().then(() => {
                    const next = context.getSnapshot();
                    if (
                        currentPath.current === pathname &&
                        next.generation === generation &&
                        next.phase === 'ready' &&
                        next.activeSpaceId
                    )
                        router.replace(`/spaces/${next.activeSpaceId}`);
                });
            }
            if (
                routeSpaceId &&
                space.activeSpaceId === routeSpaceId &&
                !space.routeIssue
            ) {
                const generation = context.getSnapshot().generation;
                void Promise.resolve().then(() => {
                    const snapshot = context.getSnapshot();
                    if (
                        currentPath.current === pathname &&
                        snapshot.generation === generation &&
                        snapshot.phase === 'ready' &&
                        snapshot.activeSpaceId === routeSpaceId &&
                        !snapshot.routeIssue
                    )
                        setValidatedPath(pathname);
                });
            }
            return;
        }
        visitedPath.current = pathname;
        if (routeSpaceId) {
            const request = context.visit(routeSpaceId);
            const generation = context.getSnapshot().generation;
            void request.then((success) => {
                const snapshot = context.getSnapshot();
                if (
                    success &&
                    currentPath.current === pathname &&
                    snapshot.generation === generation
                )
                    setValidatedPath(pathname);
                if (
                    success &&
                    currentPath.current === pathname &&
                    snapshot.generation === generation &&
                    snapshot.activeSpaceId &&
                    snapshot.activeSpaceId !== routeSpaceId
                )
                    router.replace(`/spaces/${snapshot.activeSpaceId}`);
            });
        }
    }, [
        context,
        pathname,
        routeSpaceId,
        router,
        space.activeSpaceId,
        space.phase,
        space.accessFallback,
        space.routeIssue,
    ]);
    const routeIssue =
        space.routeIssue?.spaceId === routeSpaceId ? space.routeIssue : null;
    const globalPage = pathname === '/spaces' || pathname === '/spaces/new';
    const canMountPage =
        space.initialized && (!routeSpaceId || validatedPath === pathname);
    const showPage =
        space.initialized &&
        (globalPage ||
            (space.phase === 'ready' &&
                !routeIssue &&
                (!routeSpaceId ||
                    (space.activeSpaceId === routeSpaceId &&
                        validatedPath === pathname))));
    const navigation = [
        {
            href: '/',
            label: 'Hoje',
            icon: CalendarDays,
            current: pathname === '/',
        },
        ...(space.activeSpaceId
            ? [
                  {
                      href: `/spaces/${space.activeSpaceId}/finances`,
                      label: 'Finanças',
                      icon: Wallet,
                      current:
                          /\/(finances|expenses|incomes|recurring-commitments|installment-commitments)(?:\/|$)/.test(
                              pathname,
                          ),
                  },
              ]
            : []),
    ];
    const navigationLinks = navigation.map(
        ({ href, label, icon: Icon, current }) => (
            <Link
                key={label}
                href={href}
                aria-current={current ? 'page' : undefined}
                aria-disabled={space.switchBlocked || undefined}
                className={styles.navLink}
            >
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
            </Link>
        ),
    );
    return (
        <div
            className={styles.shell}
            onClickCapture={(event) => {
                if (
                    event.target instanceof Element &&
                    event.target.closest('a') &&
                    !context.canLeave()
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }}
        >
            <a className={styles.skipLink} href="#main-content">
                Ir para o conteúdo
            </a>
            <aside className={styles.sidebar}>
                <Link
                    href="/"
                    aria-label="Prospera Mais, Hoje"
                    className={styles.brandLink}
                >
                    <Brand />
                </Link>
                <nav
                    aria-label="Navegação principal"
                    className={styles.desktopNavigation}
                >
                    {navigationLinks}
                </nav>
                <div className={styles.sidebarFooter}>
                    <Link
                        href="/spaces"
                        className={styles.manageLink}
                        aria-disabled={space.switchBlocked || undefined}
                    >
                        <Settings2 size={18} aria-hidden="true" />
                        Meus espaços
                    </Link>
                    <div className={styles.accountName}>
                        {auth.data?.person.displayName}
                    </div>
                    <LogoutButton />
                </div>
            </aside>
            <header className={`${styles.header} navigation-glass`}>
                <div className={styles.headerContent}>
                    <Link
                        href="/"
                        aria-label="Prospera Mais, Hoje"
                        className={styles.mobileBrand}
                    >
                        <Brand />
                    </Link>
                    <div className={styles.accountMenu}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Conta e espaços"
                                >
                                    <UserRound aria-hidden="true" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel className="break-words">
                                    {auth.data?.person.displayName}
                                </DropdownMenuLabel>
                                <DropdownMenuItem asChild>
                                    <Link href="/spaces">
                                        <Settings2 aria-hidden="true" />
                                        Meus espaços
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <LogoutButton menuItem />
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <SpaceSwitcher />
                </div>
            </header>
            <main
                id="main-content"
                tabIndex={-1}
                className={styles.content}
                onClickCapture={(event) => {
                    if (
                        space.switchBlocked &&
                        event.target instanceof Element &&
                        event.target.closest('a')
                    )
                        event.preventDefault();
                }}
            >
                {routeIssue && (
                    <section className="space-y-4 rounded-lg border bg-card p-6">
                        <h1>Espaço indisponível</h1>
                        <p role="alert">{routeIssue.message}</p>
                        <Button
                            type="button"
                            onClick={() => void context.visit(routeSpaceId!)}
                        >
                            Tentar novamente
                        </Button>
                    </section>
                )}
                {!showPage && !routeIssue && space.phase !== 'error' && (
                    <div
                        role="status"
                        aria-label="Carregando espaço"
                        className="space-y-6"
                    >
                        <span className="sr-only">Carregando espaço…</span>
                        <Skeleton className="h-9 w-36" />
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                )}
                <div hidden={!showPage} inert={!showPage}>
                    {canMountPage ? children : null}
                </div>
            </main>
            <nav
                aria-label="Navegação principal"
                className={`${styles.mobileNavigation} navigation-glass`}
            >
                {navigationLinks}
            </nav>
        </div>
    );
}
