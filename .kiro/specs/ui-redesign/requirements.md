# Requirements Document

## Introduction

本特性对驾考答题系统(drive-exam-system)进行一次系统化的 UI/UX 重构,目标是把现有"功能可用但视觉粗糙"的界面升级为符合专业 UI 标准的、风格统一的产品。

重构遵循工作区已安装的 `ui-ux-pro-max` 技能(`.kiro/steering/ui-ux-pro-max/SKILL.md`)定义的工作流:先用 `search.py --design-system --persist` 生成项目级设计体系并落盘到 `design-system/MASTER.md`,再以该 Master 文件作为唯一事实来源(Source of Truth)指导所有页面改造。

本次重构在视觉/交互层做**推倒重写**:彻底移除 shadcn/ui 残留与 Radix UI 依赖,改为在 `src/components/ui/` 下手写一套基于 Tailwind + lucide-react 的自有组件库(Owned_Components)。**业务契约不变**——Server Actions 的入参与返回值、Prisma schema、URL 路由保持原样;允许重写 `src/components/**/*.tsx` 与 `src/app/**/*.tsx` 中的 JSX、className 以及表单 `onSubmit` 适配代码以接住新组件 API。所有现有功能(五种答题模式、断点续答、模考倒计时、错题本、教练统计、RBAC、异地登录、批量导入等)在重构后行为保持一致。

重构覆盖前台(`(student)` 路由组)和后台(`/admin/*` 路由组)两套界面,以及公开首页 `/`、登录页与改密页。重构完成的标志是所有改动通过 SKILL.md 的 Pre-Delivery Checklist。

## Glossary

- **System**: 驾考答题系统(drive-exam-system)整体,即本仓库 `src/` 下运行的 Next.js 应用。
- **Design_System_Master**: 由 `ui-ux-pro-max` 脚本生成、落盘在 `design-system/MASTER.md` 的项目设计体系文件,定义全局色板、字体、间距、效果、反模式。
- **Design_System_Pages**: 落盘在 `design-system/pages/<page>.md` 的页面级覆盖文件,仅在与 Master 冲突时使用。
- **Student_Surface**: 前台路由组 `(student)` 下的全部页面,包括 `/exam`、`/exam/session/[attemptId]`、`/exam/session/[attemptId]/result`、`/exam/wrong`、`/exam/history`、`/exam/history/[attemptId]`。
- **Admin_Surface**: 后台路由组 `/admin/(protected)` 下的全部页面,包括 `/admin`、`/admin/banks`、`/admin/categories`、`/admin/login-logs`、`/admin/questions` 等。
- **Auth_Surface**: 公开首页 `/`、学生登录 `/login`、后台登录 `/admin/login`、自助改密 `/change-password`。
- **App_Shell**: 包裹页面内容的全局壳,包含 `StudentShell`、`AdminShell`、`Topbar`、`Sidebar` 等组件。
- **Designer**: 执行本次重构的开发者(包含 AI 助手),其产出需通过 Pre-Delivery Checklist。
- **Icon_Set**: 统一使用的 SVG 图标库,本项目固定为 `lucide-react`(已存在依赖)。
- **Pre_Delivery_Checklist**: SKILL.md 中"Pre-Delivery Checklist"章节定义的 5 类(视觉、交互、明暗模式、布局、可访问性)共 16 项检查清单。
- **Common_Rules**: SKILL.md 中"Common Rules for Professional UI"章节定义的图标、交互、明暗对比、布局四大类专业 UI 规则。
- **Theme_Tokens**: `src/app/globals.css` 中 `:root` / `.dark` 下定义的 CSS 变量(`--background`、`--foreground`、`--primary` 等)及 `tailwind.config.ts` 中映射出的 Tailwind 颜色 / 字号 token(`bg-primary`、`text-foreground`、`text-base` 等)。Theme_Tokens 是色板与字号的唯一引用方式。
- **Owned_Components**: 本次重构在 `src/components/ui/` 下手写的自有 UI 组件集合,至少包含 Button、Card(及 Header/Title/Description/Content/Footer 子组件)、Badge、Input、Label、Checkbox、Textarea、SelectNative、Alert(及 AlertDescription)。Toast 不属于 Owned_Components,继续使用 `sonner` 提供的实现。
- **Theme_Toggle**: 位于 `StudentShell` 与 `AdminShell` 顶栏右侧的明暗模式切换按钮,使用 `lucide-react` 的 `Sun` / `Moon` 图标,通过给 `<html>` 切换 `.dark` 类实现主题切换。
- **Banned_Packages**: 本次重构后必须从 `dependencies` 中移除的包集合,具体为:所有 `@radix-ui/*` 包、`class-variance-authority`、`tailwindcss-animate`。`tailwind-merge` 与 `clsx` 作为 className 工具函数保留。

