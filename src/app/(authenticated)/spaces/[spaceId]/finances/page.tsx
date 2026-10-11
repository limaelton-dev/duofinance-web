import { FinancesSummaryPage } from '@/features/finances/components/finances-summary-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <FinancesSummaryPage spaceId={spaceId.toLowerCase()} />;
}
