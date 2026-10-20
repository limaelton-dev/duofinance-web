import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from '@playwright/test';
import { businessToday } from '../../src/features/finances/utils/expense-money';
import type { ClosureDiagnostic } from '../../src/features/spaces/closure/types';
import type { FinancialContext } from '../../src/features/finances/types/shared-expense';
import type { OffsetOptions } from '../../src/features/finances/types/settlement-depth';

const apiUrl = 'http://127.0.0.1:3101/v2';
const csrf = new WeakMap<APIRequestContext, string>();
type Account = {
    personId: string;
    personalSpaceId: string;
    state: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
async function post(
    api: APIRequestContext,
    path: string,
    data: object,
    status = 200,
) {
    let token = csrf.get(api);
    if (!token) {
        token = (await (await api.get(`${apiUrl}/auth/csrf`)).json()).csrfToken;
        csrf.set(api, token!);
    }
    const response = await api.post(`${apiUrl}${path}`, {
        data,
        headers: {
            Origin: 'http://localhost:3100',
            'X-CSRF-Token': token!,
            'Idempotency-Key': randomUUID(),
        },
    });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
}
async function read<T>(api: APIRequestContext, path: string): Promise<T> {
    const response = await api.get(`${apiUrl}${path}`);
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
}
async function register(
    api: APIRequestContext,
    displayName: string,
): Promise<Account> {
    const response = await post(
        api,
        '/auth/register',
        {
            displayName,
            email: `${randomUUID()}@example.test`,
            password: 'teste-encerramento-espaco-seguro',
        },
        201,
    );
    csrf.delete(api);
    return {
        personId: response.person.id,
        personalSpaceId: response.personalSpace.id,
        state: await api.storageState(),
    };
}
async function open(
    page: Page,
    context: BrowserContext,
    account: Account,
    spaceId: string,
) {
    await context.clearCookies();
    await context.addCookies(
        account.state.cookies.map((cookie) => ({
            ...cookie,
            domain: 'localhost',
        })),
    );
    await page.goto(`/spaces/${spaceId}/closure`);
    await expect(
        page.getByRole('combobox', { name: 'Espaço atual', exact: true }),
    ).toHaveValue(spaceId);
}
async function readClosure(api: APIRequestContext, spaceId: string) {
    const diagnostic = await read<ClosureDiagnostic>(
        api,
        `/spaces/${spaceId}/closure/diagnostic`,
    );
    expect(diagnostic.closure).not.toBeNull();
    return diagnostic.closure!;
}
async function version(api: APIRequestContext, spaceId: string) {
    const closure = await readClosure(api, spaceId);
    return {
        expectedSpaceVersion: closure.spaceVersion,
        expectedPlanRevision: closure.planRevision,
    };
}
async function propose(api: APIRequestContext, spaceId: string) {
    const review = await read<{ finance: { fingerprint: string } }>(
        api,
        `/spaces/${spaceId}/closure/plan-review`,
    );
    return post(api, `/spaces/${spaceId}/closure/proposal`, {
        ...(await version(api, spaceId)),
        expectedFinancialFingerprint: review.finance.fingerprint,
    });
}
async function approve(api: APIRequestContext, spaceId: string) {
    const review = await read<{ finance: { fingerprint: string } }>(
        api,
        `/spaces/${spaceId}/closure/plan-review`,
    );
    return post(api, `/spaces/${spaceId}/closure/approval`, {
        ...(await version(api, spaceId)),
        expectedFinancialFingerprint: review.finance.fingerprint,
    });
}

test('criador na formação continua futuro pessoal, consente, confirma e preserva leitura', async ({
    playwright,
    page,
    context,
}) => {
    const api = await playwright.request.newContext();
    try {
        const owner = await register(api, 'Criador encerramento');
        const created = await post(
            api,
            '/spaces',
            { name: 'Casa em formação' },
            201,
        );
        const spaceId = created.space.id;
        const financialContext = await read<FinancialContext>(
            api,
            `/spaces/${spaceId}/financial-entry-context`,
        );
        const recurrence = await post(
            api,
            `/spaces/${spaceId}/recurring-commitments`,
            {
                scope: 'SHARED',
                kind: 'EXPENSE',
                description: 'Internet futura da casa',
                amountInCents: 3000,
                recurrence: { frequency: 'MONTHLY', dayOfMonth: 20 },
                startsOn: '2099-01-20',
                expectedSpaceVersion: financialContext.version,
                expectedMemberId: financialContext.actorMemberId,
                distribution: {
                    mode: 'PERCENTAGES',
                    shares: [
                        {
                            memberId: financialContext.actorMemberId,
                            basisPoints: 10000,
                        },
                    ],
                },
            },
            201,
        );
        await open(page, context, owner, spaceId);
        await page.getByLabel('Entendi o corte inicial').check();
        await page
            .getByRole('button', { name: 'Iniciar encerramento', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Data de corte', exact: true }),
        ).toBeVisible();
        await page
            .getByLabel('Destino de Internet futura da casa')
            .selectOption('PERSONAL_SUCCESSOR');
        await page
            .getByLabel('Pessoa que assumirá o futuro')
            .selectOption(financialContext.actorMemberId);
        await page
            .getByRole('button', { name: 'Conferir escolha', exact: true })
            .click();
        await page.getByLabel('Conferi o destino e entendi').check();
        await page
            .getByRole('button', {
                name: 'Salvar destino no plano',
                exact: true,
            })
            .click();
        const plan = page.locator('#plan');
        await plan
            .getByRole('button', {
                name: 'Revisar meu consentimento',
                exact: true,
            })
            .click();
        await plan.getByLabel('Conferi as consequências desta revisão').check();
        await plan
            .getByRole('button', {
                name: 'Consentir e aprovar meu plano',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('link', {
                name: 'Consultar sucessor no meu espaço',
                exact: true,
            }),
        ).toBeVisible();
        const conclusion = page.locator('#conclusion');
        await conclusion
            .getByRole('button', {
                name: 'Revisar confirmação final',
                exact: true,
            })
            .click();
        await conclusion
            .getByLabel(
                'Conferi os efeitos e quero registrar minha confirmação final',
            )
            .check();
        await conclusion
            .getByRole('button', {
                name: 'Confirmar encerramento',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('heading', {
                name: 'Histórico do encerramento',
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', {
                name: /Iniciar|Salvar destino|Confirmar encerramento/,
            }),
        ).toHaveCount(0);
        const closed = await readClosure(api, spaceId);
        expect(closed.spaceStatus).toBe('CLOSED');
        expect(closed.requiredMemberIds).toHaveLength(1);
        expect(closed.confirmations).toHaveLength(1);
        expect(closed.futureDestinations[0].originId).toBe(
            recurrence.commitment.id,
        );
        const successor = page.getByRole('link', {
            name: 'Consultar sucessor no meu espaço',
            exact: true,
        });
        await expect(successor).toHaveAttribute(
            'href',
            new RegExp(
                `/spaces/${owner.personalSpaceId}/recurring-commitments/`,
            ),
        );
        const oldToken = new URLSearchParams(
            new URL(created.inviteUrl).hash.slice(1),
        ).get('token');
        await post(api, '/invitations/preview', { token: oldToken }, 404);
        const personal = await read<{ space: { status: string } }>(
            api,
            `/spaces/${owner.personalSpaceId}`,
        );
        expect(personal.space.status).toBe('ACTIVE');
    } finally {
        await api.dispose();
    }
});

test('rejeição e nova revisão preservam bloqueadores brutos até compensação e confirmação bilateral', async ({
    playwright,
    page,
    context,
}) => {
    const ownerApi = await playwright.request.newContext(),
        otherApi = await playwright.request.newContext();
    try {
        const owner = await register(ownerApi, 'Pessoa A encerramento'),
            other = await register(otherApi, 'Pessoa B encerramento');
        const shared = await post(
                ownerApi,
                '/spaces',
                { name: 'Casa bilateral' },
                201,
            ),
            spaceId = shared.space.id;
        const token = new URLSearchParams(
            new URL(shared.inviteUrl).hash.slice(1),
        ).get('token');
        await post(otherApi, '/invitations/respond', {
            token,
            decision: 'ACCEPT',
            expectedVersion: shared.space.version,
        });
        const ctx = await read<FinancialContext>(
            ownerApi,
            `/spaces/${spaceId}/financial-entry-context`,
        );
        const a = ctx.members.find(
                (member) => member.personId === owner.personId,
            )!.memberId,
            b = ctx.members.find(
                (member) => member.personId === other.personId,
            )!.memberId;
        for (const [debtor, payer] of [
            [a, b],
            [b, a],
        ])
            await post(
                ownerApi,
                `/spaces/${spaceId}/shared-cash-expenses`,
                {
                    expectedSpaceVersion: ctx.version,
                    description: `Despesa paga por ${payer === a ? 'A' : 'B'}`,
                    amountInCents: 1000,
                    factDate: businessToday(),
                    expectedPayerMemberId: null,
                    responsibilitySplit: {
                        mode: 'AMOUNTS',
                        shares: [a, b].map((memberId) => ({
                            memberId,
                            amountInCents: memberId === debtor ? 1000 : 0,
                        })),
                    },
                    disbursement: { payerMemberId: payer, method: 'PIX' },
                    settlement: { mode: 'NONE' },
                },
                201,
            );
        await post(
            ownerApi,
            `/spaces/${spaceId}/closure`,
            { expectedSpaceVersion: ctx.version },
            201,
        );
        await propose(ownerApi, spaceId);
        await open(page, context, other, spaceId);
        const plan = page.locator('#plan');
        await plan
            .getByRole('button', { name: 'Revisar rejeição', exact: true })
            .click();
        await plan.getByLabel('Conferi as consequências desta revisão').check();
        await plan
            .getByRole('button', { name: 'Confirmar rejeição', exact: true })
            .click();
        await expect(
            plan.getByText('Rejeitado', { exact: false }),
        ).toBeVisible();
        await propose(ownerApi, spaceId);
        await approve(otherApi, spaceId);
        await open(page, context, owner, spaceId);
        await expect(
            page.getByRole('button', {
                name: 'Revisar confirmação final',
                exact: true,
            }),
        ).toBeDisabled();
        const diagnostics = await read<{
            finance: {
                outstandingAmounts: { amountInCents: string }[];
                blockers: { type: string; originId: string }[];
            };
        }>(ownerApi, `/spaces/${spaceId}/closure/diagnostic?limit=100`);
        expect(
            diagnostics.finance.outstandingAmounts.map(
                (item) => item.amountInCents,
            ),
        ).toEqual(['1000', '1000']);
        const obligationIds = diagnostics.finance.blockers
            .filter((item) => item.type === 'INTER_MEMBER_OBLIGATION')
            .map((item) => item.originId);
        const scope = { cycleIds: [], obligationIds };
        const options = await read<OffsetOptions>(
            ownerApi,
            `/spaces/${spaceId}/settlement-offsets/options?obligationIds=${obligationIds.join(',')}`,
        );
        await post(
            ownerApi,
            `/spaces/${spaceId}/settlement-offsets`,
            {
                scope,
                expectedSpaceVersion: options.spaceVersion,
                factDate: businessToday(),
                expectedCycleVersions: [],
                allocations: options.preview.allocations,
            },
            201,
        );
        await page
            .getByRole('button', { name: 'Atualizar', exact: true })
            .click();
        await page
            .getByRole('button', {
                name: 'Revisar confirmação final',
                exact: true,
            })
            .click();
        await page
            .getByLabel(
                'Conferi os efeitos e quero registrar minha confirmação final',
            )
            .check();
        await page
            .getByRole('button', {
                name: 'Confirmar encerramento',
                exact: true,
            })
            .click();
        await expect(
            page.getByText('Você já confirmou este estado.', { exact: false }),
        ).toBeVisible();
        await open(page, context, other, spaceId);
        await page
            .getByRole('button', {
                name: 'Revisar confirmação final',
                exact: true,
            })
            .click();
        await page
            .getByLabel(
                'Conferi os efeitos e quero registrar minha confirmação final',
            )
            .check();
        await page
            .getByRole('button', {
                name: 'Confirmar encerramento',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('heading', {
                name: 'Histórico do encerramento',
                exact: true,
            }),
        ).toBeVisible();
        expect((await readClosure(ownerApi, spaceId)).spaceStatus).toBe(
            'CLOSED',
        );
    } finally {
        await ownerApi.dispose();
        await otherApi.dispose();
    }
});

test('após aprovação bilateral, cancelar depende das duas pessoas e não reabre convite antigo', async ({
    playwright,
    page,
    context,
}) => {
    const ownerApi = await playwright.request.newContext(),
        otherApi = await playwright.request.newContext();
    try {
        const owner = await register(ownerApi, 'Solicitante cancelamento'),
            other = await register(otherApi, 'Participante cancelamento');
        const shared = await post(
                ownerApi,
                '/spaces',
                { name: 'Casa cancelamento' },
                201,
            ),
            spaceId = shared.space.id;
        const token = new URLSearchParams(
            new URL(shared.inviteUrl).hash.slice(1),
        ).get('token');
        await post(otherApi, '/invitations/respond', {
            token,
            decision: 'ACCEPT',
            expectedVersion: shared.space.version,
        });
        const ctx = await read<FinancialContext>(
            ownerApi,
            `/spaces/${spaceId}/financial-entry-context`,
        );
        await post(
            ownerApi,
            `/spaces/${spaceId}/closure`,
            { expectedSpaceVersion: ctx.version },
            201,
        );
        await propose(ownerApi, spaceId);
        await approve(otherApi, spaceId);
        await open(page, context, owner, spaceId);
        await page
            .getByRole('button', {
                name: 'Revisar cancelamento em conjunto',
                exact: true,
            })
            .click();
        await page
            .getByLabel(
                'Conferi os efeitos e quero registrar meu consentimento de cancelamento',
            )
            .check();
        await page
            .getByRole('button', {
                name: 'Confirmar cancelamento',
                exact: true,
            })
            .click();
        await expect(
            page.getByText('Seu pedido de cancelamento está registrado.', {
                exact: false,
            }),
        ).toBeVisible();
        expect((await readClosure(ownerApi, spaceId)).spaceStatus).toBe(
            'CLOSING',
        );
        await open(page, context, other, spaceId);
        await page
            .getByRole('button', {
                name: 'Revisar cancelamento em conjunto',
                exact: true,
            })
            .click();
        await page
            .getByLabel(
                'Conferi os efeitos e quero registrar meu consentimento de cancelamento',
            )
            .check();
        await page
            .getByRole('button', {
                name: 'Confirmar cancelamento',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('button', {
                name: 'Iniciar encerramento',
                exact: true,
            }),
        ).toBeVisible();
        expect((await readClosure(ownerApi, spaceId)).processStatus).toBe(
            'CANCELLED',
        );
        await post(otherApi, '/invitations/preview', { token }, 404);
    } finally {
        await ownerApi.dispose();
        await otherApi.dispose();
    }
});
