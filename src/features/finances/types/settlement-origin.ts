import type { ObligationOrigin } from './inter-member-position';

export type SettlementOrigin =
    | ObligationOrigin
    | {
          kind: 'CLOSURE_AGREEMENT';
          closureAgreementId: string;
          description: string;
      };

export function hasFinancialOriginPage(
    origin: SettlementOrigin,
): origin is ObligationOrigin {
    return origin.kind !== 'CLOSURE_AGREEMENT';
}
