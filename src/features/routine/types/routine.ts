export type Urgency = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type Participant = { personId: string; memberId: string | null };
export type Deadline = { date: string; time: string | null } | null;
export type RoutineContext = {
    spaceId: string;
    type: 'PERSONAL' | 'SHARED';
    status: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    actorMemberId: string | null;
    participants: (Participant & { displayName: string })[];
};
export type TaskItem = {
    id: string;
    spaceId: string;
    description: string;
    creator: Participant;
    assignee: Participant | null;
    deadline: Deadline;
    urgency: Urgency;
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'SKIPPED';
    version: number | null;
    kind: 'ONE_OFF' | 'OCCURRENCE';
    createdAt: string;
    recurrenceId?: string;
    scheduledDate?: string;
    recurrenceVersion?: number;
    materialized?: boolean;
    shoppingListId?: string | null;
    shoppingList?: {
        id: string;
        name: string | null;
        status: string;
        summary: {
            activeItemCount: number;
            actionableItemCount: number;
            isComplete: boolean;
        };
    } | null;
    allowedActions: string[];
    completion: {
        executor: Participant;
        completedAt: string;
        assignee: Participant | null;
    } | null;
    conditions?: {
        today: boolean;
        overdue: boolean;
        urgent: boolean;
        upcoming: boolean;
        noDeadline: boolean;
        group: string;
    };
};
export type PageResult<T> = {
    spaceId: string;
    items: T[];
    nextCursor: string | null;
};
export type TaskList = PageResult<TaskItem> & {
    referenceDate: string;
    referenceInstant: string;
    counts: {
        totalCount: number;
        today: number;
        overdue: number;
        urgent: number;
        upcoming: number;
        noDeadline: number;
    };
};
export type RecurrenceRule =
    | { frequency: 'DAILY' }
    | { frequency: 'WEEKLY'; weekday: number }
    | { frequency: 'WEEKDAYS'; weekdays: number[] }
    | { frequency: 'MONTHLY'; day: number }
    | { frequency: 'ANNUAL'; month: number; day: number };
export type TaskRecurrence = {
    id: string;
    spaceId: string;
    description: string;
    creator: Participant;
    assignee: Participant | null;
    urgency: Urgency;
    deadline: { time: string | null } | null;
    rule: RecurrenceRule;
    startsOn: string;
    endsOn: string | null;
    status: 'ACTIVE' | 'CANCELLED';
    version: number;
    createdAt: string;
    cancelledAt: string | null;
    cancelledOn: string | null;
};
export type RoutineEvent = {
    id: string;
    spaceId: string;
    sequence: number;
    type: string;
    actorId: string;
    registeredAt: string;
    data: Record<string, unknown>;
};
export type CreateTask = {
    description: string;
    assigneeMemberId?: string | null;
    urgency: Urgency;
    deadline: Deadline;
    shoppingListId?: string;
};
export type CreateRecurrence = Omit<
    CreateTask,
    'deadline' | 'shoppingListId'
> & {
    deadline: { time: string | null } | null;
    rule: RecurrenceRule;
    startsOn: string;
    endsOn: string | null;
};
