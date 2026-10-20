import { randomUUID } from 'node:crypto';
import {
    expect,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';

export const apiUrl = 'http://127.0.0.1:3101/v2',
    origin = 'http://localhost:3100';
export async function post(api: APIRequestContext, path: string, data: object) {
    const csrf = await (await api.get(`${apiUrl}/auth/csrf`)).json();
    const response = await api.post(`${apiUrl}${path}`, {
        headers: {
            Origin: origin,
            'X-CSRF-Token': csrf.csrfToken,
            'Idempotency-Key': randomUUID(),
        },
        data,
    });
    expect([200, 201], await response.text()).toContain(response.status());
    return response.json();
}
export async function register(
    api: APIRequestContext,
    displayName = 'Pessoa Compras',
) {
    return post(api, '/auth/register', {
        displayName,
        email: `${randomUUID()}@example.com`,
        password: 'uma-senha-forte-de-testes',
    });
}
export async function open(
    page: Page,
    context: BrowserContext,
    api: APIRequestContext,
    personalId: string,
    path: string,
    spaceId = personalId,
) {
    await context.addCookies(
        (await api.storageState()).cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    );
    await page.goto(`/spaces/${personalId}/shopping`);
    await expect(page.getByLabel('Espaço atual', { exact: true })).toHaveValue(
        personalId,
    );
    if (spaceId !== personalId) {
        await page
            .getByLabel('Espaço atual', { exact: true })
            .selectOption(spaceId);
        await expect(
            page.getByLabel('Espaço atual', { exact: true }),
        ).toHaveValue(spaceId);
    }
    await page.goto(path);
}
export async function seed(
    api: APIRequestContext,
    spaceId: string,
    name = 'Mercado de teste',
) {
    const list = await post(api, `/spaces/${spaceId}/shopping-lists`, { name });
    const item = await post(
        api,
        `/spaces/${spaceId}/shopping-lists/${list.id}/items`,
        {
            expectedVersion: list.version,
            description: 'Arroz integral',
            desiredQuantity: '1.25',
            unit: 'kg',
        },
    );
    return {
        listId: list.id as string,
        itemId: item.item.id as string,
        version: item.version as number,
    };
}
export const quantity = (page: Page, label: string) =>
    page.getByText(label, { exact: true }).locator('..').locator('dd');
