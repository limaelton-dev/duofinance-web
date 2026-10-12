import type {
    InterMemberPosition,
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
        resolvedAmountInCents: string;
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
        status: string;
        debtorMemberId: string;
        creditorMemberId: string;
        originalAmountInCents: number;
        resolvedAmountInCents: number;
        remainingAmountInCents: number;
        factDate: string;
        registeredAt: string;
        origin: {
            commitmentId: string;
            disbursementId: string;
            description: string;
        };
    }[];
    page: {
        direction: PositionDirection;
        pageSize: 20;
        nextCursor: string | null;
    };
};
