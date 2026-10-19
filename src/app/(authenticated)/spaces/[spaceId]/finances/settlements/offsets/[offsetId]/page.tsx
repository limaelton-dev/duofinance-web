import { SettlementOffsetPage } from '@/features/finances/components/settlement-offset-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; offsetId: string }>;
}) {
    const { spaceId, offsetId } = await params;
    return (
        <SettlementOffsetPage
            spaceId={spaceId.toLowerCase()}
            mode="detail"
            offsetId={offsetId.toLowerCase()}
        />
    );
}
