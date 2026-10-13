import { TransferHistoryPage } from '@/features/finances/components/transfer-history-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; transferId: string }>;
}) {
    const { spaceId, transferId } = await params;
    return (
        <TransferHistoryPage
            spaceId={spaceId.toLowerCase()}
            transferId={transferId.toLowerCase()}
        />
    );
}