## Requirements

### Requirement 1: 生成并持久化项目级设计体系

**User Story:** 作为 Designer,我想在动手改任何页面之前先得到一份项目专属的设计体系文档,这样我后续所有改造都有统一的色板、字体、间距、效果可以遵循,而不是凭感觉调样式。

#### Acceptance Criteria

1. THE Designer SHALL 使用 `python3 .kiro/steering/ui-ux-pro-max/scripts/search.py` 命令配合 `--design-system --persist -p "Drive Exam System"` 参数生成设计体系。
2. WHERE 用户未显式指定风格关键词,THE Designer SHALL 使用默认查询词 `"professional dashboard education driver license elegant minimal"` 作为 `search.py` 的位置参数;用户可在执行前覆盖该默认值。
3. THE System SHALL 在仓库根目录下创建 `design-system/MASTER.md` 文件,内容由步骤 1 命令生成,不得手工编造。
4. THE Design_System_Master SHALL 至少声明:主色 / 辅色 / 背景色调色板、字体组合(Google Fonts 名称)、字号阶梯、圆角与阴影规范、推荐风格关键词、反模式列表。
5. WHERE 设计体系生成命令产出页级覆盖建议,THE Designer SHALL 在 `design-system/pages/` 下为对应页面创建 `<page>.md` 覆盖文件。
6. THE `design-system/` 目录 SHALL 被纳入版本控制,不在 `.gitignore` 中被忽略。
7. IF Python 解释器在用户机器上不可用,THEN THE Designer SHALL 中止重构并向用户报告需要先安装 Python(参考 SKILL.md 的 Prerequisites 章节)。

### Requirement 2: 设计体系作为唯一事实来源

**User Story:** 作为 Designer,我想让所有页面改造都引用 `design-system/MASTER.md`,这样不会出现某个页面用一种灰、另一个页面用另一种灰的不一致问题。

#### Acceptance Criteria

1. WHEN Designer 改造任意一个页面,THE Designer SHALL 优先读取 `design-system/pages/<page>.md`(如存在)并以其为准,否则读取 `design-system/MASTER.md`。
2. THE System SHALL 把 Design_System_Master 中定义的色板与字号映射为 Theme_Tokens(Tailwind config 中的颜色 / 字号 token 与 `globals.css` 中的 CSS 变量),所有色板与字号 SHALL 通过 Theme_Tokens 引用,不得在组件里写死十六进制色值或像素字号。
3. WHERE Design_System_Master 指定了 Google Fonts 字体组合,THE System SHALL 在 `src/app/layout.tsx` 中通过 `next/font/google` 加载并应用到 `<body>`。
4. IF Design_System_Master 中列出了反模式(anti-patterns),THEN THE Designer SHALL 在重构后的代码中移除所有命中反模式的写法。
5. THE System SHALL 在重构后的 `package.json` 的 `dependencies` 中不出现任何 Banned_Packages(`@radix-ui/*`、`class-variance-authority`、`tailwindcss-animate`)。

### Requirement 3: 移除 Emoji 图标,统一使用 SVG 图标集

**User Story:** 作为 Designer,我想把界面里所有当作图标用的 emoji 全部替换为 Lucide 矢量图标,这样图标在任何字体回退、任何系统下显示效果都一致,看起来更专业。

#### Acceptance Criteria

1. WHEN Designer 完成重构,THE System SHALL 在 Student_Surface、Admin_Surface、Auth_Surface 的 JSX 中不出现任何把 emoji(如 🚗、📒、🎉)作为图标使用的写法。
2. THE Icon_Set SHALL 固定为 `lucide-react`,Designer 在新增图标时只能从 `lucide-react` 导入,不得引入其他图标库。
3. THE System SHALL 在所有渲染图标的位置使用统一尺寸约束:行内图标 `h-4 w-4`、按钮内图标 `h-5 w-5`、卡片标题图标 `h-6 w-6`,禁止自由 `width/height`。
4. WHERE 文案需要表情(如成绩页庆祝场景),THE Designer SHALL 用 SVG 插画或 Lucide 图标(如 `Trophy`、`PartyPopper`)替代 emoji。
5. IF 业务文本(题干、解析、用户输入内容)中本身包含 emoji,THEN THE System SHALL 原样渲染,不视为违反本要求。

