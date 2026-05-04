const STYLE = {
  ts: 'color: #484f58; font-size: 11px;',
  tag: 'font-size: 10px; font-weight: 700; padding: 1px 4px; border-radius: 3px;',
  info: 'background: #1f6feb33; color: #58a6ff;',
  ok: 'background: #23863633; color: #3fb950;',
  warn: 'background: #9e6a0333; color: #d2991d;',
  err: 'background: #da363333; color: #f85149;',
  event: 'background: #7c3aed33; color: #a78bfa;',
  lifecycle: 'background: #0d737733; color: #22d3ee;',
  section: 'color: #c9d1d9; font-weight: 600; border-bottom: 1px solid #30363d;',
}

function ts(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function log(tag: string, tagCss: string, msg: string, args: unknown[] = []) {
  const prefix = `%c${ts()} %c${tag}%c`
  const css = [STYLE.ts, STYLE.tag + tagCss, '']
  console.log(prefix + ' ' + msg, ...css, ...args)
}

export const logger = {
  info(msg: string, ...args: unknown[]) {
    log('INFO', STYLE.info, msg, args)
  },

  ok(msg: string, ...args: unknown[]) {
    log('OK  ', STYLE.ok, msg, args)
  },

  warn(msg: string, ...args: unknown[]) {
    log('WARN', STYLE.warn, msg, args)
  },

  error(msg: string, ...args: unknown[]) {
    log('ERR ', STYLE.err, msg, args)
  },

  event(msg: string, ...args: unknown[]) {
    log('EVENT', STYLE.event, msg, args)
  },

  lifecycle(tag: string, msg: string, ...args: unknown[]) {
    log(tag.toUpperCase(), STYLE.lifecycle, msg, args)
  },

  section(label: string) {
    console.log(`%c── ${label}`, STYLE.section)
  },

  group(label: string, fn: () => void) {
    console.groupCollapsed(`%c▸ ${label}`, 'color: #8b949e; font-size: 11px; font-weight: 600;')
    fn()
    console.groupEnd()
  },

  groupExpanded(label: string, fn: () => void) {
    console.group(`%c▸ ${label}`, 'color: #8b949e; font-size: 11px; font-weight: 600;')
    fn()
    console.groupEnd()
  },
}
