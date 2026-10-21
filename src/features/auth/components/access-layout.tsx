import type { ReactNode } from 'react';
import { Brand } from '@/components/patterns/brand';
import { AppearanceSettings } from '@/components/patterns/appearance';
import styles from './auth-form.module.css';

export function AccessLayout({
    title,
    titleId,
    description,
    children,
}: {
    title: string;
    titleId: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <main className={styles.page}>
            <header className={styles.pageHeader}>
                <Brand className={styles.brand} />
                <AppearanceSettings />
            </header>
            <div className={styles.layout}>
                <aside className={styles.introduction}>
                    <p className={styles.eyebrow}>Seu dia a dia, conectado.</p>
                    <h2>
                        Tudo no
                        <br />
                        seu lugar.
                    </h2>
                    <p>
                        Finanças, rotina e compras. Com espaço para o que é seu
                        e para o que vocês compartilham.
                    </p>
                    <div className={styles.signature} aria-hidden="true">
                        <span>Seu.</span>
                        <span>Nosso.</span>
                        <span>Junelo.</span>
                    </div>
                </aside>
                <section className={styles.card} aria-labelledby={titleId}>
                    <header className={styles.formHeading}>
                        <h1 id={titleId} className={styles.title}>
                            {title}
                        </h1>
                        <p className={styles.description}>{description}</p>
                    </header>
                    {children}
                </section>
            </div>
        </main>
    );
}
