'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';

import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CircleCheck } from 'lucide-react';

import { useSpaceCommand } from '../hooks/use-space-command';
import type { InvitationCommandResponse } from '../types/spaces-responses';
import { validateSpaceName } from '../utils/validate-space-name';
import { InvitationLink } from './invitation-link';
import { Button } from '@/components/ui/button';
import styles from './spaces.module.css';
import { useSpaceContext } from '../hooks/use-space-context';
import { useSpaceContextInstance } from '../context/space-context-provider';

export function CreateSharedSpacePage() {
    const router = useRouter();
    const auth = useAuthenticatedContext({ enabled: false });
    const context = useSpaceContext();
    const selection = useSpaceContextInstance();
    const nameInput = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [result, setResult] = useState<InvitationCommandResponse | null>(
        null,
    );

    const command = useSpaceCommand(auth.data?.person.id ?? null, setResult);
    useEffect(() => {
        let generation = selection.getSnapshot().generation;
        return selection.subscribe(() => {
            const next = selection.getSnapshot().generation;
            if (next === generation) return;
            generation = next;
            setResult(null);
        });
    }, [selection]);
    const contextBusy = context.phase !== 'ready';

    function submit(event: SubmitEvent<HTMLFormElement>): void {
        event.preventDefault();

        const validation = validateSpaceName(name);
        setFieldError(validation);

        if (validation) {
            nameInput.current?.focus();
            return;
        }

        command.submit({
            operation: 'create',
            name: name.trim(),
        });
    }

    if (!auth.data) {
        return null;
    }

    if (result) {
        return (
            <section className={styles.stack}>
                <p className={styles.success} role="status">
                    <CircleCheck size={18} aria-hidden="true" />
                    Espaço criado
                </p>
                <h1 className={styles.title}>{result.space.label}</h1>

                {result.linkAvailable ? (
                    <InvitationLink
                        key={result.invitation.id}
                        inviteUrl={result.inviteUrl}
                        expiresAt={result.invitation.expiresAt}
                    />
                ) : (
                    <p role="status">
                        A criação já foi concluída. O link original não pode ser
                        exibido novamente. Abra o espaço para consultar o
                        convite e, se necessário, gerar outro link.
                    </p>
                )}

                <Button asChild variant="outline" className={styles.secondary}>
                    <Link href={`/spaces/${result.space.id}`}>
                        Abrir espaço
                    </Link>
                </Button>
            </section>
        );
    }

    return (
        <section className={`${styles.stack} ${styles.formColumn}`}>
            <h1 className={styles.title}>Criar espaço compartilhado</h1>

            <p className={styles.muted}>
                Organize registros com outra pessoa, separados do seu espaço
                pessoal. Ao criar, você receberá um link de convite.
            </p>

            <form
                noValidate
                className={styles.stack}
                aria-busy={command.isPending}
                onSubmit={submit}
            >
                <div className={styles.field}>
                    <Label htmlFor="space-name">Nome do espaço</Label>

                    <Input
                        ref={nameInput}
                        id="space-name"
                        name="name"
                        type="text"
                        required
                        value={name}
                        disabled={command.isPending || command.canRetry}
                        aria-invalid={fieldError !== null}
                        aria-describedby={
                            fieldError
                                ? 'space-name-help space-name-error'
                                : 'space-name-help'
                        }
                        className={styles.input}
                        onChange={(event) => {
                            setName(event.target.value);
                            setFieldError(null);
                        }}
                    />

                    <p id="space-name-help" className={styles.muted}>
                        Use um nome de até 80 caracteres para identificar o
                        espaço.
                    </p>

                    {fieldError && (
                        <p
                            id="space-name-error"
                            role="alert"
                            className={styles.error}
                        >
                            {fieldError}
                        </p>
                    )}
                </div>

                {command.error && (
                    <p role="alert" className={styles.error}>
                        {command.error}
                    </p>
                )}

                <div className={styles.actions}>
                    <Button
                        type="button"
                        variant="outline"
                        className={styles.secondary}
                        disabled={command.isPending}
                        onClick={() => router.push('/spaces')}
                    >
                        Cancelar
                    </Button>

                    {command.canRetry ? (
                        <Button
                            type="button"
                            className={styles.button}
                            disabled={command.isPending || contextBusy}
                            onClick={command.retry}
                        >
                            Tentar novamente
                        </Button>
                    ) : (
                        <Button
                            type="submit"
                            className={styles.button}
                            disabled={command.isPending || contextBusy}
                        >
                            {command.isPending ? 'Criando...' : 'Criar espaço'}
                        </Button>
                    )}
                </div>
            </form>
        </section>
    );
}
