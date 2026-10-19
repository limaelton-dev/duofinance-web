import { SettlementSelectedPage } from '@/features/finances/components/settlement-selected-page';

export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ spaceId: string }>;
    searchParams: Promise<{ cycleIds?: string | string[] }>;
}) {
    const { spaceId } = await params;
    const search = await searchParams;
    return (
        <SettlementSelectedPage
            spaceId={spaceId.toLowerCase()}
            cycleIds={
                typeof search.cycleIds === 'string'
                    ? search.cycleIds
                    : undefined
            }
        />
    );
}
