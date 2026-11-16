// Single source of truth for the LossLens Protection product family.
// Three insurance STRUCTURES provide access to ONE standardised
// treatment-benefit package (Option A). Only enrolment/eligibility,
// distribution, premium collection and risk-pool composition differ.
// Everything here is PROPOSED — nothing is approved for sale.

export const PROTECTION_STATUS =
  'Proposed product — under development, subject to insurer underwriting and regulatory approval. Not currently available for purchase.'

export const COMMON_PACKAGE = {
  title: 'The shared treatment-benefit package',
  qualifier: 'Proposed and identical across all three structures, subject to insurer and regulatory validation:',
  couldCover: [
    'Clinical assessment for gambling disorder',
    'Outpatient therapy, including CBT where appropriate',
    'Psychiatric consultation when clinically needed',
    'Structured outpatient programmes',
    'Inpatient treatment only where clinically necessary and pre-approved',
    'Follow-up after treatment',
    'Family counselling, with the patient\u2019s consent',
  ],
  neverCover: [
    'Betting stakes, gambling losses or debts',
    'Loan balances or lost savings',
    'Rent arrears or cash compensation for having gambled',
    'Treatment that is not clinically necessary',
  ],
  process: [
    'A clinician assesses whether treatment is needed.',
    'The insurer confirms cover under the applicable policy.',
    'Treatment happens with a qualified clinician; LossLens supports day-to-day recovery.',
    'Eligible treatment and benefit milestones are verified.',
    'The insurer assesses and settles eligible claims under the policy terms.',
    'With separate permission, minimal status updates are shared. Your diary, chats and risk scores are never shared.',
  ],
  privacy: [
    'Your diary is never shared with insurers.',
    'Oloo conversations are never shared with insurers.',
    'Crisis data and behavioural risk scores are never shared with insurers.',
    'Only the minimum necessary information is shared, and only with your separate permission.',
    'Insurance decisions — underwriting, eligibility, pricing, claims — always belong to the licensed insurer, never to LossLens.',
  ],
}

export const STRUCTURES = {
  'medical-rider': {
    slug: 'medical-rider',
    name: 'LossLens Medical Rider',
    tagline: 'For people who already have an eligible medical insurance policy.',
    forWho: 'Members who hold an eligible existing medical insurance policy and want the proposed gambling-harm treatment benefit added as a rider.',
    enrolment: [
      'Confirm you have an eligible medical policy.',
      'Submit an enquiry to LossLens or your insurer.',
      'The insurer confirms whether the rider is compatible with your existing policy.',
      'The insurer quotes the premium and, if you proceed, issues the endorsement.',
    ],
    whoProvides: 'The licensed insurer issues the rider on top of your existing medical policy. LossLens provides the platform and coordinates recovery support.',
    premium: 'Quoted by the insurer based on the underlying policy and underwriting. LossLens does not set or collect insurance premiums.',
    differences: ['Enrolment route: rider on an existing medical policy', 'Premium: insurer-quoted per policy', 'Risk pool: existing medical policyholders'],
    cta: 'Explore Medical Rider',
  },
  'individual-cover': {
    slug: 'individual-cover',
    name: 'LossLens Individual Cover',
    tagline: 'A standalone insurance arrangement for eligible individuals.',
    forWho: 'Eligible individuals who want the proposed treatment benefit without an existing medical insurance policy.',
    enrolment: [
      'Submit an individual enquiry or application.',
      'The insurer assesses individual eligibility and underwriting.',
      'The insurer provides a quotation.',
      'If you proceed, the insurer issues the policy and collects the premium.',
    ],
    whoProvides: 'The licensed insurer underwrites and issues the standalone policy. LossLens provides the platform and coordinates recovery support.',
    premium: 'Determined by the insurer through individual underwriting. LossLens does not set or collect insurance premiums.',
    differences: ['Enrolment route: individual application and underwriting', 'Premium: insurer-set per individual', 'Risk pool: individual policyholders'],
    cta: 'Explore Individual Cover',
  },
  'group-cover': {
    slug: 'group-cover',
    name: 'LossLens Group Cover',
    tagline: 'Access arranged through an eligible employer, university, association or other group.',
    forWho: 'Members of a participating organisation — an employer, university, association or other eligible group.',
    enrolment: [
      'Your organisation expresses interest or is already participating.',
      'Group eligibility and terms are determined with the insurer.',
      'Members enrol through the organisation\u2019s arrangement.',
      'The organisation and insurer administer group-level premiums and coverage.',
    ],
    whoProvides: 'The licensed insurer issues the group policy; the participating organisation facilitates enrolment. LossLens provides the platform and coordinates recovery support.',
    premium: 'Set through the group arrangement with the insurer — may be employer-, member- or jointly-funded. LossLens does not set or collect insurance premiums.',
    differences: ['Enrolment route: through a participating organisation', 'Premium: group-level arrangement', 'Risk pool: organised group'],
    cta: 'Explore Group Cover',
  },
}

export const STRUCTURE_ORDER = ['medical-rider', 'individual-cover', 'group-cover']

export const ACTUARIAL_NOTES = {
  model: 'The proposed pricing model uses a monthly discrete-time four-state Markov model (π(t+1) = π(t)P) with states: S0 no identified harmful gambling, S1 harmful gambling not in treatment, S2 in treatment, S3 post-treatment recovery.',
  uncertainty: 'The annual treatment-start rate is a highly uncertain assumption — validated Kenyan longitudinal claims data are not yet available. Any figures shown are illustrative only, not market quotations or approved premiums.',
  structures: 'The same benefit package can be distributed through three risk-pooling arrangements (rider, individual, group), but each has different risk-pool composition, selection effects, acquisition and administration costs — so gross premiums will differ and must be modelled per structure by the insurer.',
}
