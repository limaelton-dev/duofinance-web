import { SettlementOffsetPage } from '@/features/finances/components/settlement-offset-page';

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
    const search = await searchParams;
    return (
        <SettlementOffsetPage
            spaceId={spaceId.toLowerCase()}
            mode="history"
            cycleId={
                typeof search.cycleId === 'string' ? search.cycleId : undefined
            }
            obligationId={
                typeof search.obligationId === 'string'
                    ? search.obligationId
                    : undefined
            }
        />
    );
}
