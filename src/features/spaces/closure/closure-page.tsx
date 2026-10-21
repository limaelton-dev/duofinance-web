'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { getSpaceDetails } from '@/lib/api/get-space-details';
import { getFinancialContext } from '@/lib/api/shared-expense';
import { executeClosure, getClosureDiagnostic } from '@/lib/api/space-closure';
import {
    SpaceBoundary,
    QueryFeedback,
    CommandFeedback,
} from '../components/space-operation-shared';
import { useSpaceOperation } from '../hooks/use-space-operation';
import { useSpaceQuery } from '../hooks/use-space-query';
import { ClosureDestinations } from './closure-destinations';
import {
    BlockerList,
    closureKey,
    InformationalEffects,
    OutstandingAmounts,
    panelClass,
    sectionClass,
} from './closure-shared';
import type { ClosureView, ClosureWork } from './types';
import { StartClosure, CutoffDate } from './closure-setup';
import { ClosurePlan } from './closure-plan';
import { ClosureFinances, ClosureReadOnlyEffects } from './closure-finances';
import { ClosureConclusion } from './closure-conclusion';
import { ClosureHistorySection } from './closure-history';

export function ClosurePage({ spaceId }: { spaceId: string }) {
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <ClosureContent personId={personId} spaceId={spaceId} />
            )}
        </SpaceBoundary>
    );
}

