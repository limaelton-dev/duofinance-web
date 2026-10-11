import { ExpenseDetailPage } from '@/features/finances/components/expense-detail-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; commitmentId: string }>;
}) {
    const { spaceId, commitmentId } = await params;
    return (
        <ExpenseDetailPage
            spaceId={spaceId.toLowerCase()}
            commitmentId={commitmentId.toLowerCase()}
        />
    );
}
