import type { Metadata } from 'next';
import Link from 'next/link';

import { RegisterForm } from '@/features/auth/components/register-form';
import styles from '@/features/auth/components/auth-form.module.css';
import { AccessLayout } from '@/features/auth/components/access-layout';

export const metadata: Metadata = {
    title: 'Criar conta',
};

export default function RegisterPage() {
    return (
        <AccessLayout
            title="Criar conta"
            titleId="register-title"
            description="Seu espaço pessoal começa aqui."
        >
            <RegisterForm />

            <p className={styles.footer}>
                Já tem uma conta?{' '}
                <Link href="/login" className={styles.link} prefetch={false}>
                    Entrar
                </Link>
            </p>
        </AccessLayout>
    );
}
