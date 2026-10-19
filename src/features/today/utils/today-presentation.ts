import type { Today, TodayBlock, TodayPreviewItem } from '../types/today';

export function shouldShowTodayBlock(block: TodayBlock) {
    if (block.status === 'NOT_APPLICABLE') return false;
    return !(
        block.kind === 'ATTENTION' &&
        block.status === 'AVAILABLE' &&
        block.totalCount === 0
    );
}

export function todayItemKey(item: TodayPreviewItem) {
    switch (item.type) {
        case 'FINANCIAL_COMMITMENT':
            return `${item.type}:${item.reference.commitmentId}:${item.reference.occurrenceId ?? ''}`;
        case 'SETTLEMENT_CYCLE':
            return `${item.type}:${item.reference.cycleId}`;
        case 'TASK':
            return `${item.type}:${item.reference.taskId}`;
        case 'SHOPPING_LIST':
            return `${item.type}:${item.reference.listId}`;
        case 'CHANGE_PROPOSAL':
            return `${item.type}:${item.reference.proposalId}`;
        case 'SPACE_CLOSURE':
            return `${item.type}:${item.reference.processId}`;
    }
}

export function todayItemHref(
    item: TodayPreviewItem,
    today: Today,
): string | null {
    const base = `/spaces/${encodeURIComponent(today.spaceId)}`;
    if (item.type === 'SETTLEMENT_CYCLE')
        return `${base}/finances/settlements/${encodeURIComponent(item.reference.cycleId)}`;
    if (item.type === 'CHANGE_PROPOSAL') return `${base}/finances/changes`;
    if (item.type !== 'FINANCIAL_COMMITMENT') return null;
    if (item.reference.modality === 'RECURRING')
        return `${base}/recurring-commitments/${encodeURIComponent(item.reference.commitmentId)}?month=${encodeURIComponent(item.reference.expectedDate.slice(0, 7))}`;
    if (item.reference.modality === 'INSTALLMENT')
        return `${base}/installment-commitments/${encodeURIComponent(item.reference.commitmentId)}`;
    return item.details.kind === 'INCOME'
        ? `${base}/incomes/${encodeURIComponent(item.reference.commitmentId)}`
        : `${base}/finances/planning/${encodeURIComponent(item.reference.commitmentId)}`;
}

export function formatTodayReferenceDate(date: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
}