### Requirement 4: 交互元素的指针与悬停反馈

**User Story:** 作为学员或管理员,我想让所有可点击的卡片、按钮、链接在鼠标悬停时立即给出明确的视觉反馈,这样我知道哪些区域是可以交互的,不会瞎点。

#### Acceptance Criteria

1. THE System SHALL 给所有可点击且非 `<button>` / `<a>` 原生元素(包括 Card、自定义 div 容器)添加 `cursor-pointer` 类。
2. WHEN 用户把鼠标悬停在可点击元素上,THE System SHALL 在 200ms 内通过颜色、阴影或边框变化给出视觉反馈。
3. THE System SHALL 用 `transition-colors duration-200`(或与 Design_System_Master 一致的过渡时长)实现悬停过渡,过渡时长在 150ms 至 300ms 之间。
4. THE System SHALL 不使用 `hover:scale-*` 类型的形变作为主要悬停反馈(防止周边布局抖动),允许的例外是图标本身放大、按钮内部装饰的微动效(放大幅度小于等于 5%)。
5. WHEN 用户用键盘 Tab 到可交互元素,THE System SHALL 显示可见的焦点环(`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` 或与 Design_System_Master 一致的写法)。

### Requirement 5: 明暗模式下的对比度与可读性

**User Story:** 作为在不同光线环境下使用系统的用户,我想让浅色主题和深色主题下的文字、边框、卡片都清晰可见,不出现"白底白卡"或"灰底灰字"的问题。

#### Acceptance Criteria

1. THE System SHALL 在浅色主题下让正文文本与其背景之间的对比度至少为 4.5:1(WCAG AA)。
2. THE System SHALL 在浅色主题下让次要文本(muted)使用不浅于 `slate-600`(`#475569`)的颜色,禁止 `gray-400` 或更浅。
3. WHERE 使用半透明 / 玻璃质感(glass / blur)效果,THE System SHALL 在浅色主题下使用不低于 `bg-white/80` 的不透明度,在深色主题下使用不低于 `bg-slate-900/80` 的不透明度。
4. THE System SHALL 在浅色主题下使用 `border-gray-200`(或 Theme_Tokens 中等价值)以上的可见边框,禁止 `border-white/10` 这类在浅色背景下不可见的边框。
5. WHEN 同一组件在两套主题下渲染,THE Designer SHALL 在两套主题下分别人工核对一遍,不得出现某一主题下文字、图标或边框消失的现象。

### Requirement 6: 浮动 / 固定导航的间距与内容遮挡

**User Story:** 作为用户,我想让顶部导航栏在屏幕滚动时不遮挡正文,且如果设计成"浮动卡片"风格,要离屏幕边缘留出呼吸感,这样视觉上更舒服。

#### Acceptance Criteria

1. WHERE App_Shell 使用浮动导航栏样式,THE System SHALL 让导航栏与视口顶部、左右各保持至少 `top-4 left-4 right-4`(16px)的距离。
2. WHILE 页面存在固定 / 粘性导航栏,THE System SHALL 给主内容区添加等于导航栏高度的上内边距,确保滚动到顶部时正文第一行完整可见。
3. THE System SHALL 在 Student_Surface 与 Admin_Surface 各自统一一套最大宽度 token:Student_Surface 使用 `max-w-3xl`(或 Master 指定值),Admin_Surface 使用 `max-w-7xl`(或 Master 指定值),不得在同一壳里混用多个最大宽度。

### Requirement 7: 公开首页(Landing)重构

**User Story:** 作为首次访问系统的访客,我想看到一个有信息层次、视觉吸引力强的首页,这样我能快速理解这是什么产品并决定是否登录。

#### Acceptance Criteria

1. THE System SHALL 在 `src/app/page.tsx` 中按 Design_System_Master 的色板与字体重绘 hero 区。
2. THE System SHALL 把首页右上角的 "🚗 驾考答题系统" 标题替换为"Lucide 图标 + 文字"的组合,图标遵循 Requirement 3。
3. THE System SHALL 让 hero 区在 ≥768px 屏幕下显示主标题、副标题、主 CTA、辅 CTA 四要素,在 <768px 屏幕下保持单列堆叠且各要素垂直间距至少 16px。
4. THE System SHALL 把首页"多种练习模式 / 自动统计成绩 / 账号安全"三张特性卡重绘为统一卡片样式(同圆角、同阴影、同 hover 反馈),并满足 Requirement 4 的悬停规则。
5. THE System SHALL 在浅色与深色主题下分别测试首页,均满足 Requirement 5。

