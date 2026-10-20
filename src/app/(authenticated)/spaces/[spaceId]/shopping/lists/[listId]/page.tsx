import { ShoppingListPage } from '@/features/shopping/components/shopping-list-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; listId: string }>;
}) {
    const { spaceId, listId } = await params;
    return (
        <ShoppingListPage
            spaceId={spaceId.toLowerCase()}
            listId={listId.toLowerCase()}
        />
    );
}
