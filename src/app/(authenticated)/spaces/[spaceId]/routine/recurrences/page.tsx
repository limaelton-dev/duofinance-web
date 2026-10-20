import { TaskRecurrencesPage } from '@/features/routine/components/task-recurrences-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string }>;
}) {
    const { spaceId } = await params;
    return <TaskRecurrencesPage spaceId={spaceId.toLowerCase()} />;
}
