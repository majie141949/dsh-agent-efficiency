import Schema from '@deepseek-ai/schemastery';
import { createRuntime } from './config/runtime.js';
import { beforeStep, observeResult } from './events/feedback.js';
import { efficiencySection } from './prompts/efficiency-section.js';
export const name = 'agent-efficiency';
export const inject = ['systemPrompt', 'tools'];
export const Config = Schema.object({
    enabled: Schema.boolean().default(true).description('启用执行效率优化'),
    runtimeFeedback: Schema.boolean().default(true).description('发现重复读取、重复检查或返工时提示，每轮最多两次'),
});
export function apply(ctx, config = {}) {
    if (config.enabled === false)
        return;
    ctx.effect(() => ctx.systemPrompt.section(efficiencySection), 'agent-efficiency:section');
    if (config.runtimeFeedback === false)
        return;
    const runtime = createRuntime();
    ctx.on('tools/result', (exec, result) => observeResult(runtime, exec, result));
    ctx.on('agent/pre-step', (payload, next) => beforeStep(runtime, payload, next));
}
