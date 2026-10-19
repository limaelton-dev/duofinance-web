import { expect, test, type Page } from '@playwright/test';
const person = '10000000-0000-4000-8000-000000000001',
    other = '10000000-0000-4000-8000-000000000002',
    personal = '20000000-0000-4000-8000-000000000001',
    space = '20000000-0000-4000-8000-000000000002',
    member = '30000000-0000-4000-8000-000000000001',
    otherMember = '30000000-0000-4000-8000-000000000002',
    id = '40000000-0000-4000-8000-000000000001',
    recurrence = '50000000-0000-4000-8000-000000000001';
const taskBase = {
    id,
    spaceId: space,
    description:
        'Conferir filtro e organizar a manutenção da casa com prazo combinado',
    creator: { personId: person, memberId: member },
    assignee: { personId: other, memberId: otherMember },
    deadline: { date: '2026-10-18', time: null },
    urgency: 'HIGH',
    status: 'PENDING',
    version: 1,
    kind: 'ONE_OFF',
    createdAt: '2026-10-17T15:00:00Z',
    completion: null,
    shoppingListId: null,
    shoppingList: null,
    allowedActions: ['ASSIGN', 'COMPLETE', 'DEADLINE', 'URGENCY', 'CANCEL'],
    conditions: {
        overdue: true,
        today: false,
        urgent: false,
        group: 'OVERDUE',
    },
};
async function setup(
    page: Page,
    options: {
        status?: string;
        retry?: boolean;
        conflict?: boolean;
        failList?: boolean;
        virtual?: boolean;
        loading?: boolean;
    } = {},
) {
    const writes: {
        body: Record<string, unknown>;
        key: string | undefined;
        path: string;
        csrf: string | undefined;
    }[] = [];
    const reads: URL[] = [];
    let version = 1,
        completed = false,
        attempts = 0,
        listRecovered = !options.failList;
    const task = () => ({
        ...taskBase,
        version,
        allowedActions:
            options.status && options.status !== 'ACTIVE'
                ? []
                : completed
                  ? ['REOPEN']
                  : taskBase.allowedActions,
        status: completed ? 'COMPLETED' : 'PENDING',
        completion: completed
            ? {
                  executor: { personId: person, memberId: member },
                  completedAt: '2026-10-19T15:00:00Z',
                  assignee: taskBase.assignee,
              }
            : null,
        ...(options.virtual
            ? {
                  kind: 'OCCURRENCE',
                  id: `${recurrence}/2026-10-19`,
                  recurrenceId: recurrence,
                  recurrenceVersion: 3,
                  scheduledDate: '2026-10-19',
                  materialized: completed,
                  version: completed ? 1 : null,
                  allowedActions: completed ? ['REOPEN'] : ['COMPLETE', 'SKIP'],
              }
            : {}),
    });
    await page.route('**/v2/**', async (route) => {
        const request = route.request(),
            url = new URL(request.url()),
            path = url.pathname,
            headers = {
                'Access-Control-Allow-Origin': 'http://localhost:3200',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Allow-Headers':
                    'Content-Type, X-CSRF-Token, Idempotency-Key',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            };
        if (request.method() === 'OPTIONS')
            return route.fulfill({ status: 204, headers });
        const personalSpace = {
                id: personal,
                label: 'Meu espaço',
                type: 'PERSONAL',
                status: 'ACTIVE',
                version: 1,
            },
            shared = {
                id: space,
                label: 'Nossa casa',
                type: 'SHARED',
                status: options.status ?? 'ACTIVE',
                version: 1,
            };
        let json: unknown;
        if (path.endsWith('/auth/me'))
            json = {
                person: {
                    id: person,
                    displayName: 'Lucas',
                    email: 'lucas@example.test',
                },
                personalSpace,
            };
        else if (path.endsWith('/auth/csrf'))
            json = { csrfToken: 'routine-csrf' };
        else if (path === '/v2/spaces')
            json = { items: [personalSpace, shared] };
        else if (path === `/v2/spaces/${space}`)
            json = {
                space: shared,
                actorMembership: {
                    id: member,
                    personId: person,
                    status: 'ACTIVE',
                },
                activeMemberCount: 2,
                invitation: null,
            };
        else if (path === `/v2/spaces/${personal}`)
            json = {
                space: personalSpace,
                actorMembership: null,
                activeMemberCount: 0,
                invitation: null,
            };
        else if (path.endsWith('/routine-context'))
            json = {
                spaceId: path.includes(personal) ? personal : space,
                type: path.includes(personal) ? 'PERSONAL' : 'SHARED',
                status: options.status ?? 'ACTIVE',
                actorMemberId: member,
                participants: [
                    {
                        personId: person,
                        memberId: member,
                        displayName: 'Lucas',
                    },
                    {
                        personId: other,
                        memberId: otherMember,
                        displayName: 'Ana',
                    },
                ],
            };
        else if (request.method() === 'POST') {
            const body = request.postDataJSON();
            writes.push({
                body,
                key: request.headers()['idempotency-key'],
                csrf: request.headers()['x-csrf-token'],
                path,
            });
            attempts++;
            if (options.retry && attempts === 1)
                return route.fulfill({
                    status: 503,
                    headers,
                    json: {
                        code: 'UNAVAILABLE',
                        message: 'Ainda não foi possível confirmar.',
                    },
                });
            if (options.conflict && attempts === 1) {
                version++;
                return route.fulfill({
                    status: 409,
                    headers,
                    json: {
                        code: 'CONCURRENT_MODIFICATION',
                        message: 'O registro mudou.',
                    },
                });
            }
            if (path.endsWith('/complete')) {
                completed = true;
                version++;
            }
            json = task();
        } else if (path.endsWith('/shopping-lists')) {
            json = { items: [], nextCursor: null };
        } else if (path.endsWith('/shopping-context')) {
            json = { spaceId: space, status: 'ACTIVE', type: 'SHARED' };
        } else if (path.endsWith('/tasks')) {
            reads.push(url);
            if (options.loading)
                await new Promise((resolve) => setTimeout(resolve, 150));
            if (!listRecovered) {
                return route.fulfill({
                    status: 503,
                    headers,
                    json: {
                        code: 'UNAVAILABLE',
                        message: 'Consulta indisponível',
                    },
                });
            }
            const next = url.searchParams.has('cursor');
            json = {
                referenceDate: '2026-10-19',
                referenceInstant: '2026-10-19T15:00:00Z',
                items: next
                    ? [
                          {
                              ...task(),
                              id: '40000000-0000-4000-8000-000000000002',
                              description: 'Segunda página da rotina',
                          },
                      ]
                    : [task()],
                counts: {
                    totalCount: 2,
                    today: 0,
                    overdue: 2,
                    urgent: 0,
                    upcoming: 0,
                    noDeadline: 0,
                },
                nextCursor: next ? null : 'opaque-page-2',
            };
        } else if (path.endsWith('/history'))
            json = {
                items: completed
                    ? [
                          {
                              id: 'event-1',
                              spaceId: space,
                              aggregateId: id,
                              sequence: 2,
                              type: 'COMPLETED',
                              actorId: person,
                              registeredAt: '2026-10-19T15:00:00Z',
                              data: { after: task().completion },
                          },
                      ]
                    : [],
                nextCursor: null,
            };
        else if (
            path.endsWith(`/tasks/${id}`) ||
            path.includes('/occurrences/')
        )
            json = task();
        else
            return route.fulfill({
                status: 404,
                headers,
                json: { code: 'NOT_FOUND', message: 'Fixture não definida' },
            });
        return route.fulfill({ headers, json });
    });
    return {
        writes,
        reads,
        recoverList: () => {
            listRecovered = true;
        },
    };
}
for (const width of [320, 390, 768, 1280])
    test(`Wave6: consulta, filtros e paginação legíveis em ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 844 });
        const fixture = await setup(page, { loading: true });
        await page.goto(`/spaces/${space}/routine`);
        await expect(
            page.getByRole('heading', { name: 'Rotina', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: taskBase.description, exact: true }),
        ).toBeVisible();
        await page
            .getByRole('combobox', { name: 'Responsabilidade', exact: true })
            .selectOption('MINE');
        await expect
            .poll(() => fixture.reads.at(-1)?.searchParams.get('scope'))
            .toBe('MINE');
        await page
            .getByRole('button', { name: 'Próxima página', exact: true })
            .click();
        await expect(
            page.getByRole('link', {
                name: 'Segunda página da rotina',
                exact: true,
            }),
        ).toBeVisible();
        await page
            .getByRole('combobox', { name: 'Atenção', exact: true })
            .selectOption('URGENT');
        await expect(
            page.getByRole('link', { name: taskBase.description, exact: true }),
        ).toBeVisible();
        expect(fixture.reads.at(-1)?.searchParams.has('cursor')).toBe(false);
        expect(fixture.reads.at(-1)?.searchParams.get('attention')).toBe(
            'URGENT',
        );
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth > window.innerWidth,
            ),
        ).toBe(false);
        await page
            .getByRole('link', { name: 'Nova tarefa', exact: true })
            .click();
        await page
            .getByRole('textbox', { name: 'Descrição', exact: true })
            .fill('Trocar o filtro de água');
        await page
            .getByRole('combobox', { name: 'Responsável', exact: true })
            .selectOption(otherMember);
        await page
            .getByRole('button', { name: 'Revisar tarefa', exact: true })
            .click();
        await expect(
            page.getByRole('region', { name: 'Confirmar tarefa' }),
        ).toContainText('Ana');
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth > window.innerWidth,
            ),
        ).toBe(false);
    });
test('Wave6: resultado incerto repete destino, versão, CSRF e chave da mesma tentativa', async ({
    page,
}) => {
    const fixture = await setup(page, { retry: true });
    await page.goto(`/spaces/${space}/routine/tasks/${id}`);
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
        page.getByRole('button', {
            name: 'Reenviar a mesma tentativa',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByLabel('Espaço atual', { exact: true }),
    ).toBeDisabled();
    await page
        .getByRole('button', {
            name: 'Reenviar a mesma tentativa',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Tarefa concluída', exact: true }),
    ).toBeVisible();
    expect(fixture.writes).toHaveLength(2);
    expect(fixture.writes[0]).toEqual(fixture.writes[1]);
    expect(fixture.writes[0].body).toEqual({ expectedVersion: 1 });
    expect(fixture.writes[0].csrf).toBe('routine-csrf');
    expect(fixture.writes[0].key).toMatch(/^[0-9a-f-]{36}$/);
});
test('Wave6: conflito consulta versão atual e exige nova revisão explícita', async ({
    page,
}) => {
    const fixture = await setup(page, { conflict: true });
    await page.goto(`/spaces/${space}/routine/tasks/${id}`);
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
        page.getByRole('button', { name: 'Confirmar conclusão', exact: true }),
    ).toHaveCount(0);
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
        page.getByRole('heading', { name: 'Tarefa concluída', exact: true }),
    ).toBeVisible();
    expect(fixture.writes.map((w) => w.body.expectedVersion)).toEqual([1, 2]);
    expect(fixture.writes[0].key).not.toBe(fixture.writes[1].key);
});
test('Wave6: ocorrência virtual envia versão nula sem inventar UUID persistido', async ({
    page,
}) => {
    const fixture = await setup(page, { virtual: true });
    await page.goto(
        `/spaces/${space}/routine/recurrences/${recurrence}/occurrences/2026-10-19`,
    );
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
        page.getByRole('heading', { name: 'Tarefa concluída', exact: true }),
    ).toBeVisible();
    expect(fixture.writes[0].body).toEqual({
        expectedRecurrenceVersion: 3,
        expectedOccurrenceVersion: null,
    });
    expect(fixture.writes[0].path).toContain(
        `/task-recurrences/${recurrence}/occurrences/2026-10-19/complete`,
    );
});
test('Wave6: erro de leitura permite recuperar consulta', async ({ page }) => {
    const fixture = await setup(page, { failList: true });
    await page.goto(`/spaces/${space}/routine`);
    await expect(
        page.getByRole('button', { name: 'Tentar novamente', exact: true }),
    ).toBeVisible();
    fixture.recoverList();
    await page
        .getByRole('button', { name: 'Tentar novamente', exact: true })
        .click();
    await expect(
        page.getByRole('link', { name: taskBase.description, exact: true }),
    ).toBeVisible();
});
for (const status of ['CLOSING', 'CLOSED'])
    test(`Wave6: ${status} preserva leitura sem comandos`, async ({ page }) => {
        const fixture = await setup(page, { status });
        await page.goto(`/spaces/${space}/routine/tasks/${id}`);
        await expect(
            page.getByText(/A rotina permanece disponível para consulta/),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', {
                name: taskBase.description,
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole('combobox', { name: 'Ação', exact: true }),
        ).toHaveCount(0);
        expect(fixture.writes).toHaveLength(0);
    });
test('Wave6: trocar espaço com rascunho exige descartar e remove o formulário anterior', async ({
    page,
}) => {
    await setup(page);
    await page.goto(`/spaces/${space}/routine/new`);
    await page
        .getByRole('textbox', { name: 'Descrição', exact: true })
        .fill('Rascunho somente da casa');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page
        .getByLabel('Espaço atual', { exact: true })
        .selectOption(personal);
    await expect(page.getByLabel('Espaço atual', { exact: true })).toHaveValue(
        space,
    );
    await expect(
        page.getByRole('textbox', { name: 'Descrição', exact: true }),
    ).toHaveValue('Rascunho somente da casa');
    page.once('dialog', (dialog) => dialog.accept());
    await page
        .getByLabel('Espaço atual', { exact: true })
        .selectOption(personal);
    await expect(page.getByLabel('Espaço atual', { exact: true })).toHaveValue(
        personal,
    );
    await expect(
        page.getByRole('textbox', { name: 'Descrição', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('heading', { name: 'Rotina', exact: true }),
    ).toBeVisible();
});
