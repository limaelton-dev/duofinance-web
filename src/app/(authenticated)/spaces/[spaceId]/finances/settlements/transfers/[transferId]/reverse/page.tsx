import { SettlementReversalPage } from '@/features/finances/components/settlement-reversal-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; transferId: string }>;
}) {
    const { spaceId, transferId } = await params;
    return (
        <SettlementReversalPage
            spaceId={spaceId.toLowerCase()}
            kind="TRANSFER"
            resolutionId={transferId.toLowerCase()}
        />
    );
}
