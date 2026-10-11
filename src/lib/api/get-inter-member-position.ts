import { apiRequest } from './api-client';
import type {
    InterMemberPosition,
    PositionDirection,
} from '@/features/finances/types/inter-member-position';

export function getInterMemberPosition(
    spaceId: string,
    direction: PositionDirection,
    cursor: string | null,
    signal?: AbortSignal,
) {
    const query = new URLSearchParams({ direction });
    if (cursor !== null) query.set('cursor', cursor);
    return apiRequest<InterMemberPosition>(
        `/spaces/${spaceId}/inter-member-position?${query}`,
        { signal },
    );
}
