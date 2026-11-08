import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const benchmarkHome = process.env.DSH_BENCH_HOME
const cli = process.env.DSH_BENCH_DSH_BIN
const providerPatch = process.env.DSH_BENCH_PROVIDER_PATCH
const pluginPackage = process.env.DSH_BENCH_PLUGIN_PACKAGE || packageRoot
assert(benchmarkHome && cli && providerPatch, 'Set DSH_BENCH_HOME, DSH_BENCH_DSH_BIN and DSH_BENCH_PROVIDER_PATCH; use an isolated home')
const home = resolve(benchmarkHome)
const userHome = join(homedir(), '.dsh')
assert(home !== userHome && !home.startsWith(`${userHome}${sep}`), 'Benchmark output must be outside the user Harness home')
await mkdir(home, { recursive: true })
const outputRoot = await mkdtemp(join(home, 'runs-'))
const { version } = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const fixture = join(packageRoot, 'fixtures/cart')
const task = '请修复这个目录中的购物车工具，满足 README.md 中所有要求，完成验证后简短报告结果。'
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex')

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    let forceStop
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      forceStop = setTimeout(() => child.kill('SIGKILL'), 5000)
    }, 180000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      clearTimeout(forceStop)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timeout)
      clearTimeout(forceStop)
      resolveRun({ code, signal, stdout, stderr })
    })
  })
}

async function validate(cwd) {
  for (const file of ['README.md', 'checks.test.mjs']) {
    assert.equal(await digest(join(cwd, file)), await digest(join(fixture, file)), `${file} was changed`)
  }
  const checks = await run(process.execPath, ['--test', 'checks.test.mjs'], { cwd })
  assert.equal(checks.code, 0, checks.stdout + checks.stderr)
  const { total } = await import(pathToFileURL(join(cwd, 'total.mjs')).href)
  const { paginate } = await import(pathToFileURL(join(cwd, 'paginate.mjs')).href)
  const { slug } = await import(pathToFileURL(join(cwd, 'slug.mjs')).href)
  assert.equal(total([{ price: 257, quantity: 2 }, { price: 1, quantity: 0 }], 10), 463)
  assert.equal(total([{ price: 100, quantity: 3 }], 100), 0)
  const input = ['a', 'b', 'c']
  assert.deepEqual(paginate(input, 2, 2), ['c'])
  assert.deepEqual(input, ['a', 'b', 'c'])
  assert.throws(() => paginate(input, 1, Infinity), RangeError)
  assert.equal(slug('  One\t\n Two  '), 'one-two')
  return { visibleTests: 12, independentChecks: 6 }
}

const results = []
for (const [index, enabled] of [false, true, true, false].entries()) {
  const label = `${index + 1}-${enabled ? 'on' : 'off'}`
  const cwd = join(outputRoot, label)
  await cp(fixture, cwd, { recursive: true })
  const patch = join(outputRoot, `${label}.yml`)
  await writeFile(patch, `- id: agent-efficiency\n  config:\n    enabled: ${enabled}\n    runtimeFeedback: true\n`)
  const options = { cwd, env: { ...process.env, DSH_HOME: join(outputRoot, `${label}-home`), DSH_TOOLS_MODE: 'ptc', DSH_PERMISSION_MODE: 'workspace-write' } }
  let result = { code: null, signal: null, stdout: '', stderr: '' }
  let elapsedMs = null
  let stage = 'install'
  let events = []
  let verification
  try {
    process.stdout.write(`Installing ${label}\n`)
    const installation = await run(process.execPath, [cli, 'plugin', '--profile', 'headless', 'add', pluginPackage], options)
    await writeFile(join(outputRoot, `${label}.install.log`), installation.stdout + installation.stderr)
    assert.equal(installation.code, 0, `Plugin installation failed: ${installation.stderr.slice(-2000)}`)
    stage = 'preflight'
    const inspection = await run(process.execPath, [cli, '--profile', 'headless', '--patch', providerPatch, '--patch', patch, '--dump-config-schema'], options)
    assert.equal(inspection.code, 0, `Plugin inspection failed: ${inspection.stderr.slice(-2000)}`)
    const schema = JSON.parse(inspection.stdout)
    const entry = schema['x-cordis']?.entries?.find(item => item.id === 'agent-efficiency')
    assert.equal(entry?.name, 'dsh-agent-efficiency', 'Installed plugin entry is missing')
    assert.equal(entry.status, 'schema', 'Installed plugin could not be imported')
    stage = 'run'
    process.stdout.write(`Starting ${label}\n`)
    const start = performance.now()
    result = await run(process.execPath, [cli, '--profile', 'headless', '--patch', providerPatch, '--patch', patch, '--json', task], options)
    elapsedMs = Math.round(performance.now() - start)
    await writeFile(join(outputRoot, `${label}.jsonl`), result.stdout)
    await writeFile(join(outputRoot, `${label}.stderr`), result.stderr)
    assert.equal(result.code, 0, `Harness exited ${result.code} (${result.signal}): ${result.stderr.slice(-2000)}`)
    assert(!/entries did not activate|failed to import|waiting for service:/i.test(result.stderr), `Harness plugins did not activate: ${result.stderr.slice(-2000)}`)
    events = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    assert(events.some(event => event.type === 'final'), 'Harness did not produce a final event')
    stage = 'verify'
    verification = { passed: true, ...await validate(cwd) }
  }
  catch (error) {
    verification = { passed: false, stage, error: error.message }
  }
  const row = {
    label,
    enabled,
    elapsedMs,
    exitCode: result.code,
    verification,
    toolCalls: events.filter(event => event.type === 'tool_call').length,
    toolErrors: events.filter(event => event.type === 'tool_result' && event.status !== 'completed').length,
    eventTypes: [...new Set(events.map(event => event.type))],
  }
  results.push(row)
  await writeFile(join(outputRoot, 'results.json'), JSON.stringify({ version, task, order: 'ABBA', results }, null, 2))
  process.stdout.write(`${JSON.stringify(row)}\n`)
  if (result.code !== 0)
    break
}
process.stdout.write(`Results: ${join(outputRoot, 'results.json')}\n`)
if (results.length !== 4 || results.some(row => !row.verification.passed))
  process.exitCode = 1