function ClosureContent({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const client = useQueryClient();
    const [message, setMessage] = useState<string | null>(null);
    const query = useSpaceQuery(
        personId,
        spaceId,
        closureKey(personId, spaceId, 'overview'),
        true,
        async (signal) => {
            const details = await getSpaceDetails(spaceId, signal);
            if (details.space.id !== spaceId)
                throw new Error('O espaço foi alterado.');
            const financialContext =
                details.space.type === 'SHARED'
                    ? await getFinancialContext(spaceId, signal)
                    : null;
            if (financialContext && financialContext.spaceId !== spaceId)
                throw new Error('O espaço foi alterado.');
            const diagnostic =
                details.space.type === 'SHARED'
                    ? await getClosureDiagnostic(spaceId, signal)
                    : null;
            if (
                diagnostic?.closure &&
                (diagnostic.closure.spaceVersion !== details.space.version ||
                    diagnostic.closure.spaceStatus !== details.space.status)
            )
                throw new Error(
                    'O estado do espaço mudou. Atualize o diagnóstico.',
                );
            return {
                spaceId,
                details,
                members: financialContext?.members ?? [],
                diagnostic,
            };
        },
    );
    const command = useSpaceOperation<ClosureWork, ClosureView>({
        execute: executeClosure,
        onSuccess: (value) =>
            setMessage(
                value.spaceStatus === 'CLOSED'
                    ? 'Espaço encerrado. O histórico permanece disponível para consulta.'
                    : value.processStatus === 'CANCELLED'
                      ? 'Encerramento cancelado. Os efeitos já registrados foram preservados.'
                      : 'Decisão registrada. Confira o estado atualizado abaixo.',
            ),
        onConflict: () => {
            setMessage(null);
            void client.invalidateQueries({
                queryKey: closureKey(personId, spaceId),
            });
        },
    });
    const busy =
        command.isPending ||
        command.canRetry ||
        query.isFetching ||
        query.isError;
    const actions = {
        busy,
        submit: (work: ClosureWork) => {
            setMessage(null);
            command.submit(work);
        },
    };
    const data = query.data;
    const closure = data?.diagnostic?.closure;
    const open =
        closure?.spaceStatus === 'CLOSING' && closure.processStatus === 'OPEN';
    const closed = data?.details.space.status === 'CLOSED';
    return (
        <section className="mx-auto min-w-0 max-w-[52rem] space-y-8 pb-4 wrap-anywhere [&_button]:max-w-full">
            <header className="space-y-4">
                <Link
                    className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"
                    href={`/spaces/${spaceId}`}
                >
                    <ArrowLeft aria-hidden="true" size={16} />
                    Voltar ao espaço
                </Link>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                        <h1 className="text-3xl leading-tight font-bold tracking-[-0.035em]">
                            {closed
                                ? 'Histórico do encerramento'
                                : 'Encerramento do espaço'}
                        </h1>
                        {data && (
                            <p className="break-words text-muted-foreground">
                                {data.details.space.label}
                                {open
                                    ? ' · Em encerramento'
                                    : closed
                                      ? ' · Encerrado'
                                      : ''}
                            </p>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        disabled={
                            command.isPending ||
                            command.canRetry ||
                            query.isFetching
                        }
                        onClick={() => {
                            setMessage(null);
                            void client.invalidateQueries({
                                queryKey: closureKey(personId, spaceId),
                            });
                        }}
                    >
                        <RefreshCw size={16} aria-hidden="true" />
                        Atualizar
                    </Button>
                </div>
                <p className="max-w-[70ch] text-sm text-muted-foreground">
                    Confira pendências, defina o destino dos compromissos e
                    registre os consentimentos necessários. O histórico
                    permanece no espaço original.
                </p>
            </header>
            <QueryFeedback query={query} />
            <CommandFeedback command={command} />
            {message && (
                <p
                    role="status"
                    className="rounded-sm border border-success bg-success-surface p-4 text-success"
                >
                    {message}
                </p>
            )}
            {!data && !query.isError && (
                <p role="status">Carregando diagnóstico do espaço…</p>
            )}
            {data?.details.space.type === 'PERSONAL' && (
                <p>
                    O encerramento se aplica a espaços compartilhados. Seu
                    espaço pessoal continua disponível.
                </p>
            )}
            {data?.diagnostic && (
                <>
                    {closed ? (
                        <p className={panelClass}>
                            Este espaço está encerrado e disponível somente para
                            leitura dos participantes históricos. Ele não será
                            reaberto nem reutilizado com outra pessoa.
                        </p>
                    ) : (
                        <nav
                            aria-label="Etapas do encerramento"
                            className="flex flex-wrap gap-x-5 gap-y-1 text-sm"
                        >
                            {[
                                ['diagnostic', 'Diagnóstico'],
                                ...(open
                                    ? [
                                          ['destinations', 'Destinos'],
                                          ['plan', 'Plano'],
                                          ['finances', 'Resolver finanças'],
                                          ['conclusion', 'Concluir'],
                                      ]
                                    : []),
                                ['history', 'Histórico'],
                            ].map(([id, name]) => (
                                <a
                                    key={id}
                                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                                    href={`#${id}`}
                                >
                                    {name}
                                </a>
                            ))}
                        </nav>
                    )}
                    {!closed && (
                        <section
                            id="diagnostic"
                            className={sectionClass}
                            aria-labelledby="diagnostic-title"
                        >
                            <h2
                                id="diagnostic-title"
                                className="text-xl font-semibold tracking-tight"
                            >
                                Diagnóstico completo
                            </h2>
                            <p>
                                {data.diagnostic.finance.totalCount === 0
                                    ? 'Nenhum bloqueador financeiro foi encontrado nesta consulta.'
                                    : `${data.diagnostic.finance.totalCount} bloqueador(es) financeiro(s) para resolver. Todas as páginas da consulta foram carregadas.`}
                            </p>
                            <OutstandingAmounts
                                finance={data.diagnostic.finance}
                                members={closure?.participants ?? data.members}
                            />
                            <BlockerList
                                spaceId={spaceId}
                                blockers={data.diagnostic.finance.blockers}
                            />
                            <details>
                                <summary className="cursor-pointer py-3 font-semibold">
                                    Efeito na rotina e nas compras
                                </summary>
                                <InformationalEffects
                                    value={data.diagnostic.informational}
                                    spaceId={spaceId}
                                />
                            </details>
                        </section>
                    )}
                    {data.details.space.status === 'ACTIVE' && (
                        <StartClosure
                            key={data.details.space.version}
                            version={data.details.space.version}
                            solo={data.details.activeMemberCount === 1}
                            actions={actions}
                        />
                    )}
                    {open && closure && (
                        <div
                            key={`${closure.processId}:${closure.spaceVersion}:${closure.planRevision}`}
                            className="space-y-8"
                        >
                            <CutoffDate closure={closure} actions={actions} />
                            <ClosureDestinations
                                closure={closure}
                                blockers={data.diagnostic.finance.blockers}
                                actions={actions}
                            />
                            <ClosurePlan
                                personId={personId}
                                closure={closure}
                                actions={actions}
                            />
                            <ClosureFinances
                                personId={personId}
                                closure={closure}
                                actions={actions}
                                blockers={data.diagnostic.finance.blockers}
                            />
                            <ClosureConclusion
                                personId={personId}
                                closure={closure}
                                actions={actions}
                            />
                        </div>
                    )}
                    {closed && closure && (
                        <ClosureReadOnlyEffects
                            personId={personId}
                            closure={closure}
                        />
                    )}
                    {closure && (
                        <ClosureHistorySection
                            personId={personId}
                            spaceId={spaceId}
                            closed={closed}
                        />
                    )}
                </>
            )}
        </section>
    );
}
