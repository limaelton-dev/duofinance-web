'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    configureSpecificRule,
    getRuleCommitment,
} from '@/lib/api/settlement-depth';
import { getFinancialContext } from '@/lib/api/shared-expense';
import { useFinancialCommand } from '../hooks/use-financial-command';
import type {
    SpecificRuleInput,
    SpecificRuleResult,
} from '../types/settlement-depth';
import { formatDate } from '../utils/expense-money';
import {
    CommandFeedback,
    QueryFeedback,
    SettlementAccess,
    SettlementNav,
    useSettlementQuery,
} from './settlement-depth-shared';
import styles from './finances-summary.module.css';
import formStyles from './settlement-depth.module.css';

export function SettlementSpecificRulePage({
    spaceId,
    commitmentId,
}: {
    spaceId: string;
    commitmentId: string;
}) {
    return (
        <SettlementAccess spaceId={spaceId}>
            {(personId) => (
                <RuleRead
                    key={commitmentId}
                    personId={personId}
                    spaceId={spaceId}
                    commitmentId={commitmentId}
                />
            )}
        </SettlementAccess>
    );
}
function RuleRead({
    personId,
    spaceId,
    commitmentId,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
}) {
    const [day, setDay] = useState(''),
        [confirmed, setConfirmed] = useState(false),
        [result, setResult] = useState<SpecificRuleResult | null>(null);
    const query = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-specific-rule', commitmentId],
        (signal) => getRuleCommitment(spaceId, commitmentId, signal),
    );
    const context = useSettlementQuery(
        personId,
        spaceId,
        ['financial-entry-context'],
        (signal) => getFinancialContext(spaceId, signal),
    );
    const command = useFinancialCommand<SpecificRuleInput, SpecificRuleResult>({
        execute: (id, input, token, key, signal) =>
            configureSpecificRule(id, commitmentId, input, token, key, signal),
        onSuccess: setResult,
    });
    const data = !query.isFetching && !query.isError ? query.data : undefined,
        ctx =
            !context.isFetching && !context.isError ? context.data : undefined;
    const busy = command.isPending || command.canRetry;
    return (
        <section className={styles.stack}>
            <div className={styles.intro}>
                <h1>Regra específica de acerto</h1>
                <p>
                    Defina um dia de acerto para este compromisso. A data
                    econômica e o histórico dos fatos permanecem preservados.
                </p>
            </div>
            <SettlementNav spaceId={spaceId} />
            {result ? (
                <div className={formStyles.receipt} role="status">
                    <h2>Regra específica salva</h2>
                    <p>
                        Dia {result.settlementRule.rule?.dayOfMonth} de cada
                        mês.
                        {result.settlementRule.suggestedTargetDate
                            ? ` Próxima data sugerida: ${formatDate(result.settlementRule.suggestedTargetDate)}.`
                            : ''}
                    </p>
                    <p>
                        Pendências existentes mantêm seu acerto. Use a mudança
                        de ciclo para mover o restante em aberto quando
                        necessário.
                    </p>
                    <Link href={`/spaces/${spaceId}/finances`}>
                        Conferir Finanças
                    </Link>
                </div>
            ) : (
                <>
                    <QueryFeedback query={query} label="compromisso" />
                    <QueryFeedback query={context} label="contexto do espaço" />
                    {data && ctx && (
                        <>
                            <h2>{data.commitment.description}</h2>
                            <p>
                                Data econômica:{' '}
                                {formatDate(data.commitment.factDate)}.
                            </p>
                            <p>
                                Regra atual:{' '}
                                {data.settlementRule?.source === 'SPECIFIC'
                                    ? 'específica deste compromisso'
                                    : 'herdada do espaço'}
                                {data.settlementRule?.rule
                                    ? ` · dia ${data.settlementRule.rule.dayOfMonth}`
                                    : ''}
                                .
                            </p>
                            {ctx.status === 'CLOSED' ? (
                                <p>
                                    Este espaço foi encerrado. A regra permanece
                                    disponível para consulta.
                                </p>
                            ) : (
                                <form
                                    className={formStyles.form}
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (busy || !confirmed) return;
                                        command.submit({
                                            rule: {
                                                kind: 'MONTHLY_DAY',
                                                dayOfMonth: Number(day),
                                            },
                                            expectedCommitmentVersion:
                                                data.commitment.version,
                                            expectedSpaceVersion: ctx.version,
                                        });
                                    }}
                                >
                                    <fieldset disabled={busy}>
                                        <label
                                            className={formStyles.field}
                                            htmlFor="specific-rule-day"
                                        >
                                            Dia do mês
                                            <Input
                                                id="specific-rule-day"
                                                type="number"
                                                min={1}
                                                max={31}
                                                required
                                                value={day}
                                                onChange={(e) => {
                                                    setDay(e.target.value);
                                                    setConfirmed(false);
                                                }}
                                            />
                                        </label>
                                        <p className={styles.help}>
                                            Em meses sem esse dia, a regra usa o
                                            último dia do mês. A regra
                                            específica substitui a regra padrão
                                            somente neste compromisso.
                                        </p>
                                        <label className={formStyles.check}>
                                            <input
                                                type="checkbox"
                                                checked={confirmed}
                                                required
                                                onChange={(e) =>
                                                    setConfirmed(
                                                        e.target.checked,
                                                    )
                                                }
                                            />
                                            Conferi a regra específica para este
                                            compromisso.
                                        </label>
                                        <Button
                                            type="submit"
                                            disabled={!confirmed}
                                        >
                                            Salvar regra específica
                                        </Button>
                                    </fieldset>
                                    <CommandFeedback command={command} />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => {
                                            setConfirmed(false);
                                            void query.refetch();
                                            void context.refetch();
                                        }}
                                    >
                                        Atualizar dados
                                    </Button>
                                </form>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
}
