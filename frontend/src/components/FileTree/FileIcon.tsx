import {
  FileCode2, FileJson2, FileText, FileType2, FileImage, FileVideo,
  FileAudio, FileArchive, FileTerminal, FileCog, FileKey, FileLock,
  Braces, FileSpreadsheet, Settings, Shield, BookOpen, Box, Package,
  type LucideProps,
} from 'lucide-react'

/**
 * File-type icon resolver — maps file extensions to distinct icons.
 *
 * Single-color (monochrome) design matching VS Code's Seti icon theme:
 * all icons use --text-dim, relying on SHAPE to distinguish file types.
 * Icon shapes are varied enough for instant visual recognition without
 * the noise of per-language brand colors.
 */

type IconComponent = React.ComponentType<LucideProps>

// Extension → icon mapping. Keys are lowercase extensions without dot.
const EXT_MAP: Record<string, IconComponent> = {
  // Programming languages → FileCode2
  go: FileCode2, rs: FileCode2, ts: FileCode2, tsx: FileCode2,
  js: FileCode2, jsx: FileCode2, mjs: FileCode2, cjs: FileCode2,
  py: FileCode2, java: FileCode2, kt: FileCode2, swift: FileCode2,
  c: FileCode2, cpp: FileCode2, cc: FileCode2, h: FileCode2, hpp: FileCode2,
  cs: FileCode2, rb: FileCode2, php: FileCode2, dart: FileCode2, lua: FileCode2,
  scala: FileCode2, clj: FileCode2, ex: FileCode2, exs: FileCode2,
  elm: FileCode2, hs: FileCode2, ml: FileCode2, nim: FileCode2,
  zig: FileCode2, v: FileCode2, pl: FileCode2, r: FileCode2, jl: FileCode2,

  // Shell / scripts → FileTerminal
  sh: FileTerminal, bash: FileTerminal, zsh: FileTerminal, fish: FileTerminal,
  ps1: FileTerminal, bat: FileTerminal, cmd: FileTerminal,

  // Web markup → FileCode2 (distinct from above by shape? no — keep consistent)
  html: FileCode2, htm: FileCode2, css: FileCode2, scss: FileCode2,
  sass: FileCode2, less: FileCode2, vue: FileCode2, svelte: FileCode2,

  // Structured data → FileJson2 / Braces
  json: FileJson2, jsonc: FileJson2, json5: FileJson2,
  yaml: FileText, yml: FileText, toml: FileText,
  xml: FileText, csv: FileSpreadsheet, tsv: FileSpreadsheet,

  // Config → FileCog / Settings
  ini: FileCog, conf: FileCog, cfg: FileCog, properties: FileCog,
  editorconfig: Settings, prettierrc: Settings, eslintrc: Settings,

  // Env / secrets → FileKey
  env: FileKey,

  // Lock files → FileLock
  lock: FileLock, lockb: FileLock,

  // Build files
  mod: FileCode2, sum: FileText, makefile: FileCog,

  // Docs → FileText / BookOpen
  md: FileText, mdx: FileText, txt: FileText, rtf: FileText,
  pdf: FileText, doc: FileText, docx: FileText,
  rst: BookOpen, org: BookOpen, tex: FileText,

  // Images → FileImage
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage,
  svg: FileImage, webp: FileImage, ico: FileImage, bmp: FileImage,
  tiff: FileImage, tif: FileImage, avif: FileImage, heic: FileImage,

  // Video → FileVideo
  mp4: FileVideo, webm: FileVideo, mov: FileVideo, avi: FileVideo,
  mkv: FileVideo, flv: FileVideo, wmv: FileVideo, m4v: FileVideo,

  // Audio → FileAudio
  mp3: FileAudio, wav: FileAudio, ogg: FileAudio, flac: FileAudio,
  m4a: FileAudio, aac: FileAudio, opus: FileAudio, wma: FileAudio,

  // Archives → FileArchive / Package
  zip: FileArchive, tar: FileArchive, gz: FileArchive, tgz: FileArchive,
  rar: FileArchive, '7z': FileArchive, bz2: FileArchive, xz: FileArchive,
  deb: Package, rpm: Package, dmg: Package, pkg: Package, msi: Package,

  // Binary → FileType2
  exe: FileType2, dll: FileType2, so: FileType2, dylib: FileType2,
  bin: FileType2, o: FileType2, a: FileType2, wasm: FileType2,
  class: FileType2, jar: FileType2, pyc: FileType2,

  // Database → Box
  sqlite: Box, db: Box, sql: FileCode2,

  // Certificates → Shield
  pem: Shield, crt: Shield, key: FileKey, pub: FileKey,
  cer: Shield, der: Shield, p12: Shield, pfx: Shield,

  // Misc code-adjacent
  graphql: Braces, gql: Braces, proto: FileCode2, thrift: FileCode2,
  dockerfile: FileCog, dockerignore: FileText,
  gitignore: FileText, gitattributes: FileText, gitmodules: FileText,
  npmrc: Settings, nvmrc: Settings, nodeversion: Settings,
  license: FileText, copying: FileText,
}

// Special filenames (no extension or special meaning)
const NAME_MAP: Record<string, IconComponent> = {
  dockerfile: FileCog,
  makefile: FileCog,
  gemfile: FileCog,
  rakefile: FileCog,
  '.gitignore': FileText,
  '.gitattributes': FileText,
  '.env': FileKey,
  '.env.local': FileKey,
  '.env.example': FileKey,
  '.env.production': FileKey,
  'license': FileText,
  'readme': FileText,
  'changelog': FileText,
  'package.json': FileJson2,
  'package-lock.json': FileLock,
  'tsconfig.json': Settings,
  'go.mod': FileCode2,
  'go.sum': FileText,
  'cargo.toml': Package,
  'cargo.lock': FileLock,
  'docker-compose.yml': FileCog,
  'docker-compose.yaml': FileCog,
  '.dockerignore': FileText,
  'taskfile.yml': FileCog,
  'webpack.config.js': Settings,
  'vite.config.ts': Settings,
  'rollup.config.js': Settings,
  '.prettierrc': Settings,
  '.eslintrc': Settings,
  '.editorconfig': Settings,
  'gemfile.lock': FileLock,
}

const DEFAULT_ICON: IconComponent = FileText

/**
 * Resolve the icon component for a file based on its name/extension.
 */
export function getFileIcon(fileName: string): IconComponent {
  const lower = fileName.toLowerCase()

  // Check exact name match first
  if (NAME_MAP[lower]) return NAME_MAP[lower]

  // Extract extension
  const lastDot = lower.lastIndexOf('.')
  if (lastDot <= 0) return DEFAULT_ICON

  const ext = lower.slice(lastDot + 1)
  return EXT_MAP[ext] ?? DEFAULT_ICON
}

/**
 * Render a file-type icon. Monochrome — uses currentColor for theming.
 * Size defaults to 13px to match the file tree.
 */
export function FileIcon({ name, size = 13, className }: { name: string; size?: number; className?: string }) {
  const Icon = getFileIcon(name)
  return <Icon size={size} strokeWidth={1.5} className={className} />
}
