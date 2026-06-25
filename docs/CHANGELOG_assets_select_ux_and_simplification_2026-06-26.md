# 更新日志 - 素材库选图体验优化与新建草稿面板精简 (2026-06-26)

为了解决用户在新建草稿时“素材挑选缩略图过于拥挤、堆叠难用”的体验痛点，并精简新建内容时的录入工作量，我们实施了以下交互与界面优化：

## 变更明细

### 1. 新建草稿工作区精简 (Draft Creation Form Simplified)
- **隐藏非必要字段**：在**新建发布草稿（日历视图）**和**新建草稿（草稿视图且无选中草稿）**时，隐藏以下三个输入框：
  - 草稿正文 (Draft Caption)
  - 标签 (Hashtags)
  - 协作备注 / 修改说明 (Agent Note)
- **核心逻辑**：用户在此阶段只需输入“内容创意 (Idea)”并选择对应的媒体素材、发布账号及时间即可。保存草稿或启动 AI 创作时，系统将使用“内容创意”作为核心指令；点击 AI 创作后，AI 会自动按所选平台特性在后台生成对应的正文及标签。
- **编辑已有草稿**：当用户在草稿列表点击某一已生成/已存在的草稿进行编辑时，草稿正文、标签与协作备注框将**正常渲染显现**，允许用户针对不同社交平台的自动生成结果进行差异化微调和创作。

### 2. 素材选择网格与卡片升级 (Grid & Card Redesign)
- **响应式排版**：从固定的 `grid-cols-4` 改为自适应的 `grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5`，使每一张缩略图的显示面积扩大，避免堆叠感。
- **高度限额拓宽**：将素材库选择容器的高度限制在日历面板提升到 `max-h-[340px]`，草稿看板面板提升到 `max-h-[380px]`，浏览体验更加开阔。
- **选中遮罩与卡片圆角**：素材卡片换用圆润的 `rounded-xl` 圆角；鼠标悬浮增加微型缩放与投影高亮；选中时覆盖半透明绿色遮罩 (`bg-emerald-950/20`) 并在右上角放置高清绿底白勾的 `Check` 标识。

### 3. 全能大图灯箱预览 (Custom Lightbox Preview Overlay)
- **放大镜预览入口**：卡片悬停时左下角浮现半透明玻璃眼睛/放大镜按钮 (`Maximize2`)，点击在不切换选中状态下打开全屏灯箱。
- **灯箱全功能浏览**：采用 `z-50` 的 `backdrop-blur-md` 磨砂背景，居中展示大图/视频，底部配有一键 `选择` / `取消选择` 联动按钮，支持两侧箭头进行当前列表内的所有素材连贯翻页。
- **全键盘支持**：支持键盘左、右方向键翻页，Esc 键一键退出。

---

## 涉及模块与组件

- **日历新建工作区**：[DashboardCalendar.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%2520Staff/amc-kanban/src/components/dashboard/DashboardCalendar.tsx)
- **草稿新建与编辑工作区**：[DraftManagementView.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%2520Staff/amc-kanban/src/components/dashboard/DraftManagementView.tsx)
