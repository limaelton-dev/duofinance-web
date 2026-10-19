import { InstallmentCommitmentComposer } from '@/features/finances/components/installment-commitment-composer';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <InstallmentCommitmentComposer spaceId={spaceId.toLowerCase()} />;
}
