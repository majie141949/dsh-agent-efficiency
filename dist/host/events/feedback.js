import { createHash } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
const MAX_NOTICES_PER_TURN = 2;
const LARGE_WRITE_LENGTH = 12000;
const MAX_TRACKED_CALLS = 128;
function queue(state, kind, text, target) {
    if (state.notices < MAX_NOTICES_PER_TURN && !state.delivered.has(kind))
        state.pending.set(kind, { text, target });
}
function invalidateChecks(state) {
    state.checks.clear();
    state.pending.delete('check');
}
function invalidateReads(state) {
    state.readEpoch += 1;
    state.pending.delete('read');
}
function checkKey(args) {
    if (typeof args.command !== 'string' || args.run_in_background)
        return undefined;
    const command = args.command.trim();
    if (!/^[\w ./:=@*-]+$/.test(command))
        return undefined;
    if (!/^(?:node --test|(?:npm|pnpm|yarn) (?:run )?test|(?:pnpm|npx) vitest run|pytest|python3? -m pytest|cargo test|go test)(?:\s|$)/.test(command))
        return undefined;
    return signature({ command, cwd: args.cwd, workdir: args.workdir });
}
function signature(value) {
    const ordered = JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item);
    return createHash('sha256').update(ordered ?? '').digest('hex');
}
export function observeResult(runtime, exec, result) {
    if (!exec.agent || exec.signal.aborted)
        return;
    const state = runtime.states.get(exec.agent);
    if (!state || state.notices >= MAX_NOTICES_PER_TURN)
        return;
    const args = exec.arguments && typeof exec.arguments === 'object' ? exec.arguments : {};
    const file = typeof args.file_path === 'string' ? signature(args.file_path) : undefined;
    if (result.isError) {
        invalidateReads(state);
        invalidateChecks(state);
        if (exec.name === 'run_code' && /\bSyntaxError\b|\bUnexpected token\b|\bUnterminated (?:string|template|comment)\b|\bExpected (?:['"`]|a semicolon\b)/i.test(result.error.message)) {
            queue(state, 'syntax', '执行脚本出现语法错误。先修复报错位置和字符串引用方式，复用已经生成的内容；不要为此重新生成整份大文件。');
        }
        else if (exec.name === 'edit' && /not found|match|old_string|oldText|unique|multiple/i.test(result.error.message)) {
            queue(state, 'edit', '局部替换没有匹配成功。重新读取目标附近的实际内容，用精确且唯一的片段修复；不要重复提交原来的替换参数。', file);
        }
        return;
    }
    if (exec.name === 'read') {
        const key = signature(args);
        const content = signature(result.value);
        const previous = state.reads.get(key);
        if (previous?.content === content && previous.epoch === state.readEpoch) {
            queue(state, 'read', '本阶段出现相同参数、相同内容的重复读取。已有内容仍适用时直接复用；需要确认文件变化时可以重读。把下一批独立读取合并到同一次调用。', key);
        }
        else if (previous !== undefined && previous.content !== content) {
            invalidateChecks(state);
            if (state.pending.get('read')?.target === key)
                state.pending.delete('read');
        }
        if (state.reads.size >= MAX_TRACKED_CALLS)
            state.reads.clear();
        state.reads.set(key, { content, epoch: state.readEpoch });
        if (file) {
            if (state.files.size >= MAX_TRACKED_CALLS)
                state.files.clear();
            state.files.add(file);
        }
        return;
    }
    if (exec.name === 'run_code') {
        state.pending.delete('syntax');
        return;
    }
    invalidateReads(state);
    const check = exec.name === 'bash' ? checkKey(args) : undefined;
    const value = result.value && typeof result.value === 'object' && !Array.isArray(result.value) ? result.value : undefined;
    if (check && value?.kind === 'foreground' && value.exitCode === 0) {
        if (state.checks.has(check))
            queue(state, 'check', '同一检查已再次通过，期间未观察到修改。若确认代码、输入和环境未变化，可复用已有结论并完成验收；发现外部变化、波动或新风险时仍应重新验证。');
        if (state.checks.size >= MAX_TRACKED_CALLS)
            state.checks.clear();
        state.checks.add(check);
        return;
    }
    invalidateChecks(state);
    if (file && (exec.name === 'write' || exec.name === 'edit')) {
        if (state.pending.get('edit')?.target === file)
            state.pending.delete('edit');
        if (exec.name === 'write' && typeof args.content === 'string' && state.files.has(file) && args.content.length >= LARGE_WRITE_LENGTH) {
            queue(state, 'rewrite', '已存在的文件写入了大段内容。后续小改动优先局部编辑，保留已经正确的部分；只有结构性变化才继续整体重写。');
        }
        if (state.files.size >= MAX_TRACKED_CALLS)
            state.files.clear();
        state.files.add(file);
    }
}
export async function beforeStep(runtime, payload, next) {
    const decision = await next();
    if (decision.kind === 'reject' || payload.signal.aborted)
        return decision;
    let state = runtime.states.get(payload.agent);
    if (!state || state.turn !== payload.turn) {
        state = { turn: payload.turn, reads: new Map(), readEpoch: 0, files: new Set(), checks: new Set(), delivered: new Set(), pending: new Map(), notices: 0 };
        runtime.states.set(payload.agent, state);
    }
    if (!state.pending.size || state.notices >= MAX_NOTICES_PER_TURN)
        return decision;
    const text = [...state.pending.values()].map(notice => notice.text).join('\n');
    for (const key of state.pending.keys())
        state.delivered.add(key);
    state.pending.clear();
    state.notices += 1;
    return {
        ...decision,
        messages: [...decision.messages, createUserMessage({
                content: [{ type: 'text', text: `执行效率反馈：\n${text}\n保持原来的验收要求；此反馈不要求增加汇报或额外调用。` }],
                source: { kind: 'agent-efficiency', form: 'notice', summary: '减少重复操作与返工' },
            })],
    };
}
