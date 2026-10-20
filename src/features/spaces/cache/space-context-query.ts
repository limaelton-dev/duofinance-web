import type { QueryClient } from '@tanstack/react-query';
import { queryInSpacesSession } from './spaces-session';

export function queryInSpaceContext<T extends { spaceId: string }>(
    client: QueryClient,
    personId: string,
    spaceId: string,
    isCurrent: () => boolean,
    request: () => Promise<T>,
): Promise<T> {
    return queryInSpacesSession(client, personId, async () => {
        try {
            const result = await request();
            if (!isCurrent() || result.spaceId !== spaceId)
                throw new Error('O espaço foi alterado.');
            return result;
        } catch (error) {
            if (!isCurrent()) throw new Error('O espaço foi alterado.');
            throw error;
        }
    });
}