### Requirement 8: 学生前台(Student_Surface)重构

**User Story:** 作为学员,我想让答题主页、答题进行中页面、错题本、答题记录这几个高频页面在视觉上是统一风格,而不是每个页面各自一种样式,这样使用起来不分裂。

#### Acceptance Criteria

1. THE System SHALL 用 Design_System_Master 重绘 `StudentShell`(顶栏 + 标签导航),保留现有路由分组(`/exam`、`/exam/wrong`、`/exam/history`)与权限行为。
2. THE System SHALL 重绘 `ExamModePicker`:每个题库一张卡,卡内并排 4 个模式按钮(顺序 / 随机 / 章节 / 模考),"错题重做"独立卡片,卡片的视觉风格与 Master 一致。
3. WHEN `ExamModePicker` 渲染存在 `ONGOING` 会话的模式按钮,THE System SHALL 用与"开始"按钮可视区分的样式渲染"继续上次"按钮(例如不同 variant 或加上 Lucide 图标),并在按钮下方提供"放弃后重开"次级动作。
4. THE System SHALL 重绘 `practice-player`、`mock-player`、`random-player` 三个答题播放器:进度条、题干、选项、答题反馈、提交按钮、模考倒计时均按 Master 排版,选项命中状态(正确 / 错误 / 已选)用色彩 + 图标双重指示,不只靠颜色。
5. THE System SHALL 重绘 `/exam/wrong` 错题列表与筛选器,以及 `/exam/history` 答题记录列表与单次详情(`/exam/history/[attemptId]`)。
6. THE System SHALL 重绘 `/exam/session/[attemptId]/result` 成绩页:用 SVG 图标 / 视觉元素表达通过或未通过,展示得分、用时、对错统计、操作按钮(继续学习 / 看错题)。
7. THE System SHALL 在所有 Student_Surface 页面满足 Requirement 4(交互反馈)、Requirement 5(明暗对比)、Requirement 6(布局间距)。

### Requirement 9: 后台(Admin_Surface)重构

**User Story:** 作为管理员或教练,我想让题库管理、分类管理、登录日志这几个后台页面在视觉上像一个完整的管理工作台,而不是几个表格散落在白屏上。

#### Acceptance Criteria

1. THE System SHALL 用 Design_System_Master 重绘 `AdminShell`(顶栏 + 侧栏 + 主内容),保留现有移动端折叠侧栏行为与权限行为。
2. THE System SHALL 重绘 `/admin` 工作台首页:用统计卡片、最近活动列表、快捷入口三块布局,数字与标签的字号层级遵循 Master。
3. THE System SHALL 重绘 `/admin/banks` 题库列表与 `/admin/banks/[id]` 详情:统一表格 / 卡片样式、操作按钮位置、空状态插画或图标提示。
4. THE System SHALL 重绘 `/admin/categories` 全局分类管理:树形 / 列表的视觉层级、增删改交互按钮、确认对话框遵循 Master。
5. THE System SHALL 重绘 `/admin/login-logs` 登录日志:表格列宽、状态徽章(成功 / 失败 / 冻结)、分页器、筛选器视觉统一。
6. THE System SHALL 在所有 Admin_Surface 页面满足 Requirement 4、Requirement 5、Requirement 6。

### Requirement 10: 登录与改密(Auth_Surface)重构

**User Story:** 作为学员或管理员,我想让两个登录页和改密页在视觉上保持品牌一致,这样我能立刻识别这是同一个系统。

#### Acceptance Criteria

1. THE System SHALL 用 Design_System_Master 重绘 `/login`(学生)与 `/admin/login`(管理员)两个登录页,共享布局结构(品牌区 + 表单区),仅在标识徽章和主色强调上区分。
2. THE System SHALL 在登录表单上对所有 `<input>` 提供可见的 `<label>`,且在错误时显示与字段相邻的红色提示文本(满足 Requirement 11.2)。
3. THE System SHALL 重绘 `/change-password` 自助改密页,布局与登录页风格一致,提交按钮在校验未通过时禁用。

### Requirement 11: 可访问性基线

**User Story:** 作为有视觉或运动障碍的用户,我想让系统的图片有替代文本、表单有标签、动画可以被关闭,这样我能在依赖屏幕阅读器或减少动画偏好下正常使用。

#### Acceptance Criteria

