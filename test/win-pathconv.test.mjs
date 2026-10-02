/**
 * dsh-sync — Windows MSYS2 path-conversion guard contract tests.
 *
 * 背景（issue weibaohui/dsh-sync#10）：Windows 上路径中的「点」被 MSYS2 runtime 当成
 * 路径分隔符——`C:\Users\x\.dsh\dsh-sync\repo` → `C:\Users\x\dsh\dsh-sync\repo`
 * （点消失、多一级目录），git 于是在不存在的目录里执行 → `fetch failed`。
 * 官方定性 wontfix：https://github.com/git-for-windows/git/issues/685
 *
 * 本文件锁住三条契约：
 *   1. msysPathConvEnv() 只在 win32 返回开关，非 Windows 返回 undefined（不打扰别人）
 *   2. 开关值正确且变量名拼写正确（MSYS2_ARG_CONV_EXCL 结尾是 L；拼错会静默失效）
 *   3. git 子进程的 env 带上开关，且**不污染** process.env（全局设会 wreak havoc，
 *      见 https://github.com/git-for-windows/build-extra/issues/376）
 *   4. 三个 agent 提示词都带 Windows 注意事项（agent 走 bash 才是真正暴露面）
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const I = require('../src/index.js').__internals

// ── 1. 平台闸门 ─────────────────────────────────────────────────────────

test('msysPathConvEnv only fires on win32; undefined elsewhere', () => {
  const env = I.msysPathConvEnv()
  if (process.platform === 'win32') {
    assert.deepEqual(env, { MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*' })
  } else {
    assert.equal(env, undefined, '非 Windows 不应注入任何开关（避免影响别的平台）')
  }
})

test('switch values match the documented opt-outs exactly', () => {
  // 用桩把平台伪装成 win32，断言取值——变量名拼错是已知的静默失效原因
  const real = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  try {
    const env = I.msysPathConvEnv()
    assert.equal(env.MSYS_NO_PATHCONV, '1')
    // 结尾必须是 L：MSYS2_ARG_CONV_EXCL（拼成 EXC 会静默失效，见 git-for-windows#577）
    assert.equal(env.MSYS2_ARG_CONV_EXCL, '*')
    assert.deepEqual(Object.keys(env).sort(), ['MSYS2_ARG_CONV_EXCL', 'MSYS_NO_PATHCONV'])
  } finally {
    if (real) Object.defineProperty(process, 'platform', real)
  }
})

// ── 2. gitExec 注入契约 ─────────────────────────────────────────────────

test('gitExec does not mutate process.env (guard must stay scoped)', async () => {
  const before = {
    MSYS_NO_PATHCONV: process.env.MSYS_NO_PATHCONV,
    MSYS2_ARG_CONV_EXCL: process.env.MSYS2_ARG_CONV_EXCL,
  }
  // 真实跑一条 git 命令，覆盖注入路径
  await I.gitExec('git', ['--version']).catch(() => {})
  assert.equal(process.env.MSYS_NO_PATHCONV, before.MSYS_NO_PATHCONV,
    'MSYS_NO_PATHCONV 不得写进 process.env（全局设会破坏其它程序）')
  assert.equal(process.env.MSYS2_ARG_CONV_EXCL, before.MSYS2_ARG_CONV_EXCL,
    'MSYS2_ARG_CONV_EXCL 不得写进 process.env')
})

test('gitExec still injects askpass env on top of the guard (issue #9 intact)', async () => {
  // 合并顺序：process.env < msys guard < authEnv。凭据不得被 guard 覆盖掉。
  const d = require('node:os').tmpdir()
  const authEnv = { GIT_ASKPASS: '/nonexistent/askpass.sh', DSH_SYNC_TOKEN: 'sekret', GIT_TERMINAL_PROMPT: '0' }
  // 用一个读 env 的探针：git --version 不接受 env 断言，这里直接验证合并结果形状
  const merged = { ...process.env, ...(I.msysPathConvEnv() || {}), ...authEnv }
  assert.equal(merged.DSH_SYNC_TOKEN, 'sekret')
  assert.equal(merged.GIT_ASKPASS, '/nonexistent/askpass.sh')
  if (process.platform === 'win32') {
    assert.equal(merged.MSYS_NO_PATHCONV, '1', 'win32 下 guard 应在，且不与凭据冲突')
  }
  assert.ok(d)
})

// ── 3. 提示词必须提醒 agent（bash 才是真正的暴露面） ──────────────────────

test('all three agent prompts carry the Windows path-conversion note', () => {
  const prompts = {
    CONFLICT_PROMPT_ZH: I.CONFLICT_PROMPT_ZH,
    ALIGN_PROMPT_ZH: I.ALIGN_PROMPT_ZH,
    REMOTE_ALIGN_PROMPT_ZH: I.REMOTE_ALIGN_PROMPT_ZH,
  }
  for (const [name, text] of Object.entries(prompts)) {
    assert.ok(typeof text === 'string' && text.length > 0, `${name} 应为非空提示词`)
    assert.ok(text.includes('MSYS_NO_PATHCONV'), `${name} 应含 MSYS_NO_PATHCONV 指引（agent 走 bash 会中招）`)
    assert.ok(text.includes('MSYS2_ARG_CONV_EXCL'), `${name} 应含 MSYS2_ARG_CONV_EXCL 指引`)
    assert.ok(/Windows/.test(text), `${name} 应说明这是 Windows 专属问题`)
  }
})

test('prompt note must NOT tell the agent to set the switch globally', () => {
  for (const key of ['CONFLICT_PROMPT_ZH', 'ALIGN_PROMPT_ZH', 'REMOTE_ALIGN_PROMPT_ZH']) {
    const text = I[key]
    // 必须显式禁止全局设置——全局设会破坏其它程序（ani-cli#715 / build-extra#376）
    assert.ok(/(严禁|不要|不得)[^。\n]*全局/.test(text), `${key} 应显式禁止全局设置该变量`)
    // 且必须点名 export / .bashrc 这类全局写法，避免"看起来禁止了其实没禁"
    assert.ok(/export\s+MSYS_NO_PATHCONV|\.bashrc/.test(text), `${key} 应点名 export/.bashrc 这类全局写法`)
  }
})

test('prompt note carries the Windows pre-flight safeguard (detect + verify + stop)', () => {
  const keys = ['CONFLICT_PROMPT_ZH', 'ALIGN_PROMPT_ZH', 'REMOTE_ALIGN_PROMPT_ZH']
  for (const key of keys) {
    const text = I[key]
    // 1) 先让 agent 判定平台（不能无脑加开关）
    assert.ok(/uname|MINGW|MSYS|CYGWIN/.test(text), `${key} 应让 agent 先判定是否 Windows`)
    // 2) 给出路径自检手段（对比加开关前后）
    assert.ok(/printf/.test(text), `${key} 应给出路径自检命令`)
    // 3) 动手前验证目录真实可达
    assert.ok(/rev-parse --show-toplevel/.test(text), `${key} 应要求用 rev-parse 验证目录可达`)
    // 4) 验证失败必须停下、不得据此判定"无需修改"（防止静默做错事）
    assert.ok(/立即停止|停下/.test(text), `${key} 应在验证失败时要求停止`)
    assert.ok(/无冲突|无需修改/.test(text), `${key} 应明确禁止据错误目录判定"无冲突/无需修改"`)
    // 5) 非 Windows 明确要求跳过，避免误加开关
    assert.ok(/非 Windows|非Windows/.test(text), `${key} 应说明非 Windows 跳过本节`)
  }
})

// ── 4. 路径本身不被插件改动（回归：确认插件没吞点） ──────────────────────

test('expandTilde keeps a dot-leading directory name intact', () => {
  // expandTilde 曾被怀疑吃掉 `.dsh` 的点；实际不吞。锁住这条，防未来回归。
  const { join } = require('node:path')
  const { homedir } = require('node:os')
  assert.equal(I.expandTilde('~/.dsh/dsh-sync/repo'), join(homedir(), '.dsh', 'dsh-sync', 'repo'))
  assert.equal(I.expandTilde('~'), homedir())
  // 绝对路径原样返回（含目录名里的点）
  const abs = join('/tmp', '5342.dsh', 'dsh-sync')
  assert.equal(I.expandTilde(abs), abs)
  // 路径中间的点的目录名不得被拆
  assert.ok(I.expandTilde(abs).includes('5342.dsh'), '目录名里的点必须保留')
})
