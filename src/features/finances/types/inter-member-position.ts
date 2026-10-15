import type { Member } from './shared-expense';

export type PositionDirection = 'ALL' | 'PAYABLE' | 'RECEIVABLE';
export type ObligationOrigin =
    | {
          commitmentId: string;
          disbursementId: string;
          description: string;
          kind?: 'EXPENSE';
      }
    | {
          commitmentId: string;
          receiptId: string;
          description: string;
          kind: 'INCOME';
      };
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
        status: 'OPEN' | 'PARTIALLY_SETTLED';
        debtorMemberId: string;
        creditorMemberId: string;
        originalAmountInCents: number;
        remainingAmountInCents: number;
        factDate: string;
        registeredAt: string;
        origin: ObligationOrigin;
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
