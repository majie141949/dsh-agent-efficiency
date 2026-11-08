import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { ToolExecution, ToolExecutionResult, ToolExecutionSuccess } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { createRuntime } from '../config/runtime.js'
import { beforeStep, observeResult } from './feedback.js'

function fixture() {
  const runtime = createRuntime()
  const agent = {} as Agent
  const controller = new AbortController()
  const accept = async (): Promise<PreStepDecision> => ({ kind: 'enter', messages: [], startsRequestSeries: true })
  const step = (turn = 1, next = accept, target = agent) => beforeStep(runtime, {
    agent: target,
    turn,
    step: 1,
    messages: [],
    signal: controller.signal,
  }, next)
  const result = (name: string, args: unknown, error?: string, target = agent, value: ToolExecutionSuccess['value'] = { ok: true }) => {
    const execution = { name, arguments: args, agent: target, signal: controller.signal } as ToolExecution
    const output: ToolExecutionResult = error
      ? { isError: true, error: { message: error }, content: [{ type: 'text', text: error }] }
      : { isError: false, value, content: [{ type: 'text', text: JSON.stringify(value) }] }
    const original = structuredClone(output)
    observeResult(runtime, execution, output)
    expect(output).toEqual(original)
  }
  const repeat = () => {
    result('read', { file_path: 'src/a.ts', offset: 1 })
    result('read', { offset: 1, file_path: 'src/a.ts' })
  }
  return { agent, controller, runtime, step, result, repeat }
}

