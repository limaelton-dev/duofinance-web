import { TaskComposer } from '@/features/routine/components/task-composer';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <TaskComposer spaceId={spaceId.toLowerCase()} />;
}
