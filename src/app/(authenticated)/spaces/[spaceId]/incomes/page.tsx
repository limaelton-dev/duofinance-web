import { IncomeHistoryPage } from '@/features/finances/components/income-history-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <IncomeHistoryPage spaceId={spaceId.toLowerCase()} />;
}