describe('执行效率反馈', () => {
  it('读取相同范围但内容已经变化时不提示重复读取', async () => {
    const f = fixture()
    await f.step()
    f.result('read', { file_path: 'a' }, undefined, f.agent, { lines: ['old'] })
    f.result('read', { file_path: 'a' }, undefined, f.agent, { lines: ['changed externally'] })
    expect(await f.step()).toMatchObject({ messages: [] })
  })

  it('重复读取后发生写入时清除本批次尚未发送的读取提醒', async () => {
    const f = fixture()
    await f.step()
    f.repeat()
    f.result('write', { file_path: 'src/a.ts', content: 'changed' })
    expect(await f.step()).toMatchObject({ messages: [] })
  })

  it('同一文件替换已成功时清除过期修复提醒', async () => {
    const f = fixture()
    await f.step()
    f.result('edit', { file_path: 'a' }, 'old_string not found')
    f.result('edit', { file_path: 'a' })
    expect(await f.step()).toMatchObject({ messages: [] })
  })

  it('其他文件替换成功时保留未解决文件的修复提醒', async () => {
    const f = fixture()
    await f.step()
    f.result('edit', { file_path: 'a' }, 'old_string not found')
    f.result('edit', { file_path: 'b' })
    expect(await f.step()).toMatchObject({ messages: [expect.any(Object)] })
  })

  it('权限和返回值校验错误不被误判为脚本语法错误', async () => {
    const f = fixture()
    await f.step()
    f.result('run_code', {}, 'Expected approval before execution')
    f.result('run_code', {}, 'Could not parse tool response')
    expect(await f.step()).toMatchObject({ messages: [] })
  })

  it('已经读过的已有文件首次大段写入也提示局部修改', async () => {
    const f = fixture()
    await f.step()
    f.result('read', { file_path: 'a' }, undefined, f.agent, { lines: ['existing'] })
    f.result('write', { file_path: 'a', content: 'x'.repeat(12000) })
    expect(await f.step()).toMatchObject({ messages: [{ content: [{ text: expect.stringContaining('局部编辑') }] }] })
  })

  it('相同读取只提醒一次，保留已有消息和请求边界', async () => {
    const f = fixture()
    await f.step()
    f.repeat()
    const original = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '继续修复' }] })
    const decision = await f.step(1, async () => ({ kind: 'enter', messages: [original], startsRequestSeries: true }))
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter')
      throw new Error('step rejected')
    expect(decision.startsRequestSeries).toBe(true)
    expect(decision.messages).toHaveLength(2)
    expect(decision.messages[0]).toEqual(original)
    expect(decision.messages[1].source).toMatchObject({ kind: 'agent-efficiency', form: 'notice' })
    expect(decision.messages[1].content).toEqual([expect.objectContaining({ text: expect.stringContaining('重复读取') })])
    f.repeat()
    expect(await f.step()).toEqual({ kind: 'enter', messages: [], startsRequestSeries: true })
  })

  it('写入或外部命令后允许重新读取，成功的 PTC 外层不会丢失读记录', async () => {
    const f = fixture()
    await f.step()
    f.result('read', { file_path: 'a' })
    f.result('bash', { command: 'generate a' })
    f.result('read', { file_path: 'a' })
    expect(await f.step()).toMatchObject({ messages: [] })
    f.result('write', { file_path: 'a', content: 'changed' })
    f.result('read', { file_path: 'a' })
    expect(await f.step()).toMatchObject({ messages: [] })
    f.result('run_code', { code: 'await read(a)' })
    f.result('read', { file_path: 'a' })
    expect(await f.step()).toMatchObject({ messages: [expect.any(Object)] })
  })

  it('只针对已知返工错误给出反馈，不改变失败结果', async () => {
    const f = fixture()
    await f.step()
    f.result('bash', {}, 'permission denied')
    f.result('run_code', {}, 'network timeout')
    expect(await f.step()).toMatchObject({ messages: [] })
    f.result('run_code', {}, 'Expected \'>\', got \'class\'')
    f.result('edit', {}, 'old_string not found')
    const decision = await f.step()
    expect(decision).toMatchObject({ messages: [{ content: [{ text: expect.stringContaining('语法错误') }] }] })
    expect(decision).toMatchObject({ messages: [{ content: [{ text: expect.stringContaining('替换没有匹配成功') }] }] })
  })

  it('正常新建和小文件重写不提醒，同一大文件再次写入才提醒', async () => {
    const f = fixture()
    await f.step()
    f.result('write', { file_path: 'a', content: 'x'.repeat(12000) })
    f.result('write', { file_path: 'b', content: 'x'.repeat(12000) })
    f.result('write', { file_path: 'a', content: 'x'.repeat(11999) })
    expect(await f.step()).toMatchObject({ messages: [] })
    f.result('write', { file_path: 'a', content: 'x'.repeat(12000) })
    expect(await f.step()).toMatchObject({ messages: [{ content: [{ text: expect.stringContaining('局部编辑') }] }] })
  })

  it('每轮最多两次反馈，新用户轮次重新计数', async () => {
    const f = fixture()
    await f.step()
    f.repeat()
    expect(await f.step()).toMatchObject({ messages: [expect.any(Object)] })
    f.result('edit', {}, 'old_string not found')
    expect(await f.step()).toMatchObject({ messages: [expect.any(Object)] })
    f.result('run_code', {}, 'SyntaxError')
    expect(await f.step()).toMatchObject({ messages: [] })
    await f.step(2)
    f.repeat()
    expect(await f.step(2)).toMatchObject({ messages: [expect.any(Object)] })
  })

  it('相同检查重复成功时提醒复用，检查描述变化不影响识别', async () => {
    const f = fixture()
    await f.step()
    const value = { kind: 'foreground', exitCode: 0 }
    f.result('bash', { command: 'node --test checks.test.mjs', description: 'verify' }, undefined, f.agent, value)
    f.result('run_code', {})
    f.result('bash', { command: 'node --test checks.test.mjs', description: 'check again' }, undefined, f.agent, value)
    expect(await f.step()).toMatchObject({ messages: [{ content: [{ text: expect.stringContaining('同一检查已再次通过') }] }] })
  })

  it.each(['write', 'edit', 'bash'])('检查之间发生 %s 修改或未知命令时允许重跑', async (name) => {
    const f = fixture()
    await f.step()
    const value = { kind: 'foreground', exitCode: 0 }
    f.result('bash', { command: 'npm test' }, undefined, f.agent, value)
    f.result(name, { file_path: 'a', content: 'new', command: 'node generate.mjs' })
    f.result('bash', { command: 'npm test' }, undefined, f.agent, value)
    expect(await f.step()).toMatchObject({ messages: [] })
  })

  it('重新读取发现外部变化时使旧检查结论失效', async () => {
    const f = fixture()
    await f.step()
    const value = { kind: 'foreground', exitCode: 0 }
    f.result('read', { file_path: 'a' }, undefined, f.agent, { text: 'old' })
    f.result('bash', { command: 'npm test' }, undefined, f.agent, value)
    f.result('read', { file_path: 'a' }, undefined, f.agent, { text: 'new' })
    f.result('bash', { command: 'npm test' }, undefined, f.agent, value)
    expect(await f.step()).toMatchObject({ messages: [] })
  })

  it.each([
    [{ command: 'npm test' }, { kind: 'foreground', exitCode: 1 }],
    [{ command: 'npm test' }, { kind: 'foreground', exitCode: null }],
    [{ command: 'npm test', run_in_background: true }, { kind: 'background', jobId: 'job' }],
    [{ command: 'npm test && node change.mjs' }, { kind: 'foreground', exitCode: 0 }],
  ])('失败、后台或复合命令不计入可复用检查：%j', async (args, value) => {
    const f = fixture()
    await f.step()
    f.result('bash', args, undefined, f.agent, value)
    f.result('bash', args, undefined, f.agent, value)
    expect(await f.step()).toMatchObject({ messages: [] })
  })

  it('已经排队的重复检查提醒在新修改后失效', async () => {
    const f = fixture()
    await f.step()
    const value = { kind: 'foreground', exitCode: 0 }
    f.result('bash', { command: 'pnpm vitest run' }, undefined, f.agent, value)
    f.result('bash', { command: 'pnpm vitest run' }, undefined, f.agent, value)
    f.result('edit', { file_path: 'a' })
    expect(await f.step()).toMatchObject({ messages: [] })
  })

  it('局部编辑失败后成功执行外层脚本仍保留未解决的局部编辑提醒', async () => {
    const f = fixture()
    await f.step()
    f.result('edit', { file_path: 'a' }, 'old_string not found')
    f.result('run_code', {})
    expect(await f.step()).toMatchObject({ messages: [expect.any(Object)] })
  })

  it('拒绝的步骤不消耗反馈，取消后不注入反馈', async () => {
    const f = fixture()
    await f.step()
    f.repeat()
    expect(await f.step(1, async () => ({ kind: 'reject' }))).toEqual({ kind: 'reject' })
    expect(await f.step()).toMatchObject({ messages: [expect.any(Object)] })
    f.result('edit', {}, 'old_string not found')
    f.controller.abort()
    expect(await f.step()).toMatchObject({ messages: [] })
  })

  it('不同 Agent 和插件实例之间不共享反馈', async () => {
    const f = fixture()
    const other = {} as Agent
    await f.step()
    await f.step(1, undefined, other)
    f.repeat()
    expect(await f.step(1, undefined, other)).toMatchObject({ messages: [] })
    const second = fixture()
    await second.step(1, undefined, f.agent)
    expect(await second.step(1, undefined, f.agent)).toMatchObject({ messages: [] })
    expect(await f.step()).toMatchObject({ messages: [expect.any(Object)] })
  })
})
