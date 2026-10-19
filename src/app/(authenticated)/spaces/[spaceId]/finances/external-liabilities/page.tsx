import { ExternalLiabilitiesPage } from '@/features/finances/components/external-liabilities-page';

export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ spaceId: string }>;
    searchParams: Promise<{ memberId?: string | string[] }>;
}) {
    const { spaceId } = await params;
    const { memberId } = await searchParams;
    return (
        <ExternalLiabilitiesPage
            spaceId={spaceId.toLowerCase()}
            memberId={
                Array.isArray(memberId)
                    ? memberId.join(',')
                    : (memberId ?? null)
            }
        />
    );
}
