import { expect, test } from '@playwright/test';
import { shoppingQuantity } from '../../src/features/shopping/utils/shopping';

import { getShopping, shoppingCommand } from '../../src/lib/api/shopping';

async function withReply(body: unknown, run: () => Promise<void>) {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(
        globalThis,
        'window',
    );
    const originalUrl = process.env.NEXT_PUBLIC_API_URL;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
    });
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.test/v2';
    globalThis.fetch = async () =>
        new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
        });
    try {
        await run();
    } finally {
        globalThis.fetch = originalFetch;
        if (originalWindow)
            Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
        if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
        else process.env.NEXT_PUBLIC_API_URL = originalUrl;
    }
}

for (const [label, suffix, body] of [
    ['lista', '/list-a', { id: 'list-b', spaceId: 'space-a' }],
    [
        'item',
        '/list-a/items/item-a',
        { id: 'list-a', item: { id: 'item-b', listId: 'list-a' } },
    ],
    [
        'pai do item',
        '/list-a/items/item-a',
        { id: 'list-a', item: { id: 'item-a', listId: 'list-b' } },
    ],
    [
        'compras',
        '/list-a/items/item-a/purchases',
        {
            id: 'list-a',
            itemId: 'item-a',
            items: [{ id: 'purchase', itemId: 'item-b', listId: 'list-a' }],
        },
    ],
    [
        'correções',
        '/list-a/items/item-a/purchases/purchase-a/corrections',
        { id: 'list-a', purchaseId: 'purchase-b', items: [] },
    ],
    [
        'itens da lista',
        '/list-a/items',
        { id: 'list-a', items: [{ id: 'item-a', listId: 'list-b' }] },
    ],
    ['espaço', '', { items: [{ id: 'list-a', spaceId: 'space-b' }] }],
    [
        'tarefas vinculadas',
        '/list-a/tasks',
        { items: [{ id: 'task', shoppingListId: 'list-b' }] },
    ],
] as const) {
    test(`Compras recusa resposta cruzada: ${label}`, async () => {
        await withReply(body, async () => {
            await expect(getShopping('space-a', suffix)).rejects.toThrow(
                'não correspondem',
            );
        });
    });
}

test('Compras conserva a identidade comprovada em detalhe, páginas e confirmação', async () => {
    const body = {
        id: 'list-a',
        version: 3,
        item: { id: 'item-a', listId: 'list-a' },
    };
    await withReply(body, async () => {
        expect(await getShopping('space-a', '/list-a/items/item-a')).toEqual({
            ...body,
            spaceId: 'space-a',
        });
        expect(
            await shoppingCommand(
                'space-a',
                {
                    suffix: '/list-a/items/item-a/need',
                    body: { expectedVersion: 2, desiredQuantity: '1.5' },
                },
                'csrf',
                'same-key',
                new AbortController().signal,
            ),
        ).toEqual(body);
    });
});

test('confirmação de outro item não vira sucesso para o destino solicitado', async () => {
    await withReply(
        { id: 'list-a', version: 3, item: { id: 'item-b', listId: 'list-a' } },
        async () => {
            await expect(
                shoppingCommand(
                    'space-a',
                    {
                        suffix: '/list-a/items/item-a/purchases',
                        body: { expectedVersion: 2, quantity: '0.5' },
                    },
                    'csrf',
                    'same-key',
                    new AbortController().signal,
                ),
            ).rejects.toThrow('não correspondem');
        },
    );
});

test('quantidade exata aceita vírgula local sem arredondamento, zero apenas para correção e limite decimal', () => {
    expect(shoppingQuantity('0,001')).toBe('0.001');
    expect(shoppingQuantity('999999999999,999')).toBe('999999999999.999');
    expect(shoppingQuantity('1,250')).toBe('1.25');
    expect(shoppingQuantity('0', true)).toBe('0');
    for (const value of ['0', '-1', '1e3', '0,0001', '1000000000000'])
        expect(() => shoppingQuantity(value)).toThrow();
});
