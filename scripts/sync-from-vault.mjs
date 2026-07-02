#!/usr/bin/env node
// Copies only notes with `publish: true` in frontmatter from the Obsidian vault
// into content/, along with any local image/pdf assets they reference.
// Anything not explicitly flagged never leaves the vault.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..")
const CONTENT_DIR = path.join(REPO_ROOT, "content")
const MANIFEST_PATH = path.join(REPO_ROOT, ".sync-manifest.json")

const VAULT_ROOT = process.env.VAULT_ROOT || "/home/mkva/ObsidianVault/🧠 valvet"

const SKIP_DIRS = new Set([".obsidian", ".git", ".trash", ".quartz", "node_modules"])
const ASSET_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".pdf"])

const PUBLISH_RE = /^publish:\s*["']?true["']?\s*(#.*)?$/im
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function isPublished(mdContent) {
  const fm = mdContent.match(FRONTMATTER_RE)
  if (!fm) return false
  return PUBLISH_RE.test(fm[1])
}

function findAssetRefs(mdContent) {
  const refs = new Set()
  for (const m of mdContent.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) refs.add(m[1].trim())
  for (const m of mdContent.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const p = decodeURIComponent(m[1].split(/[?#]/)[0])
    if (!/^https?:\/\//.test(p)) refs.add(p)
  }
  return [...refs].filter((r) => ASSET_EXT.has(path.extname(r).toLowerCase()))
}

console.log(`Scanning vault: ${VAULT_ROOT}`)
const allFiles = walk(VAULT_ROOT)
const mdFiles = allFiles.filter((f) => f.endsWith(".md"))
const assetIndex = new Map()
for (const f of allFiles) {
  if (ASSET_EXT.has(path.extname(f).toLowerCase())) {
    assetIndex.set(path.basename(f), f)
  }
}

const newManifest = new Set()
let publishedCount = 0

for (const file of mdFiles) {
  const content = fs.readFileSync(file, "utf8")
  if (!isPublished(content)) continue
  publishedCount++

  const rel = path.relative(VAULT_ROOT, file)
  const dest = path.join(CONTENT_DIR, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(file, dest)
  newManifest.add(rel)
  console.log(`  + ${rel}`)

  for (const ref of findAssetRefs(content)) {
    const assetName = path.basename(ref)
    const srcAsset = assetIndex.get(assetName)
    if (!srcAsset) {
      console.warn(`    ! asset not found in vault, skipping: ${ref}`)
      continue
    }
    const assetRel = path.relative(VAULT_ROOT, srcAsset)
    const assetDest = path.join(CONTENT_DIR, assetRel)
    fs.mkdirSync(path.dirname(assetDest), { recursive: true })
    fs.copyFileSync(srcAsset, assetDest)
    newManifest.add(assetRel)
  }
}

// Remove files that were synced before but are no longer published (or no longer referenced)
let oldManifest = []
if (fs.existsSync(MANIFEST_PATH)) {
  oldManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"))
}
for (const rel of oldManifest) {
  if (!newManifest.has(rel)) {
    const stale = path.join(CONTENT_DIR, rel)
    if (fs.existsSync(stale)) {
      fs.rmSync(stale)
      console.log(`  - ${rel} (unpublished)`)
    }
  }
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify([...newManifest], null, 2))
console.log(`\nDone. ${publishedCount} published note(s) synced into content/.`)
