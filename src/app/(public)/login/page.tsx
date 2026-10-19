import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/features/auth/components/login-form';
import styles from '@/features/auth/components/auth-form.module.css';
import { Brand } from '@/components/patterns/brand';

export const metadata: Metadata = {
    title: 'Entrar',
};

export default function LoginPage() {
    return (
        <main className={styles.page}>
            <section className={styles.card} aria-labelledby="login-title">
                <Brand className={styles.brand} />
                <h1 id="login-title" className={styles.title}>
                    Entre na sua conta
                </h1>

                <LoginForm />

                <p className={styles.footer}>
                    Ainda não tem conta?{' '}
                    <Link href="/register" className={styles.link}>
                        Criar conta
                    </Link>
                </p>
            </section>
        </main>
    );
}
