import { ENGINES, type EngineId } from '@/lib/tracker'

// The engine checkboxes — the add modal, the prompt page's editor and the
// bulk "set engines" dialog share it.

export function EnginePicker({ value, onChange }: { value: EngineId[]; onChange: (next: EngineId[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ENGINES.filter((e) => !e.hidden || value.includes(e.id)).map((e) => {
        const on = value.includes(e.id)
        return (
          <label
            key={e.id}
            className={
              'border-border-default hover:border-border-strong flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-1.5 text-13' +
              (on ? ' bg-surface-2 text-text' : ' text-text-muted')
            }
          >
            <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== e.id) : [...value, e.id])} />
            {e.label}
          </label>
        )
      })}
    </div>
  )
}
