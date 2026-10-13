'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import { getTransferOptions } from '@/lib/api/settlement-transfers';
import { financesQueryKeys } from '../cache/finances-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import { useTransferCommand } from '../hooks/use-transfer-command';
import type {
    TransferDirection,
    TransferObligation,
    TransferResult,
} from '../types/settlement-transfer';
import {
    businessToday,
    decimalUnits,
    formatDate,
    formatMoney,
} from '../utils/expense-money';
import { formatPositionMoney } from '../utils/position-money';
import styles from './expenses.module.css';

type Selected = { item: TransferObligation; amount: string };
type Search = {
    direction: TransferDirection;
    cycleId: string | null;
    cursor: string | null;
};
const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validCivilDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

export function TransferComposer({
    spaceId,
    cycleId,
}: {
    spaceId: string;
    cycleId?: string;
}) {
    const auth = useAuthenticatedContext({ enabled: false });
    const space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    if (space.currentSpace?.type !== 'SHARED')
        return (
            <section>
                <h1>Registrar transferência</h1>
                <p>
                    O acerto entre membros se aplica somente a espaços
                    compartilhados.
                </p>
                <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
            </section>
        );
    return (
        <Composer
            key={`${auth.data.person.id}:${spaceId}:${space.generation}:${cycleId ?? 'all'}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
            initialCycleId={cycleId && uuid.test(cycleId) ? cycleId : null}
        />
    );
}

function Composer({
    personId,
    spaceId,
    initialCycleId,
}: {
    personId: string;
    spaceId: string;
    initialCycleId: string | null;
}) {
    const router = useRouter();
    const client = useQueryClient();
    const context = useSpaceContextInstance();
    const space = useSpaceContext();
    const [search, setSearch] = useState<Search>({
        direction: 'PAYABLE',
        cycleId: initialCycleId,
        cursor: null,
    });
    const currentSearch = useRef<Search | null>(search);
    useLayoutEffect(() => {
        currentSearch.current = search;
        return () => {
            currentSearch.current = null;
        };
    }, [search]);
    const options = useExpenseQuery(
        personId,
        spaceId,
        financesQueryKeys.transferOptions(
            personId,
            spaceId,
            search.direction,
            search.cycleId,
            search.cursor,
        ),
        true,
        (signal) =>
            getTransferOptions(
                spaceId,
                search.direction,
                search.cycleId,
                search.cursor,
                signal,
            ),
        () => currentSearch.current === search,
    );
    const [selected, setSelected] = useState<Record<string, Selected>>({});
    const [payerChoice, setPayerChoice] = useState('');
    const [amount, setAmount] = useState('');
    const [factDate, setFactDate] = useState(businessToday);
    const [dirty, setDirty] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);
    const [result, setResult] = useState<TransferResult | null>(null);
    const form = useRef<HTMLFormElement>(null);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const value =
        !options.isFetching && !options.isError ? options.data : undefined;
    const members = options.data?.members ?? [];
    const actor = options.data?.actorMemberId;
    const other = members.find((member) => member.memberId !== actor)?.memberId;
    const payer =
        payerChoice || (search.direction === 'PAYABLE' ? actor : other);
    const recipient = members.find(
        (member) => member.memberId !== payer,
    )?.memberId;
    const eligibleItems =
        value?.items.filter(
            (item) =>
                item.debtorMemberId === payer &&
                item.creditorMemberId === recipient,
        ) ?? [];
    const memberName = (id: string) =>
        members.find((member) => member.memberId === id)?.displayName ??
        'Membro do espaço';
    const chosen = Object.values(selected);
    const transferCents = decimalUnits(amount);
    const parsed = chosen.map(({ item, amount: applied }) => ({
        item,
        cents: decimalUnits(applied),
    }));
    const distributed = parsed.reduce(
        (sum, entry) => sum + BigInt(entry.cents ?? 0),
        0n,
    );
    const remaining =
        transferCents === null ? null : BigInt(transferCents) - distributed;
    const invalidAllocation = parsed.find(
        ({ item, cents }) =>
            cents === null || cents <= 0 || cents > item.remainingAmountInCents,
    );
    const complete =
        !!value?.canRecord &&
        !!payer &&
        !!recipient &&
        members.some((member) => member.memberId === payer) &&
        members.some((member) => member.memberId === recipient) &&
        payer !== recipient &&
        transferCents !== null &&
        transferCents > 0 &&
        chosen.length > 0 &&
        !invalidAllocation &&
        remaining === 0n &&
        validCivilDate(factDate) &&
        factDate <= value.referenceDate;

    function selectSearch(next: Search) {
        currentSearch.current = next;
        setSearch(next);
    }
    function changeScope(next: Search) {
        setSelected({});
        setConflict(false);
        setLocalError(null);
        selectSearch(next);
    }
    function choosePayer(nextPayer: string) {
        mark();
        setPayerChoice(nextPayer);
        changeScope({
            direction: nextPayer === actor ? 'PAYABLE' : 'RECEIVABLE',
            cycleId: search.cycleId,
            cursor: null,
        });
    }
    function mark() {
        setDirty(true);
        setLocalError(null);
        setConflict(false);
    }
    async function refresh() {
        setSelected({});
        const prefix = [
            'finances',
            personId,
            spaceId,
            'settlement-transfer-options',
        ];
        if (search.cursor !== null) {
            selectSearch({ ...search, cursor: null });
            await client.invalidateQueries({
                queryKey: prefix,
                refetchType: 'none',
            });
            return;
        }
        await client.resetQueries({
            queryKey: prefix,
        });
    }
    function accessLost() {
        const capture = context.capture();
        if (!capture || capture.spaceId !== spaceId) return;
        const request = context.accessLost(spaceId);
        const generation = context.getSnapshot().generation;
        void request.then((success) => {
            if (
                success &&
                mounted.current &&
                context.getSnapshot().generation === generation
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
    }
    const command = useTransferCommand(
        (receipt) => {
            setResult(receipt);
            setDirty(false);
            setConflict(false);
        },
        async () => {
            setConflict(true);
            await refresh();
        },
        accessLost,
        () => {},
    );
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    useEffect(() => {
        if (
            options.error instanceof ApiError &&
            options.error.code === 'SPACE_NOT_FOUND'
        )
            accessLost();
    });
    useEffect(() => {
        const field = command.fields[0];
        if (!field) return;
        const input =
            document.querySelector<HTMLElement>(`[name="${field}"]`) ??
            form.current?.querySelector<HTMLElement>('[name="amountInCents"]');
        input?.focus();
    }, [command.fields]);

    function focus(name: string, message: string) {
        setLocalError(message);
        document.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
    }
    function save() {
        if (!value || busy || result) return;
        if (transferCents === null || transferCents <= 0) {
            focus(
                'amountInCents',
                'Informe um valor transferido positivo, com até duas casas decimais.',
            );
            return;
        }
        if (!validCivilDate(factDate) || factDate > value.referenceDate) {
            focus(
                'factDate',
                'Informe uma data válida de dinheiro já transferido, até hoje.',
            );
            return;
        }
        if (chosen.length === 0) {
            focus(
                'amountInCents',
                'Escolha ao menos uma pendência para aplicar o valor.',
            );
            return;
        }
        if (invalidAllocation) {
            focus(
                `allocation-${invalidAllocation.item.id}`,
                'Cada aplicação precisa ser positiva e não pode superar o valor em aberto.',
            );
            return;
        }
        if (remaining !== 0n) {
            focus(
                'amountInCents',
                'Distribua exatamente todo o valor transferido antes de confirmar.',
            );
            return;
        }
        if (!complete || !payer || !recipient) return;
        command.submit({
            expectedSpaceVersion: value.spaceVersion,
            payerMemberId: payer,
            recipientMemberId: recipient,
            amountInCents: transferCents,
            factDate,
            allocations: parsed.map(({ item, cents }) => ({
                obligationId: item.id,
                expectedObligationVersion: item.version,
                amountInCents: cents!,
            })),
        });
    }

    if (result)
        return (
            <section className={styles.stack}>
                <h1>Transferência registrada</h1>
                <p>{space.currentSpace?.label}</p>
                <p>
                    {memberName(result.transfer.payerMemberId)} transferiu{' '}
                    {formatMoney(result.transfer.amountInCents)} para{' '}
                    {memberName(result.transfer.recipientMemberId)} em{' '}
                    <time dateTime={result.transfer.factDate}>
                        {formatDate(result.transfer.factDate)}
                    </time>
                    .
                </p>
                <p>
                    Valor distribuído em {result.allocations.length}{' '}
                    pendência(s).
                </p>
                {result.replayed && <p>A tentativa original foi recuperada.</p>}
                <p>
                    O registro confirma dinheiro informado por vocês; o sistema
                    não executou a transferência.
                </p>
                <div className={styles.actions}>
                    <Link
                        href={`/spaces/${spaceId}/finances/settlements/transfers/${result.transfer.id}`}
                    >
                        Ver transferência e alocações
                    </Link>
                    <Link
                        href={`/spaces/${spaceId}/finances/settlements/transfers`}
                    >
                        Ver histórico
                    </Link>
                    <Link href={`/spaces/${spaceId}/finances`}>
                        Ver posição atual
                    </Link>
                </div>
            </section>
        );

    return (
        <section className={styles.stack}>
            <h1>Registrar transferência</h1>
            <p>
                Registre um valor já transferido entre membros e distribua todo
                o valor nas pendências escolhidas.
            </p>
            <p>
                Esta ação não faz um PIX e não compensa pendências recíprocas.
            </p>
            <div className={styles.actions}>
                <Link
                    href={`/spaces/${spaceId}/finances/settlements/transfers`}
                >
                    Histórico de transferências
                </Link>
                <Link
                    href={
                        initialCycleId
                            ? `/spaces/${spaceId}/finances/settlements/${initialCycleId}`
                            : `/spaces/${spaceId}/finances`
                    }
                >
                    Voltar
                </Link>
            </div>
            <div className={styles.columns}>
                <form
                    id="transfer-form"
                    ref={form}
                    className={styles.stack}
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        save();
                    }}
                >
                    <fieldset disabled={busy || !value?.canRecord}>
                        <legend>Transferência realizada</legend>
                        <label>
                            Quem transferiu
                            <select
                                name="payerMemberId"
                                value={payer ?? ''}
                                onChange={(event) =>
                                    choosePayer(event.target.value)
                                }
                            >
                                {members.map((member) => (
                                    <option
                                        key={member.memberId}
                                        value={member.memberId}
                                    >
                                        {member.displayName}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Quem recebeu
                            <select
                                name="recipientMemberId"
                                value={recipient ?? ''}
                                onChange={(event) => {
                                    const nextPayer = members.find(
                                        (member) =>
                                            member.memberId !==
                                            event.target.value,
                                    )?.memberId;
                                    if (nextPayer) choosePayer(nextPayer);
                                }}
                            >
                                {members.map((member) => (
                                    <option
                                        key={member.memberId}
                                        value={member.memberId}
                                    >
                                        {member.displayName}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {value && payer && recipient && (
                            <p>
                                Direção:{' '}
                                {payer === actor
                                    ? 'você transferiu'
                                    : 'o outro membro transferiu'}
                                .
                            </p>
                        )}
                        <label>
                            Valor transferido (R$)
                            <input
                                name="amountInCents"
                                inputMode="decimal"
                                value={amount}
                                onChange={(event) => {
                                    mark();
                                    setAmount(event.target.value);
                                }}
                            />
                        </label>
                        <label>
                            Data da transferência
                            <input
                                name="factDate"
                                type="date"
                                value={factDate}
                                max={value?.referenceDate ?? businessToday()}
                                onChange={(event) => {
                                    mark();
                                    setFactDate(event.target.value);
                                }}
                            />
                        </label>
                    </fieldset>
                    {search.cycleId && (
                        <p>
                            Mostrando pendências do acerto selecionado.{' '}
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                    changeScope({
                                        direction: search.direction,
                                        cycleId: null,
                                        cursor: null,
                                    })
                                }
                            >
                                Mostrar todos os acertos e avulsas
                            </button>
                        </p>
                    )}
                    {options.isPending || options.isFetching ? (
                        <p role="status" aria-busy="true">
                            Carregando pendências elegíveis…
                        </p>
                    ) : options.isError ? (
                        <div>
                            <p role="alert">
                                Não foi possível consultar as pendências
                                elegíveis.
                            </p>
                            <button
                                type="button"
                                onClick={() =>
                                    search.cursor
                                        ? selectSearch({
                                              ...search,
                                              cursor: null,
                                          })
                                        : void options.refetch()
                                }
                            >
                                Tentar novamente as pendências
                            </button>
                        </div>
                    ) : (
                        value && (
                            <>
                                {!value.canRecord && (
                                    <p role="status">
                                        Este espaço está somente para consulta.
                                        O histórico permanece disponível.
                                    </p>
                                )}
                                <p>
                                    Em aberto nesta direção:{' '}
                                    {formatPositionMoney(
                                        search.direction === 'PAYABLE'
                                            ? value.summary.payableAmountInCents
                                            : value.summary
                                                  .receivableAmountInCents,
                                    )}
                                    .
                                    {value.summary.net.direction ===
                                        'BALANCED' &&
                                        (value.summary.payableAmountInCents !==
                                            '0' ||
                                            value.summary
                                                .receivableAmountInCents !==
                                                '0') &&
                                        ' A posição líquida está zerada, mas ainda há pendências em ambas as direções.'}
                                </p>
                                <h2>Escolha onde aplicar</h2>
                                {eligibleItems.length === 0 ? (
                                    <p>
                                        Nenhuma pendência elegível nesta direção
                                        e neste recorte.
                                    </p>
                                ) : (
                                    <ul
                                        className={styles.stack}
                                        aria-label="Pendências elegíveis"
                                    >
                                        {eligibleItems.map((item) => (
                                            <li key={item.id}>
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            !!selected[item.id]
                                                        }
                                                        disabled={
                                                            !value.canRecord ||
                                                            busy
                                                        }
                                                        onChange={(event) => {
                                                            mark();
                                                            setSelected(
                                                                (old) => {
                                                                    const next =
                                                                        {
                                                                            ...old,
                                                                        };
                                                                    if (
                                                                        event
                                                                            .target
                                                                            .checked
                                                                    )
                                                                        next[
                                                                            item.id
                                                                        ] = {
                                                                            item,
                                                                            amount: '',
                                                                        };
                                                                    else
                                                                        delete next[
                                                                            item
                                                                                .id
                                                                        ];
                                                                    return next;
                                                                },
                                                            );
                                                        }}
                                                    />
                                                    {item.origin.description} ·
                                                    Em aberto:{' '}
                                                    {formatMoney(
                                                        item.remainingAmountInCents,
                                                    )}
                                                </label>
                                                <p>
                                                    {item.settlementCycle
                                                        ? `Acerto de ${formatDate(item.settlementCycle.targetDate)}`
                                                        : 'Sem acerto associado'}{' '}
                                                    · Data do fato:{' '}
                                                    {formatDate(item.factDate)}
                                                </p>
                                                <Link
                                                    href={`/spaces/${spaceId}/expenses/${item.origin.commitmentId}`}
                                                >
                                                    Ver origem
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {value.page.nextCursor ? (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                            selectSearch({
                                                ...search,
                                                cursor: value.page.nextCursor,
                                            })
                                        }
                                    >
                                        Próximas pendências
                                    </button>
                                ) : (
                                    <p role="status">
                                        Fim das pendências deste recorte.
                                    </p>
                                )}
                                <button
                                    type="button"
                                    disabled={busy || options.isFetching}
                                    onClick={() => void refresh()}
                                >
                                    Atualizar pendências / Voltar ao início
                                </button>
                            </>
                        )
                    )}
                    {conflict && (
                        <p role="alert">
                            As pendências mudaram. Confira os valores atuais e
                            faça uma nova confirmação.
                        </p>
                    )}
                    {localError && <p role="alert">{localError}</p>}
                    {command.error && <p role="alert">{command.error}</p>}
                    {command.canRetry ? (
                        <button
                            type="button"
                            disabled={command.isPending}
                            onClick={command.retry}
                        >
                            Reenviar a mesma tentativa
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={busy || !complete || !!result}
                        >
                            {command.isPending
                                ? 'Confirmando…'
                                : 'Confirmar transferência'}
                        </button>
                    )}
                </form>
                <aside
                    className={styles.summary}
                    aria-label="Prévia da distribuição"
                >
                    <h2>Prévia</h2>
                    <p>
                        Transferido:{' '}
                        {transferCents === null
                            ? 'Informe o valor'
                            : formatMoney(transferCents)}
                    </p>
                    <p>
                        Distribuído:{' '}
                        {formatPositionMoney(distributed.toString())}
                    </p>
                    <p>
                        {remaining === null
                            ? 'Falta distribuir: informe o valor'
                            : remaining < 0n
                              ? `Excesso: ${formatPositionMoney((-remaining).toString())}`
                              : `Falta distribuir: ${formatPositionMoney(remaining.toString())}`}
                    </p>
                    <h3>Pendências selecionadas</h3>
                    {chosen.length === 0 ? (
                        <p>Nenhuma selecionada.</p>
                    ) : (
                        <ul>
                            {chosen.map(({ item, amount: applied }) => (
                                <li key={item.id}>
                                    <label>
                                        Aplicar em {item.origin.description}{' '}
                                        (R$)
                                        <input
                                            form="transfer-form"
                                            name={`allocation-${item.id}`}
                                            inputMode="decimal"
                                            value={applied}
                                            disabled={busy}
                                            onChange={(event) => {
                                                mark();
                                                setSelected((old) => ({
                                                    ...old,
                                                    [item.id]: {
                                                        item,
                                                        amount: event.target
                                                            .value,
                                                    },
                                                }));
                                            }}
                                        />
                                    </label>
                                    <p>
                                        Em aberto:{' '}
                                        {formatMoney(
                                            item.remainingAmountInCents,
                                        )}
                                    </p>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                            mark();
                                            setSelected((old) => {
                                                const next = { ...old };
                                                delete next[item.id];
                                                return next;
                                            });
                                        }}
                                    >
                                        Remover {item.origin.description}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p>
                        A prévia não altera valores. A confirmação será validada
                        novamente.
                    </p>
                </aside>
            </div>
        </section>
    );
}
