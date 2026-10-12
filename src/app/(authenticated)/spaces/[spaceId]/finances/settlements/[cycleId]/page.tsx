import { SettlementCyclesPage } from '@/features/finances/components/settlement-cycles-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; cycleId: string }>;
}) {
    const { spaceId, cycleId } = await params;
    return (
        <SettlementCyclesPage
            spaceId={spaceId.toLowerCase()}
            cycleId={cycleId.toLowerCase()}
        />
    );
}
