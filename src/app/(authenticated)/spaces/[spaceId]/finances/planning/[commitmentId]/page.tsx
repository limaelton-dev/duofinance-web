import { PlannedExpenseDetailPage } from '@/features/finances/components/planned-expense-detail-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; commitmentId: string }>;
}) {
    const { spaceId, commitmentId } = await params;
    return (
        <PlannedExpenseDetailPage
            spaceId={spaceId.toLowerCase()}
            commitmentId={commitmentId.toLowerCase()}
        />
    );
}
