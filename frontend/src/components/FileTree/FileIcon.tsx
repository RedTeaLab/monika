import { FileCode2, FileJson2, FileText, FileType, FileImage, FileVideo, FileAudio, FileArchive, FileTerminal, FileCog, FileKey, FileLock, type LucideProps } from 'lucide-react'

/**
 * File-type icon resolver — maps file extensions to distinct icons + colors.
 * Falls back to a generic file icon for unknown types.
 */

type IconComponent = React.ComponentType<LucideProps>

interface FileIconConfig {
  icon: IconComponent
  color: string
}

// Extension → icon+color mapping. Keys are lowercase extensions without dot.
const EXT_MAP: Record<string, FileIconConfig> = {
  // Code
  go:      { icon: FileCode2, color: '#00add8' },
  rs:      { icon: FileCode2, color: '#dea584' },
  ts:      { icon: FileCode2, color: '#519aba' },
  tsx:     { icon: FileCode2, color: '#519aba' },
  js:      { icon: FileCode2, color: '#f7df1e' },
  jsx:     { icon: FileCode2, color: '#519aba' },
  mjs:     { icon: FileCode2, color: '#f7df1e' },
  cjs:     { icon: FileCode2, color: '#f7df1e' },
  py:      { icon: FileCode2, color: '#3572a5' },
  java:    { icon: FileCode2, color: '#e76f00' },
  kt:      { icon: FileCode2, color: '#a97bff' },
  swift:   { icon: FileCode2, color: '#f05138' },
  c:       { icon: FileCode2, color: '#555555' },
  cpp:     { icon: FileCode2, color: '#f34b7d' },
  cc:      { icon: FileCode2, color: '#f34b7d' },
  h:       { icon: FileCode2, color: '#555555' },
  hpp:     { icon: FileCode2, color: '#f34b7d' },
  cs:      { icon: FileCode2, color: '#178600' },
  rb:      { icon: FileCode2, color: '#cc342d' },
  php:     { icon: FileCode2, color: '#777bb3' },
  dart:    { icon: FileCode2, color: '#00b4ab' },
  lua:     { icon: FileCode2, color: '#5cc6c1' },
  sh:      { icon: FileTerminal, color: '#89e051' },
  bash:    { icon: FileTerminal, color: '#89e051' },
  zsh:     { icon: FileTerminal, color: '#89e051' },
  fish:    { icon: FileTerminal, color: '#89e051' },
  ps1:     { icon: FileTerminal, color: '#012456' },
  bat:     { icon: FileTerminal, color: '#89e051' },

  // Web
  html:    { icon: FileCode2, color: '#e34c26' },
  htm:     { icon: FileCode2, color: '#e34c26' },
  css:     { icon: FileCode2, color: '#563d7c' },
  scss:    { icon: FileCode2, color: '#c6538c' },
  sass:    { icon: FileCode2, color: '#c6538c' },
  less:    { icon: FileCode2, color: '#1d365d' },
  vue:     { icon: FileCode2, color: '#41b883' },
  svelte:  { icon: FileCode2, color: '#ff3e00' },

  // Config & data
  json:    { icon: FileJson2, color: '#f7df1e' },
  jsonc:   { icon: FileJson2, color: '#f7df1e' },
  yaml:    { icon: FileText, color: '#cb171e' },
  yml:     { icon: FileText, color: '#cb171e' },
  toml:    { icon: FileText, color: '#9c4221' },
  xml:     { icon: FileText, color: '#0060ac' },
  csv:     { icon: FileText, color: '#237346' },
  tsv:     { icon: FileText, color: '#237346' },
  ini:     { icon: FileCog, color: '#6b7280' },
  env:     { icon: FileKey, color: '#fbbf24' },
  conf:    { icon: FileCog, color: '#6b7280' },
  cfg:     { icon: FileCog, color: '#6b7280' },

  // Build & lockfiles
  lock:    { icon: FileLock, color: '#8b8b9e' },
  mod:     { icon: FileCode2, color: '#00add8' },
  sum:     { icon: FileText, color: '#00add8' },

  // Docs
  md:      { icon: FileText, color: '#519aba' },
  mdx:     { icon: FileText, color: '#519aba' },
  txt:     { icon: FileText, color: '#8b8b9e' },
  pdf:     { icon: FileText, color: '#ff4757' },
  doc:     { icon: FileText, color: '#2b579a' },
  docx:    { icon: FileText, color: '#2b579a' },
  rtf:     { icon: FileText, color: '#7B68EE' },

  // Images
  png:     { icon: FileImage, color: '#a07cc5' },
  jpg:     { icon: FileImage, color: '#a07cc5' },
  jpeg:    { icon: FileImage, color: '#a07cc5' },
  gif:     { icon: FileImage, color: '#a07cc5' },
  svg:     { icon: FileImage, color: '#ffb13b' },
  webp:    { icon: FileImage, color: '#a07cc5' },
  ico:     { icon: FileImage, color: '#a07cc5' },
  bmp:     { icon: FileImage, color: '#a07cc5' },
  tiff:    { icon: FileImage, color: '#a07cc5' },

  // Video
  mp4:     { icon: FileVideo, color: '#fd7e14' },
  webm:    { icon: FileVideo, color: '#fd7e14' },
  mov:     { icon: FileVideo, color: '#fd7e14' },
  avi:     { icon: FileVideo, color: '#fd7e14' },
  mkv:     { icon: FileVideo, color: '#fd7e14' },

  // Audio
  mp3:     { icon: FileAudio, color: '#e84393' },
  wav:     { icon: FileAudio, color: '#e84393' },
  ogg:     { icon: FileAudio, color: '#e84393' },
  flac:    { icon: FileAudio, color: '#e84393' },
  m4a:     { icon: FileAudio, color: '#e84393' },

  // Archives
  zip:     { icon: FileArchive, color: '#f59e0b' },
  tar:     { icon: FileArchive, color: '#f59e0b' },
  gz:      { icon: FileArchive, color: '#f59e0b' },
  rar:     { icon: FileArchive, color: '#f59e0b' },
  '7z':    { icon: FileArchive, color: '#f59e0b' },

  // Binary
  exe:     { icon: FileType, color: '#8b8b9e' },
  dll:     { icon: FileType, color: '#8b8b9e' },
  so:      { icon: FileType, color: '#8b8b9e' },
  dylib:   { icon: FileType, color: '#8b8b9e' },
  bin:     { icon: FileType, color: '#8b8b9e' },
  o:       { icon: FileType, color: '#8b8b9e' },
  a:       { icon: FileType, color: '#8b8b9e' },
  wasm:    { icon: FileType, color: '#8b8b9e' },

  // Database
  sqlite:  { icon: FileArchive, color: '#00a4c8' },
  db:      { icon: FileArchive, color: '#00a4c8' },
}

