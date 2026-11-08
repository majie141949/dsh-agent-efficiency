import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "agent-efficiency";
export declare const inject: string[];
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    enabled: Schema<boolean, boolean, "defined">;
    runtimeFeedback: Schema<boolean, boolean, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: Schema<boolean, boolean, "defined">;
    runtimeFeedback: Schema<boolean, boolean, "defined">;
}>>, "plain">;
export declare function apply(ctx: Context, config?: {
    enabled?: boolean;
    runtimeFeedback?: boolean;
}): void;
