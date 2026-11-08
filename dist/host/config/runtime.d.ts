import type { Agent } from '@deepseek-ai/dsh-agent';
export interface EfficiencyState {
    turn: number;
    reads: Map<string, {
        content: string;
        epoch: number;
    }>;
    readEpoch: number;
    files: Set<string>;
    checks: Set<string>;
    delivered: Set<string>;
    pending: Map<string, {
        text: string;
        target?: string;
    }>;
    notices: number;
}
export declare function createRuntime(): {
    states: WeakMap<Agent, EfficiencyState>;
};
export type EfficiencyRuntime = ReturnType<typeof createRuntime>;
