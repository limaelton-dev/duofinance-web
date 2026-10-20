'use client';
import {
    useSpaceOperation,
    type SpaceOperationOptions,
} from '@/features/spaces/hooks/use-space-operation';

export function useFinancialCommand<Input, Result>(
    options: SpaceOperationOptions<Input, Result>,
) {
    return useSpaceOperation({
        ...options,
        invalidates: options.invalidates ?? ['finances', 'today'],
    });
}
