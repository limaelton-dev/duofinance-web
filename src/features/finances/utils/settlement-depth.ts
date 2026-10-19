import type {
    AssignmentCycle,
    AssignmentOptions,
    AssignmentInput,
    ReversalOptions,
    ReversalInput,
} from '../types/settlement-depth';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function settlementIds(
    value: string | undefined,
    minimum = 1,
): string[] | null {
    const ids = value?.split(',').map((id) => id.toLowerCase()) ?? [];
    return ids.length >= minimum &&
        ids.length <= 50 &&
        ids.every((id) => uuid.test(id)) &&
        new Set(ids).size === ids.length
        ? [...ids].sort()
        : null;
}
export function assignmentVersions(
    data: AssignmentOptions,
    settlement: AssignmentInput['settlement'],
) {
    const destination =
        settlement.mode === 'CYCLE'
            ? data.cycles.find((c) => c.id === settlement.cycleId)
            : settlement.mode === 'DATE'
              ? data.cycles.find((c) => c.targetDate === settlement.targetDate)
              : undefined;
    return [
        ...new Map(
            [data.currentCycle, destination]
                .filter((cycle): cycle is AssignmentCycle => !!cycle)
                .map((cycle) => [
                    cycle.id,
                    { cycleId: cycle.id, version: cycle.version },
                ]),
        ).values(),
    ];
}
export function reversalInput(
    data: ReversalOptions,
    factDate: string,
    correctionCycle?: AssignmentCycle,
): ReversalInput {
    return {
        expectedSpaceVersion: data.spaceVersion,
        factDate,
        expectedObligationVersions: data.obligations.map((o) => ({
            obligationId: o.id,
            version: o.version,
        })),
        expectedCycleVersions: [
            ...new Map(
                [
                    ...data.cycles,
                    ...(correctionCycle ? [correctionCycle] : []),
                ].map((c) => [c.id, { cycleId: c.id, version: c.version }]),
            ).values(),
        ],
        applications: data.allocations.map((a) => ({
            allocationId: a.id,
            amountInCents: a.amountInCents,
        })),
        ...(correctionCycle ? { correctionCycleId: correctionCycle.id } : {}),
    };
}
