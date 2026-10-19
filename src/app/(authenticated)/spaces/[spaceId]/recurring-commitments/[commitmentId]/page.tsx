import { RecurringCommitmentPage } from '@/features/finances/components/recurring-commitment-page';
export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ spaceId: string; commitmentId: string }>;
    searchParams: Promise<{ month?: string }>;
}) {
    const { spaceId, commitmentId } = await params;
    return (
        <RecurringCommitmentPage
            spaceId={spaceId.toLowerCase()}
            commitmentId={commitmentId.toLowerCase()}
            initialMonth={(await searchParams).month}
        />
    );
}
