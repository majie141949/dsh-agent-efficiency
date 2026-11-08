import type { Events } from '@deepseek-ai/cordis';
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { EfficiencyRuntime } from '../config/runtime.js';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'agent-efficiency': {
            kind: 'agent-efficiency';
            form: 'notice';
            summary: string;
        };
    }
}
export declare function observeResult(runtime: EfficiencyRuntime, exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): undefined;
export declare function beforeStep(runtime: EfficiencyRuntime, payload: Parameters<Events['agent/pre-step']>[0], next: Parameters<Events['agent/pre-step']>[1]): Promise<import("@deepseek-ai/dsh-agent").PreStepDecision>;
