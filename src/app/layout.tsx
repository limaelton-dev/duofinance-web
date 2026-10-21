import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { QueryProvider } from '@/providers/query-provider';
import { InvitationFlowProvider } from '@/features/spaces/context/invitation-flow-provider';

import { AppearanceProvider } from '@/components/patterns/appearance';
import './globals.css';

export const metadata: Metadata = {
    title: {
        default: 'Junelo',
        template: '%s | Junelo',
    },
    description: 'Seu espaço de organização financeira.',
    referrer: 'no-referrer',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    colorScheme: 'light dark',
};

type RootLayoutProps = Readonly<{
    children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <html lang="pt-BR">
            <body>
                <QueryProvider>
                    <AppearanceProvider>
                        <InvitationFlowProvider>
                            {children}
                        </InvitationFlowProvider>
                    </AppearanceProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
