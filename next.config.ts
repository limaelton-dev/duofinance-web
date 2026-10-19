import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    distDir: process.env.NEXT_DIST_DIR ?? '.next',
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
