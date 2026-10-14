export const personalExpenseQueryKeys = {
    options: (personId: string, spaceId: string) =>
        ['finances', personId, spaceId, 'personal-expense-options'] as const,
    history: (personId: string, spaceId: string, cursor?: string | null) =>
        cursor === undefined
            ? (['finances', personId, spaceId, 'personal-expenses'] as const)
            : ([
                  'finances',
                  personId,
                  spaceId,
                  'personal-expenses',
                  cursor,
              ] as const),
    detail: (personId: string, spaceId: string, id?: string) =>
        id === undefined
            ? ([
                  'finances',
                  personId,
                  spaceId,
                  'personal-financial-commitment',
              ] as const)
            : ([
                  'finances',
                  personId,
                  spaceId,
                  'personal-financial-commitment',
                  id,
              ] as const),
};
import type { QueryClient } from '@tanstack/react-query';
import { todayQueryKeys } from '@/features/today/cache/today-query-keys';

export function invalidatePersonalExpenseQueries(
    client: QueryClient,
    personId: string,
    spaceId: string,
) {
    void client.invalidateQueries({
        queryKey: personalExpenseQueryKeys.history(personId, spaceId),
    });
    void client.invalidateQueries({
        queryKey: personalExpenseQueryKeys.detail(personId, spaceId),
    });
    void client.invalidateQueries({
        queryKey: todayQueryKeys.space(personId, spaceId),
    });
}
