# 发布与市场收录

目标仓库：`https://github.com/dsh-tauri/deepseek-harness-desktop`。源码目录：`packages/agent-efficiency`。包名：`dsh-agent-efficiency`。待发布版本：`0.1.3`。

本文件是发布说明，不代表源码已推送、npm 已发布或市场已收录。当前版本只调整发布材料，运行逻辑与已验证的 0.1.2 相同。沿用 `LICENSE` 与 `LICENSE.details`，包含禁止商业二次开发的附加条款；不能将其对外表述为纯 MIT。

## 1. 公开源码

将插件源码、许可证、说明、测试与本仓库对应的锁文件变更提交到目标仓库，经项目流程合入默认分支。确认公开地址中可以看到 `packages/agent-efficiency/src`、`package.json`、`cordis.patch.yml` 和两份许可文件，再发布 npm。

若不使用 npm 而申请固定 Git 提交收录，该提交还必须包含编译后的 `dist`，不能只附一个 GitHub Release 安装包；需提供完整的 40 位提交 SHA 和源码子目录。

## 2. 构建与打包

从仓库根目录运行，使用仓库已有开发依赖：

```sh
pnpm --filter dsh-agent-efficiency build
pnpm --dir packages/agent-efficiency pack --out ../../dist/plugins/dsh-agent-efficiency-0.1.3.tgz
npm publish ./dist/plugins/dsh-agent-efficiency-0.1.3.tgz --dry-run --access public --registry=https://registry.npmjs.org
```

使用 pnpm 打包，以把 `catalog:` 开发依赖转换为可公开分发的版本号。发布的是经过检查的安装包，不直接发布工作目录。安装包不包含用户配置、账号或 API Key。

## 3. npm 登录与发布

在自己的终端完成账号登录和 npm 要求的认证，不把密码、访问令牌或验证码粘贴到聊天里：

```sh
npm login --registry=https://registry.npmjs.org
npm publish ./dist/plugins/dsh-agent-efficiency-0.1.3.tgz --access public --registry=https://registry.npmjs.org
npm view dsh-agent-efficiency@0.1.3 version repository dist.integrity --registry=https://registry.npmjs.org
```

若包名届时被其他人占用，需要换成自己有权限的名称，再同步 bundle 补丁、安装说明和收录申请；不要覆盖其他作者的包。发布后，独立命令行用户可使用 `dsh plugin --profile headless add dsh-agent-efficiency@0.1.3`；桌面用户在插件安装界面输入该名称和版本。

## 4. 社区市场申请

确认公开源码地址与 npm 版本都可访问后，把 [MARKET_SUBMISSION.md](./MARKET_SUBMISSION.md) 作为申请正文，提交到 [Open Plugin Market 收录申请](https://github.com/polang233/dsh-plugin-index/issues/new?template=plugin-add.yml)。它是独立社区市场，最终是否收录由维护者决定。

申请依据：[市场贡献指南](https://github.com/polang233/dsh-plugin-index/blob/main/.github/CONTRIBUTING.md)。不要把准备好申请或提交申请描述为已经上架。
