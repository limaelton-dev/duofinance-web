import type { SpaceSummary } from '../types/spaces-responses';

// Carry the section across spaces; an entity ID belongs only to its original space.
export function spaceSelectionPath(
    pathname: string,
    target: Pick<SpaceSummary, 'id' | 'type'>,
): string {
    const section = /^\/spaces\/[^/]+(\/[^?#]*)?/.exec(pathname)?.[1] ?? '';
    const shared = target.type === 'SHARED';
    let destination = '';
    if (section === '/settings') destination = shared ? '/settings' : '';
    else if (/^\/routine(?:\/|$)/.test(section)) destination = '/routine';
    else if (/^\/shopping(?:\/|$)/.test(section)) destination = '/shopping';
    else if (/^\/closure(?:\/|$)/.test(section))
        destination = shared ? '/closure' : '';
    else if (section === '/expenses/new') destination = '/expenses/new';
    else if (/^\/recurring-commitments(?:\/|$)/.test(section))
        destination =
            section === '/recurring-commitments/new'
                ? '/recurring-commitments/new'
                : '/recurring-commitments';
    else if (/^\/installment-commitments(?:\/|$)/.test(section))
        destination =
            section === '/installment-commitments/new'
                ? '/installment-commitments/new'
                : '/installment-commitments';
    else if (/^\/finances\/planning(?:\/|$)/.test(section))
        destination = '/finances/planning';
    else if (/^\/finances\/changes(?:\/|$)/.test(section))
        destination = shared ? '/finances/changes' : '/finances';
    else if (/^\/finances\/commitments(?:\/|$)/.test(section))
        destination = '/finances';
    else if (/^\/finances\/settlements(?:\/|$)/.test(section)) {
        destination = !shared
            ? '/finances'
            : section === '/finances/settlements/transfers/new'
              ? '/finances/settlements/transfers/new'
              : /^\/finances\/settlements\/transfers(?:\/|$)/.test(section)
                ? '/finances/settlements/transfers'
                : /^\/finances\/settlements\/offsets(?:\/|$)/.test(section)
                  ? '/finances/settlements/offsets'
                  : '/finances/settlements';
    } else if (section === '/finances') destination = '/finances';
    else if (section === '/incomes') destination = '/incomes';
    return `/spaces/${target.id}${destination}`;
}
