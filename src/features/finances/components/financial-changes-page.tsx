'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { getFinancialContext } from '@/lib/api/shared-expense';
import {
    decideFinancialProposal,
    getChangeProposals,
} from '@/lib/api/financial-integrity';
import type { ChangeProposal } from '../types/financial-integrity';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useFinancialCommand } from '../hooks/use-financial-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import { formatDate } from '../utils/expense-money';
import { FinancialImpact } from './financial-impact';
import styles from './expenses.module.css';

const statusLabels = {
    PROPOSED: 'Aguardando aprovação',
    ACCEPTED: 'Aceita',
    REJECTED: 'Rejeitada',
    CANCELLED: 'Cancelada',
};
export function FinancialChangesPage({ spaceId }: { spaceId: string }) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    if (space.currentSpace?.type !== 'SHARED')
        return (
            <section className={styles.stack}>
                <h1>Alterações financeiras</h1>
                <p>
                    Propostas com aceite são usadas em espaços compartilhados.
                </p>
                <Link href={`/spaces/${spaceId}/finances`}>
                    Voltar às Finanças
                </Link>
            </section>
        );
    return (
        <Changes
            key={`${auth.data.person.id}:${spaceId}:${space.generation}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
        />
    );
}
function Changes({ personId, spaceId }: { personId: string; spaceId: string }) {
    const [cursor, setCursor] = useState<string | null>(null),
        [selection, setSelection] = useState<{
            proposal: ChangeProposal;
            acceptance: boolean;
        } | null>(null),
        [notice, setNotice] = useState<string | null>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const context = useExpenseQuery(
        personId,
        spaceId,
        ['finances', personId, spaceId, 'proposal-context'],
        true,
        (signal) => getFinancialContext(spaceId, signal),
    );
    const list = useExpenseQuery(
        personId,
        spaceId,
        ['finances', personId, spaceId, 'change-proposals', cursor],
        true,
        (signal) => getChangeProposals(spaceId, cursor, signal),
    );
    const command = useFinancialCommand({
        execute: decideFinancialProposal,
        onSuccess(result) {
            setSelection(null);
            setNotice(
                result.proposal.status === 'ACCEPTED'
                    ? 'Proposta aceita. A alteração respeitará a vigência informada.'
                    : 'Proposta rejeitada. A condição anterior foi mantida.',
            );
            void list.refetch();
            void context.refetch();
        },
    });
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(false, busy, () => undefined);
    useEffect(() => {
        if (notice) heading.current?.focus();
    }, [notice]);
    const ctx =
        !context.isFetching && !context.isError ? context.data : undefined;
    const value = !list.isFetching && !list.isError ? list.data : undefined;
    return (
        <section className={styles.stack}>
            <header className={styles.heading}>
                <h1 ref={heading} tabIndex={-1}>
                    Alterações financeiras
                </h1>
                <p className={styles.help}>
                    Confira o efeito de cada proposta. Somente a pessoa que
                    receberá o aumento de responsabilidade pode aceitar ou
                    rejeitar.
                </p>
            </header>
            <div className={styles.actions}>
                <Button variant="outline" asChild>
                    <Link href={`/spaces/${spaceId}/finances`}>
                        Voltar às Finanças
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    disabled={busy || list.isFetching}
                    onClick={() => {
                        setSelection(null);
                        void list.refetch();
                        void context.refetch();
                    }}
                >
                    Atualizar propostas
                </Button>
            </div>
            {notice && (
                <p role="status" className={styles.success}>
                    {notice}
                </p>
            )}
            {(list.isPending || list.isFetching || context.isPending) && (
                <p role="status">Consultando propostas…</p>
            )}
            {(list.isError || context.isError) && (
                <p role="alert">
                    Não foi possível consultar as propostas e suas permissões.
                    Tente atualizar.
                </p>
            )}
            {value?.items.length === 0 && (
                <div className={styles.receipt}>
                    <h2>Nenhuma proposta nesta página</h2>
                    <p>
                        Alterações que dependem de aceite aparecerão aqui com
                        seu impacto.
                    </p>
                </div>
            )}
            {value &&
                ctx &&
                value.items.map((proposal) => (
                    <article key={proposal.id} className={styles.fields}>
                        <div className={styles.heading}>
                            <h2>
                                {proposal.configuration.description ??
                                    'Ajuste de compromisso'}
                            </h2>
                            <p className={styles.status}>
                                {statusLabels[proposal.status]}
                            </p>
                            <p>
                                Vigência:{' '}
                                <time dateTime={proposal.effectiveFrom}>
                                    {formatDate(proposal.effectiveFrom)}
                                </time>
                            </p>
                            <p>
                                Proposta de{' '}
                                {ctx.members.find(
                                    (m) =>
                                        m.memberId ===
                                        proposal.proposedByMemberId,
                                )?.displayName ?? 'participante'}{' '}
                                para{' '}
                                {ctx.members.find(
                                    (m) =>
                                        m.memberId ===
                                        proposal.recipientMemberId,
                                )?.displayName ?? 'participante'}
                                .
                            </p>
                            {proposal.configuration.reason && (
                                <p>Motivo: {proposal.configuration.reason}</p>
                            )}
                        </div>
                        <FinancialImpact
                            value={proposal.impact}
                            members={ctx.members}
                            pendingApproval={proposal.status === 'PROPOSED'}
                        />
                        <Link
                            href={`/spaces/${spaceId}/finances/commitments/${proposal.commitmentId}`}
                        >
                            Consultar origem e histórico
                        </Link>
                        {proposal.status === 'PROPOSED' &&
                            proposal.recipientMemberId ===
                                ctx.actorMemberId && (
                                <div className={styles.actions}>
                                    <Button
                                        disabled={busy}
                                        onClick={() => {
                                            setNotice(null);
                                            setSelection({
                                                proposal,
                                                acceptance: true,
                                            });
                                        }}
                                    >
                                        Revisar aceite
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => {
                                            setNotice(null);
                                            setSelection({
                                                proposal,
                                                acceptance: false,
                                            });
                                        }}
                                    >
                                        Revisar rejeição
                                    </Button>
                                </div>
                            )}
                        {selection?.proposal.id === proposal.id && (
                            <div
                                className={styles.confirmation}
                                role="group"
                                aria-label="Confirmar decisão da proposta"
                            >
                                <h3>
                                    {selection.acceptance
                                        ? 'Aceitar esta alteração?'
                                        : 'Rejeitar esta alteração?'}
                                </h3>
                                <p>
                                    {selection.acceptance
                                        ? `A nova condição será aplicada conforme a vigência de ${formatDate(proposal.effectiveFrom)}. Os fatos anteriores continuam preservados.`
                                        : 'A condição anterior será mantida e a rejeição ficará no histórico.'}
                                </p>
                                <div className={styles.actions}>
                                    <Button
                                        disabled={busy}
                                        onClick={() =>
                                            command.submit({
                                                commitmentId:
                                                    proposal.commitmentId,
                                                proposalId: proposal.id,
                                                acceptance:
                                                    selection.acceptance,
                                                expectedCommitmentVersion:
                                                    proposal.baseVersion,
                                                expectedProposalVersion:
                                                    proposal.version,
                                                expectedSpaceVersion:
                                                    ctx.version,
                                            })
                                        }
                                    >
                                        Confirmar{' '}
                                        {selection.acceptance
                                            ? 'aceite'
                                            : 'rejeição'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => setSelection(null)}
                                    >
                                        Voltar
                                    </Button>
                                </div>
                            </div>
                        )}
                    </article>
                ))}
            {command.error && <p role="alert">{command.error}</p>}
            {command.isPending && <p role="status">Registrando decisão…</p>}
            {command.canRetry && (
                <Button variant="outline" onClick={command.retry}>
                    Reenviar a mesma tentativa
                </Button>
            )}
            <div className={styles.actions}>
                {value?.nextCursor && (
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                            setSelection(null);
                            setCursor(value.nextCursor);
                        }}
                    >
                        Próxima página de propostas
                    </Button>
                )}
                {cursor && (
                    <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                            setSelection(null);
                            setCursor(null);
                        }}
                    >
                        Voltar ao início
                    </Button>
                )}
            </div>
        </section>
    );
}
