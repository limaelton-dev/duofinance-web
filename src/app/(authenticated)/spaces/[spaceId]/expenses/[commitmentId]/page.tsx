import { ExpenseDetailPage } from '@/features/finances/components/expense-detail-page';
export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ spaceId: string; commitmentId: string }>;
    searchParams: Promise<{ returnCycle?: string | string[] }>;
}) {
    const { spaceId, commitmentId } = await params;
    const { returnCycle } = await searchParams;
    return (
        <ExpenseDetailPage
            spaceId={spaceId.toLowerCase()}
            commitmentId={commitmentId.toLowerCase()}
            returnCycle={
                typeof returnCycle === 'string'
                    ? returnCycle.toLowerCase()
                    : undefined
            }
        />
    );
}
