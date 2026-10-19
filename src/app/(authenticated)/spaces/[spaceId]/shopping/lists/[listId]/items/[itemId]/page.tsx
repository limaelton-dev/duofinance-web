import { ShoppingItemPage } from '@/features/shopping/components/shopping-item-page';
export default async function Page({
    params,
}: {
    params: Promise<{ spaceId: string; listId: string; itemId: string }>;
}) {
    const { spaceId, listId, itemId } = await params;
    return (
        <ShoppingItemPage
            spaceId={spaceId.toLowerCase()}
            listId={listId.toLowerCase()}
            itemId={itemId.toLowerCase()}
        />
    );
}
