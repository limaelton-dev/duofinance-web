import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
} from '@playwright/test';
import { businessToday } from '../src/features/finances/utils/expense-money';

const apiUrl = 'http://127.0.0.1:3101/v2',
    origin = 'http://localhost:3100';
const csrf = new WeakMap<APIRequestContext, string>();
async function post(api: APIRequestContext, path: string, data: object) {
    let token = csrf.get(api);
    if (!token) {
        token = (await (await api.get(`${apiUrl}/auth/csrf`)).json()).csrfToken;
        csrf.set(api, token!);
    }
    return api.post(`${apiUrl}${path}`, {
        headers: {
            Origin: origin,
            'X-CSRF-Token': token!,
            'Idempotency-Key': randomUUID(),
        },
        data,
    });
}
async function register(api: APIRequestContext, context: BrowserContext) {
    const response = await post(api, '/auth/register', {
        displayName: 'Pessoa Rotina',
        email: `${randomUUID()}@example.test`,
        password: 'rotina-segura-para-teste-completo',
    });
    expect(response.status(), await response.text()).toBe(201);
    csrf.delete(api);
    const account = await response.json(),
        state = await api.storageState();
    await context.addCookies(
        state.cookies.map((cookie) => ({ ...cookie, domain: 'localhost' })),
    );
    return account.personalSpace.id as string;
}
async function act(
    page: import('@playwright/test').Page,
    action: string,
    confirmation: string,
) {
    await page
        .getByRole('combobox', { name: 'Ação', exact: true })
        .selectOption({ label: action });
    await page
        .getByRole('button', { name: 'Revisar ação', exact: true })
        .click();
    await page.getByRole('button', { name: confirmation, exact: true }).click();
}
test('Wave6: criar, priorizar, concluir e reabrir tarefa com histórico real', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext();
    try {
        const space = await register(api, context);
        await page.goto(`/spaces/${space}/routine/new`);
        await page
            .getByRole('textbox', { name: 'Descrição', exact: true })
            .fill('Conferir filtro de água');
        await page
            .getByLabel('Prazo (opcional)', { exact: true })
            .fill(businessToday());
        await page
            .getByRole('combobox', { name: 'Urgência', exact: true })
            .selectOption('HIGH');
        await page
            .getByRole('button', { name: 'Revisar tarefa', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Criar tarefa', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Tarefa criada', exact: true }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Ver tarefa', exact: true })
            .click();
        await expect(page).toHaveURL(new RegExp(`/routine/tasks/[0-9a-f-]+$`));
        const id = page.url().split('/').at(-1)!;
        await page
            .getByRole('combobox', { name: 'Ação', exact: true })
            .selectOption('DEADLINE');
        await page
            .getByLabel('Novo prazo (deixe vazio para remover)', {
                exact: true,
            })
            .fill('');
        await page
            .getByRole('button', { name: 'Revisar ação', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Confirmar alteração', exact: true })
            .click();
        await expect(
            page.getByText('Prazo alterado', { exact: true }),
        ).toBeVisible();
        await act(page, 'Concluir tarefa', 'Confirmar conclusão');
        await expect(
            page.getByText('Tarefa concluída', { exact: true }),
        ).toBeVisible();
        const completed = await (
            await api.get(`${apiUrl}/spaces/${space}/tasks/${id}`)
        ).json();
        expect(completed.status).toBe('COMPLETED');
        expect(completed.deadline).toBeNull();
        expect(completed.urgency).toBe('HIGH');
        expect(completed.completion.executor.personId).toBe(
            completed.assignee.personId,
        );
        await act(page, 'Reabrir tarefa', 'Confirmar reabertura');
        await expect(
            page.getByText('Tarefa reaberta', { exact: true }),
        ).toBeVisible();
        await page
            .getByRole('combobox', { name: 'Ação', exact: true })
            .selectOption('URGENCY');
        await page
            .getByRole('combobox', { name: 'Nova urgência', exact: true })
            .selectOption('URGENT');
        await page
            .getByRole('button', { name: 'Revisar ação', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Confirmar alteração', exact: true })
            .click();
        await expect(
            page.getByText('Urgência alterada', { exact: true }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Voltar à rotina', exact: true })
            .click();
        await page
            .getByRole('combobox', { name: 'Atenção', exact: true })
            .selectOption('NO_DEADLINE');
        await expect(
            page.getByRole('link', {
                name: 'Conferir filtro de água',
                exact: true,
            }),
        ).toBeVisible();
        await page
            .getByRole('link', { name: 'Conferir filtro de água', exact: true })
            .click();
        await act(page, 'Cancelar tarefa', 'Confirmar cancelamento');
        await expect(
            page.getByText('Tarefa cancelada', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('combobox', { name: 'Ação', exact: true }),
        ).toHaveCount(0);
        const history = await (
            await api.get(`${apiUrl}/spaces/${space}/tasks/${id}/history`)
        ).json();
        expect(history.items.map((e: { type: string }) => e.type)).toEqual([
            'CREATED',
            'DEADLINE_CHANGED',
            'COMPLETED',
            'REOPENED',
            'URGENCY_CHANGED',
            'CANCELLED',
        ]);
    } finally {
        await api.dispose();
    }
});
test('Wave6: regra, projeção virtual, conclusão, reabertura, ignorar e cancelamento reais', async ({
    page,
    context,
    playwright,
}) => {
    const api = await playwright.request.newContext();
    try {
        const space = await register(api, context),
            today = businessToday();
        await page.goto(`/spaces/${space}/routine/recurrences/new`);
        await page
            .getByRole('textbox', { name: 'Descrição', exact: true })
            .fill('Regar as plantas');
        await page
            .getByRole('button', { name: 'Revisar tarefa', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Criar recorrência', exact: true })
            .click();
        await page
            .getByRole('link', { name: 'Ver recorrência', exact: true })
            .click();
        await expect(page).toHaveURL(
            new RegExp(`/routine/recurrences/[0-9a-f-]+$`),
        );
        const id = page.url().split('/').at(-1)!;
        const projected = await (
            await api.get(
                `${apiUrl}/spaces/${space}/task-recurrences/${id}/occurrences/${today}`,
            )
        ).json();
        expect(projected.materialized).toBe(false);
        expect(projected.version).toBeNull();
        await page.goto(
            `/spaces/${space}/routine/recurrences/${id}/occurrences/${today}`,
        );
        await act(page, 'Concluir tarefa', 'Confirmar conclusão');
        await expect(
            page.getByText('Tarefa concluída', { exact: true }),
        ).toBeVisible();
        await act(page, 'Reabrir tarefa', 'Confirmar reabertura');
        await expect(
            page.getByText('Tarefa reaberta', { exact: true }),
        ).toBeVisible();
        await act(page, 'Ignorar ocorrência', 'Confirmar ocorrência ignorada');
        await expect(
            page.getByText('Ocorrência ignorada', { exact: true }),
        ).toBeVisible();
        const persisted = await (
            await api.get(
                `${apiUrl}/spaces/${space}/task-recurrences/${id}/occurrences/${today}`,
            )
        ).json();
        expect(persisted.materialized).toBe(true);
        expect(persisted.status).toBe('SKIPPED');
        await page
            .getByRole('link', {
                name: 'Ver regra da recorrência',
                exact: true,
            })
            .click();
        await page
            .getByRole('button', { name: 'Cancelar recorrência', exact: true })
            .click();
        await page
            .getByRole('button', {
                name: 'Confirmar cancelamento',
                exact: true,
            })
            .click();
        await expect(
            page.getByText(
                'Recorrência cancelada. O histórico foi preservado.',
                { exact: true },
            ),
        ).toBeVisible();
        expect(
            (
                await (
                    await api.get(
                        `${apiUrl}/spaces/${space}/task-recurrences/${id}`,
                    )
                ).json()
            ).status,
        ).toBe('CANCELLED');
    } finally {
        await api.dispose();
    }
});
