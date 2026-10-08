import { classifyCitations, detectStructure, extract, findMentions } from './extract.ts'
import type { BrandProfile } from '../engines/types.ts'

// A fictional brand and competitors on reserved .example domains.
const profile: BrandProfile = {
  brandName: 'Northwind Coffee Roasters',
  aliases: ['Northwind Coffee', 'Northwind Roasters'],
  domains: ['northwindroasters.example'],
  competitors: [
    { name: 'Bean & Barrel', aliases: ['Bean and Barrel'], domains: ['beanandbarrel.example'] },
    { name: 'Ridgeline', aliases: [], domains: ['ridgeline.example'] },
  ],
}

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg)
}

Deno.test('word boundaries: substring matching bugs are gone', () => {
  // "no " in "no fee", "pros" in "prospect": the class of false hit a
  // substring matcher produces.
  assert(findMentions('Ridgeliner is not Ridgeline.', 'Ridgeline', []).length === 1, 'suffix should not match')
  assert(findMentions('the ridgeline app', 'Ridgeline', []).length === 1, 'case-insensitive')
  assert(findMentions('Bean & Barrel, then Bean and Barrel again', 'Bean & Barrel', ['Bean and Barrel']).length === 2, 'ampersand name and alias')
  assert(findMentions('Northwind alone', 'Northwind Coffee Roasters', ['Northwind Coffee']).length === 0, 'a bare first word is not the brand')
})

Deno.test('overlapping forms collapse to the longest match', () => {
  const ms = findMentions('Northwind Coffee Roasters is good. Northwind Coffee again.', 'Northwind Coffee Roasters', ['Northwind Coffee'])
  assert(ms.length === 2, `expected 2 mentions, got ${ms.length}`)
  assert(ms[0].matched === 'Northwind Coffee Roasters', 'longest form wins at the same offset')
  assert(ms[1].matched === 'Northwind Coffee', 'alias matches on its own')
})

Deno.test('extract: rank, paragraph, counts, citation ownership', () => {
  const text = `Bean & Barrel is the biggest name.

Northwind Coffee Roasters is a specialist roaster; Northwind Roasters ships weekly. Ridgeline is cheaper.

Northwind Coffee again.`
  const citations = [
    { url: 'https://www.beanandbarrel.example/services', domain: '', position: 1 },
    { url: 'https://northwindroasters.example/about', domain: 'northwindroasters.example', position: 2 },
    { url: 'https://buyersguide.example/x', domain: 'buyersguide.example', position: 3 },
    { url: 'https://blog.ridgeline.example/post', domain: '', position: 4 },
  ]
  const x = extract(text, citations, profile)
  assert(x.brand.count === 3, `brand count 3, got ${x.brand.count}`)
  assert(x.brand.paragraph === 1, `brand first paragraph 1, got ${x.brand.paragraph}`)
  assert(x.brandRank === 2, `brand rank 2 (after Bean & Barrel), got ${x.brandRank}`)
  assert(x.namedCount === 3, 'three named entities')
  assert(x.competitors.find((c) => c.name === 'Ridgeline')?.count === 1, 'competitor count')
  const owners = x.citations.map((c) => c.owner)
  assert(JSON.stringify(owners) === JSON.stringify(['competitor', 'brand', 'third_party', 'competitor']), `owners ${owners}`)
  assert(x.citations[3].ownerName === 'Ridgeline', 'subdomain resolves to the competitor')
  assert(x.citations[0].domain === 'beanandbarrel.example', 'domain derived from url when blank')
  assert(x.paragraphCount === 3, 'paragraphs')
})

Deno.test('extract: not mentioned', () => {
  const x = extract('Bean & Barrel and Ridgeline are the usual names.', [], profile)
  assert(x.brand.count === 0 && x.brand.first === null && x.brandRank === null, 'absent brand')
  assert(x.namedCount === 2, 'two competitors named')
})

Deno.test('structure detection', () => {
  assert(detectStructure('Plain prose answer.') === 'direct', 'direct')
  assert(detectStructure('1. one\n2. two\n3. three') === 'list', 'list')
  assert(detectStructure('A vs B: B is better than A.') === 'comparison', 'comparison prose')
  assert(detectStructure('- A is cheaper than B\n- B has more features') === 'comparison', 'list + comparison')
  assert(classifyCitations([], profile).length === 0, 'empty citations')
})
