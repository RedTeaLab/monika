import { useStore } from '../../store'
import { Combobox } from '../ui'
import type { ComboboxOption } from '../ui'

const OPTIONS: ComboboxOption[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'manual', label: 'Manual' },
]

// Compact override for the chat-input toolbar: the Combobox trigger defaults to
// h-9/form-field sizing; we collapse it to match the surrounding inline pickers.
const COMPACT = (
    '!w-auto ' +
    '[&>button]:!w-auto [&>button]:!h-auto [&>button]:!py-0.5 [&>button]:!px-2 ' +
    '[&>button]:!text-[11px] [&>button]:!gap-1 [&>button]:!bg-[var(--bg-elevated)] ' +
    '[&>button]:!border-[var(--border)] [&>button]:!rounded'
)

function PermissionModePicker() {
    const permissionMode = useStore((s) => s.permissionMode)
    const setPermissionMode = useStore((s) => s.setPermissionMode)

    return (
        <Combobox
            value={permissionMode}
            options={OPTIONS}
            onChange={(v) => setPermissionMode(v as 'auto' | 'manual')}
            searchable={false}
            aria-label="Permission mode"
            className={COMPACT}
        />
    )
}

export default PermissionModePicker
