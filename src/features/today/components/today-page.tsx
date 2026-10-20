'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import {
    ArrowDownLeft,
    ArrowUpRight,
    ArrowRight,
    CalendarDays,
    Plus,
    TriangleAlert,
    ListChecks,
    ShoppingBasket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceDetails } from '@/features/spaces/hooks/use-space-details';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { isSpaceAccessDenied } from '@/features/spaces/state/space-context';
import type { SettlementCycle } from '@/features/finances/types/settlement-cycle';
import { formatPositionMoney } from '@/features/finances/utils/position-money';
import {
    formatDate,
    formatMoney,
} from '@/features/finances/utils/expense-money';
import { useToday } from '../hooks/use-today';
import type {
    Today,
    TodayBlock,
    TodayPreviewItem,
    TodaySettlements,
} from '../types/today';
import {
    formatTodayReferenceDate,
    shouldShowTodayBlock,
    todayItemHref,
    todayItemKey,
} from '../utils/today-presentation';
import styles from './today.module.css';

export function TodayPage() {
    const auth = useAuthenticatedContext({ enabled: false });
    const space = useSpaceContext();
    if (!auth.data || space.phase !== 'ready' || !space.currentSpace)
        return null;
    return (
        <TodayRead
            key={`${auth.data.person.id}:${space.activeSpaceId}:${space.generation}`}
            personId={auth.data.person.id}
            spaceId={space.currentSpace.id}
        />
    );
}

function CycleCard({
    cycle,
    settlements,
    spaceId,
}: {
    cycle: SettlementCycle;
    settlements: TodaySettlements | null;
    spaceId: string;
}) {
    const other = settlements?.members.find(
        (member) => member.memberId !== settlements.actorMemberId,
    );
    const net = cycle.position.net;
    return (
        <article className={styles.cycle}>
            <div>
                <h3>
                    Acerto de{' '}
                    <time dateTime={cycle.targetDate}>
                        {formatDate(cycle.targetDate)}
                    </time>
                </h3>
                <p className={styles.meta}>
                    {cycle.isOverdue
                        ? 'Data-alvo vencida'
                        : 'Data-alvo do acerto'}{' '}
                    · {cycle.openObligationCount}{' '}
                    {cycle.openObligationCount === 1
                        ? 'pendência aberta'
                        : 'pendências abertas'}
                </p>
            </div>
            {cycle.totals.remainingAmountInCents === '0' ? (
                <p>Sem valor em aberto. Este ciclo continua em aberto.</p>
            ) : (
                <div>
                    {cycle.position.payableAmountInCents !== '0' && (
                        <p>
                            Você precisa acertar
                            {other ? ` com ${other.displayName}` : ''}:{' '}
                            <strong className={styles.money}>
                                {formatPositionMoney(
                                    cycle.position.payableAmountInCents,
                                )}
                            </strong>
                        </p>
                    )}
                    {cycle.position.receivableAmountInCents !== '0' && (
                        <p>
                            {other?.displayName ?? 'A outra pessoa'} precisa
                            acertar com você:{' '}
                            <strong className={styles.money}>
                                {formatPositionMoney(
                                    cycle.position.receivableAmountInCents,
                                )}
                            </strong>
                        </p>
                    )}
                    {net.direction === 'BALANCED' && (
                        <p>
                            Os valores se equilibram, mas ainda existem
                            pendências abertas.
                        </p>
                    )}
                </div>
            )}
            <dl className={styles.cycleAmount}>
                <dt>Falta acertar</dt>
                <dd>
                    {formatPositionMoney(cycle.totals.remainingAmountInCents)}
                </dd>
            </dl>
            <Link
                className={styles.textLink}
                href={`/spaces/${spaceId}/finances/settlements/${cycle.id}`}
            >
                Ver acerto <ArrowRight aria-hidden="true" size={16} />
            </Link>
        </article>
    );
}

