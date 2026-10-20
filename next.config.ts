import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    distDir: process.env.NEXT_DIST_DIR ?? '.next',

    async rewrites() {
        const apiUrl = process.env.API_INTERNAL_URL?.replace(/\/+$/, '');

        if (!apiUrl) {
            return [];
        }

        return [
            {
                source: '/api/:path*',
                destination: `${apiUrl}/:path*`,
            },
        ];
    },

    async headers() {
        return [
            {
                source: '/:path*',
                headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
            },
        ];
    },
};

export default nextConfig;
