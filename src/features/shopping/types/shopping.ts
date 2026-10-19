export type ShoppingAuthor = {
    personId: string;
    memberId: string | null;
    displayName: string;
};
export type ShoppingPage<T> = {
    items: T[];
    totalCount?: number;
    nextCursor: string | null;
};
export type ShoppingSummary = {
    activeItemCount: number;
    pendingItemCount: number;
    partiallyPurchasedItemCount: number;
    purchasedItemCount: number;
    actionableItemCount: number;
    isComplete: boolean;
    canSuggestArchival: boolean;
};
export type ShoppingList = {
    id: string;
    spaceId: string;
    name: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    version: number;
    creator: ShoppingAuthor;
    createdAt: string;
    archivedAt: string | null;
    summary: ShoppingSummary;
    allowedActions: string[];
};
export type ShoppingItem = {
    id: string;
    listId: string;
    description: string;
    desiredQuantity: string;
    purchasedQuantity: string;
    remainingQuantity: string;
    unit: string | null;
    status: 'PENDING' | 'PARTIALLY_PURCHASED' | 'PURCHASED' | 'REMOVED';
    removedAt: string | null;
    creator: ShoppingAuthor;
    createdAt: string;
    allowedActions: string[];
};
export type ShoppingDetail = ShoppingList & {
    items: ShoppingPage<ShoppingItem>;
};
export type ShoppingPurchase = {
    id: string;
    itemId: string;
    listId: string;
    quantity: string;
    effectiveQuantity: string;
    unit: string | null;
    registeredBy: ShoppingAuthor;
    registeredAt: string;
};
export type ShoppingCorrection = {
    id: string;
    sequence: number;
    previousQuantity: string;
    quantity: string;
    unit: string | null;
    correctedBy: ShoppingAuthor;
    correctedAt: string;
};
export type ShoppingHistory = {
    id: string;
    sequence: number;
    type: string;
    actor: ShoppingAuthor;
    registeredAt: string;
    data: Record<string, unknown>;
};
export type LinkedShoppingTask = {
    id: string;
    description: string;
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
    shoppingListId: string;
};
