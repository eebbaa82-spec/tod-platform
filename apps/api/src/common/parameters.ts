// Business rules and configurable parameters (section 5). These are the
// launch values; the Operator changes them in the staff console without a
// release (FR-ADM-02). FINANCIAL changes need a second approver.
// Values marked "[confirm]" in the specification carry a provisional default.

export interface ParameterDef {
  key: string;
  category: 'FINANCIAL' | 'OPERATIONAL';
  description: string;
  value: unknown;
}

export const PARAMETER_DEFAULTS: ParameterDef[] = [
  { key: 'COMMISSION_STANDARD_RATE', category: 'FINANCIAL', value: 0.05, description: 'BR-01 Standard commission on settled value.' },
  { key: 'COMMISSION_INCLUSIVE_RATE', category: 'FINANCIAL', value: 0.01, description: 'BR-02 Inclusive commission for verified women and persons with disabilities.' },
  { key: 'COMMISSION_INCLUSIVE_ELIGIBILITY', category: 'FINANCIAL', value: { verifiedWomen: true, confirmedDisability: true }, description: 'BR-02 Who qualifies for the inclusive rate.' },
  { key: 'TALENT_FEES_ENABLED', category: 'FINANCIAL', value: { registration: false, membership: false, featuredListing: false }, description: 'FR-COM-06 Talent-side fees. Off at launch.' },
  { key: 'ASSIGNMENT_VALUE_LIMITS', category: 'FINANCIAL', value: { VERIFIED_ENTERPRISE: null, BASIC_ENTERPRISE: 2000000, INDIVIDUAL: 2000000, PROVISIONAL: 500000 }, description: 'BR-07, BR-08 Maximum assignment value in santim per client level; null means no limit. [confirm]' },
  { key: 'REVIEW_WINDOW_WORKING_DAYS', category: 'OPERATIONAL', value: 3, description: 'BR-03 Review window after delivery, in working days.' },
  { key: 'REVIEW_WINDOW_REMINDERS', category: 'OPERATIONAL', value: 2, description: 'BR-03 Reminders sent to the client during the review window.' },
  { key: 'RATING_PUBLICATION_DAYS', category: 'OPERATIONAL', value: 7, description: 'BR-17 Ratings are published when both are submitted, or after this many days.' },
  { key: 'DISPUTE_LIMITS_WORKING_DAYS', category: 'OPERATIONAL', value: { intake: 2, facilitation: 5, decision: 10, appeal: 5 }, description: 'BR-18 Dispute time limits.' },
  { key: 'MANUAL_REVIEW_TARGET_WORKING_DAYS', category: 'OPERATIONAL', value: 2, description: 'BR-19 Manual review and safeguarding acknowledgement target.' },
  { key: 'MINIMUM_AGE', category: 'OPERATIONAL', value: 18, description: 'BR-20 Minimum age.' },
  { key: 'SMALL_CELL_THRESHOLD', category: 'OPERATIONAL', value: 5, description: 'BR-21 Suppress report figures based on fewer individuals than this.' },
  { key: 'TIER_CONCURRENCY', category: 'OPERATIONAL', value: { ENTRY: 1, INTERMEDIATE: 3, EXPERT: 5 }, description: 'BR-09 to BR-11 Concurrent active assignments allowed per tier. Expert value [confirm].' },
  { key: 'TRUST_WEIGHTS', category: 'OPERATIONAL', value: { delivery: 30, clientRating: 25, timeliness: 20, repeat: 15, conduct: 10 }, description: 'BR-15 Trust score weights.' },
  { key: 'TRUST_THRESHOLDS', category: 'OPERATIONAL', value: { minCompleted: 3, trusted: 60, topRated: 85 }, description: 'BR-16 Trust level thresholds. [confirm]' },
  { key: 'MATCH_WEIGHTS', category: 'OPERATIONAL', value: { availability: 20, readiness: 15, trust: 30, responseTime: 20, tier: 15 }, description: 'FR-MAT-02 Weights used to rank eligible talents.' },
  { key: 'MATCH_SHORTLIST_SIZE', category: 'OPERATIONAL', value: 5, description: 'FR-MAT-02 Number of talents invited per assignment.' },
  { key: 'MATCH_INCLUSION_SLOTS', category: 'OPERATIONAL', value: 1, description: 'FR-MAT-03 Shortlist places reserved for new Entry-tier talents.' },
  { key: 'INVITATION_RESPONSE_HOURS', category: 'OPERATIONAL', value: 48, description: 'FR-MAT-04 Time a talent has to accept or propose.' },
  { key: 'NO_PROPOSAL_ALERT_WORKING_DAYS', category: 'OPERATIONAL', value: 1, description: 'FR-MAT-07 Alert support when an assignment has no proposal after this long.' },
  { key: 'LOGIN_MAX_FAILED_ATTEMPTS', category: 'OPERATIONAL', value: 5, description: 'FR-ACC-07 Failed sign-ins before the account is locked.' },
  { key: 'LOGIN_LOCK_MINUTES', category: 'OPERATIONAL', value: 30, description: 'FR-ACC-07 Lock duration.' },
  { key: 'OTP_TTL_MINUTES', category: 'OPERATIONAL', value: 10, description: 'One-time code lifetime.' },
  { key: 'HOLIDAYS', category: 'OPERATIONAL', value: ['2026-01-07', '2026-01-19', '2026-03-02', '2026-03-20', '2026-04-10', '2026-04-12', '2026-05-01', '2026-05-05', '2026-05-27', '2026-05-28', '2026-09-11', '2026-09-27', '2027-01-07', '2027-01-19'], description: 'Public holidays excluded from working days. Movable feasts must be confirmed each year.' },
  { key: 'POLICY_VERSIONS', category: 'OPERATIONAL', value: { TERMS: '2026-11', PRIVACY: '2026-11', COMMUNITY: '2026-11' }, description: 'FR-ACC-05 Current versions of the terms, privacy notice and community standards.' },
  { key: 'FILE_MAX_MB', category: 'OPERATIONAL', value: 20, description: 'NFR-SEC-04 Largest file a user can upload.' },
  { key: 'PAY_LATER_ENABLED', category: 'FINANCIAL', value: false, description: 'FR-BNP-01 Pay-later facility switch (R2).' },
];
