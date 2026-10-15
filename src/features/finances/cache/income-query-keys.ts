import type { QueryClient } from '@tanstack/react-query';
import { todayQueryKeys } from '@/features/today/cache/today-query-keys';

export const incomeQueryKeys = {
    options: (personId: string, spaceId: string) =>
        ['finances', personId, spaceId, 'income-options'] as const,
    receiptOptions: (personId: string, spaceId: string, id: string) =>
        ['finances', personId, spaceId, 'income-receipt-options', id] as const,
    history: (
        personId: string,
        spaceId: string,
        status?: string,
        cursor?: string | null,
    ) => ['finances', personId, spaceId, 'incomes', status, cursor] as const,
    detail: (personId: string, spaceId: string, id?: string) =>
        ['finances', personId, spaceId, 'income-detail', id] as const,
};
export function invalidateIncomeQueries(
    client: QueryClient,
    personId: string,
    spaceId: string,
) {
    void client.invalidateQueries({
        queryKey: ['finances', personId, spaceId],
    });
    void client.invalidateQueries({
        queryKey: todayQueryKeys.space(personId, spaceId),
    });
}
