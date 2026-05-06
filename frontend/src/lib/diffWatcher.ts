interface OpenFile {
  path: string
  mode: 'edit' | 'diff'
}

export function findStaleDiffTabs(
  prevChanged: Set<string>,
  currentChanged: Set<string>,
  openFiles: OpenFile[],
): string[] {
  const result: string[] = []
  for (const path of prevChanged) {
    if (!currentChanged.has(path)) {
      if (openFiles.some((f) => f.path === path && f.mode === 'diff')) {
        result.push(path)
      }
    }
  }
  return result
}
