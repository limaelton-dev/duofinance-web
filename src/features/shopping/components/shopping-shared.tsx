'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons';
import { useSpaceQuery } from '@/features/spaces/hooks/use-space-query';
import { getShopping } from '@/lib/api/shopping';
import type { ShoppingPage } from '../types/shopping';
import styles from './shopping.module.css';

export const shoppingKey = (
    personId: string,
    spaceId: string,
    ...parts: unknown[]
) => ['shopping', personId, spaceId, ...parts] as const;
export const ShoppingLink = Link;
export function ShoppingHeading({
    spaceId,
    title,
    children,
}: {
    spaceId: string;
    title: string;
    children?: ReactNode;
}) {
    return (
        <header className={styles.heading}>
            <ShoppingLink
                className={styles.back}
                href={`/spaces/${spaceId}/shopping`}
            >
                <ArrowLeft aria-hidden="true" size={20} />
                Voltar às compras
            </ShoppingLink>
            <h1>{title}</h1>
            {children}
        </header>
    );
}
export function ShoppingPagination({
    next,
    previous,
    onNext,
    onPrevious,
    disabled = false,
}: {
    next: string | null;
    previous: boolean;
    onNext: () => void;
    onPrevious: () => void;
    disabled?: boolean;
}) {
    return (
        <div className={styles.actions}>
            {previous && (
                <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={onPrevious}
                >
                    Página anterior
                </Button>
            )}
            {next && (
                <Button variant="outline" disabled={disabled} onClick={onNext}>
                    Ver mais
                </Button>
            )}
        </div>
    );
}
export function useShoppingPage<T>(
    personId: string,
    spaceId: string,
    path: string,
    filters: Record<string, string> = {},
    enabled = true,
) {
    const [cursors, setCursors] = useState<(string | null)[]>([null]);
    const cursor = cursors[cursors.length - 1];
    const params = new URLSearchParams({ limit: '20', ...filters });
    if (cursor) params.set('cursor', cursor);
    const suffix = `${path}?${params}`;
    const query = useSpaceQuery(
        personId,
        spaceId,
        shoppingKey(personId, spaceId, suffix),
        enabled,
        (signal) => getShopping<ShoppingPage<T>>(spaceId, suffix, signal),
    );
    return {
        query,
        pagination: (
            <ShoppingPagination
                next={query.data?.nextCursor ?? null}
                previous={cursors.length > 1}
                disabled={query.isFetching}
                onNext={() => {
                    const next = query.data?.nextCursor;
                    if (next) setCursors([...cursors, next]);
                }}
                onPrevious={() => setCursors(cursors.slice(0, -1))}
            />
        ),
    };
}
