import { TaskDetailPage } from '@/features/routine/components/task-detail-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; taskId: string }>;
}) {
    const { spaceId, taskId } = await params;
    return (
        <TaskDetailPage
            spaceId={spaceId.toLowerCase()}
            taskId={taskId.toLowerCase()}
        />
    );
}
