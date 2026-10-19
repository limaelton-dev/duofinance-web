import { FinancialChangesPage } from '@/features/finances/components/financial-changes-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <FinancialChangesPage spaceId={spaceId.toLowerCase()} />;
}
