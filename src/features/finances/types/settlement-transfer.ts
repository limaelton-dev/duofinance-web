import type { Member } from './shared-expense';
import type { ObligationOrigin } from './inter-member-position';

export type TransferDirection = 'PAYABLE' | 'RECEIVABLE';

export type TransferAllocationInput = {
    obligationId: string;
    expectedObligationVersion: number;
    amountInCents: number;
};

export type TransferInput = {
    expectedSpaceVersion: number;
    payerMemberId: string;
    recipientMemberId: string;
    amountInCents: number;
    factDate: string;
    allocations: TransferAllocationInput[];
};

export type TransferObligation = {
    id: string;
    version: number;
    status: 'OPEN' | 'PARTIALLY_SETTLED';
    debtorMemberId: string;
    creditorMemberId: string;
    originalAmountInCents: number;
    recognizedAmountInCents: number;
    remainingAmountInCents: number;
    factDate: string;
    registeredAt: string;
    origin: ObligationOrigin;
    settlementCycle: null | {
        id: string;
        targetDate: string;
        status: 'OPEN' | 'FINALIZED';
    };
};

export type TransferOptions = {
    spaceId: string;
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    spaceVersion: number;
    actorMemberId: string;
    members: Member[];
    referenceDate: string;
    canRecord: boolean;
    summary: {
        payableAmountInCents: string;
        receivableAmountInCents: string;
        net: {
            direction: 'PAYABLE' | 'RECEIVABLE' | 'BALANCED';
            amountInCents: string;
        };
    };
    items: TransferObligation[];
    page: {
        direction: TransferDirection;
        cycleId: string | null;
        pageSize: 20;
        nextCursor: string | null;
    };
};

export type TransferAllocation = {
    id: string;
    obligationId: string;
    amountInCents: number;
    cycleId: string | null;
    origin: ObligationOrigin;
};

export type SettlementTransfer = {
    id: string;
    payerMemberId: string;
    recipientMemberId: string;
    amountInCents: number;
    factDate: string;
    registeredAt: string;
    createdByPersonId: string;
    mode: 'MANUAL';
    reversedAmountInCents?: number;
    effectiveAmountInCents?: number;
    reversalId?: string | null;
};

export type TransferDetail = {
    spaceId: string;
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    actorMemberId: string;
    members: Member[];
    transfer: SettlementTransfer;
    allocations: TransferAllocation[];
    affectedCycleIds: string[];
};

export type TransferResult = Pick<
    TransferDetail,
    'spaceId' | 'transfer' | 'allocations' | 'affectedCycleIds'
> & { replayed: boolean };

export type TransferHistory = {
    spaceId: string;
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    actorMemberId: string;
    members: Member[];
    items: (Pick<
        TransferDetail,
        'transfer' | 'allocations' | 'affectedCycleIds'
    > & { appliedAmountInCentsInFilter: number })[];
    page: {
        cycleId: string | null;
        obligationId: string | null;
        pageSize: 20;
        nextCursor: string | null;
    };
};
