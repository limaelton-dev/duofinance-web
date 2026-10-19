import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const apiUrl = 'http://127.0.0.1:3101/v2',
    origin = 'http://localhost:3100';
async function post(
    api: APIRequestContext,
    path: string,
    data: object,
    key = randomUUID(),
) {
    const token = (await (await api.get(`${apiUrl}/auth/csrf`)).json())
        .csrfToken;
    return api.post(`${apiUrl}${path}`, {
        data,
        headers: {
            Origin: origin,
            'X-CSRF-Token': token,
            'Idempotency-Key': key,
        },
    });
}
async function account(
    api: APIRequestContext,
    context: BrowserContext,
    page: Page,
) {
    const response = await post(api, '/auth/register', {
        displayName: 'Planejamento Web',
        email: `${randomUUID()}@example.com`,
        password: 'uma-senha-forte-de-testes',
    });
    expect(response.status(), await response.text()).toBe(201);
    const user = await response.json();
    const state = await api.storageState();
    await context.addCookies(
        state.cookies.map((cookie) => ({ ...cookie, domain: 'localhost' })),
    );
    await page.goto(`/spaces/${user.personalSpace.id}`);
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(user.personalSpace.id);
    const options = await (
        await api.get(
            `${apiUrl}/spaces/${user.personalSpace.id}/income-options`,
        )
    ).json();
    return {
        spaceId: user.personalSpace.id as string,
        today: options.referenceDate as string,
    };
}
function future(today: string, offset: number) {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date.toISOString().slice(0, 10);
}
async function createPlan(page: Page, spaceId: string, date: string) {
    await page.goto(`/spaces/${spaceId}/installment-commitments/new`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill('Curso com plano finito');
    await page.getByLabel('Quantidade de parcelas').fill('3');
    await page.getByLabel('Valor total (R$)', { exact: true }).fill('300,00');
    await page.getByLabel('Primeiro vencimento').fill(date);
    await page.getByRole('button', { name: 'Conferir cronograma' }).click();
    await expect(
        page.getByRole('region', { name: 'Cronograma do parcelamento' }),
    ).toContainText('3 parcelas');
    await page
        .getByRole('button', { name: 'Criar parcelamento', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Parcelamento criado' }),
    ).toBeVisible();
    const link = page.getByRole('link', { name: 'Conferir parcelamento' });
    const id = (await link.getAttribute('href'))!.split('/').at(-1)!;
    await link.click();
    return id;
}

test('Wave 4 real: future expense remains pending until a later explicit payment', async ({
    request,
    context,
    page,
}) => {
    const { spaceId, today } = await account(request, context, page);
    await page.goto(`/spaces/${spaceId}/finances/planning`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill('Manutenção planejada');
    await page.getByLabel('Valor previsto (R$)').fill('200,00');
    await page
        .getByLabel('Data prevista para pagamento')
        .fill(future(today, 1));
    await page
        .getByRole('button', { name: 'Revisar despesa prevista' })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar despesa prevista' })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Despesa prevista registrada' }),
    ).toBeVisible();
    const link = page.getByRole('link', { name: 'Conferir despesa' }),
        id = (await link.getAttribute('href'))!.split('/').at(-1)!;
    const before = await (
        await request.get(
            `${apiUrl}/spaces/${spaceId}/financial-commitments/${id}`,
        )
    ).json();
    expect(before.paidAmountInCents).toBe(0);
    expect(before.remainingAmountInCents).toBe(20000);
    expect(before.disbursement).toBeNull();
    await link.click();
    await page.getByLabel('Valor pago agora (R$)').fill('200,00');
    await page
        .getByRole('button', { name: 'Revisar pagamento', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar pagamento', exact: true })
        .click();
    await expect(
        page.getByText('Pagamento registrado.', { exact: true }),
    ).toBeVisible();
    const after = await (
        await request.get(
            `${apiUrl}/spaces/${spaceId}/financial-commitments/${id}`,
        )
    ).json();
    expect(after.remainingAmountInCents).toBe(0);
    expect(after.disbursements).toHaveLength(1);
    expect(after.disbursements[0].amountInCents).toBe(20000);
});
test('Wave 4 real: variable recurrence requires a real occurrence value before a payment', async ({
    request,
    context,
    page,
}) => {
    const { spaceId, today } = await account(request, context, page);
    await page.goto(`/spaces/${spaceId}/recurring-commitments/new`);
    await page
        .getByLabel('Descrição', { exact: true })
        .fill('Energia variável');
    await page
        .getByRole('combobox', { name: 'Valor', exact: true })
        .selectOption('VARIABLE');
    await page
        .getByLabel('Dia do mês', { exact: true })
        .fill(String(Number(today.slice(-2))));
    await page.getByRole('button', { name: 'Revisar recorrência' }).click();
    await page
        .getByRole('button', { name: 'Criar recorrência', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Recorrência criada' }),
    ).toBeVisible();
    const link = page.getByRole('link', { name: 'Conferir recorrência' }),
        id = (await link.getAttribute('href'))!.split('/').at(-1)!;
    await link.click();
    await page.getByRole('button', { name: 'Abrir ocorrência' }).click();
    await page.getByLabel('Valor real da ocorrência (R$)').fill('125,50');
    await page
        .getByRole('button', { name: 'Revisar registro', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar registro', exact: true })
        .click();
    await expect(
        page.getByText('Registro confirmado. O histórico foi preservado.', {
            exact: true,
        }),
    ).toBeVisible();
    await page.getByLabel('Valor realizado (R$)').fill('125,50');
    await page
        .getByRole('button', { name: 'Revisar registro', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar registro', exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (
                    await (
                        await request.get(
                            `${apiUrl}/spaces/${spaceId}/recurring-commitments/${id}/occurrences?month=${today.slice(0, 7)}`,
                        )
                    ).json()
                ).items[0].status,
        )
        .toBe('FULFILLED');
    const result = await (
        await request.get(
            `${apiUrl}/spaces/${spaceId}/recurring-commitments/${id}/occurrences?month=${today.slice(0, 7)}`,
        )
    ).json();
    expect(result.items[0].amountInCents).toBe(12550);
    expect(result.items[0].valueHistory).toHaveLength(1);
    expect(result.items[0].facts).toHaveLength(1);
    expect(result.items[0].remainingAmountInCents).toBe(0);
});
test('Wave 4 real: anticipation then global payoff preserve distinct installment history', async ({
    request,
    context,
    page,
}) => {
    const { spaceId, today } = await account(request, context, page),
        id = await createPlan(page, spaceId, future(today, 1));
    await page
        .getByRole('button', { name: 'Antecipar parcelas', exact: true })
        .click();
    await page
        .getByRole('combobox', { name: 'Selecionar parcelas', exact: true })
        .selectOption('FROM_END');
    await page.getByLabel('Quantidade a partir do final').fill('1');
    await page
        .getByRole('button', { name: 'Conferir parcelas selecionadas' })
        .click();
    await page
        .getByLabel('Valor real da parcela 3', { exact: true })
        .fill('90,00');
    await page.getByRole('button', { name: 'Revisar antecipação' }).click();
    await page.getByRole('button', { name: 'Confirmar antecipação' }).click();
    await expect(
        page.getByText('Antecipação registrada nas parcelas selecionadas.', {
            exact: true,
        }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Quitar restante', exact: true })
        .click();
    await page.getByLabel('Valor real global da quitação (R$)').fill('180,00');
    await page.getByRole('button', { name: 'Revisar quitação' }).click();
    await page
        .getByRole('button', { name: 'Confirmar quitação global' })
        .click();
    await expect(
        page.getByText(
            'Quitação global registrada. As parcelas realizadas continuam no histórico.',
            { exact: true },
        ),
    ).toBeVisible();
    const root = (
        await (
            await request.get(
                `${apiUrl}/spaces/${spaceId}/installment-commitments/${id}`,
            )
        ).json()
    ).commitment;
    expect(root.plan.remainingAmountInCents).toBe(0);
    expect(root.plan.fulfilledAmountInCents).toBe(27000);
    expect(root.plan.payoff.paidAmountInCents).toBe(18000);
    expect(root.plan.installments[2].anticipation.paidAmountInCents).toBe(9000);
    expect(
        root.plan.installments
            .slice(0, 2)
            .every((item: { status: string }) => item.status === 'PAID_OFF'),
    ).toBe(true);
});
test('Wave 4 real: future cancellation preserves an earlier partial payment and its amount', async ({
    request,
    context,
    page,
}) => {
    const { spaceId, today } = await account(request, context, page),
        id = await createPlan(page, spaceId, future(today, 1));
    await page
        .getByRole('button', { name: 'Abrir parcela', exact: true })
        .first()
        .click();
    await page.getByLabel('Valor realizado (R$)').fill('25,00');
    await page
        .getByRole('button', { name: 'Revisar registro', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Confirmar registro', exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (
                    await (
                        await request.get(
                            `${apiUrl}/spaces/${spaceId}/installment-commitments/${id}/installments`,
                        )
                    ).json()
                ).items[0].fulfilledAmountInCents,
        )
        .toBe(2500);
    await page
        .getByRole('button', { name: 'Cancelar futuras', exact: true })
        .click();
    await page.getByRole('checkbox', { name: /Parcela 1/ }).check();
    await page
        .getByLabel('Motivo do cancelamento')
        .fill('Contrato externo encerrado');
    await page.getByRole('button', { name: 'Revisar cancelamento' }).click();
    await page
        .getByRole('button', { name: 'Confirmar cancelamento das parcelas' })
        .click();
    await expect(
        page.getByText(
            'Parcelas futuras canceladas. Os fatos anteriores foram preservados.',
            { exact: true },
        ),
    ).toBeVisible();
    const items = (
        await (
            await request.get(
                `${apiUrl}/spaces/${spaceId}/installment-commitments/${id}/installments`,
            )
        ).json()
    ).items;
    expect(items[0].status).toBe('CANCELLED');
    expect(items[0].fulfilledAmountInCents).toBe(2500);
    expect(items[0].facts).toHaveLength(1);
    expect(items[0].remainingAmountInCents).toBe(0);
    expect(items[1].status).toBe('PENDING');
});
