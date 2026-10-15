import { ExternalLiabilitiesPage } from '@/features/finances/components/external-liabilities-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <ExternalLiabilitiesPage spaceId={spaceId.toLowerCase()} />;
}
