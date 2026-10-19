import { SettlementSpecificRulePage } from '@/features/finances/components/settlement-specific-rule-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; commitmentId: string }>;
}) {
    const { spaceId, commitmentId } = await params;
    return (
        <SettlementSpecificRulePage
            spaceId={spaceId.toLowerCase()}
            commitmentId={commitmentId.toLowerCase()}
        />
    );
}
