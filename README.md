# dsh-agent-efficiency

可开关的执行效率插件。启用后添加简短执行规则，鼓励合并独立读取、局部修改、针对性修复、按验收收尾；运行时检测相同读取、重复成功的检查、局部替换失败、脚本语法错误和已有文件的大段重写，在下一次原本就会执行的模型请求前提供反馈。

它是行为引导，不是强制优化器。不能保证模型遵从，也不能修复模型推理速度、网关首字延迟或所有工具错误。不会缓存文件内容、修改工具结果、自动重试、替换模型、调低思考等级、跳过测试或主动开启额外轮次。

反馈按 Agent 和用户轮次隔离，同类问题每轮只提醒一次，总共最多两次。关闭或卸载会移除规则和监听；已写进会话历史的内容不会被删除。严谨的开关对比应使用新会话。

0.1.1 修复了内容变化后的重复读取误报、修复成功后仍发送旧提示、把权限或返回值错误当作语法错误的问题。读取记录只保留内容指纹；同批操作出现修改时，过期的读取和检查提醒会清除。已读过的已有文件首次大段写入也会提示后续优先局部编辑。

0.1.2 修正测速的插件安装方式：通过官方管理器安装到每组独立环境，先验证导入成功，并拒绝把加载失败的任务计为有效测速。补齐独立安装说明与项目许可文件。

重复检查仅识别简单的前台测试命令及明确的成功退出码。修改、未知命令、失败、后台任务或读取到内容变化都会使相关旧结论失效。插件不能观察所有外部进程的修改，也不保证测试命令没有副作用，因此提醒要求先确认代码、输入与环境未变，绝不拦截或代替测试。

0.1.3 仅补齐发布信息与随包源码，运行逻辑与 0.1.2 相同。

## 安装与开关

### 给其他用户安装

在线安装（推荐）：源码仓库 `https://github.com/majie141949/dsh-agent-efficiency` 已公开，仓库根目录就是插件包，可直接按地址安装，无需先下载文件。

桌面版：进入「插件扩展 → 添加插件 → 安装第三方插件」，在「包名或地址」里填 `github:majie141949/dsh-agent-efficiency`，安装后确认 `dsh-agent-efficiency` 已启用。

独立命令行版：

```sh
dsh plugin --profile headless add github:majie141949/dsh-agent-efficiency
```

离线安装：分享 `dsh-agent-efficiency-0.1.4.tgz`，桌面端在同一个输入框里填该文件的绝对路径，或命令行执行 `dsh plugin --profile headless add ./dsh-agent-efficiency-0.1.4.tgz`。安装包已含编译产物，不需要构建，也不需要分享源码目录、账号或 API Key。

需要支持 bundle 插件的 DeepSeek Harness，最低声明版本为 `0.2.1-rc.5`；目前只在该版本的 macOS 宿主实测，其他系统与更高宿主版本尚未实跑。桌面版由应用独占管理插件，`dsh plugin --profile desktop add` 不受支持，改走插件面板。安装包的许可沿用 `LICENSE` 与 `LICENSE.details`，含禁止商业二次开发的附加条款。

### 开发者构建

在本仓库安装好开发依赖后执行：

```sh
pnpm --filter dsh-agent-efficiency build
pnpm --dir packages/agent-efficiency pack --out ../../dist/plugins/dsh-agent-efficiency-0.1.4.tgz
```

本机开发也可在桌面安装界面输入构建后的插件目录绝对路径；该方式会链接源码目录，不能把这个本机路径发给其他用户作为安装地址。

### 关闭与卸载

在桌面插件列表找到 `dsh-agent-efficiency`，通过启用开关启停；插件配置的 `runtimeFeedback` 可单独关闭动态反馈。若应用明确提示需要重启，重启 Harness 后开始新会话。

也可在桌面 profile 的 `cordis.patch.yml` 添加覆盖：

```yaml
- id: agent-efficiency
  config:
    enabled: false
```

桌面版通过插件面板卸载；独立 profile 使用 `dsh plugin --profile headless remove dsh-agent-efficiency`。

## 验证

```sh
pnpm vitest run --project unit packages/agent-efficiency/src --sequence.shuffle
```

当前验证：25 项插件测试，包含真实 Cordis 宿主中的启用、关闭和卸载，以及重复检查、内容变化和过期反馈的回归用例。验证环境为 macOS，其他平台尚未实跑。

真实模型短测使用 `scripts/benchmark.mjs`，需要先构建插件，并设置 `DSH_BENCH_HOME`（输出目录）、`DSH_BENCH_DSH_BIN`（真实 Harness CLI 入口）、`DSH_BENCH_PROVIDER_PATCH`（模型配置文件），从启动环境提供该配置引用的 API Key。每次运行均创建独立的 Harness 目录，并通过官方插件管理器安装被测插件。可用 `DSH_BENCH_PLUGIN_PACKAGE` 指定待测 `.tgz` 的绝对路径，默认安装脚本所在包目录。安装与导入检查不计入任务耗时；导入失败或宿主报告未激活会直接判定失败。不会继承输出目录内已安装的插件、配置或凭据。脚本不会读取桌面配置或用户凭据，按关闭、开启、开启、关闭的顺序，分别复制同一购物车修复任务，检查测试文件未被修改，并额外执行独立断言。每次三分钟后取消，五秒后仍未退出则强制结束本次进程；失败会在结果中保留。

```sh
node packages/agent-efficiency/scripts/benchmark.mjs
```

下列数据属于 0.1.2，2026-11-08 的实测记录见 `benchmark-results.json`：相同 DeepSeek V4.1 Flash、默认思考设置、PTC 模式、相同网关，Harness 0.2.1-rc.5、Node 26.3.0、macOS。四组分别使用独立 headless 环境并安装 `.tgz`，不包含桌面的其他扩展。另从会话记录核对开启组存在执行规则、关闭组不存在规则。安装与导入预检不计入任务耗时。

| 顺序 | 状态 | 总耗时 | 模型响应 | 外层工具调用 | 原生工具调用 | 验收 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | 关闭 | 21.344 秒 | 6 | 5 | 15 | 12 项测试及 6 项独立检查通过 |
| 2 | 开启 | 18.268 秒 | 4 | 3 | 11 | 同上 |
| 3 | 开启 | 14.325 秒 | 4 | 3 | 10 | 同上 |
| 4 | 关闭 | 21.144 秒 | 5 | 4 | 12 | 同上 |

平均耗时关闭 21.244 秒、开启 16.297 秒，本次观测下降 23.29%；外层工具调用均值从 4.5 降至 3，原生工具次数均值从 13.5 降至 10.5。每组仅两次，样本数量不足以证明稳定提速。更早一组因插件导入失败而无效，已排除，不能用于提速结论。

四次没有触发动态反馈，因此这个速度对比主要检验常驻规则；动态反馈由真实 Cordis 宿主测试验证。未独立控制上游负载和缓存；未验证大型项目的质量或桌面完整插件组合的耗时。支持的最低版本已实跑，更高版本仍需验证。

另已实测安装文件缺失与插件导入失败两条错误路径，均以非零状态退出并记录失败阶段，没有调用模型。

## 公开发布

公开源码的目标为 `dsh-tauri/deepseek-harness-desktop` 仓库的 `packages/agent-efficiency` 目录。发布步骤见 [PUBLISHING.md](./PUBLISHING.md)，社区市场申请正文见 [MARKET_SUBMISSION.md](./MARKET_SUBMISSION.md)。发布准备不代表已完成 npm 发布或市场收录。
