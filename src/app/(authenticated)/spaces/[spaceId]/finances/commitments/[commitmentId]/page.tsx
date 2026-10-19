import { FinancialIntegrityPage } from '@/features/finances/components/financial-integrity-page';
export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ spaceId: string; commitmentId: string }>;
    searchParams: Promise<{
        modality?: string;
        referenceDate?: string;
        installmentId?: string;
    }>;
}) {
    const { spaceId, commitmentId } = await params,
        query = await searchParams;
    return (
        <FinancialIntegrityPage
            spaceId={spaceId.toLowerCase()}
            commitmentId={commitmentId.toLowerCase()}
            modality={
                query.modality === 'RECURRING' ||
                query.modality === 'INSTALLMENT'
                    ? query.modality
                    : 'AUTO'
            }
            referenceDate={
                typeof query.referenceDate === 'string'
                    ? query.referenceDate
                    : undefined
            }
            installmentId={
                typeof query.installmentId === 'string'
                    ? query.installmentId
                    : undefined
            }
        />
    );
}
