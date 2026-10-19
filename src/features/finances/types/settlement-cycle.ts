import type {
    InterMemberPosition,
    PositionDirection,
} from './inter-member-position';
import type { Member } from './shared-expense';
import type { SettlementOrigin } from './settlement-origin';

export type SettlementView = 'OPEN' | 'UPCOMING' | 'OVERDUE' | 'FINALIZED';
export type SettlementCycle = {
    id: string;
    version: number;
    targetDate: string;
    status: 'OPEN' | 'FINALIZED';
    isOverdue: boolean;
    obligationCount: number;
    openObligationCount: number;
    totals: {
        originalAmountInCents: string;
        recognizedAmountInCents: string;
        resolvedAmountInCents: string;
        transferredAmountInCents: string;
        remainingAmountInCents: string;
        compensatedAmountInCents?: string;
        waivedAmountInCents?: string;
        reversedTransferredAmountInCents?: string;
        effectiveTransferredAmountInCents?: string;
        reversedCompensatedAmountInCents?: string;
        effectiveCompensatedAmountInCents?: string;
    };
    position: InterMemberPosition['summary'];
};
type SettlementContext = {
    spaceId: string;
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    actorMemberId: string;
    members: Member[];
    referenceDate: string;
};
export type SettlementCycles = SettlementContext & {
    items: SettlementCycle[];
    page: { view: SettlementView; pageSize: 20; nextCursor: string | null };
};
export type SettlementCycleDetail = SettlementContext & {
    cycle: SettlementCycle & {
        finalizedAt: string | null;
        canFinalize?: boolean;
        finalizationBlockReason?: string | null;
    };
    items: {
        id: string;
        version: number;
        status:
            'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'RECONCILED' | 'WAIVED';
        debtorMemberId: string;
        creditorMemberId: string;
        originalAmountInCents: number;
        recognizedAmountInCents: number;
        resolvedAmountInCents: number;
        remainingAmountInCents: number;
        compensatedAmountInCents?: number | string;
        waivedAmountInCents?: number;
        factDate: string;
        registeredAt: string;
        origin: SettlementOrigin;
    }[];
    page: {
        direction: PositionDirection;
        pageSize: 20;
        nextCursor: string | null;
    };
};