function PreviewItem({
    item,
    today,
    personId,
}: {
    item: TodayPreviewItem;
    today: Today;
    personId: string;
}) {
    const settlements =
        today.finance.status === 'AVAILABLE'
            ? today.finance.data.settlements
            : null;
    if (item.type === 'SETTLEMENT_CYCLE')
        return (
            <CycleCard
                cycle={item.details}
                settlements={settlements}
                spaceId={today.spaceId}
            />
        );
    const href = todayItemHref(item, today);
    const financial =
        item.type === 'FINANCIAL_COMMITMENT' ? item.details : null;
    const task = item.type === 'TASK' ? item.details : null;
    const assignee =
        task?.assignee?.personId === personId
            ? 'Você'
            : settlements?.members.find(
                  (member) => member.personId === task?.assignee?.personId,
              )?.displayName;
    return (
        <article className={styles.item}>
            <div className={styles.itemMain}>
                {financial && (
                    <span className={styles.itemIcon} aria-hidden="true">
                        {financial.kind === 'INCOME' ? (
                            <ArrowDownLeft size={20} />
                        ) : (
                            <ArrowUpRight size={20} />
                        )}
                    </span>
                )}
                <div className={styles.itemCopy}>
                    <h3>
                        {href ? (
                            <Link className={styles.itemLink} href={href}>
                                {item.label}
                            </Link>
                        ) : (
                            item.label
                        )}
                    </h3>
                    <p className={styles.meta}>
                        {financial
                            ? financial.kind === 'INCOME'
                                ? 'Receita prevista'
                                : 'Despesa prevista'
                            : item.type === 'TASK'
                              ? 'Tarefa'
                              : item.type === 'SHOPPING_LIST'
                                ? 'Lista de compras'
                                : item.type === 'CHANGE_PROPOSAL'
                                  ? 'Aprovação pendente'
                                  : 'Encerramento do espaço'}
                        {item.date && (
                            <>
                                {' '}
                                ·{' '}
                                <time dateTime={item.date}>
                                    {formatDate(item.date)}
                                </time>
                            </>
                        )}
                        {task?.deadline?.time && <> às {task.deadline.time}</>}
                        {task && (
                            <>
                                {' '}
                                ·{' '}
                                {assignee
                                    ? `Responsável: ${assignee}`
                                    : task.assignee
                                      ? 'Responsável definido'
                                      : 'Sem responsável'}
                            </>
                        )}
                    </p>
                    {task &&
                        (task.conditions.overdue || task.conditions.urgent) && (
                            <p className={styles.attentionText}>
                                {[
                                    task.conditions.overdue && 'Prazo vencido',
                                    task.conditions.urgent && 'Urgente',
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                        )}
                    {item.type === 'SHOPPING_LIST' && (
                        <div className={styles.meta}>
                            <p>
                                {item.details.summary.actionableItemCount}{' '}
                                {item.details.summary.actionableItemCount === 1
                                    ? 'item por comprar'
                                    : 'itens por comprar'}
                            </p>
                            {item.details.pendingItems.items.map((pending) => (
                                <p key={pending.id}>
                                    {pending.description}: faltam{' '}
                                    {pending.remainingQuantity.replace(
                                        '.',
                                        ',',
                                    )}
                                    {pending.unit ? ` ${pending.unit}` : ''}
                                </p>
                            ))}
                        </div>
                    )}
                    {item.type === 'CHANGE_PROPOSAL' && (
                        <p className={styles.meta}>
                            Vigência proposta:{' '}
                            {formatDate(item.details.effectiveFrom)}.
                        </p>
                    )}
                    {item.type === 'SPACE_CLOSURE' && (
                        <p className={styles.meta}>
                            Data de corte: {formatDate(item.details.cutoffDate)}
                            .{' '}
                            {
                                closureActions[
                                    item.details.actorNextAction ??
                                        'REVIEW_CLOSURE'
                                ]
                            }
                        </p>
                    )}
                    {!href && (
                        <p className={styles.readOnly}>
                            Para consulta. O detalhe ainda não está disponível
                            nesta versão.
                        </p>
                    )}
                </div>
            </div>
            {financial && (
                <div className={styles.itemValue}>
                    {financial.valuePending ||
                    financial.remainingAmountInCents === null ? (
                        <>
                            <span className={styles.meta}>Valor a definir</span>
                            {financial.expectedAmountInCents !== null && (
                                <span>
                                    Estimativa:{' '}
                                    {formatMoney(
                                        financial.expectedAmountInCents,
                                    )}
                                </span>
                            )}
                        </>
                    ) : (
                        <>
                            <span className={styles.meta}>
                                {financial.kind === 'INCOME'
                                    ? 'Falta receber'
                                    : 'Falta pagar'}
                            </span>
                            <strong className={styles.money}>
                                {formatMoney(financial.remainingAmountInCents)}
                            </strong>
                        </>
                    )}
                </div>
            )}
        </article>
    );
}

const blockTitles: Record<TodayBlock['kind'], string> = {
    ATTENTION: 'Precisa de atenção',
    TODAY: 'Para hoje',
    NEXT_SETTLEMENT: 'Próximo acerto',
    UPCOMING: 'Próximos compromissos',
    TASKS: 'Tarefas',
    SHOPPING: 'Compras',
};
const closureActions = {
    PROPOSE_PLAN: 'Defina e proponha o plano.',
    REVIEW_PLAN: 'Revise o plano para aprovar ou recusar.',
    WAIT_APPROVAL: 'Aguardando a decisão da outra pessoa.',
    RESOLVE_FINANCES: 'Consulte as pendências financeiras.',
    REVIEW_CLOSURE: 'Revise as condições de encerramento.',
    WAIT_CANCELLATION: 'Aguardando concordância para cancelar.',
    APPROVE_CANCELLATION: 'Revise a solicitação de cancelamento.',
    READ_ONLY: 'Histórico disponível para consulta.',
} as const;
const emptyMessages: Record<TodayBlock['kind'], string> = {
    ATTENTION: '',
    TODAY: 'Nenhum compromisso para hoje.',
    NEXT_SETTLEMENT: 'Nenhum acerto para hoje ou datas futuras.',
    UPCOMING: 'Nenhum compromisso próximo para exibir.',
    TASKS: 'Nenhuma tarefa pendente para exibir.',
    SHOPPING: 'Nenhuma compra pendente para exibir.',
};

function TodaySection({
    block,
    today,
    personId,
    retry,
    fetching,
}: {
    block: TodayBlock;
    today: Today;
    personId: string;
    retry: () => void;
    fetching: boolean;
}) {
    if (!shouldShowTodayBlock(block)) return null;
    const title = blockTitles[block.kind];
    const incomplete =
        block.status === 'PARTIAL' || block.status === 'UNAVAILABLE';
    return (
        <section
            className={styles.section}
            aria-labelledby={`today-${block.kind}`}
        >
            <div className={styles.sectionHeading}>
                <h2 id={`today-${block.kind}`}>
                    {block.kind === 'ATTENTION' && (
                        <TriangleAlert size={20} aria-hidden="true" />
                    )}
                    {title}
                </h2>
                {block.status === 'AVAILABLE' &&
                    block.totalCount !== null &&
                    block.totalCount > 0 && (
                        <span
                            className={styles.count}
                            aria-label={`${block.totalCount} ${block.totalCount === 1 ? 'item' : 'itens'} no total`}
                        >
                            {block.totalCount}
                        </span>
                    )}
            </div>
            {incomplete && (
                <div className={styles.partial} role="status">
                    <p>
                        {block.status === 'PARTIAL'
                            ? 'Algumas informações não puderam ser carregadas. Os itens disponíveis continuam abaixo.'
                            : `Não foi possível carregar ${title.toLocaleLowerCase('pt-BR')}.`}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={retry}
                        disabled={fetching}
                    >
                        Tentar novamente
                    </Button>
                </div>
            )}
            {block.items.length > 0 ? (
                <ul className={styles.list}>
                    {block.items.map((item) => (
                        <li key={todayItemKey(item)}>
                            <PreviewItem
                                item={item}
                                today={today}
                                personId={personId}
                            />
                        </li>
                    ))}
                </ul>
            ) : block.status === 'AVAILABLE' && block.totalCount === 0 ? (
                <div className={styles.empty}>
                    {block.kind === 'TODAY' && (
                        <CalendarDays size={24} aria-hidden="true" />
                    )}
                    <p>{emptyMessages[block.kind]}</p>
                </div>
            ) : null}
            {block.hasMore === true && block.totalCount !== null && (
                <p className={styles.more}>
                    Exibindo {block.items.length} de {block.totalCount} itens.
                </p>
            )}
            {block.kind === 'TASKS' && (
                <Link
                    className={styles.textLink}
                    href={`/spaces/${today.spaceId}/routine`}
                >
                    Ver todas as tarefas{' '}
                    <ArrowRight size={16} aria-hidden="true" />
                </Link>
            )}
            {block.kind === 'SHOPPING' && (
                <Link
                    className={styles.textLink}
                    href={`/spaces/${today.spaceId}/shopping`}
                >
                    Ver listas de compras{' '}
                    <ArrowRight size={16} aria-hidden="true" />
                </Link>
            )}
            {block.kind === 'UPCOMING' &&
                today.finance.status === 'AVAILABLE' && (
                    <Link
                        className={styles.textLink}
                        href={`/spaces/${today.spaceId}/incomes`}
                    >
                        Ver receitas <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                )}
            {block.kind === 'ATTENTION' &&
                block.items.some(
                    (item) => item.type === 'SETTLEMENT_CYCLE',
                ) && (
                    <Link
                        className={styles.textLink}
                        href={`/spaces/${today.spaceId}/finances/settlements`}
                    >
                        Ver todos os acertos{' '}
                        <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                )}
        </section>
    );
}

function TodayRead({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const space = useSpaceContext();
    const selection = useSpaceContextInstance();
    const today = useToday(personId, spaceId);
    const details = useSpaceDetails(personId, spaceId);
    const denied =
        isSpaceAccessDenied(today.error) || isSpaceAccessDenied(details.error);
    useEffect(() => {
        if (denied) void selection.accessLost(spaceId);
    }, [denied, selection, spaceId]);
    const data = !today.isError ? today.data : undefined;
    const status = data?.spaceStatus ?? space.currentSpace?.status;
    const confirmed =
        !details.isError && details.data?.space.id === spaceId
            ? details.data
            : null;
    const canAddIncome =
        confirmed?.space.status === 'ACTIVE' && status === 'ACTIVE';
    const canAddExpense =
        canAddIncome &&
        (confirmed?.space.type === 'PERSONAL' ||
            confirmed?.activeMemberCount === 2);
    if (denied) return null;
    return (
        <section className={styles.page} aria-labelledby="today-title">
            <header className={styles.header}>
                <div>
                    <h1 id="today-title">Hoje</h1>
                    {data ? (
                        <p className={styles.date}>
                            <time dateTime={data.referenceDate}>
                                {formatTodayReferenceDate(data.referenceDate)}
                            </time>
                        </p>
                    ) : (
                        <p className={styles.meta}>
                            Seus próximos passos, neste espaço.
                        </p>
                    )}
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button disabled={!canAddIncome} aria-label="Adicionar">
                            <Plus size={18} aria-hidden="true" />
                            Adicionar
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {canAddExpense && (
                            <DropdownMenuItem asChild>
                                <Link href={`/spaces/${spaceId}/expenses/new`}>
                                    <ArrowUpRight
                                        size={18}
                                        aria-hidden="true"
                                    />
                                    Adicionar despesa
                                </Link>
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem asChild>
                            <Link href={`/spaces/${spaceId}/incomes/new`}>
                                <ArrowDownLeft size={18} aria-hidden="true" />
                                Adicionar receita
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href={`/spaces/${spaceId}/finances/planning`}>
                                Planejar compromisso
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href={`/spaces/${spaceId}/routine/new`}>
                                <ListChecks size={18} aria-hidden="true" />{' '}
                                Adicionar tarefa
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href={`/spaces/${spaceId}/shopping?new=1`}>
                                <ShoppingBasket size={18} aria-hidden="true" />{' '}
                                Criar lista de compras
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>
            {status && status !== 'ACTIVE' && (
                <Alert>
                    <AlertTitle>
                        {status === 'CLOSED'
                            ? 'Espaço encerrado'
                            : 'Espaço em encerramento'}
                    </AlertTitle>
                    <AlertDescription>
                        {status === 'CLOSED'
                            ? 'O histórico continua disponível em somente leitura.'
                            : 'Consulte o plano, a data de corte e as pendências para continuar o encerramento.'}
                        {confirmed?.space.type === 'SHARED' && (
                            <Link
                                className={styles.textLink}
                                href={`/spaces/${spaceId}/closure`}
                            >
                                Consultar encerramento{' '}
                                <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        )}
                    </AlertDescription>
                </Alert>
            )}
            {confirmed?.space.type === 'SHARED' &&
                confirmed.space.status === 'ACTIVE' &&
                status === 'ACTIVE' &&
                confirmed.activeMemberCount === 1 && (
                    <Alert>
                        <AlertTitle>
                            Aguardando outra pessoa entrar no espaço.
                        </AlertTitle>
                        <AlertDescription>
                            Convide a outra pessoa para acompanhar os registros
                            deste espaço.
                            <Link
                                className={styles.textLink}
                                href={`/spaces/${spaceId}`}
                            >
                                Ver espaço e convite{' '}
                                <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        </AlertDescription>
                    </Alert>
                )}
            {details.isError && (
                <Alert>
                    <AlertTitle>
                        Não foi possível consultar o espaço.
                    </AlertTitle>
                    <AlertDescription>
                        Atualize o espaço para voltar a adicionar registros.
                        <Button
                            variant="outline"
                            onClick={() => void details.refetch()}
                            disabled={details.isFetching}
                        >
                            Tentar novamente o espaço
                        </Button>
                    </AlertDescription>
                </Alert>
            )}
            {today.isPending ? (
                <div
                    role="status"
                    aria-label="Carregando Hoje"
                    className={styles.loading}
                >
                    <span className="sr-only">Carregando Hoje…</span>
                    <Skeleton className="h-7 w-44" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="mt-6 h-7 w-52" />
                    <Skeleton className="h-24 w-full" />
                </div>
            ) : today.isError ? (
                <Alert>
                    <AlertTitle>Não foi possível carregar Hoje.</AlertTitle>
                    <AlertDescription>
                        Suas informações não foram alteradas. Tente carregar
                        novamente.
                        <Button
                            variant="outline"
                            onClick={() => void today.refetch()}
                            disabled={today.isFetching}
                        >
                            Tentar novamente
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : data ? (
                <div className={styles.sections}>
                    {data.blocks.map((block) => (
                        <TodaySection
                            key={block.kind}
                            block={block}
                            today={data}
                            personId={personId}
                            retry={() => void today.refetch()}
                            fetching={today.isFetching}
                        />
                    ))}
                </div>
            ) : null}
        </section>
    );
}
