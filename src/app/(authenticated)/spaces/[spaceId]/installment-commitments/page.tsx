import { InstallmentCommitmentPage } from '@/features/finances/components/installment-commitment-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <InstallmentCommitmentPage spaceId={spaceId.toLowerCase()} />;
}
