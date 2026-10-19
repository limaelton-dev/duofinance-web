'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/api-error';

export function useAuthRetry() {
    const [retryAt, setRetryAt] = useState(0);
    const [now, setNow] = useState(0);

    useEffect(() => {
        if (!retryAt) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [retryAt]);

    function respectRetryAfter(error: unknown) {
        if (
            error instanceof ApiError &&
            error.status === 429 &&
            error.retryAfterSeconds
        ) {
            const timestamp = Date.now();
            setNow(timestamp);
            setRetryAt(timestamp + error.retryAfterSeconds * 1000);
        }
    }

    return {
        retrySeconds: Math.max(0, Math.ceil((retryAt - now) / 1000)),
        respectRetryAfter,
    };
}
