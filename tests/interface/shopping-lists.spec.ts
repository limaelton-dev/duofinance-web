import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type {
    ShoppingDetail,
    ShoppingItem,
    ShoppingPurchase,
} from '../../src/features/shopping/types/shopping';

const personId = '10000000-0000-4000-8000-000000000001',
    spaceId = '20000000-0000-4000-8000-000000000001';
const listId = '30000000-0000-4000-8000-000000000001',
    itemId = '40000000-0000-4000-8000-000000000001';
const author = {
    personId,
    memberId: null,
    displayName: 'Pessoa de demonstração',
};
const item: ShoppingItem = {
    id: itemId,
    listId,
    description: 'Arroz integral da compra semanal',
    desiredQuantity: '1.25',
    purchasedQuantity: '0.625',
    remainingQuantity: '0.625',
    unit: 'kg',
    status: 'PARTIALLY_PURCHASED',
    removedAt: null,
    creator: author,
    createdAt: '2026-10-19T15:00:00Z',
    allowedActions: ['CHANGE_NEED', 'RECORD_PURCHASE', 'REMOVE'],
};
const list: ShoppingDetail = {
    id: listId,
    spaceId,
    name: 'Compras da casa',
    status: 'ACTIVE',
    version: 4,
    creator: author,
    createdAt: item.createdAt,
    archivedAt: null,
    allowedActions: ['ADD_ITEM', 'RENAME', 'ARCHIVE'],
    summary: {
        activeItemCount: 1,
        pendingItemCount: 0,
        partiallyPurchasedItemCount: 1,
        purchasedItemCount: 0,
        actionableItemCount: 1,
        isComplete: false,
        canSuggestArchival: false,
    },
    items: { items: [item], totalCount: 1, nextCursor: null },
};
const purchase: ShoppingPurchase = {
    id: '50000000-0000-4000-8000-000000000001',
    itemId,
    listId,
    quantity: '0.625',
    effectiveQuantity: '0.625',
    unit: 'kg',
    registeredBy: author,
    registeredAt: item.createdAt,
};
async function setup(
    page: Page,
    options: {
        status?: 'ACTIVE' | 'CLOSING' | 'CLOSED';
        archived?: boolean;
        long?: boolean;
        failItems?: boolean;
    } = {},
) {
    const space = {
        id: spaceId,
        type: 'PERSONAL',
        status: options.status ?? 'ACTIVE',
        label: 'Meu espaço',
        version: 1,
    };
    const writable = space.status === 'ACTIVE' && !options.archived;
    const currentItem = {
        ...item,
        description: options.long
            ? 'Arroz integral '.repeat(35)
            : item.description,
        allowedActions: writable ? item.allowedActions : [],
    };
    const currentList = {
        ...list,
        status: options.archived ? 'ARCHIVED' : 'ACTIVE',
        archivedAt: options.archived ? item.createdAt : null,
        allowedActions: writable ? list.allowedActions : [],
        items: { ...list.items, items: [currentItem] },
    };
    const submissions: {
        path: string;
        body: unknown;
        key: string | undefined;
    }[] = [];
    await page.route('http://localhost:3101/v2/**', async (route) => {
        const request = route.request(),
            path = new URL(request.url()).pathname;
        const headers = {
            'Access-Control-Allow-Origin': 'http://localhost:3200',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Headers':
                'Content-Type, X-CSRF-Token, Idempotency-Key',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        };
        if (request.method() === 'OPTIONS')
            return route.fulfill({ status: 204, headers });
        let json: unknown;
        if (path.endsWith('/auth/me'))
            json = {
                person: {
                    id: personId,
                    displayName: author.displayName,
                    email: 'pessoa@example.test',
                },
                personalSpace: {
                    id: spaceId,
                    type: 'PERSONAL',
                    label: 'Meu espaço',
                },
            };
        else if (path.endsWith('/auth/csrf'))
            json = { csrfToken: 'synthetic-csrf' };
        else if (path === '/v2/spaces') json = { items: [space] };
        else if (path === `/v2/spaces/${spaceId}`)
            json = {
                space,
                actorMembership: null,
                activeMemberCount: 0,
                invitation: null,
            };
        else if (request.method() === 'POST') {
            submissions.push({
                path,
                body: request.postDataJSON(),
                key: request.headers()['idempotency-key'],
            });
            json = { id: listId, spaceId, version: 5, item: currentItem };
        } else if (path.endsWith(`/shopping-lists/${listId}/items/${itemId}`))
            json = { id: listId, version: 4, item: currentItem };
        else if (path.endsWith(`/shopping-lists/${listId}`)) json = currentList;
        else if (path.endsWith('/shopping-lists'))
            json = { items: [currentList], totalCount: 1, nextCursor: null };
        else if (path.endsWith('/items')) {
            if (options.failItems)
                return route.fulfill({
                    status: 503,
                    headers,
                    json: { code: 'UNAVAILABLE', message: 'Indisponível' },
                });
            json = {
                id: listId,
                version: 4,
                items: [currentItem],
                totalCount: 1,
                nextCursor: null,
            };
        } else if (path.endsWith('/purchases'))
            json = {
                id: listId,
                version: 4,
                items: [purchase],
                totalCount: 1,
                nextCursor: null,
            };
        else if (path.endsWith('/corrections'))
            json = { items: [], totalCount: 0, nextCursor: null };
        else if (path.endsWith('/history'))
            json = {
                items: [
                    {
                        id: 'history-1',
                        sequence: 1,
                        type: 'CREATED',
                        actor: author,
                        registeredAt: item.createdAt,
                        data: { name: list.name },
                    },
                ],
                nextCursor: null,
            };
        else if (path.endsWith('/tasks'))
            json = { spaceId, items: [], totalCount: 0, nextCursor: null };
        else
            return route.fulfill({
                status: 404,
                headers,
                json: { code: 'NOT_FOUND', message: 'Fixture ausente' },
            });
        return route.fulfill({ status: 200, headers, json });
    });
    return submissions;
}

