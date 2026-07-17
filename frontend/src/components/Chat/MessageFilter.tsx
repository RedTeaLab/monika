import { Combobox } from '../ui'
import type { ComboboxOption } from '../ui'

export type MsgFilterKey = 'all' | 'chat' | 'user' | 'assistant'

const OPTIONS: ComboboxOption[] = [
    { value: 'all', label: 'All' },
    { value: 'chat', label: 'Chat' },
    { value: 'user', label: 'User' },
    { value: 'assistant', label: 'Assistant' },
]

// Compact override for the messages header: the Combobox trigger defaults to
// h-9/form-field sizing; we collapse it to match the previous inline button.
const COMPACT = (
    '!w-auto ' +
    '[&>button]:!w-auto [&>button]:!h-auto [&>button]:!py-0.5 [&>button]:!px-2 ' +
    '[&>button]:!text-[11px] [&>button]:!gap-1 [&>button]:!bg-[var(--bg-elevated)] ' +
    '[&>button]:!border-[var(--border)] [&>button]:!rounded'
)

function MessageFilter({ value, onChange, disabled }: { value: MsgFilterKey; onChange: (v: MsgFilterKey) => void; disabled?: boolean }) {
    return (
        <Combobox
            value={value}
            options={OPTIONS}
            onChange={(v) => onChange(v as MsgFilterKey)}
            searchable={false}
            disabled={disabled}
            aria-label="Filter messages"
            className={COMPACT}
        />
    )
}

export default MessageFilter
