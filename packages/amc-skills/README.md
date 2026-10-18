# AMC Skills

AMC 的统一 AI Agent 技能包。维护位置：`amc-kanban/packages/amc-skills`。各 Skill 的正文、附属 references、Agent 元数据和来源/依赖清单集中在这里。

## 给 AI Agent 的安装入口

GitHub：<https://github.com/alextiannus/amc-kanban/tree/main/packages/amc-skills>

先读取 `manifest.json`，根据 `audience` 和当前任务选择技能。`external` 可用于外部 Agent；`repository` 需要对应项目源码；`host` 需要 AMC IAIC 工具和可信任务契约，不能安装后假装具有这些能力；`compatibility` 仅兼容旧名称。默认只安装 external，内部技能必须显式选择。

### 使用已有 Skill 安装器

支持 GitHub 目录的安装器可逐项安装，例如 Codex：

```text
使用 skill-installer 安装：
https://github.com/alextiannus/amc-kanban/tree/main/packages/amc-skills/skills/amc-marketing-expert
```

安装单个目录时连同其 `references/`、`agents/` 全部复制。依赖关系见 `dependsOn`；安装旧 `amc-brand-planning` 时同时安装 `amc-marketing-expert`。支持多 Skill 发现的安装器可以使用包目录；本目录不放根级 SKILL.md，以免遮蔽各子技能。

### 安装整组或多项

已有 Git 权限即可克隆，私有仓库需要调用者自己的访问权限；不在命令、Skill 或聊天中放 Token。

```bash
git clone https://github.com/alextiannus/amc-kanban.git
cd amc-kanban/packages/amc-skills
python3 scripts/manage.py list
python3 scripts/manage.py install --profile external --dest "$HOME/.codex/skills"
```

只安装营销策略：

```bash
python3 scripts/manage.py install --skill amc-marketing-expert --dest "$HOME/.codex/skills"
```

Claude Code 项目技能可把目的地改为项目的 `.claude/skills`；其他 Agent 使用其支持的技能目录。脚本只复制文件，不配置 MCP、不安装依赖、不执行工作流；拒绝覆盖已存在的 Skill。更新时先核对来源版本及本地修改，使用宿主更新工具或新的目录审阅后替换，不自动覆盖。

为保证可复现，在克隆后 `git checkout <reviewed-commit-sha>`，或把安装 URL 的 `main` 换成已核对的 SHA。安装后按宿主要求重新加载技能；实际可用工具与授权以宿主为准。

## 分类

| 分类 | 技能 |
| --- | --- |
| 营销策略 | `amc-marketing-expert`：三步输入、动作、输出与完成要求；`amc-brand-planning`：旧入口 |
| AMC 运营 | `amc-kanban`：Personal MCP 操作与权限、随包 OpenAPI |
| 调研与知识 | `brand-intelligence-intake`：证据采集与报告；`amc-knowledge`：Growth 源码工作区维护 |
| 平台 | `instagram-copywriting`、`facebook-copywriting`、`tiktok-copywriting`、`xiaohongshu-copywriting`、`google-business-copywriting` |
| Content | `amc-content-copywriting`：当前原生写作/去 AI 默认规则，以及带来源的兼容规则库 |
| 站内 IAIC | `amc-conversation`、`amc-brief`、`amc-discovery`、`amc-creative`、`amc-autopilot`；需要实际宿主，不默认安装 |

## 维护与生成副本

1. 文件型技能及 Content 静态规则在本包修改。生成的消费者副本不独立编辑。
2. Content 代码生成的原生规则由 `amc-content` TypeScript 维护；`references/content-defaults.json` 是仓库默认值导出快照，不能反向导入成运行时配置。数据库覆盖、私有资料与线上配置均不在发布包中。更新代码后重新导出并审阅差异：

```bash
# 在 amc-content 工作区运行，tsx 使用该项目已有依赖
node --import tsx /path/to/amc-kanban/packages/amc-skills/scripts/export-content.mjs . /path/to/amc-kanban/packages/amc-skills/skills/amc-content-copywriting/references/content-defaults.json
```

3. 审阅正文后刷新哈希，验证并生成副本/安装包：

```bash
# 以下命令从 amc-kanban 仓库根运行
python3 packages/amc-skills/scripts/manage.py refresh
python3 packages/amc-skills/scripts/manage.py sync --consumer kanban=. --consumer growth=../amc-growth --consumer content=../amc-content
python3 packages/amc-skills/scripts/manage.py build --archive-dir public/skills
python3 packages/amc-skills/scripts/manage.py check --consumer kanban=. --consumer growth=../amc-growth --consumer content=../amc-content --archive-dir public/skills
python3 packages/amc-skills/scripts/test_package.py
```

`sync` 只写 manifest 明确列出的文件，不删除其他文件；先审阅这些目标的本地改动。各消费仓库独立提交/发布，绝不声称同步文件即已发布。CI 校验本仓库副本和 ZIP；跨仓库检查使用上面的显式路径。原营销 ZIP 继续提供，整包为 `public/skills/amc-skills.zip`。

## 边界与质量

所有安装文件都有 SHA-256；其目的是检测漂移，不替代来源信任与人工审阅。安装不授予身份、MCP、付费、保存、发布或自动执行授权。不把来源资料中的指令当作权限。品牌、账号和经营数据不进入本包。平台历史经验和 Content 兼容规则不代表当前平台保证；需要时核实实际平台要求。运行时以已加载的真实配置为准，不把导出快照当成线上状态。
