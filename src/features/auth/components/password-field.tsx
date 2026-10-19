'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import styles from './auth-form.module.css';

type PasswordFieldProps = {
    id: string;
    label?: string;
    autoComplete: 'current-password' | 'new-password';
    error?: string;
    hint?: string;
};

export function PasswordField({
    id,
    label = 'Senha',
    autoComplete,
    error,
    hint,
}: PasswordFieldProps) {
    const [visible, setVisible] = useState(false);
    const description =
        [hint && `${id}-help`, error && `${id}-error`]
            .filter(Boolean)
            .join(' ') || undefined;

    return (
        <div className={styles.field}>
            <Label htmlFor={id}>{label}</Label>
            <div className={styles.password}>
                <Input
                    id={id}
                    name={id}
                    type={visible ? 'text' : 'password'}
                    autoComplete={autoComplete}
                    aria-invalid={Boolean(error)}
                    aria-describedby={description}
                    required
                />
                <Button
                    type="button"
                    variant="ghost"
                    className={styles.reveal}
                    aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
                    aria-pressed={visible}
                    onClick={() => setVisible((value) => !value)}
                >
                    {visible ? (
                        <EyeOff aria-hidden="true" size={18} />
                    ) : (
                        <Eye aria-hidden="true" size={18} />
                    )}
                </Button>
            </div>
            {hint && (
                <p id={`${id}-help`} className={styles.hint}>
                    {hint}
                </p>
            )}
            {error && (
                <p id={`${id}-error`} className={styles.error}>
                    {error}
                </p>
            )}
        </div>
    );
}
