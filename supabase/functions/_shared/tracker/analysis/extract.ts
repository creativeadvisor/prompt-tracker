import type { BrandProfile, Citation } from '../engines/types.ts'
import { domainOf } from '../engines/types.ts'

// Layer 1 of the sentiment design: the
// facts about an answer that need no judgment — who is named, where, how
// often, and whose sources are cited. Pure, deterministic, tested. The
// judge reads these; so do share of voice and visibility, which is why
// they must not depend on a model's mood.
//
// Matching is word-boundary and case-insensitive on the brand, its aliases
// and each competitor's name and aliases. "Northwind" alone does not match
// "Northwind Coffee" unless it is listed as an alias; plain substring
// matching ("no " in "no fee") is the class of bug this avoids.

export interface Mention {
  /** The profile name the match resolved to (brand or competitor). */
  name: string
  /** Which listed form matched (name or alias), as written in the text. */
  matched: string
  /** 0-based character offset of the first match. */
  offset: number
}

export interface EntityMentions {
  name: string
  count: number
  /** First mention, or null when never mentioned. */
  first: Mention | null
  /** 0-based paragraph index of the first mention. */
  paragraph: number | null
}

export type CitationOwner = 'brand' | 'competitor' | 'third_party'

export interface ClassifiedCitation extends Citation {
  owner: CitationOwner
  /** The competitor's name when owner is 'competitor'. */
  ownerName?: string
}

export type AnswerStructure = 'direct' | 'list' | 'comparison'

export interface Extract {
  brand: EntityMentions
  competitors: EntityMentions[]
  /** 1-based rank of the brand's first mention among every named entity's
   *  first mention, or null when the brand is not mentioned. */
  brandRank: number | null
  /** Named entities (brand + competitors) mentioned at least once. */
  namedCount: number
  citations: ClassifiedCitation[]
  structure: AnswerStructure
  wordCount: number
  paragraphCount: number
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Word-boundary pattern for a name: boundaries that also work for names
 *  ending in punctuation ("Bean & Barrel", "M1 Finance", "Co."). */
export function namePattern(name: string): RegExp {
  const core = escapeRe(name.trim()).replace(/\s+/g, '\\s+')
  // (?<![\w]) / (?![\w]) instead of \b so "Bean & Barrel" and "Northwind." work.
  return new RegExp(`(?<![\\p{L}\\p{N}])${core}(?![\\p{L}\\p{N}])`, 'giu')
}

export function findMentions(text: string, name: string, aliases: string[]): Mention[] {
  const forms = [name, ...aliases].map((f) => f.trim()).filter((f) => f.length >= 2)
  const out: Mention[] = []
  for (const form of forms) {
    const re = namePattern(form)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      out.push({ name, matched: m[0], offset: m.index })
      if (m[0].length === 0) re.lastIndex++
    }
  }
  // Two forms can overlap ("Northwind Coffee" inside "Northwind Coffee Roasters"):
  // keep the earliest-starting, longest match for any overlapping span.
  out.sort((a, b) => a.offset - b.offset || b.matched.length - a.matched.length)
  const dedup: Mention[] = []
  let end = -1
  for (const m of out) {
    if (m.offset < end) continue
    dedup.push(m)
    end = m.offset + m.matched.length
  }
  return dedup
}

export function splitParagraphs(text: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  const re = /\n\s*\n/g
  let start = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ start, end: m.index })
    start = m.index + m[0].length
  }
  out.push({ start, end: text.length })
  return out
}

function paragraphOf(paragraphs: Array<{ start: number; end: number }>, offset: number): number {
  const i = paragraphs.findIndex((p) => offset >= p.start && offset < p.end)
  return i === -1 ? paragraphs.length - 1 : i
}

export function detectStructure(text: string): AnswerStructure {
  const lines = text.split('\n')
  const listLines = lines.filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l)).length
  const comparison = /\b(?:vs\.?|versus|compared (?:to|with)|comparison|better than|cheaper than)\b/i.test(text)
  if (listLines >= 2 && comparison) return 'comparison'
  if (listLines >= 2) return 'list'
  if (comparison) return 'comparison'
  return 'direct'
}

function ownerOf(domain: string, profile: BrandProfile): { owner: CitationOwner; ownerName?: string } {
  const matches = (owned: string[]) =>
    owned.some((d) => {
      const o = d.toLowerCase().replace(/^www\./, '')
      return domain === o || domain.endsWith('.' + o)
    })
  if (matches(profile.domains)) return { owner: 'brand' }
  for (const c of profile.competitors) {
    if (matches(c.domains)) return { owner: 'competitor', ownerName: c.name }
  }
  return { owner: 'third_party' }
}

export function classifyCitations(citations: Citation[], profile: BrandProfile): ClassifiedCitation[] {
  return citations.map((c) => {
    const domain = (c.domain || domainOf(c.url)).toLowerCase().replace(/^www\./, '')
    return { ...c, domain, ...ownerOf(domain, profile) }
  })
}

export function extract(text: string, citations: Citation[], profile: BrandProfile): Extract {
  const paragraphs = splitParagraphs(text)
  const entity = (name: string, aliases: string[]): EntityMentions => {
    const ms = findMentions(text, name, aliases)
    const first = ms[0] ?? null
    return {
      name,
      count: ms.length,
      first,
      paragraph: first ? paragraphOf(paragraphs, first.offset) : null,
    }
  }
  const brand = entity(profile.brandName, profile.aliases)
  const competitors = profile.competitors.map((c) => entity(c.name, c.aliases))
  const firsts = [brand, ...competitors]
    .filter((e) => e.first)
    .sort((a, b) => a.first!.offset - b.first!.offset)
  const brandRank = brand.first ? firsts.findIndex((e) => e.name === brand.name) + 1 : null
  return {
    brand,
    competitors,
    brandRank,
    namedCount: firsts.length,
    citations: classifyCitations(citations, profile),
    structure: detectStructure(text),
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    paragraphCount: paragraphs.filter((p) => text.slice(p.start, p.end).trim()).length,
  }
}