// Files matched by basename (no extension or special names)
const NAME_MAP: Record<string, FileIconConfig> = {
  'dockerfile':   { icon: FileCog, color: '#2496ed' },
  'makefile':     { icon: FileCog, color: '#6b7280' },
  'gemfile':      { icon: FileCog, color: '#cc342d' },
  '.gitignore':   { icon: FileText, color: '#f1502f' },
  '.gitattributes': { icon: FileText, color: '#f1502f' },
  '.env':         { icon: FileKey, color: '#fbbf24' },
  '.env.local':   { icon: FileKey, color: '#fbbf24' },
  '.env.example': { icon: FileKey, color: '#fbbf24' },
  'license':      { icon: FileText, color: '#8b8b9e' },
  'readme':       { icon: FileText, color: '#519aba' },
  'changemet':    { icon: FileText, color: '#8b8b9e' },
}

const DEFAULT_CONFIG: FileIconConfig = { icon: FileText, color: 'var(--text-dim)' }

/**
 * Get the icon config for a file based on its name/extension.
 */
export function getFileIconConfig(fileName: string): FileIconConfig {
  const lower = fileName.toLowerCase()

  // Check exact name match first (for special files like Dockerfile, .gitignore)
  if (NAME_MAP[lower]) return NAME_MAP[lower]

  // Extract extension
  const lastDot = lower.lastIndexOf('.')
  if (lastDot <= 0) return DEFAULT_CONFIG

  const ext = lower.slice(lastDot + 1)
  return EXT_MAP[ext] ?? DEFAULT_CONFIG
}

/**
 * Render a file-type icon. Size defaults to 13px to match the file tree.
 */
export function FileIcon({ name, size = 13 }: { name: string; size?: number }) {
  const config = getFileIconConfig(name)
  const Icon = config.icon
  return <Icon size={size} strokeWidth={1.5} style={{ color: config.color }} />
}