1. THE System SHALL 给所有 `<img>` / Next.js `<Image>` 标签提供非空 `alt`,装饰性图片显式写 `alt=""`。
2. THE System SHALL 给所有表单 `<input>` / `<select>` / `<textarea>` 关联可见的 `<label>` 或 `aria-label`。
3. THE System SHALL 不使用颜色作为唯一的状态指示符,需同时配合图标、文字或形状(例如选项命中状态用"✓ + 绿色"组合)。
4. WHILE 用户偏好 `prefers-reduced-motion: reduce`,THE System SHALL 把所有非必要的 transition 与 animation 时长降为 0 或 ≤ 50ms。
5. THE System SHALL 让交互元素的可点击区域在移动端不小于 44×44 px(Tailwind `min-h-11 min-w-11` 或等价)。

### Requirement 12: 响应式断点

**User Story:** 作为在手机、平板、笔记本、桌面显示器之间切换使用的用户,我想让界面在每个常见尺寸下都不出现横向滚动条或元素被截断,这样我用任何设备体验都顺。

#### Acceptance Criteria

1. THE System SHALL 在 375px、768px、1024px、1440px 四个视口宽度下均不出现非预期的水平滚动条。
2. WHEN 视口宽度小于 640px,THE System SHALL 让 Student_Surface 与 Admin_Surface 的多列布局降级为单列。
3. WHILE 视口宽度小于 1024px,THE Admin_Surface 的侧栏 SHALL 折叠为抽屉式,触发按钮位于顶栏左侧。
4. THE System SHALL 在所有断点下保证 Topbar 与主内容之间不发生重叠(满足 Requirement 6.2)。

### Requirement 13: 业务行为不回归

**User Story:** 作为产品负责人,我想让 UI 重构不引入功能回归,这样既得到更好看的界面,又不丢任何已有功能。

#### Acceptance Criteria

1. WHEN UI 重构合并,THE System SHALL 保持所有现有 Server Actions 的入参与返回值不变,Prisma schema 不变,所有 URL 路由保持原样。
2. THE Designer SHALL 仅在 `src/components/**/*.tsx` 与 `src/app/**/*.tsx` 范围内重写 JSX 与 className,允许同步重写表单组件的 `onSubmit` / 受控值适配代码以接住新组件 API。
3. THE System SHALL 在重构后让 `pnpm lint`、`pnpm typecheck`、`pnpm test`(若已有用例)三条命令全部通过。
4. THE System SHALL 在重构后保持所有路由(`/`, `/login`, `/admin/login`, `/exam/*`, `/admin/*`, `/change-password`)在原 URL 上可访问,不允许重命名或删除路由。
5. WHEN Designer 提交重构 PR,THE Designer SHALL 在 PR 描述中附 `pnpm install` 后 `pnpm-lock.yaml` 的改动审查摘要,确认所有 Banned_Packages(`@radix-ui/*`、`class-variance-authority`、`tailwindcss-animate`)及其传递依赖已被移除。
6. IF 重构过程中发现某段 UI 与业务逻辑耦合无法单独替换,THEN THE Designer SHALL 在 `design-system/pages/<page>.md` 中标注偏差并向用户说明,而不是默默改业务逻辑。

### Requirement 14: 通过预交付检查清单(Pre_Delivery_Checklist)

**User Story:** 作为 Designer,我想在每个页面完成后用一张统一的清单验收,这样不会因为漏掉某条规则导致回炉。

#### Acceptance Criteria

1. WHEN Designer 声明某个页面重构完成,THE Designer SHALL 把该页面对照 SKILL.md 的 Pre-Delivery Checklist(视觉 5 项 + 交互 4 项 + 明暗 4 项 + 布局 4 项 + 可访问性 4 项)逐条检查,并把检查结果记录到 `design-system/pages/<page>.md` 的 "Checklist Verification" 章节。
2. THE System SHALL 不接受任何一项 Pre_Delivery_Checklist 处于 `[ ]`(未勾选)状态的页面进入"完成"。
3. IF 任何一项无法在当前阶段满足,THEN THE Designer SHALL 在该项后用 `// reason:` 注明原因,并把对应改进项记入待办,不得静默跳过。

### Requirement 15: 自建组件库基线(Owned_Components)

**User Story:** 作为前端开发者,我想用一套自有的、零 Radix 依赖的轻量组件库替代之前的 shadcn/ui,这样我能完全控制组件的样式与可访问性表现,且不再背 Radix 的版本与运行时成本。

#### Acceptance Criteria

