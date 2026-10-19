import { RecurringCommitmentPage } from '@/features/finances/components/recurring-commitment-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <RecurringCommitmentPage spaceId={spaceId.toLowerCase()} />;
}
