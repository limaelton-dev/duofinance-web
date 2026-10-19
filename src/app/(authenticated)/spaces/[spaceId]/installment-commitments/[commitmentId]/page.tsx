import { InstallmentCommitmentPage } from '@/features/finances/components/installment-commitment-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; commitmentId: string }>;
}) {
    const { spaceId, commitmentId } = await params;
    return (
        <InstallmentCommitmentPage
            spaceId={spaceId.toLowerCase()}
            commitmentId={commitmentId.toLowerCase()}
        />
    );
}
