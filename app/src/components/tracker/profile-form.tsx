import { useState } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Panel } from '@/components/page-shell'
import { InfoTip } from '@/components/info-tip'
import {
  discoveredCompetitorsQueryOptions,
  ENGINES,
  JUDGE_MODELS,
  STANCE_LABELS,
  saveProfile,
  splitList,
  type BrandProfile,
  type Competitor,
  type EngineId,
} from '@/lib/tracker'

// The brand profile form. Lists (aliases, domains) are typed as
// comma-separated text and split on save; competitors are rows.

interface CompetitorDraft {
  name: string
  aliases: string
  domains: string
}

const COUNTRIES = [
  ['us', 'United States'],
  ['au', 'Australia'],
  ['gb', 'United Kingdom'],
  ['ca', 'Canada'],
  ['nz', 'New Zealand'],
  ['sg', 'Singapore'],
  ['ie', 'Ireland'],
] as const

export function ProfileForm({ qc, profile }: { qc: QueryClient; profile: BrandProfile }) {
  const [brandName, setBrandName] = useState(profile.brandName)
  const [aliases, setAliases] = useState(profile.aliases.join(', ') ?? '')
  const [domains, setDomains] = useState(profile.domains.join(', ') ?? '')
  const [competitors, setCompetitors] = useState<CompetitorDraft[]>(
    profile.competitors.map((c) => ({
      name: c.name,
      aliases: c.aliases.join(', '),
      domains: c.domains.join(', '),
    })) ?? [],
  )
  const [country, setCountry] = useState(profile.marketCountry ?? 'us')
  const [language, setLanguage] = useState(profile.marketLanguage ?? 'en')
  const [engines, setEngines] = useState<EngineId[]>(
    profile.defaultEngines ?? ['google_ai_overview', 'chatgpt'],
  )
  const [judgeModel, setJudgeModel] = useState(profile.judgeModel ?? 'claude-sonnet-5-5')
  const [judgeEnabled, setJudgeEnabled] = useState(profile.judgeEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  // Names the judge saw in answers that are not (yet) in the list below —
  // the discovery loop.
  const listed = competitors.map((c) => c.name).filter(Boolean)
  const discovered = useQuery(discoveredCompetitorsQueryOptions(profile.id, listed))

  function patchCompetitor(i: number, patch: Partial<CompetitorDraft>) {
    setCompetitors((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const comps: Competitor[] = competitors
        .filter((c) => c.name.trim())
        .map((c) => ({ name: c.name.trim(), aliases: splitList(c.aliases), domains: splitList(c.domains) }))
      await saveProfile(
        qc,
        profile.id,
        {
          brandName,
          aliases: splitList(aliases),
          domains: splitList(domains),
          competitors: comps,
          marketCountry: country,
          marketLanguage: language,
          defaultEngines: engines,
          judgeEnabled,
          judgeModel,
        },
      )
      setSavedAt(new Date().toLocaleTimeString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Panel title="Brand">
        <div className="form-grid">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pf-brand" className="form-label">
                Brand name
              </label>
              <input
                id="pf-brand"
                className="form-input"
                required
                maxLength={120}
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
              <span className="form-hint">The name an answer would use. Mentions are matched against this and the aliases.</span>
            </div>
            <div className="form-field">
              <label htmlFor="pf-aliases" className="form-label">
                Also known as <InfoTip text="Other spellings and short forms an answer might use. Comma-separated." />
              </label>
              <input
                id="pf-aliases"
                className="form-input"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
              />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="pf-domains" className="form-label">
              Domains the brand owns <InfoTip text="A citation to one of these counts as brand-owned. Comma-separated; paths are dropped." />
            </label>
            <input
              id="pf-domains"
              className="form-input"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="example.com, blog.example.com"
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Competitors"
        trailing={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCompetitors((cs) => [...cs, { name: '', aliases: '', domains: '' }])}
          >
            <Plus aria-hidden size={14} /> Add competitor
          </button>
        }
      >
        {competitors.length === 0 ? (
          <p className="text-text-soft text-sm">
            None yet. Share of voice and competitor stance need at least one. The judge also
            suggests names it sees in answers once prompts have run.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {competitors.map((c, i) => (
              <div key={i} className="border-border-default flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-end">
                <div className="form-field flex-1">
                  <label htmlFor={`pf-comp-name-${i}`} className="form-label">
                    Name
                  </label>
                  <input
                    id={`pf-comp-name-${i}`}
                    className="form-input"
                    value={c.name}
                    onChange={(e) => patchCompetitor(i, { name: e.target.value })}
                  />
                </div>
                <div className="form-field flex-1">
                  <label htmlFor={`pf-comp-aliases-${i}`} className="form-label">
                    Also known as
                  </label>
                  <input
                    id={`pf-comp-aliases-${i}`}
                    className="form-input"
                    value={c.aliases}
                    onChange={(e) => patchCompetitor(i, { aliases: e.target.value })}
                  />
                </div>
                <div className="form-field flex-1">
                  <label htmlFor={`pf-comp-domains-${i}`} className="form-label">
                    Domains
                  </label>
                  <input
                    id={`pf-comp-domains-${i}`}
                    className="form-input"
                    value={c.domains}
                    onChange={(e) => patchCompetitor(i, { domains: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${c.name || 'competitor'}`}
                  className="btn btn-ghost min-w-0 self-end px-2"
                  onClick={() => setCompetitors((cs) => cs.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {discovered.data && discovered.data.length > 0 && (
          <div className="border-border-default mt-4 border-t pt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-text-soft font-mono text-11 tracking-[0.09em] uppercase">Seen in answers</span>
              <span className="bg-agent-soft text-agent rounded-full px-[9px] py-[3px] text-11 font-semibold">from the judge</span>
            </div>
            <ul className="flex flex-col gap-2">
              {discovered.data.slice(0, 12).map((d) => {
                const top = Object.entries(d.stances).sort((a, b) => b[1] - a[1])[0]
                return (
                  <li key={d.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-13">
                    <span className="text-text font-medium">{d.name}</span>
                    <span className="text-text-soft font-mono text-11">
                      {d.answers} answer{d.answers === 1 ? '' : 's'}
                      {top ? ` · ${STANCE_LABELS[top[0] as keyof typeof STANCE_LABELS].toLowerCase()}` : ''}
                    </span>
                    {d.sampleQuote && <span className="text-text-muted min-w-0 flex-1 truncate italic">“{d.sampleQuote}”</span>}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm min-w-0"
                      onClick={() => setCompetitors((cs) => [...cs, { name: d.name, aliases: '', domains: '' }])}
                    >
                      Add
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="form-hint mt-2">Adding a name here puts it in the list above; save to keep it. Add its domain so citations to it count as competitor-owned.</p>
          </div>
        )}
      </Panel>

      <Panel title="Market and engines">
        <div className="form-grid">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="pf-country" className="form-label">
                Country
              </label>
              <select id="pf-country" className="form-select" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="form-hint">Where the prompts are asked from. Drives the search locale.</span>
            </div>
            <div className="form-field">
              <label htmlFor="pf-language" className="form-label">
                Language
              </label>
              <select id="pf-language" className="form-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <fieldset className="form-field">
            <legend className="form-label">Default engines for new prompts</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ENGINES.filter((e) => !e.hidden || engines.includes(e.id)).map((e) => {
                const on = engines.includes(e.id)
                return (
                  <label key={e.id} className="border-border-default hover:bg-surface-2 flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={on}
                      onChange={() =>
                        setEngines((cur) => (on ? cur.filter((x) => x !== e.id) : [...cur, e.id]))
                      }
                    />
                    <span className="min-w-0">
                      <span className="text-text block text-sm font-medium">{e.label}</span>
                      <span className="text-text-soft block text-xs">
                        {e.source}
                        {e.needsKey && ' · needs a key'}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </div>
      </Panel>

      <Panel title="Sentiment analysis">
        <div className="form-grid">
          <label className="border-border-default hover:bg-surface-2 flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5">
            <input type="checkbox" className="mt-0.5" checked={judgeEnabled} onChange={(e) => setJudgeEnabled(e.target.checked)} />
            <span className="min-w-0">
              <span className="text-text block text-sm font-medium">Judge every answer</span>
              <span className="text-text-soft block text-xs">
                Stance, recommendation, aspects, risks and competitor readings, with verbatim quotes. One extra model call
                per answer (about 0.5–1.6¢ with Claude Sonnet) on top of what the engine itself charges. Off, answers are
                still fetched and billed by their engines as usual; mentions, position, share of voice and citations are
                still counted; the Sentiment tab shows “Not judged”.
              </span>
            </span>
          </label>
          <div className="form-field">
            <label htmlFor="pf-judge" className="form-label">
              Judge model
            </label>
            <select id="pf-judge" className="form-select" value={judgeModel} disabled={!judgeEnabled} onChange={(e) => setJudgeModel(e.target.value)}>
              {JUDGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.provider}
                  {m.note ? ` · ${m.note}` : ''}
                </option>
              ))}
            </select>
            <span className="form-hint">
              Needs that provider's key in the function secrets (ANTHROPIC_API_KEY or OPENAI_API_KEY); without it a
              keyless mock judge runs and is labelled as such. The deployment can restrict the choices with
              JUDGE_MODELS_ALLOWED.
            </span>
          </div>
        </div>
      </Panel>

      {error && <div className="bg-danger-soft text-danger rounded-md px-3 py-2.5 text-13">{error}</div>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {savedAt && <span className="text-text-soft text-xs">Saved {savedAt}</span>}
      </div>
    </form>
  )
}
