import { RoutinePage } from '@/features/routine/components/routine-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <RoutinePage spaceId={spaceId.toLowerCase()} />;
}
