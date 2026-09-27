'use strict'

/**
 * dsh-plugin-dsh-sync — protocol-agnostic backup-tree helpers.
 *
 * Shared by the webdav / local-folder backup protocols. The git protocol
 * keeps its own shadow-repo machinery; these helpers only deal with staging
 * trees: enumerate files, hash them, plan an incremental upload against a
 * sha1 manifest, and mirror a directory into a local target via tmp-swap.
 * Keeping them dependency-free and side-effect-light makes them directly
 * unit-testable (test/backup-protocols.test.mjs).
 */

const { createHash, randomUUID } = require('node:crypto')
const fsP = require('node:fs/promises')
const { join, sep } = require('node:path')

/** Recursively list files under dir → [{ rel, abs, size }] (posix-style rel).
 *  Missing dir → []. Symlinks are not followed (staging trees are plain
 *  files — copyTree already dereferenced them). */
async function walkFiles(dir, baseDir = dir, out = []) {
  let entries = []
  try { entries = await fsP.readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const ent of entries) {
    const abs = join(dir, ent.name)
    if (ent.isDirectory()) {
      await walkFiles(abs, baseDir, out)
    } else if (ent.isFile()) {
      let size = 0
      try { size = (await fsP.stat(abs)).size } catch { continue }
      out.push({ rel: abs.slice(baseDir.length + 1).split(sep).join('/'), abs, size })
    }
  }
  return out
}

async function sha1File(abs) {
  const hash = createHash('sha1')
  await new Promise((fulfil, reject) => {
    const stream = require('node:fs').createReadStream(abs)
    stream.on('data', (c) => hash.update(c))
    stream.on('end', fulfil)
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

/** Hash every staged file (sequential reads; local disk is not the bottleneck
 *  even for five-digit file counts). */
async function hashTree(files) {
  const out = new Map()
  for (const f of files) out.set(f.rel, await sha1File(f.abs))
  return out
}

/** Pure plan: given staged files (+hashes) and the last-upload manifest,
 *  decide uploads / deletes / unchanged. `force` re-uploads everything.
 *  Deletes are manifest entries absent from the staged tree — the backup
 *  target mirrors live, deletions included (same semantics as the git
 *  backup strategy's snapshot overlay). */
function planTreeSync(files, hashes, manifest, { force = false } = {}) {
  const uploads = [], unchanged = []
  const present = new Set(files.map(f => f.rel))
  for (const f of files) {
    const known = manifest[f.rel]
    if (!force && known && known === hashes.get(f.rel)) unchanged.push(f.rel)
    else uploads.push(f.rel)
  }
  const deletes = Object.keys(manifest).filter(rel => !present.has(rel))
  return { uploads, deletes, unchanged }
}

/** Recursively copy srcDir → destDir (plain fs walk; exists for the tmp-swap
 *  mirror below — index.js's copyTree carries include/exclude options this
 *  path never needs). Returns the copied file count. */
async function copyDir(srcDir, destDir) {
  await fsP.mkdir(destDir, { recursive: true })
  let count = 0
  let entries = []
  try { entries = await fsP.readdir(srcDir, { withFileTypes: true }) } catch { return 0 }
  for (const ent of entries) {
    const from = join(srcDir, ent.name), to = join(destDir, ent.name)
    if (ent.isDirectory()) count += await copyDir(from, to)
    else if (ent.isFile()) { await fsP.copyFile(from, to); count++ }
  }
  return count
}

/** Mirror srcDir into destDir with delete-propagation via tmp-swap: copy to a
 *  sibling temp dir, rm the old target, rename. The rename is atomic on the
 *  same volume, so the target is either the old tree or the complete new one
 *  — a crash mid-copy never leaves a half-written backup. A missing source
 *  is an error, not an empty mirror. */
async function localMirrorSwap(srcDir, destDir) {
  await fsP.access(srcDir)
  await fsP.mkdir(join(destDir, '..'), { recursive: true })
  const tmp = destDir + '.tmp-' + randomUUID().slice(0, 8)
  try {
    const count = await copyDir(srcDir, tmp)
    await fsP.rm(destDir, { recursive: true, force: true })
    await fsP.rename(tmp, destDir)
    return { ok: true, count }
  } catch (e) {
    await fsP.rm(tmp, { recursive: true, force: true }).catch(() => {})
    throw e
  }
}

module.exports = { walkFiles, sha1File, hashTree, planTreeSync, copyDir, localMirrorSwap }
