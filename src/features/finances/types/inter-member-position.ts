import type { Member } from './shared-expense';

export type PositionDirection = 'ALL' | 'PAYABLE' | 'RECEIVABLE';
export type InterMemberPosition = {
    spaceId: string;
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    actorMemberId: string;
    members: Member[];
    scope: 'OPEN_OBLIGATIONS';
    summary: {
        payableAmountInCents: string;
        receivableAmountInCents: string;
        net: {
            direction: 'PAYABLE' | 'RECEIVABLE' | 'BALANCED';
            amountInCents: string;
        };
    };
    items: {
        id: string;
        version: number;
        status: 'OPEN';
        debtorMemberId: string;
        creditorMemberId: string;
        originalAmountInCents: number;
        remainingAmountInCents: number;
        factDate: string;
        registeredAt: string;
        origin: {
            commitmentId: string;
            disbursementId: string;
            description: string;
        };
        settlementCycle: null | {
            id: string;
            targetDate: string;
            status: 'OPEN' | 'FINALIZED';
        };
    }[];
    page: {
        direction: PositionDirection;
        pageSize: 20;
        nextCursor: string | null;
    };
};
