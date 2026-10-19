import { PlannedExpensePage } from '@/features/finances/components/planned-expense-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <PlannedExpensePage spaceId={spaceId.toLowerCase()} />;
}
