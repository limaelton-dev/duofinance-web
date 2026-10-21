import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/features/auth/components/login-form';
import styles from '@/features/auth/components/auth-form.module.css';
import { AccessLayout } from '@/features/auth/components/access-layout';

export const metadata: Metadata = {
    title: 'Entrar',
};

export default function LoginPage() {
    return (
        <AccessLayout
            title="Entre na sua conta"
            titleId="login-title"
            description="Seu dia a dia espera por você."
        >
            <LoginForm />

            <p className={styles.footer}>
                Ainda não tem conta?{' '}
                <Link href="/register" className={styles.link}>
                    Criar conta
                </Link>
            </p>
        </AccessLayout>
    );
}
