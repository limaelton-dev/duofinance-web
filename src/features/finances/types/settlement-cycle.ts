import type {
    InterMemberPosition,
    ObligationOrigin,
    PositionDirection,
} from './inter-member-position';
import type { Member } from './shared-expense';

export type SettlementView = 'OPEN' | 'UPCOMING';
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
    items: (SettlementCycle & { status: 'OPEN' })[];
    page: { view: SettlementView; pageSize: 20; nextCursor: string | null };
};
export type SettlementCycleDetail = SettlementContext & {
    cycle: SettlementCycle & { finalizedAt: string | null };
    items: {
        id: string;
        version: number;
        status: 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'RECONCILED';
        debtorMemberId: string;
        creditorMemberId: string;
        originalAmountInCents: number;
        recognizedAmountInCents: number;
        resolvedAmountInCents: number;
        remainingAmountInCents: number;
        factDate: string;
        registeredAt: string;
        origin: ObligationOrigin;
    }[];
    page: {
        direction: PositionDirection;
        pageSize: 20;
        nextCursor: string | null;
    };
};
