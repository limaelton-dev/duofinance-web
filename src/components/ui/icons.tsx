import type { ComponentProps, ReactNode } from 'react';

type IconProps = ComponentProps<'svg'> & { size?: number | string };

// Junelo's own geometric symbols. One 24-unit canvas and a shared stroke
// keep the controls consistent without shipping an external symbol library.
function symbol(drawing: ReactNode) {
    return function Icon({
        size = 24,
        strokeWidth = 1.8,
        ...props
    }: IconProps) {
        return (
            <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                focusable="false"
                {...props}
            >
                {drawing}
            </svg>
        );
    };
}

export const Plus = symbol(<path d="M5 12h14M12 5v14" />);
export const Check = symbol(<path d="m5 12 4 4 10-9" />);
export const ChevronLeft = symbol(<path d="m14 5-7 7 7 7" />);
export const ChevronRight = symbol(<path d="m10 5 7 7-7 7" />);
export const ArrowRight = symbol(<path d="M4 12h16m-7-7 7 7-7 7" />);
export const ArrowLeft = symbol(<path d="M20 12H4m7-7-7 7 7 7" />);
export const ArrowUpRight = symbol(<path d="M5 19 19 5M6 5h13v13" />);
export const ArrowDownLeft = symbol(<path d="M19 5 5 19M18 19H5V6" />);
export const CalendarDays = symbol(
    <>
        <rect x="3.5" y="5" width="17" height="16" rx="3" />
        <path d="M7.5 3v4m9-4v4M4 10h16M8 14h1m6 0h1m-8 4h1m6 0h1" />
    </>,
);
export const TriangleAlert = symbol(
    <>
        <path d="M10.4 4.7a1.8 1.8 0 0 1 3.2 0l7 13.4a1.8 1.8 0 0 1-1.6 2.6H5a1.8 1.8 0 0 1-1.6-2.6Z" />
        <path d="M12 9v4.5m0 3h.01" />
    </>,
);
export const ListChecks = symbol(
    <>
        <path d="m3 6 1.5 1.5L7 4.5M10 6h11M3 12l1.5 1.5L7 10.5M10 12h11M3 18l1.5 1.5L7 16.5M10 18h11" />
    </>,
);
export const ShoppingBasket = symbol(
    <>
        <path d="m8 3-4 7m12-7 4 7M2 10h20l-2.5 10h-15ZM9 13v4m6-4v4" />
    </>,
);
export const Wallet = symbol(
    <>
        <rect x="3" y="5" width="18" height="15" rx="3" />
        <path d="M3 8h18m0 4h-5v4h5" />
        <circle cx="17.5" cy="14" r=".5" />
    </>,
);
export const Settings2 = symbol(
    <>
        <path d="M3 6h7m5 0h6M3 12h2m5 0h11M3 18h10m5 0h3" />
        <circle cx="12.5" cy="6" r="2.5" />
        <circle cx="7.5" cy="12" r="2.5" />
        <circle cx="15.5" cy="18" r="2.5" />
    </>,
);
export const UserRound = symbol(
    <>
        <circle cx="12" cy="7.5" r="4" />
        <path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2" />
    </>,
);
export const UsersRound = symbol(
    <>
        <circle cx="9" cy="7.5" r="3.5" />
        <path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5.5 5.5 0 0 1 3.5 5v2" />
    </>,
);
export const Users = UsersRound;
export const Eye = symbol(
    <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
    </>,
);
export const EyeOff = symbol(
    <>
        <path d="m3 3 18 18M9 5.5a11 11 0 0 1 3-.5c6.5 0 10 7 10 7a20 20 0 0 1-3 4M6 6.5A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5-1.1M10 10a2.8 2.8 0 0 0 4 4" />
    </>,
);
export const LogOut = symbol(
    <>
        <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5m3-14 6 5-6 5M8 12h11" />
    </>,
);
export const CircleCheck = symbol(
    <>
        <circle cx="12" cy="12" r="9" />
        <path d="m7 12 3 3 7-7" />
    </>,
);
export const CheckCircle2 = CircleCheck;
export const Copy = symbol(
    <>
        <rect x="8" y="8" width="13" height="13" rx="2.5" />
        <path d="M16 5V3H3v13h2" />
    </>,
);
export const RefreshCw = symbol(
    <>
        <path d="M20 9a8 8 0 0 0-14-3L3 9m0-6v6h6m-5 6a8 8 0 0 0 14 3l3-3m0 6v-6h-6" />
    </>,
);
