import { TaskDetailPage } from '@/features/routine/components/task-detail-page';
export default async function Page({
    params,
}: {
    params: Promise<{
        spaceId: string;
        recurrenceId: string;
        scheduledDate: string;
    }>;
}) {
    const { spaceId, recurrenceId, scheduledDate } = await params;
    return (
        <TaskDetailPage
            spaceId={spaceId.toLowerCase()}
            recurrenceId={recurrenceId.toLowerCase()}
            scheduledDate={scheduledDate}
        />
    );
}
