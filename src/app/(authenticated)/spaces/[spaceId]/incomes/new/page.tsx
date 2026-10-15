import { IncomeComposer } from '@/features/finances/components/income-composer';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <IncomeComposer spaceId={spaceId.toLowerCase()} />;
}
