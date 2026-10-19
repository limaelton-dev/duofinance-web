import { Skeleton } from '@/components/ui/skeleton';

export function FinancialLoading({ label }: { label: string }) {
    return (
        <div className="grid gap-3" role="status" aria-busy="true">
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="grid gap-3" aria-hidden="true">
                <Skeleton className="h-14 w-full max-w-2xl" />
                <Skeleton className="h-14 w-3/4 max-w-xl" />
            </div>
        </div>
    );
}
