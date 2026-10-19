import { SettlementObligationPage } from '@/features/finances/components/settlement-obligation-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; obligationId: string }>;
}) {
    const { spaceId, obligationId } = await params;
    return (
        <SettlementObligationPage
            spaceId={spaceId.toLowerCase()}
            obligationId={obligationId.toLowerCase()}
        />
    );
}
