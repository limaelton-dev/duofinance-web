import { ShoppingPage } from '@/features/shopping/components/shopping-page';
export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ spaceId: string }>;
    searchParams: Promise<{ new?: string }>;
}) {
    const { spaceId } = await params;
    const search = await searchParams;
    return (
        <ShoppingPage
            spaceId={spaceId.toLowerCase()}
            openNew={search.new === '1'}
        />
    );
}
