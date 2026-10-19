import { RecurringCommitmentComposer } from '@/features/finances/components/recurring-commitment-composer';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <RecurringCommitmentComposer spaceId={spaceId.toLowerCase()} />;
}
