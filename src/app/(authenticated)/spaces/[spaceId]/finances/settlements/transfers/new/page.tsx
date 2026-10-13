import { TransferComposer } from '@/features/finances/components/transfer-composer';

export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ spaceId: string }>;
    searchParams: Promise<{ cycleId?: string | string[] }>;
}) {
    const { spaceId } = await params;
    const { cycleId } = await searchParams;
    return (
        <TransferComposer
            spaceId={spaceId.toLowerCase()}
            cycleId={
                typeof cycleId === 'string' ? cycleId.toLowerCase() : undefined
            }
        />
    );
}
