import { ExpenseComposer } from '@/features/finances/components/expense-composer';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <ExpenseComposer spaceId={spaceId.toLowerCase()} />;
}
