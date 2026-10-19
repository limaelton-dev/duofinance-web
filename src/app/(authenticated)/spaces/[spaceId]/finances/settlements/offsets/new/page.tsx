import { SettlementOffsetPage } from '@/features/finances/components/settlement-offset-page';

export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ spaceId: string }>;
    searchParams: Promise<{
        cycleIds?: string | string[];
        obligationIds?: string | string[];
    }>;
}) {
    const { spaceId } = await params;
    const search = await searchParams;
    return (
        <SettlementOffsetPage
            spaceId={spaceId.toLowerCase()}
            mode="new"
            cycleIds={
                typeof search.cycleIds === 'string'
                    ? search.cycleIds
                    : undefined
            }
            obligationIds={
                typeof search.obligationIds === 'string'
                    ? search.obligationIds
                    : undefined
            }
        />
    );
}
