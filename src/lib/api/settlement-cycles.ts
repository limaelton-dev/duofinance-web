import { apiRequest } from './api-client';
import type { PositionDirection } from '@/features/finances/types/inter-member-position';
import type {
    SettlementCycles,
    SettlementCycleDetail,
    SettlementView,
} from '@/features/finances/types/settlement-cycle';

export const getSettlementCycles = (
    spaceId: string,
    view: SettlementView,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<SettlementCycles>(
        `/spaces/${spaceId}/settlement-cycles?view=${view}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );
export const getSettlementCycle = (
    spaceId: string,
    cycleId: string,
    direction: PositionDirection,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<SettlementCycleDetail>(
        `/spaces/${spaceId}/settlement-cycles/${cycleId}?direction=${direction}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );
