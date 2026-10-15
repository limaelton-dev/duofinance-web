import type { SettlementCycle } from '@/features/finances/types/settlement-cycle';
import type { Member } from '@/features/finances/types/shared-expense';

export type TodaySettlements = {
    actorMemberId: string;
    members: Member[];
    nextCycle: SettlementCycle | null;
    overdueCycles: { items: SettlementCycle[]; totalCount: number };
};

export type Today = {
    spaceId: string;
    spaceType: 'PERSONAL' | 'SHARED';
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    referenceDate: string;
    finance:
        | {
              status: 'AVAILABLE';
              data: {
                  upcomingCommitments: {
                      items: {
                          commitmentId: string;
                          kind: 'INCOME';
                          description: string;
                          expectedReceiptDate: string;
                          amountInCents: number;
                      }[];
                      totalCount: number;
                  };
                  settlements: TodaySettlements | null;
              };
          }
        | {
              status: 'UNAVAILABLE';
              error: { code: 'FINANCE_TODAY_UNAVAILABLE'; message: string };
          };
};