1. THE System SHALL 在 `src/components/ui/` 下提供以下 Owned_Components,文件名沿用旧名(便于 import 路径平替),允许重写 props 接口:`button.tsx`、`card.tsx`(导出 `Card`、`CardHeader`、`CardTitle`、`CardDescription`、`CardContent`、`CardFooter`)、`badge.tsx`、`input.tsx`、`label.tsx`、`checkbox.tsx`、`textarea.tsx`、`select-native.tsx`、`alert.tsx`(导出 `Alert`、`AlertDescription`)。
2. THE Owned_Components SHALL 仅基于 Tailwind 类、`clsx`、`tailwind-merge` 与 `lucide-react` 实现,不得直接或间接 import 任何 Banned_Packages。
3. THE Button、Badge 与 Alert 组件 SHALL 至少支持 `variant` 形参,Button 的 `variant` 至少包含 `default`、`outline`、`ghost`、`destructive`,Badge 与 Alert 的 `variant` 至少包含 `default`、`outline`、`destructive`。
4. THE Button、Input、Textarea 与 SelectNative 组件 SHALL 至少支持 `size` 形参,取值 `sm` / `md` / `lg`,默认值为 `md`,且尺寸映射到 Theme_Tokens 中的字号与 padding token。
5. WHEN Owned_Components 接收 `disabled={true}`,THE System SHALL 应用统一的禁用态样式(降低不透明度至 50%、`cursor-not-allowed`、阻断 hover 反馈)。
6. WHEN 用户用键盘 Tab 到任何 Owned_Component,THE System SHALL 渲染满足 Requirement 4.5 的 `focus-visible` 焦点环。
7. THE Checkbox 组件 SHALL 通过原生 `<input type="checkbox">` 实现,并在选中态使用 `lucide-react` 的 `Check` 图标做视觉指示;Label 组件 SHALL 通过 `htmlFor` 与表单控件关联,满足 Requirement 11.2。
8. THE Owned_Components SHALL 引用 Theme_Tokens(不得在组件内写死十六进制色值或像素字号),且在 `.dark` 类下渲染时颜色自动跟随 Theme_Tokens 的暗色变量。
9. THE System SHALL 继续使用 `sonner` 提供 Toast 能力,Toast 不属于 Owned_Components,不需要重写。
10. WHEN 调用方文件因 Owned_Components 重写了 props 接口而需要适配,THE Designer SHALL 同步更新对应的 `src/components/**/*.tsx` 与 `src/app/**/*.tsx` 调用处,不得遗留与旧 API 不兼容的引用。

### Requirement 16: 暗色主题切换入口(Theme_Toggle)

**User Story:** 作为用户,我想在顶栏看到一个明暗模式切换按钮,这样我可以根据当前光线环境一键切换主题,且我的选择在下次访问时被记住。

#### Acceptance Criteria

1. THE System SHALL 在 `StudentShell` 与 `AdminShell` 的 Topbar 右侧渲染一个 Theme_Toggle 按钮,按钮使用 `lucide-react` 的 `Sun` 与 `Moon` 图标根据当前主题切换显示,并提供 `aria-label="切换主题"`(或等价中文/英文 label)。
2. WHEN 用户点击 Theme_Toggle,THE System SHALL 在 `<html>` 元素上 toggle `.dark` 类,使页面立即在浅色与深色主题之间切换。
3. WHEN 用户首次访问且 `localStorage` 中不存在主题偏好,THE System SHALL 读取 `window.matchMedia('(prefers-color-scheme: dark)')` 的值作为初始主题。
4. WHEN 用户通过 Theme_Toggle 选择某个主题,THE System SHALL 将该选择写入 `localStorage` 的 `theme` 键(取值 `light` 或 `dark`),并在后续访问时读取该值作为初始主题(优先级高于 `prefers-color-scheme`)。
5. WHILE 页面在 SSR 阶段渲染,THE System SHALL 在 `<head>` 中注入一段同步执行的内联脚本,在 React hydrate 之前根据 `localStorage` 与 `prefers-color-scheme` 给 `<html>` 添加 `.dark` 类,避免首屏闪烁(FOUC)。
6. THE Theme_Toggle 按钮 SHALL 满足 Requirement 4(指针 / 悬停 / 焦点环)与 Requirement 11.5(可点击区域 ≥ 44×44 px)。
7. WHEN 主题切换后,THE System SHALL 让所有 Owned_Components 与页面元素根据 Requirement 5 在新主题下保持可读对比度。
