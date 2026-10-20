import { expect, test } from '@playwright/test';
import {
    apiUrl,
    post,
    register,
    open,
    seed,
    quantity,
} from '../support/shopping-journey';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('038–041: cria lista sem nome, registra frações e corrige preservando originais e unidades', async ({
    page,
    context,
    request,
}) => {
    const account = await register(request);
    const spaceId = account.personalSpace.id;
    await open(
        page,
        context,
        request,
        spaceId,
        `/spaces/${spaceId}/shopping?new=1`,
    );
    await page
        .getByRole('button', { name: 'Criar lista', exact: true })
        .click();
    await expect(page).toHaveURL(/\/shopping\/lists\/[0-9a-f-]+$/);
    const listId = page.url().split('/').at(-1)!;
    await page
        .getByRole('button', { name: 'Renomear lista', exact: true })
        .click();
    await page.getByLabel('Nome da lista (opcional)').fill('Compras da semana');
    await page
        .getByRole('button', { name: 'Salvar nome', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Compras da semana', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Adicionar item', exact: true })
        .click();
    await page.getByLabel('O que precisa comprar').fill('Arroz integral');
    await page.getByLabel('Quantidade desejada').fill('1,250');
    await page.getByLabel('Unidade (opcional)').fill('kg');
    await page
        .getByRole('button', { name: 'Salvar item', exact: true })
        .click();
    await page
        .getByRole('link', { name: 'Arroz integral', exact: true })
        .click();
    await expect(quantity(page, 'Desejado')).toHaveText('1,25 kg');
    for (const amount of ['0,5', '0,125']) {
        await page
            .getByRole('button', { name: 'Registrar compra', exact: true })
            .click();
        await page.getByLabel('Quantidade comprada agora').fill(amount);
        await page
            .getByRole('button', { name: 'Confirmar compra', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Registrar compra', exact: true }),
        ).toBeEnabled();
    }
    await expect(quantity(page, 'Comprado após correções')).toHaveText(
        '0,625 kg',
    );
    await page
        .getByRole('button', { name: 'Corrigir este registro', exact: true })
        .first()
        .click();
    await page
        .getByLabel('Nova quantidade efetiva deste registro')
        .fill('0,375');
    await page
        .getByRole('button', { name: 'Confirmar correção', exact: true })
        .click();
    await expect(quantity(page, 'Comprado após correções')).toHaveText(
        '0,5 kg',
    );
    await expect(
        page.getByText('Original: 0,5 kg', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Ver correções', exact: true })
        .first()
        .click();
    await expect(
        page.getByText('De 0,5 kg para 0,375 kg', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', {
            name: 'Alterar quantidade ou unidade',
            exact: true,
        })
        .click();
    await page.getByLabel('Nova quantidade desejada').fill('1');
    await page.getByLabel('Unidade (opcional)').fill('pacote');
    await page
        .getByRole('button', { name: 'Salvar alteração', exact: true })
        .click();
    await expect(quantity(page, 'Falta comprar')).toHaveText('0,5 pacote');
    await expect(
        page.getByText('Original: 0,5 kg', { exact: true }),
    ).toBeVisible();
    const detail = await (
        await request.get(
            `${apiUrl}/spaces/${spaceId}/shopping-lists/${listId}`,
        )
    ).json();
    expect(detail.items.items[0].purchasedQuantity).toBe('0.5');
    const today = await (
        await request.get(`${apiUrl}/spaces/${spaceId}/today`)
    ).json();
    expect(today.finance.data.upcomingCommitments.totalCount).toBe(0);
    const financialHistory = await (
        await request.get(
            `${apiUrl}/spaces/${spaceId}/financial-timeline?month=${today.referenceDate.slice(0, 7)}&view=HISTORY`,
        )
    ).json();
    expect(financialHistory.items).toEqual([]);
});

test('040–043: autoria compartilhada, remoção e arquivo explícitos, vínculo inverso preservado', async ({
    page,
    context,
    request,
    playwright,
}) => {
    const account = await register(request, 'Pessoa que criou a lista');
    const other = await playwright.request.newContext();
    try {
        await register(other, 'Pessoa que registrou a compra');
        const shared = await post(request, '/spaces', {
            name: 'Casa das compras',
        });
        const token = new URLSearchParams(
            new URL(shared.inviteUrl).hash.slice(1),
        ).get('token');
        await post(other, '/invitations/respond', {
            token,
            decision: 'ACCEPT',
            expectedVersion: shared.space.version,
        });
        const spaceId = shared.space.id,
            { listId, itemId, version } = await seed(request, spaceId);
        const purchase = await post(
            other,
            `/spaces/${spaceId}/shopping-lists/${listId}/items/${itemId}/purchases`,
            { expectedVersion: version, quantity: '0.25' },
        );
        const task = await post(request, `/spaces/${spaceId}/tasks`, {
            description: 'Passar no mercado',
            shoppingListId: listId,
        });
        await open(
            page,
            context,
            request,
            account.personalSpace.id,
            `/spaces/${spaceId}/shopping/lists/${listId}/items/${itemId}`,
            spaceId,
        );
        await expect(
            page.getByText(/Registrado por Pessoa que registrou a compra/),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Remover item', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Confirmar remoção', exact: true })
            .click();
        await expect(page.getByText('Removido', { exact: true })).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Registrar compra', exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText('Original: 0,25 kg', { exact: true }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Voltar à lista', exact: true })
            .click();
        await expect(
            page.getByRole('link', { name: 'Passar no mercado', exact: true }),
        ).toHaveAttribute(
            'href',
            `/spaces/${spaceId}/routine/tasks/${task.id}`,
        );
        await page
            .getByRole('button', { name: 'Arquivar lista', exact: true })
            .click();
        await page
            .getByRole('button', {
                name: 'Confirmar arquivamento',
                exact: true,
            })
            .click();
        await expect(
            page.getByText('Arquivada', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Adicionar item', exact: true }),
        ).toHaveCount(0);
        await page.getByLabel('Mostrar itens').selectOption('REMOVED');
        await page
            .getByRole('link', { name: 'Arroz integral', exact: true })
            .click();
        await expect(
            page.getByText('Original: 0,25 kg', { exact: true }),
        ).toBeVisible();
        expect(purchase.purchase.registeredBy.displayName).toBe(
            'Pessoa que registrou a compra',
        );
        const taskDetail = await (
            await request.get(`${apiUrl}/spaces/${spaceId}/tasks/${task.id}`)
        ).json();
        expect(taskDetail.status).toBe('PENDING');
        expect(taskDetail.shoppingList.status).toBe('ARCHIVED');
    } finally {
        await other.dispose();
    }
});

test('040: resultado incerto reenvia mesma chave e não duplica compra', async ({
    page,
    context,
    request,
}) => {
    const account = await register(request),
        spaceId = account.personalSpace.id;
    const { listId, itemId } = await seed(request, spaceId);
    await open(
        page,
        context,
        request,
        spaceId,
        `/spaces/${spaceId}/shopping/lists/${listId}/items/${itemId}`,
    );
    const keys: string[] = [],
        bodies: unknown[] = [];
    await page.route(
        `**/v2/spaces/${spaceId}/shopping-lists/${listId}/items/${itemId}/purchases`,
        async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            keys.push(route.request().headers()['idempotency-key']);
            bodies.push(route.request().postDataJSON());
            if (keys.length === 1) {
                const response = await route.fetch();
                expect(response.status()).toBe(201);
                return route.abort('failed');
            }
            return route.continue();
        },
    );
    await page
        .getByRole('button', { name: 'Registrar compra', exact: true })
        .click();
    await page.getByLabel('Quantidade comprada agora').fill('0,1');
    await page
        .getByRole('button', { name: 'Confirmar compra', exact: true })
        .click();
    await page
        .getByRole('button', {
            name: 'Reenviar a mesma tentativa',
            exact: true,
        })
        .click();
    await expect(quantity(page, 'Comprado após correções')).toHaveText(
        '0,1 kg',
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(bodies[1]).toEqual(bodies[0]);
    const purchases = await (
        await request.get(
            `${apiUrl}/spaces/${spaceId}/shopping-lists/${listId}/items/${itemId}/purchases`,
        )
    ).json();
    expect(purchases.totalCount).toBe(1);
});

test('038–039: conflito exige revisão e itens paginados não alteram o resumo global', async ({
    page,
    context,
    request,
}) => {
    const account = await register(request),
        spaceId = account.personalSpace.id;
    const { listId, version: initialVersion } = await seed(request, spaceId);
    let version = initialVersion;
    for (let index = 1; index <= 20; index++) {
        const item = await post(
            request,
            `/spaces/${spaceId}/shopping-lists/${listId}/items`,
            {
                expectedVersion: version,
                description: `Item ${String(index).padStart(2, '0')}`,
                desiredQuantity: '1',
            },
        );
        version = item.version;
    }
    await open(
        page,
        context,
        request,
        spaceId,
        `/spaces/${spaceId}/shopping/lists/${listId}`,
    );
    await expect(quantity(page, 'Itens ativos')).toHaveText('21');
    const items = page
        .getByRole('heading', { name: 'Itens', exact: true })
        .locator('..');
    await expect(items.getByRole('link')).toHaveCount(20);
    await items.getByRole('button', { name: 'Ver mais', exact: true }).click();
    await expect(items.getByRole('link')).toHaveCount(1);
    await expect(quantity(page, 'Itens ativos')).toHaveText('21');
    await page
        .getByRole('button', { name: 'Renomear lista', exact: true })
        .click();
    await page
        .getByLabel('Nome da lista (opcional)')
        .fill('Nome desatualizado');
    await post(request, `/spaces/${spaceId}/shopping-lists/${listId}/name`, {
        expectedVersion: version,
        name: 'Nome mais recente',
    });
    await page
        .getByRole('button', { name: 'Salvar nome', exact: true })
        .click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Os dados mudaram',
    );
    await expect(
        page.getByRole('button', { name: 'Salvar nome', exact: true }),
    ).toBeDisabled();
    await page
        .getByRole('button', { name: 'Atualizar e revisar', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Nome mais recente', exact: true }),
    ).toBeVisible();
});
