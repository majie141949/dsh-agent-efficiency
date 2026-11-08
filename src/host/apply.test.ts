import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { expect, it } from 'vitest'
import * as plugin from './apply.js'

it('真实宿主中启用增加规则和反馈，关闭或卸载后恢复原有行为', async () => {
  const ctx = new Context()
  const prompt = await ctx.plugin(SystemPrompt)
  const tools = await ctx.plugin(ToolRuntime)
  const baseline = await ctx.systemPrompt.assemble()
  const efficiency = await ctx.plugin(plugin, { enabled: false })
  const agent = {} as Agent
  const signal = new AbortController().signal
  const next = async (): Promise<PreStepDecision> => ({ kind: 'enter', messages: [] })
  const step = () => ctx.waterfall('agent/pre-step', { agent, turn: 1, step: 1, signal, messages: [] }, next)
  const read = () => ctx.emit('tools/result', {
    agent,
    signal,
    name: 'read',
    arguments: { file_path: 'a.ts' },
  } as ToolExecution, { isError: false, value: 'current content', content: [] })
  try {
    expect(await ctx.systemPrompt.assemble()).toEqual(baseline)
    await step()
    read()
    read()
    expect(await step()).toEqual({ kind: 'enter', messages: [] })
    efficiency.update({ enabled: true })
    await efficiency.await()
    expect((await ctx.systemPrompt.assemble()).sections.filter(section => section.name === 'agent-efficiency:execution')).toHaveLength(1)
    await step()
    read()
    read()
    expect(await step()).toMatchObject({ messages: [{ source: { kind: 'agent-efficiency' } }] })
    efficiency.update({ enabled: false })
    await efficiency.await()
    expect(await ctx.systemPrompt.assemble()).toEqual(baseline)
    read()
    read()
    expect(await step()).toEqual({ kind: 'enter', messages: [] })
    efficiency.update({ enabled: true, runtimeFeedback: false })
    await efficiency.await()
    expect((await ctx.systemPrompt.assemble()).sections.filter(section => section.name === 'agent-efficiency:execution')).toHaveLength(1)
    await step()
    read()
    read()
    expect(await step()).toEqual({ kind: 'enter', messages: [] })
    await efficiency.dispose()
    expect(await ctx.systemPrompt.assemble()).toEqual(baseline)
  }
  finally {
    await efficiency.dispose()
    await tools.dispose()
    await prompt.dispose()
  }
})
