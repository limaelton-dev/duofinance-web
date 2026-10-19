import type { SettlementCycle } from '@/features/finances/types/settlement-cycle';
import type { Member } from '@/features/finances/types/shared-expense';

export type TodaySettlements = {
    actorMemberId: string;
    members: Member[];
    nextCycle: SettlementCycle | null;
    overdueCycles: { items: SettlementCycle[]; totalCount: number };
};

export type TodaySource<T, Code extends string> =
    | { status: 'AVAILABLE'; data: T }
    | { status: 'UNAVAILABLE'; error: { code: Code; message: string } };

export type TodayFinancialItem = {
    commitmentId: string;
    occurrenceId: string | null;
    modality: 'ONE_TIME' | 'RECURRING' | 'INSTALLMENT';
    kind: 'EXPENSE' | 'INCOME';
    description: string;
    expectedDate: string;
    amountInCents: number | null;
    expectedAmountInCents: number | null;
    valuePending: boolean;
    fulfilledAmountInCents: number;
    remainingAmountInCents: number | null;
};

type IncomePreview = {
    commitmentId: string;
    kind: 'INCOME';
    description: string;
    expectedReceiptDate: string;
    amountInCents: number;
    receivedAmountInCents: number;
    remainingAmountInCents: number;
};

type PlannedPreview = Omit<TodayFinancialItem, 'modality'> & {
    overdue: boolean;
};

type Participant = { personId: string; memberId: string | null };

export type TodayTask = {
    id: string;
    spaceId: string;
    kind: 'ONE_OFF' | 'OCCURRENCE';
    description: string;
    creator: Participant;
    assignee: Participant | null;
    deadline: { date: string; time: string | null } | null;
    urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'SKIPPED';
    version: number | null;
    createdAt: string;
    completion: {
        executor: Participant;
        completedAt: string;
        assignee: Participant | null;
    } | null;
    shoppingListId?: string | null;
    recurrenceId?: string;
    scheduledDate?: string;
    recurrenceVersion?: number;
    materialized?: boolean;
    allowedActions: string[];
    conditions: {
        today: boolean;
        overdue: boolean;
        urgent: boolean;
        upcoming: boolean;
        noDeadline: boolean;
        group: 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NO_DEADLINE';
    };
};

export type TodayShoppingList = {
    id: string;
    name: string | null;
    status: 'ACTIVE';
    summary: {
        activeItemCount: number;
        actionableItemCount: number;
        isComplete: boolean;
    };
    pendingItems: {
        items: {
            id: string;
            description: string;
            unit: string | null;
            desiredQuantity: string;
            purchasedQuantity: string;
            remainingQuantity: string;
            status: 'PENDING' | 'PARTIALLY_PURCHASED';
        }[];
        totalCount: number;
        hasMore: boolean;
    };
};

type TodayClosure = {
    spaceId: string;
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    processId: string;
    cutoffDate: string;
    actorNextAction?:
        | 'PROPOSE_PLAN'
        | 'REVIEW_PLAN'
        | 'WAIT_APPROVAL'
        | 'RESOLVE_FINANCES'
        | 'REVIEW_CLOSURE'
        | 'WAIT_CANCELLATION'
        | 'APPROVE_CANCELLATION'
        | 'READ_ONLY';
};

type Preview<Type extends string, Reference, Details> = {
    type: Type;
    reference: { type: Type } & Reference;
    label: string;
    date: string | null;
    details: Details;
};

export type TodayPreviewItem =
    | Preview<
          'FINANCIAL_COMMITMENT',
          Pick<
              TodayFinancialItem,
              'commitmentId' | 'occurrenceId' | 'modality' | 'expectedDate'
          >,
          TodayFinancialItem
      >
    | Preview<'SETTLEMENT_CYCLE', { cycleId: string }, SettlementCycle>
    | Preview<
          'TASK',
          {
              taskId: string;
              kind: 'ONE_OFF' | 'OCCURRENCE';
              recurrenceId: string | null;
              scheduledDate: string | null;
          },
          TodayTask
      >
    | Preview<'SHOPPING_LIST', { listId: string }, TodayShoppingList>
    | Preview<
          'CHANGE_PROPOSAL',
          { proposalId: string; commitmentId: string },
          {
              proposalId: string;
              commitmentId: string;
              registeredAt: string;
              effectiveFrom: string;
          }
      >
    | Preview<'SPACE_CLOSURE', { processId: string }, TodayClosure>;

export type TodayBlock = {
    kind:
        | 'ATTENTION'
        | 'TODAY'
        | 'NEXT_SETTLEMENT'
        | 'UPCOMING'
        | 'TASKS'
        | 'SHOPPING';
    status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
    items: TodayPreviewItem[];
    totalCount: number | null;
    knownTotalCount: number;
    hasMore: boolean | null;
};

export type Today = {
    spaceId: string;
    spaceType: 'PERSONAL' | 'SHARED';
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    referenceDate: string;
    finance: TodaySource<
        {
            upcomingCommitments: {
                items: (IncomePreview | PlannedPreview)[];
                totalCount: number;
            };
            settlements: TodaySettlements | null;
        },
        'FINANCE_TODAY_UNAVAILABLE'
    >;
    routine: TodaySource<
        {
            items: TodayTask[];
            counts: {
                totalCount: number;
                today: number;
                overdue: number;
                urgent: number;
                upcoming: number;
                noDeadline: number;
            };
            hasMore: boolean;
            referenceDate: string;
            referenceInstant: string;
        },
        'ROUTINE_TODAY_UNAVAILABLE'
    >;
    shopping: TodaySource<
        {
            spaceId: string;
            actorMemberId: string | null;
            referenceDate: string;
            referenceInstant: string;
            items: TodayShoppingList[];
            totalCount: number;
            activeListCount: number;
        },
        'SHOPPING_TODAY_UNAVAILABLE'
    >;
    closure: TodaySource<TodayClosure | null, 'SPACE_CLOSURE_UNAVAILABLE'>;
    blocks: TodayBlock[];
    capabilities: { spaceClosureAttention: 'SUPPORTED' };
};
