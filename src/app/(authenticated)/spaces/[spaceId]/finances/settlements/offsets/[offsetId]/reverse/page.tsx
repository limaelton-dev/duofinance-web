import { SettlementReversalPage } from '@/features/finances/components/settlement-reversal-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; offsetId: string }>;
}) {
    const { spaceId, offsetId } = await params;
    return (
        <SettlementReversalPage
            spaceId={spaceId.toLowerCase()}
            kind="OFFSET"
            resolutionId={offsetId.toLowerCase()}
        />
    );
}
