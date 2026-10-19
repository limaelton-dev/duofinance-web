import { TaskRecurrencePage } from '@/features/routine/components/task-recurrences-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; recurrenceId: string }>;
}) {
    const { spaceId, recurrenceId } = await params;
    return (
        <TaskRecurrencePage
            spaceId={spaceId.toLowerCase()}
            recurrenceId={recurrenceId.toLowerCase()}
        />
    );
}
