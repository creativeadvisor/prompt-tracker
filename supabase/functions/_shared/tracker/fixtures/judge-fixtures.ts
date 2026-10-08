import type { BrandProfile } from '../engines/types.ts'
import type { Recommendation, Stance } from '../analysis/schema.ts'

// Labeled answers for scripts/judge-agreement.ts: a small set that pins down the rubric's meaning so a model
// or prompt change can be measured instead of felt. Labels are the
// expected stance and recommendation toward THE BRAND. Add a case whenever
// the judge gets one wrong in the wild. Every name, place and domain here
// is fictional.

export const FIXTURE_PROFILE: BrandProfile = {
  brandName: 'Harbour Lane Dental',
  aliases: ['Harbour Lane', 'HLD'],
  domains: ['harbourlanedental.example'],
  competitors: [
    { name: 'SmileBright', aliases: ['Smile Bright'], domains: ['smilebright.example'] },
    { name: 'Patel Family Dental', aliases: ['Patel Dental'], domains: ['patel-dental.example'] },
  ],
}

export interface JudgeFixture {
  id: string
  prompt: string
  text: string
  expect: { stance: Stance; recommendation: Recommendation; mentioned: boolean }
  /** What the case is testing, for the report. */
  note: string
}

export const JUDGE_FIXTURES: JudgeFixture[] = [
  {
    id: 'outright',
    prompt: 'best dentist in Port Haven',
    text: `If you're in Port Haven, Harbour Lane Dental is the one to book. Patients praise the gentle approach and the clear, upfront pricing, and the practice is open Saturdays. SmileBright is a reasonable alternative if you need a late evening appointment, but for most people Harbour Lane is the clear choice.`,
    expect: { stance: 'strongly_positive', recommendation: 'recommended_outright', mentioned: true },
    note: 'Brand praised and recommended; competitor as alternative.',
  },
  {
    id: 'conditional',
    prompt: 'dentist near Port Haven good with anxious patients',
    text: `For anxious patients, Harbour Lane Dental is a good fit — it offers sedation options and longer first appointments. If cost is the bigger concern, Patel Family Dental is cheaper for routine check-ups. Choose Harbour Lane if anxiety is the main issue; choose Patel if budget is.`,
    expect: { stance: 'positive', recommendation: 'recommended_conditionally', mentioned: true },
    note: 'Positive but hedged on a condition.',
  },
  {
    id: 'listed',
    prompt: 'dentists in Port Haven',
    text: `Dentists in Port Haven include:
1. SmileBright — large clinic, extended hours.
2. Harbour Lane Dental — family practice, Saturday appointments.
3. Patel Family Dental — budget-friendly check-ups.
All three are registered with the dental board. Check reviews and whether they accept your health fund.`,
    expect: { stance: 'neutral', recommendation: 'listed_among_options', mentioned: true },
    note: 'Listed without evaluation.',
  },
  {
    id: 'passing',
    prompt: 'how much does a dental check-up cost in Port Haven',
    text: `A standard check-up and clean in Port Haven runs from about $180 to $280. Larger clinics like SmileBright publish their fees online; smaller practices such as Harbour Lane Dental quote on request. Most health funds cover part of the cost. Ask for an itemised quote before treatment.`,
    expect: { stance: 'neutral', recommendation: 'mentioned_in_passing', mentioned: true },
    note: 'Named as an example of a small practice, nothing recommended.',
  },
  {
    id: 'discouraged',
    prompt: 'is Harbour Lane Dental any good',
    text: `Harbour Lane Dental gets mixed reviews. Several patients in 2025 reported long waits and a billing dispute that took months to resolve. The dentists themselves are well regarded, but the front-desk experience drags the practice down. If you can, look at SmileBright or Patel Family Dental first.`,
    expect: { stance: 'negative', recommendation: 'discouraged', mentioned: true },
    note: 'Reader steered away despite some praise.',
  },
  {
    id: 'warned_off',
    prompt: 'Harbour Lane Dental complaints',
    text: `Avoid Harbour Lane Dental. There is an open complaint with the state health complaints commissioner about an unnecessary procedure, and multiple reviews describe pressure to buy treatment plans. Patel Family Dental is the safer choice in the area.`,
    expect: { stance: 'strongly_negative', recommendation: 'discouraged', mentioned: true },
    note: 'Explicit warning; regulatory flag expected.',
  },
  {
    id: 'absent_glowing',
    prompt: 'best dentist in Port Haven',
    text: `SmileBright is the standout dentist in Port Haven — modern clinic, friendly team, same-day emergency appointments, and transparent pricing. Patel Family Dental is a solid budget option. Either will serve you well.`,
    expect: { stance: 'not_mentioned', recommendation: 'not_mentioned', mentioned: false },
    note: 'The trap: a glowing answer that never names the brand must be not_mentioned.',
  },
  {
    id: 'alias_only',
    prompt: 'HLD dentist Port Haven review',
    text: `HLD (the Port Haven practice on Harbour Lane) is well liked for its calm, unhurried consultations. Prices are mid-range and the hygienists get particular praise. A good choice if you want a smaller practice.`,
    expect: { stance: 'positive', recommendation: 'recommended_conditionally', mentioned: true },
    note: 'Brand present only through its alias.',
  },
  {
    id: 'mixed',
    prompt: 'Harbour Lane Dental vs SmileBright',
    text: `Harbour Lane Dental and SmileBright both have strengths. Harbour Lane wins on bedside manner and pricing clarity; SmileBright wins on hours and technology. Harbour Lane's waiting times are a real drawback, though, and some reviewers mention a dated clinic. It depends what you value.`,
    expect: { stance: 'mixed', recommendation: 'recommended_conditionally', mentioned: true },
    note: 'Genuine praise and criticism side by side.',
  },
  {
    id: 'competitor_negative_brand_neutral',
    prompt: 'SmileBright Port Haven reviews',
    text: `SmileBright has drawn criticism for upselling and rushed appointments; several reviewers switched to Harbour Lane Dental or Patel Family Dental afterwards. SmileBright's hours remain the best in the area.`,
    expect: { stance: 'neutral', recommendation: 'mentioned_in_passing', mentioned: true },
    note: 'Negative tone belongs to the competitor; the brand is only where people went.',
  },
  {
    id: 'outdated',
    prompt: 'Harbour Lane Dental opening hours',
    text: `Harbour Lane Dental is open Monday to Friday 8am–5pm and closed weekends, according to its 2023 listing. It is a reliable, if unremarkable, family practice. For weekend care, SmileBright is open Saturdays.`,
    expect: { stance: 'neutral', recommendation: 'mentioned_in_passing', mentioned: true },
    note: 'Outdated flag expected (2023 hours); stance stays neutral.',
  },
  {
    id: 'brand_only_positive',
    prompt: 'is Harbour Lane Dental legit',
    text: `Yes. Harbour Lane Dental is a registered practice with board-registered dentists, has operated in Port Haven since 2012, and holds a 4.8 average across several hundred reviews. Patients describe honest advice and no pressure to over-treat.`,
    expect: { stance: 'strongly_positive', recommendation: 'recommended_outright', mentioned: true },
    note: 'No competitor at all; strong trust signals.',
  },
]