test('filtro dos itens permanece ao voltar do detalhe', async ({ page }) => {
    await setup(page);
    await page.goto(`/spaces/${spaceId}/shopping/lists/${listId}`);
    await page
        .getByRole('combobox', { name: 'Mostrar itens', exact: true })
        .selectOption('PENDING');
    await expect(
        page.getByRole('combobox', { name: 'Mostrar itens', exact: true }),
    ).toHaveValue('PENDING');
    await page
        .getByRole('link', { name: item.description, exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: item.description, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/items/${itemId}$`));
    await page.goBack();
    await expect(
        page.getByRole('combobox', { name: 'Mostrar itens', exact: true }),
    ).toHaveValue('PENDING');
});

for (const width of [320, 768, 1280]) {
    test(`compras em ${width}px mantém contexto, quantidades e nomes longos sem rolagem horizontal`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        await setup(page, { long: true });
        await page.goto(`/spaces/${spaceId}/shopping/lists/${listId}`);
        await expect(
            page.getByRole('heading', { name: list.name!, exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Falta 0,625 kg', { exact: true }),
        ).toBeVisible();
        if (process.env.IMPECCABLE_REVIEW) {
            await mkdir('.impeccable/spacing-review', { recursive: true });
            await page.screenshot({
                path: `.impeccable/spacing-review/shopping-${width}.png`,
                fullPage: true,
            });
        }
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
        await page
            .getByRole('link', { name: /^Arroz integral Arroz integral/ })
            .click();
        await expect(
            page.getByRole('heading', {
                name: /^Arroz integral Arroz integral/,
            }),
        ).toBeVisible();
        await expect(
            page.getByText('Original: 0,625 kg', { exact: true }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Registrar compra', exact: true })
            .click();
        await expect(
            page.getByLabel('Quantidade comprada agora'),
        ).toBeFocused();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
    });
}
for (const state of [
    { status: 'CLOSING' as const },
    { status: 'CLOSED' as const },
    { archived: true },
]) {
    test(`somente consulta preserva histórico: ${JSON.stringify(state)}`, async ({
        page,
    }) => {
        const submissions = await setup(page, state);
        await page.goto(`/spaces/${spaceId}/shopping/lists/${listId}`);
        await expect(
            page.getByText('Esta lista está disponível apenas para consulta.', {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Adicionar item', exact: true }),
        ).toHaveCount(0);
        await page
            .getByRole('link', { name: item.description, exact: true })
            .click();
        await expect(
            page.getByText('Original: 0,625 kg', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Registrar compra', exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('button', {
                name: 'Corrigir este registro',
                exact: true,
            }),
        ).toHaveCount(0);
        expect(submissions).toHaveLength(0);
    });
}
test('validação local mantém entrada e envia decimal canônico com versão da lista', async ({
    page,
}) => {
    const submissions = await setup(page);
    await page.goto(
        `/spaces/${spaceId}/shopping/lists/${listId}/items/${itemId}`,
    );
    await page
        .getByRole('button', { name: 'Registrar compra', exact: true })
        .click();
    await page.getByLabel('Quantidade comprada agora').fill('0,0001');
    await page
        .getByRole('button', { name: 'Confirmar compra', exact: true })
        .click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'até três casas',
    );
    expect(submissions).toHaveLength(0);
    await page.getByLabel('Quantidade comprada agora').fill('0,001');
    await page
        .getByRole('button', { name: 'Confirmar compra', exact: true })
        .click();
    await expect(
        page.getByText(
            'Registro confirmado. As quantidades foram atualizadas.',
            { exact: true },
        ),
    ).toBeVisible();
    expect(submissions).toHaveLength(1);
    expect(submissions[0].body).toEqual({
        expectedVersion: 4,
        quantity: '0.001',
    });
    expect(submissions[0].key).toMatch(/^[a-f0-9-]{36}$/);
});
test('falha de itens não vira vazio e mantém resumo global comprovado', async ({
    page,
}) => {
    await setup(page, { failItems: true });
    await page.goto(`/spaces/${spaceId}/shopping/lists/${listId}`);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Não foi possível atualizar esta consulta',
    );
    await expect(
        page.getByRole('button', { name: 'Tentar novamente', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Nenhum item neste filtro.', { exact: true }),
    ).toHaveCount(0);
    await expect(
        page
            .getByText('Itens ativos', { exact: true })
            .locator('..')
            .locator('dd'),
    ).toHaveText('1');
});
