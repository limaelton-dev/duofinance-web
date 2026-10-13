import { TransferHistoryPage } from '@/features/finances/components/transfer-history-page';

export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ spaceId: string }>;
    searchParams: Promise<{
        cycleId?: string | string[];
        obligationId?: string | string[];
    }>;
}) {
    const { spaceId } = await params;
    const { cycleId, obligationId } = await searchParams;
    return (
        <TransferHistoryPage
            spaceId={spaceId.toLowerCase()}
            cycleId={
                typeof cycleId === 'string' ? cycleId.toLowerCase() : undefined
            }
            obligationId={
                typeof obligationId === 'string'
                    ? obligationId.toLowerCase()
                    : undefined
            }
        />
    );
}
