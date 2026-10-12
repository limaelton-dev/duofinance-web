import { SettlementCyclesPage } from '@/features/finances/components/settlement-cycles-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <SettlementCyclesPage spaceId={spaceId.toLowerCase()} />;
}
