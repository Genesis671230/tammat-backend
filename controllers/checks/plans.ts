// src/lib/plans.ts
// Single source of truth — used by both pricing page and checkout

export interface Plan {
    id: string;
    lookupKey: string;        // Stripe Price lookup_key (set in Dashboard)
    label: string;            // Display name
    amount: number;           // AED
    interval: 'month' | 'year' | '2year';
    intervalLabel: string;    // "month", "year", "2 years"
    popular?: boolean;
    eidOffer?: {
      lookupKey: string;
      amount: number;
      savings: number;
    };
  }
  
  // Eid offer cutoff
  export const EID_OFFER_END = new Date('2026-05-29T23:59:59+04:00');
  export const isEidOfferActive = () => new Date() < EID_OFFER_END;
  
  export const PLANS: Plan[] = [
    {
      id: 'monthly',
      lookupKey: 'tammat_monthly',
      label: 'Monthly',
      amount: 30,
      interval: 'month',
      intervalLabel: 'month',
    },
    {
      id: 'yearly',
      lookupKey: 'tammat_yearly',
      label: '1 Year',
      amount: 149,
      interval: 'year',
      intervalLabel: 'year',
      popular: true,
      eidOffer: {
        lookupKey: 'tammat_yearly_eid',
        amount: 99,
        savings: 50,
      },
    },
    {
      id: 'twoyear',
      lookupKey: 'tammat_2year',
      label: '2 Years',
      amount: 249,
      interval: '2year',
      intervalLabel: '2 years',
      eidOffer: {
        lookupKey: 'tammat_2year_eid',
        amount: 199,
        savings: 50,
      },
    },
  ];
  
  // Effective price for a plan (Eid price if offer active, else regular)
  export function getEffectivePlan(plan: Plan) {
    if (plan.eidOffer && isEidOfferActive()) {
      return {
        lookupKey: plan.eidOffer.lookupKey,
        amount: plan.eidOffer.amount,
        regularAmount: plan.amount,
        savings: plan.eidOffer.savings,
        isOffer: true,
      };
    }
    return {
      lookupKey: plan.lookupKey,
      amount: plan.amount,
      regularAmount: plan.amount,
      savings: 0,
      isOffer: false,
    };
  }
  
  // Per-month equivalent (for showing "AED X/mo" on yearly/2yr plans)
  export function getPerMonthAmount(plan: Plan): number {
    const eff = getEffectivePlan(plan);
    if (plan.interval === 'month') return eff.amount;
    if (plan.interval === 'year') return Math.round((eff.amount / 12) * 10) / 10;
    if (plan.interval === '2year') return Math.round((eff.amount / 24) * 10) / 10;
    return eff.amount;
  }