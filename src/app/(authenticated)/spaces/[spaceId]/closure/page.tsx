import { ClosurePage } from '@/features/spaces/closure/closure-page';

export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <ClosurePage spaceId={spaceId.toLowerCase()} />;
}
