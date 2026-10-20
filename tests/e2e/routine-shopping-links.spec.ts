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

test('043: vincula, troca e remove após arquivo com navegação nos dois sentidos e ciclos independentes', async ({
    page,
    context,
    request,
}) => {
    const account = await register(request),
        spaceId = account.personalSpace.id;
    const first = await seed(request, spaceId, 'Mercado original');
    const second = await seed(request, spaceId, 'Mercado novo');
    const task = await post(request, `/spaces/${spaceId}/tasks`, {
        description: 'Passar no mercado com lista',
    });
    await open(
        page,
        context,
        request,
        spaceId,
        `/spaces/${spaceId}/routine/tasks/${task.id}`,
    );
    await page
        .getByRole('button', { name: 'Vincular lista', exact: true })
        .click();
    await page
        .getByRole('combobox', { name: 'Lista ativa', exact: true })
        .selectOption(first.listId);
    await page
        .getByRole('button', { name: 'Confirmar vínculo', exact: true })
        .click();
    await expect(
        page.getByRole('link', { name: 'Mercado original', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Trocar lista vinculada', exact: true })
        .click();
    await page
        .getByRole('combobox', { name: 'Lista ativa', exact: true })
        .selectOption(second.listId);
    await page
        .getByRole('button', { name: 'Confirmar vínculo', exact: true })
        .click();
    await expect(
        page.getByRole('link', { name: 'Mercado novo', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('combobox', { name: 'Ação', exact: true })
        .selectOption('COMPLETE');
    await page
        .getByRole('button', { name: 'Revisar ação', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar conclusão', exact: true })
        .click();
    await expect(
        page.getByText('Concluída', { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Mercado novo', exact: true }).click();
    await expect(quantity(page, 'Com quantidade a comprar')).toHaveText('1');
    await expect(
        page.getByRole('link', {
            name: 'Passar no mercado com lista',
            exact: true,
        }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Arquivar lista', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar arquivamento', exact: true })
        .click();
    await expect(page.getByText('Arquivada', { exact: true })).toBeVisible();
    await page
        .getByRole('link', { name: 'Passar no mercado com lista', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Desvincular lista', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar desvínculo', exact: true })
        .click();
    await expect(
        page.getByText('Esta tarefa não tem lista vinculada.', { exact: true }),
    ).toBeVisible();
    const detail = await (
        await request.get(
            `${apiUrl}/spaces/${spaceId}/shopping-lists/${second.listId}`,
        )
    ).json();
    expect(detail.status).toBe('ARCHIVED');
    expect(detail.summary.actionableItemCount).toBe(1);
    const taskDetail = await (
        await request.get(`${apiUrl}/spaces/${spaceId}/tasks/${task.id}`)
    ).json();
    expect(taskDetail.status).toBe('COMPLETED');
    expect(taskDetail.shoppingListId).toBeNull();
});
