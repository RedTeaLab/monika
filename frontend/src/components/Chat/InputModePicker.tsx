import { useStore } from '../../store'
import { Combobox } from '../ui'
import type { ComboboxOption } from '../ui'

const OPTIONS: ComboboxOption[] = [
    { value: 'normal', label: 'Normal' },
    { value: 'shell', label: 'Shell' },
]

// Compact override for the chat-input toolbar: the Combobox trigger defaults to
// h-9/form-field sizing; we collapse it to match the surrounding inline pickers.
const COMPACT = (
    '!w-auto ' +
    '[&>button]:!w-auto [&>button]:!h-auto [&>button]:!py-0.5 [&>button]:!px-2 ' +
    '[&>button]:!text-[11px] [&>button]:!gap-1 [&>button]:!bg-[var(--bg-elevated)] ' +
    '[&>button]:!border-[var(--border)] [&>button]:!rounded'
)

function InputModePicker() {
    const activeSessionId = useStore((s) => s.activeSessionId)
    const inputMode = useStore((s) => s.inputModes[activeSessionId] || 'normal')
    const setInputMode = useStore((s) => s.setInputMode)

    return (
        <Combobox
            value={inputMode}
            options={OPTIONS}
            onChange={(v) => setInputMode(activeSessionId, v as 'normal' | 'shell')}
            searchable={false}
            aria-label="Input mode"
            className={COMPACT}
        />
    )
}

export default InputModePicker
