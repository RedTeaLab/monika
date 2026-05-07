const CREDENTIAL_PATTERNS: [RegExp, string][] = [
  [/(--password[= ])\S+/gi, '$1***'],
  [/(--api-key[= ])\S+/gi, '$1***'],
  [/([A-Z_]+SECRET[= ])\S+/gi, '$1***'],
  [/([A-Z_]+TOKEN[= ])\S+/gi, '$1***'],
  [/(Authorization:\s*Bearer\s+)\S+/gi, '$1***'],
]

export function sanitizeArgs(args: string): string {
  let result = args
  for (const [re, replacement] of CREDENTIAL_PATTERNS) {
    result = result.replace(re, replacement)
  }
  return result
}
