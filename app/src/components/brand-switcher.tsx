import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { brandsQueryOptions, createBrand, type BrandProfile } from '@/lib/tracker'
import { BrandScopeContext, readStoredBrandId, useBrandScope, writeStoredBrandId } from '@/lib/brand-scope'
import { Dropdown } from '@/components/dropdown'
import { Modal } from '@/components/modal'

// The brand in scope: a provider the authed layout mounts, the rail's
// switcher, and the gate pages sit behind (no brand yet → create one).

export function BrandScopeProvider({ children }: { children: React.ReactNode }) {
  const [brandId, setState] = useState<string | null>(() => readStoredBrandId())
  const value = useMemo(
    () => ({
      brandId,
      setBrandId: (id: string | null) => {
        setState(id)
        writeStoredBrandId(id)
      },
    }),
    [brandId],
  )
  return <BrandScopeContext.Provider value={value}>{children}</BrandScopeContext.Provider>
}

/**
 * Gate for the pages, which only make sense per brand. With no brands at
 * all it shows the create form; with brands but none chosen it offers them;
 * a single brand self-selects.
 */
export function RequireBrand({ children }: { children: (brand: BrandProfile) => React.ReactNode }) {
  const brands = useSuspenseQuery(brandsQueryOptions).data
  const { brandId, setBrandId } = useBrandScope()
  useEffect(() => {
    if (!brandId && brands.length === 1) setBrandId(brands[0].id)
    // A stored id whose brand no longer exists degrades to "none chosen".
    if (brandId && brands.length && !brands.some((b) => b.id === brandId)) setBrandId(null)
  }, [brandId, brands, setBrandId])
  const brand = brands.find((b) => b.id === brandId)
  if (brand) return <>{children(brand)}</>
  if (brands.length === 0) return <FirstBrand />
  return (
    <div className="empty-card">
      <h3>Select a brand</h3>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {brands.map((b) => (
          <button key={b.id} type="button" onClick={() => setBrandId(b.id)} className="btn btn-secondary btn-sm">
            {b.brandName}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The empty state: the first brand, created in place. */
function FirstBrand() {
  const qc = useQueryClient()
  const { setBrandId } = useBrandScope()
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (name.trim().length < 1) return
    setError(null)
    setBusy(true)
    try {
      const brand = await createBrand(qc, { name, domain })
      setBrandId(brand.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the brand.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface border-border-default mx-auto w-full max-w-[520px] rounded-lg border p-7" style={{ boxShadow: 'var(--shadow-card-md)' }}>
      <h3 className="text-text mb-1 text-[17px] font-semibold">Add the brand you want to track</h3>
      <p className="text-text-soft mb-5 text-sm">
        The name answer engines would use for it. You can add aliases, domains, competitors and the
        market in Settings afterwards.
      </p>
      <form onSubmit={submit} className="form-grid">
        <div className="form-field">
          <label htmlFor="fb-name" className="form-label">
            Brand name
          </label>
          <input id="fb-name" className="form-input" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="form-field">
          <label htmlFor="fb-domain" className="form-label">
            Website <span className="text-text-soft font-normal">(optional)</span>
          </label>
          <input id="fb-domain" className="form-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
          <span className="form-hint">A citation to this domain counts as brand-owned.</span>
        </div>
        {error && <div className="bg-danger-soft text-danger rounded-md px-3 py-2.5 text-13">{error}</div>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create brand'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** The rail's brand switcher, with "New brand…" at the bottom. */
export function BrandSwitcher() {
  const brands = useSuspenseQuery(brandsQueryOptions).data
  const { brandId, setBrandId } = useBrandScope()
  const [creating, setCreating] = useState(false)
  const active = brands.find((b) => b.id === brandId) ?? null
  const label = active ? active.brandName : brands.length ? 'Select a brand' : 'No brand yet'
  const initial = (active?.brandName.trim()[0] || '+').toUpperCase()

  return (
    <>
      <Dropdown
        align="left"
        portal
        containerClassName="block w-full"
        triggerClassName="w-full"
        menuClassName="w-[248px] shadow-card-lg"
        trigger={
          <span className="border-sidebar-border bg-sidebar-hover text-sidebar-fg-strong hover:bg-sidebar-accent flex w-full items-center gap-2 rounded-[7px] border px-3 py-2 text-left text-[13.5px] font-medium">
            <span className="bg-primary text-primary-foreground grid h-5 w-5 flex-shrink-0 place-items-center rounded-[5px] text-[10px] font-bold">
              {initial}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <ChevronDown aria-hidden size={16} strokeWidth={2} className="text-sidebar-fg/70 shrink-0" />
          </span>
        }
      >
        {({ close }) => (
          <>
            {brands.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setBrandId(b.id)
                  close()
                }}
                className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-[5px] px-3 py-2 text-left text-[13.5px]"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-text block truncate font-medium">{b.brandName}</span>
                  {b.domains[0] && <span className="text-text-soft block truncate text-[11.5px]">{b.domains[0]}</span>}
                </span>
                {b.id === brandId && <span className="text-accent-deep text-[13px]">✓</span>}
              </button>
            ))}
            {brands.length > 0 && <div className="border-border-default my-1 border-t" />}
            <button
              type="button"
              onClick={() => {
                close()
                setCreating(true)
              }}
              className="hover:bg-surface-2 text-text flex w-full items-center gap-2 rounded-[5px] px-3 py-2 text-left text-[13.5px] font-medium"
            >
              <Plus aria-hidden size={14} /> New brand…
            </button>
          </>
        )}
      </Dropdown>
      <NewBrandModal open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function NewBrandModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { setBrandId } = useBrandScope()
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) return
    setError(null)
    setBusy(true)
    try {
      const brand = await createBrand(qc, { name, domain })
      setBrandId(brand.id)
      setName('')
      setDomain('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the brand.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New brand"
      description="Another brand to track, with its own prompts, runs and settings."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create brand'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="nb-name" className="form-label">
            Brand name
          </label>
          <input id="nb-name" className="form-input" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="nb-domain" className="form-label">
            Website <span className="text-text-soft font-normal">(optional)</span>
          </label>
          <input id="nb-domain" className="form-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
        </div>
        {error && <div className="bg-danger-soft text-danger rounded-md px-3 py-2.5 text-13">{error}</div>}
      </div>
    </Modal>
  )
}
