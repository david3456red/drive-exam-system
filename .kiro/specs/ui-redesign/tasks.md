# Implementation Plan: UI Redesign

## Overview

把 design.md 中的"Design_System_Master → Theme_Tokens → Owned_Components → Shell → 页面"单向依赖链拆为 8 个阶段、共 45 个叶子任务的可执行清单。每个任务对应 1–3 个文件的实现 + 必要的属性/单元测试,按依赖顺序串联,确保不出现孤岛代码。任务编号、Requirement 引用、Design 章节引用、依赖关系直接写在每条任务里,使任务调度器可解析为有向无环图(详见末尾 Task Dependency Graph)。

> 说明:实施语言为 **TypeScript**(已存在 `next` / `react` / `tailwindcss` / `vitest` / `fast-check` 工具链);PBT 用 `vitest + fast-check`,统一放在 `src/__tests__/properties/`,每条 ≥100 次迭代(对应 design §6)。本计划不包含覆盖率指标、部署、人工 code review、运行真实浏览器进行 e2e 等非可执行任务。

## Tasks

- [ ] 1. 阶段 0:设计体系生成与 Theme_Tokens 落地

  - [ ] 1.1 运行 search.py 生成 design-system/MASTER.md
    - 在仓库根执行 `python3 .kiro/steering/ui-ux-pro-max/scripts/search.py "professional dashboard education driver license elegant minimal" --design-system --persist -p "Drive Exam System"`(参数对齐 R1.2、§3.1)。
    - 校验产出:`design-system/MASTER.md` 存在且内容包含主色/辅色/背景调色板、字体组合、字号阶梯、圆角/阴影、推荐风格关键词、反模式列表(R1.4)。
    - 校验 `.gitignore` 不忽略 `design-system/`(R1.6),如被忽略则移除对应规则。
    - 若 `python3` 与 `python` 都不可用,中止并报告需要先安装 Python(R1.7)。
    - **References**: [R1.1, R1.2, R1.3, R1.4, R1.6, R1.7] [§3.1]
    - _Depends on: (none)_

  - [ ] 1.2 tailwind.config.ts 接入 Master tokens 并移除 animate plugin
    - 在 `tailwind.config.ts` 的 `theme.extend` 写入 `colors`(全部用 `hsl(var(--xxx))` 包裹)、`fontFamily.{sans,serif,mono}`(`var(--font-app-sans)` 等)、`fontSize`(xs..4xl)、`borderRadius` 基于 `var(--radius)` 派生 sm/md/lg/xl、`boxShadow.{sm,md,lg,card,popover}`(R2.2、§3.2)。
    - 保留 `darkMode: ['class']`(R5、R16.2)。
    - 删除 `plugins: [require('tailwindcss-animate')]` 与仅由 `tailwindcss-animate` 引入的 `accordion-down/up` keyframes/animations(R2.5、§11.1)。
    - **References**: [R2.2, R2.5, R5.0, R16.2] [§3.2, §11.1]
    - _Depends on: 1.1_

  - [ ] 1.3 globals.css 注入 :root / .dark token 与 prefers-reduced-motion
    - 在 `src/app/globals.css` 的 `@layer base` 中按 §3.3 给出的清单写入 `:root` 与 `.dark` 两套 CSS 变量(`--background` / `--foreground` / `--card` / `--primary` / `--muted-foreground`(不浅于 slate-600,R5.2)/ `--border`(浅色下可见,R5.4)/ `--ring` / `--radius` 等)。
    - `body` 应用 `bg-background text-foreground font-sans`,`*` 应用 `border-border`(R2.2、R5)。
    - 顶层注入 `@media (prefers-reduced-motion: reduce)` 把全局 `transition-duration`、`animation-duration` 降到 ≤0.01ms(R11.4、§10.2)。
    - **References**: [R2.2, R5.1, R5.2, R5.4, R11.4] [§3.3, §10.2]
    - _Depends on: 1.1_

  - [ ] 1.4 创建 design-system/pages 占位与覆盖文件命名约定
    - 确认 `--persist` 已生成 `design-system/pages/` 目录(R1.5)。
    - 按 §3.5 命名表为 11 个页面预生成空骨架文件(`landing.md`、`exam-home.md`、`exam-session.md`、`exam-result.md`、`exam-wrong.md`、`exam-history.md`、`admin-home.md`、`admin-banks.md`、`admin-categories.md`、`admin-login-logs.md`、`auth.md`),每个文件预留 `# Overrides` 与 `# Checklist Verification` 两个章节,内容留空待 8.11 填写。
    - **References**: [R1.5, R2.1, R14.1] [§3.5]
    - _Depends on: 1.1_

- [ ] 2. 阶段 1:Owned_Components 自建组件库

  - [ ] 2.1 lib/utils.ts 实现 cn helper
    - 新建 `src/lib/utils.ts`,导出 `cn(...inputs: ClassValue[])` = `twMerge(clsx(inputs))`(§4.1)。
    - 保证只 import `clsx` 与 `tailwind-merge`,不引入任何 Banned_Packages(R15.2)。
    - 单元测试 `src/__tests__/lib/utils.test.ts`:验证空入参返回 `''`、冲突类被合并、`undefined`/`false` 被过滤(对照 cn 语义即可)。
    - **References**: [R15.2] [§4.1]
    - _Depends on: (none)_

  - [ ] 2.2 components/ui/button.tsx
    - 重写为 §4.2 接口:`variant ∈ {default, outline, ghost, destructive}`、`size ∈ {sm, md, lg}`,基础类含 `transition-colors duration-200`、`focus-visible:ring-2 ring-ring ring-offset-2`、`disabled:opacity-50 cursor-not-allowed pointer-events-none`、`[&>svg]:h-5 [&>svg]:w-5`,`size=md` 提供 `h-11 min-h-11`,`size=lg` 提供 `h-12 min-h-12`(R4.5、R11.5、R15.3、R15.4、R15.5、R15.6)。
    - 移除 `class-variance-authority` 与 `@radix-ui/react-slot`,不实现 `asChild`(§11.2)。
    - 单元测试 `src/__tests__/components/button.test.tsx`:验证四种 variant、三种 size、disabled、focus-visible 类与 SVG 子元素 5×5 约束。
    - **References**: [R4.5, R11.5, R15.2, R15.3, R15.4, R15.5, R15.6, R15.8] [§4.2]
    - _Depends on: 1.2, 1.3, 2.1_

  - [ ] 2.3 components/ui/card.tsx 家族
    - 重写为 §4.3 的 `Card`、`CardHeader`、`CardTitle`(渲染 `<h3>`)、`CardDescription`、`CardContent`、`CardFooter`,新增 `interactive?: boolean`(开启时附加 `cursor-pointer transition-colors duration-200 hover:bg-accent/40 hover:border-ring/40` + 焦点环,禁止 `hover:scale-*`)、`padded?: boolean`(默认 true,false 去掉 `p-6`)(R4.1、R4.2、R4.3、R4.4、R4.5)。
    - 单元测试:验证 `interactive` 模式包含 `cursor-pointer` 与 hover 类、不含 `scale` 类,验证标题渲染为 `h3`。
    - **References**: [R4.1, R4.2, R4.3, R4.4, R4.5, R15.8] [§4.3]
    - _Depends on: 1.2, 1.3, 2.1_

  - [ ] 2.4 components/ui/badge.tsx 与 alert.tsx
    - 重写 Badge 为 §4.4:`variant ∈ {default, outline, destructive, success, warning}`,基础类 `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium [&>svg]:h-3.5 [&>svg]:w-3.5`(R15.3)。
    - 重写 Alert 为 §4.10:同 5 个 variant,导出 `AlertDescription`,默认按 variant 自动选 lucide 图标(`Info` / `AlertCircle` / `CheckCircle2` / `AlertTriangle`),容器使用 `[&>svg]:h-5 [&>svg]:w-5 [&>svg]:absolute [&_p]:pl-7`(R3.2、R15.3)。
    - 单元测试:每个组件枚举 variant 渲染快照 + 图标存在性断言。
    - **References**: [R3.2, R15.2, R15.3, R15.8] [§4.4, §4.10]
    - _Depends on: 1.2, 1.3, 2.1_

  - [ ] 2.5 components/ui/input.tsx、textarea.tsx、select-native.tsx
    - 重写为 §4.5 / §4.8 / §4.9:三组件统一 size=sm/md/lg(默认 md),size 命名分别为 `inputSize` / `textareaSize` / `selectSize`(避开 HTML `size` 属性冲突,R15.10);共享焦点环、disabled、`aria-[invalid=true]:border-destructive` 类。
    - SelectNative 使用 `<select> + appearance-none` + 右侧绝对定位 `<ChevronDown />`(R3.2、R3.3)。
    - 单元测试:验证 size 映射、`invalid=true` 时 `aria-invalid="true"` 与红边、disabled 类。
    - **References**: [R10.2, R11.2, R15.4, R15.5, R15.6, R15.8, R15.10] [§4.5, §4.8, §4.9]
    - _Depends on: 1.2, 1.3, 2.1_

  - [ ] 2.6 components/ui/label.tsx 与 checkbox.tsx
    - Label:重写为原生 `<label>`,移除 `@radix-ui/react-label` 依赖;`required={true}` 时尾部追加 `<span aria-hidden className="ml-0.5 text-destructive">*</span>`(R11.2、§4.6)。
    - Checkbox:用 `<input type="checkbox">` + `peer-checked` 视觉方块 + 内嵌 lucide `Check` 图标实现,容器套 `min-h-11 min-w-11 inline-flex items-center` 以满足 44×44 触控目标(R11.5、R15.7、§4.7)。受控值统一改为原生 `checked` / `onChange`(替代旧 `onCheckedChange`,R15.10)。
    - 单元测试:验证 `htmlFor` 与表单控件可被 `getByLabelText` 查到、checked 态下 `Check` 图标可见、容器具备 44×44 类。
    - **References**: [R11.2, R11.3, R11.5, R15.2, R15.7, R15.10] [§4.6, §4.7]
    - _Depends on: 1.2, 1.3, 2.1_

  - [ ] 2.7 components/ui/dialog.tsx 基于原生 <dialog>
    - 新增 `src/components/ui/dialog.tsx`,以原生 `<dialog>` + `showModal()` 为底,导出 `Dialog`、`DialogTrigger`、`DialogContent`、`DialogTitle`、`DialogDescription`、`DialogFooter`,样式贴合 Theme_Tokens(`bg-card text-card-foreground border-border rounded-lg`)。背景遮罩通过 `::backdrop` 伪类(R15.2、§9.9 备注、§11.2)。
    - 单元测试:验证 `showModal` 触发 `<dialog open>`、关闭后 `open` 为 false、Esc 键关闭、焦点环类存在。
    - **References**: [R4.5, R11.4, R15.2] [§9.9, §11.2]
    - _Depends on: 2.1, 2.2_

- [ ] 3. 阶段 2:Theme_Toggle 与 RootLayout 集成

  - [ ] 3.1 lib/use-theme.ts 与 _theme-init-script.ts
    - 新增 `src/app/_theme-init-script.ts` 导出 `themeInitScript` 字符串(§7.1):同步读 `localStorage('theme')` + `matchMedia('(prefers-color-scheme: dark)')`,写 `<html>.classList` 与 `colorScheme`,异常兜底 light(R16.5)。
    - 新增 `src/lib/use-theme.ts`(`'use client'`):暴露 `{ theme, toggle }`,挂载时同步读取 `<html>.classList`,监听 storage 事件跨标签同步;`toggle` 写入 `localStorage` 与 `<html>` 类(R16.2、R16.4、§7.2)。
    - 单元测试:在 jsdom 下模拟 `localStorage` / `matchMedia`,验证初态读取与 toggle 翻转。
    - **References**: [R16.2, R16.3, R16.4, R16.5] [§7.1, §7.2]
    - _Depends on: 1.3_

  - [ ] 3.2 components/theme-toggle.tsx
    - 实现 §7.3 的 `<ThemeToggle />`:`'use client'`,内部调用 `useTheme()`,根据 `theme` 切换 `Sun` / `Moon` 图标,`<Button variant="ghost" size="md" className="h-11 w-11 p-0" aria-label="切换主题">`,满足 R4 系列与 R11.5、R16.1、R16.6。
    - 单元测试:验证 ARIA label、点击后 icon 切换、容器 ≥44×44。
    - **References**: [R4.1, R4.2, R4.5, R11.5, R16.1, R16.2, R16.6] [§7.3]
    - _Depends on: 2.2, 3.1_

  - [ ] 3.3 RootLayout 注入字体、ThemeInitScript 与 Toaster
    - 重写 `src/app/layout.tsx`:用 `next/font/google` 按 Master 推荐字体加载 `Inter` 与中文 fallback `Noto_Sans_SC` 暴露 `--font-app-sans` / `--font-app-sans-cn`(R2.3、§3.4)。
    - `<html lang="zh-CN" suppressHydrationWarning>` 上挂载字体 className;`<head>` 顶部以 `<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />` 注入主题脚本,放在任何 React 内容之前(R16.5、§7.1)。
    - `<body>` 渲染 `{children}` + `<Toaster position="top-center" richColors closeButton toastOptions={{...}} />` 接入 Theme_Tokens(R15.9、§4.11)。
    - **References**: [R2.3, R15.8, R15.9, R16.5] [§3.4, §4.11, §7.1]
    - _Depends on: 1.2, 1.3, 1.4, 2.1, 3.1_

- [ ] 4. 阶段 3:App Shell 重写

  - [ ] 4.1 components/nav-icon.tsx 与 topbar.tsx
    - 重写 `nav-icon.tsx`:`NavIconProps = { icon: LucideIcon; className?; label? }`,强制只接受 `LucideIcon` 类型(R3.2、§4.12)。
    - 重写 `topbar.tsx`:`variant: 'student' | 'admin'`,按 §8.1 / §8.2 渲染浮动卡片化顶栏(`top-4 left-4 right-4` 或 `sticky top-4` + `rounded-xl` + `bg-card/95 backdrop-blur shadow-sm`),admin 变体支持 `onMenuClick` 触发抽屉,右侧固定 `<ThemeToggle />` + `UserMenu`(R6.1、R6.2、R8.1、R9.1、R16.1)。
    - 单元测试:验证两种 variant 下 ThemeToggle 必现、admin 下汉堡按钮 `<lg` 渲染。
    - **References**: [R3.2, R6.1, R6.2, R8.1, R9.1, R16.1] [§4.12, §8.1, §8.2]
    - _Depends on: 2.2, 3.2_

  - [ ] 4.2 components/sidebar.tsx
    - 重写为 §8.2:`<aside>` + `lg:translate-x-0` + 抽屉态 `translate-x-{0,-full}`,移动端遮罩 `<div className="fixed inset-0 z-40 bg-foreground/40 lg:hidden" />`,仅 admin 使用;每个导航项使用 lucide 图标 + `transition-colors duration-200` + 焦点环(R4.2、R4.3、R4.5、R12.3、R15.2)。
    - 单元测试:open=false 时 `-translate-x-full` 类、open=true 时 `translate-x-0` 类、点击遮罩触发 `onClose`、≥1024px 视口模拟下抽屉始终可见。
    - **References**: [R4.2, R4.3, R4.5, R12.3, R15.2] [§8.2]
    - _Depends on: 2.1, 4.1_

  - [ ] 4.3 components/student-shell.tsx
    - 重写为 §8.1:`<div className="min-h-screen bg-background text-foreground">` 包裹浮动 Topbar + `<main className="mx-auto w-full max-w-3xl px-4 pt-24 pb-12">`(R6.2、R6.3、R8.1)。
    - <md 视口将 Tabs 折叠为底部 NavBar(`md:hidden fixed bottom-4 ...`),触控目标 ≥44(R11.5、R12.2)。
    - 单元测试:DOM 中存在唯一一个 `max-w-3xl` 容器、Topbar 含 ThemeToggle、`<md` 模拟下渲染底部 NavBar。
    - **References**: [R6.1, R6.2, R6.3, R8.1, R11.5, R12.2, R16.1] [§8.1]
    - _Depends on: 4.1_

  - [ ] 4.4 components/admin-shell.tsx
    - 重写为 §8.2:`'use client'`,维护 `open` 状态,`<lg:pl-64>` 主区,`<main className="mx-auto w-full max-w-7xl px-4 lg:px-6 pt-6 pb-12">`,顶栏汉堡按钮 `<lg` 触发 `setOpen(true)`,顶栏右侧 `<ThemeToggle />` + `<UserMenu />`(R6.2、R6.3、R9.1、R12.3、R12.4、R16.1)。
    - 单元测试:DOM 中存在唯一一个 `max-w-7xl` 容器、`<lg` 模拟下汉堡按钮可见且点击翻转 `open`、`≥lg` 模拟下 Sidebar 常驻。
    - **References**: [R6.2, R6.3, R9.1, R12.3, R12.4, R16.1] [§8.2]
    - _Depends on: 4.1, 4.2_

- [ ] 5. 阶段 4:Auth_Surface 页面

  - [ ] 5.1 app/page.tsx Landing 重写
    - 重写为 §9.1:浮动顶栏(`<Car />` + 系统名 + 登录 / 后台双 CTA),hero 区 H1 + 副标题 + `<Button variant="default" size="md">` + `<Button variant="outline" size="md">`(R7.1–R7.3),≥768px 双栏可见,`<sm` 单列堆叠,垂直间距 ≥16px(R7.3、R12.2)。
    - 三张特性卡使用 `<Card>` 同样式,卡内顶部 lucide 图标 `h-6 w-6 text-primary`(`Layers` / `BarChart3` / `ShieldCheck`),≥sm 双列、≥md 三列,移除原 emoji 图标(R3.1、R3.2、R3.4、R7.4)。
    - **References**: [R3.1, R3.2, R3.3, R3.4, R7.1, R7.2, R7.3, R7.4, R7.5, R12.2] [§9.1]
    - _Depends on: 2.2, 2.3, 3.3_

  - [ ] 5.2 app/login/page.tsx 学员登录页
    - 重写为 §9.11 共享布局:居中 `<Card padded className="max-w-md">`,顶部品牌 `<Car />` + 系统名 + Badge "学员登录",表单使用 Owned `Label` + `Input`,错误以 `<p className="text-sm text-destructive mt-1">` + `Input invalid` 显示(R10.1、R10.2、R11.2)。
    - 适配 `react-hook-form` 受控值到新 Input API(R13.1、R13.2、R15.10);Server Action 调用入参 / 返回不变。
    - **References**: [R10.1, R10.2, R11.2, R13.1, R13.2, R15.10] [§9.11]
    - _Depends on: 2.3, 2.5, 2.6, 3.3_

  - [ ] 5.3 app/admin/(auth)/login/page.tsx 管理员登录页
    - 与 5.2 同布局、同表单组件,品牌徽章改为 `<ShieldCheck />` + Badge "管理员登录",主色用 `text-primary` 强调差异(R10.1、R10.2)。
    - **References**: [R10.1, R10.2, R11.2, R13.1, R15.10] [§9.11]
    - _Depends on: 2.3, 2.5, 2.6, 3.3_

  - [ ] 5.4 app/change-password/page.tsx 自助改密页
    - 同 §9.11 布局,Badge "修改密码",三个 `Input type="password"` + `Label`,`<Button size="lg" disabled={!isValid}>`(R10.3),错误展示规则同 5.2。
    - **References**: [R10.1, R10.3, R11.2, R13.1, R15.10] [§9.11]
    - _Depends on: 2.3, 2.5, 2.6, 3.3_

- [ ] 6. 阶段 5:Student_Surface 页面

  - [ ] 6.1 /exam ExamModePicker 与 category-select-dialog
    - 重写 `src/app/(student)/exam/page.tsx` 与 `_components/exam-mode-picker.tsx`、`_components/category-select-dialog.tsx`:每个题库一张 `<Card>`,内部 4 列(md+)/2 列 grid 渲染顺序/随机/章节/模考四个 `<Button variant="outline" size="md">`,模考用 `default` variant 强调(R8.2、§9.2)。
    - 存在 ONGOING 会话时,对应模式按钮换为 `<Button variant="default">` + `PlayCircle` 图标 + 文案"继续上次",下方一行 `<Button variant="ghost" size="sm">` 提供"放弃后重开"(R8.3)。
    - 错题重做独立 Card,顶部 `<BookMarked />` 图标。`category-select-dialog` 改用 2.7 新 Dialog,移除 `@radix-ui/react-dialog`(R3.1、R3.4、R15.2)。
    - **References**: [R3.1, R3.2, R3.3, R3.4, R8.2, R8.3, R15.2] [§9.2]
    - _Depends on: 2.2, 2.3, 2.4, 2.7, 4.3_

  - [ ] 6.2 question-view、answer-feedback、progress-bar、mock-timer
    - 重写 `src/app/(student)/exam/_components/question-view.tsx`、`answer-feedback.tsx`、`progress-bar.tsx`、`mock-timer.tsx`:进度条用 SVG/`div` 比例条,题号 + 题型 Badge,选项使用 §9.3 表格规则(`idle` / `selected` / `correct` / `wrong` / `correct-answer`),每种状态都同时含色调类与 lucide 图标(`Circle` / `CheckCircle2` / `XCircle` / `Check`),不允许只用色相区分(R8.4、R11.3、§5.3、§9.3)。
    - 模考倒计时图标用 lucide `Clock`,字号 `text-base font-mono`(R3.2、R3.3)。
    - 单元测试:对每个 OptionVisual state,断言渲染既含色调类又含对应 lucide `<svg>` 图标(铺垫 PBT-5)。
    - **References**: [R3.2, R3.3, R8.4, R11.3, R15.7] [§5.3, §9.3]
    - _Depends on: 2.2, 2.3, 2.4, 2.6_

  - [ ] 6.3 三个 player 与 session 路由 + submit-confirm-dialog
    - 重写 `src/app/(student)/exam/session/[attemptId]/page.tsx` 与 `_components/{practice-player,mock-player,random-player}.tsx`:复用 6.2 的子组件,底栏渲染"上一题 outline / 下一题 default / 提交 destructive"按钮组,模考 player 注入 `mock-timer`(R8.4、§9.3)。
    - `_components/submit-confirm-dialog.tsx` 改用 2.7 新 Dialog,移除 `@radix-ui/react-dialog`(R15.2)。
    - 保留三个 player 的状态契约(`PlayerState`)、`actions.ts` 调用入参不变(R13.1、R13.2、§5.3)。
    - **References**: [R8.4, R11.3, R13.1, R13.2, R15.2] [§5.3, §9.3]
    - _Depends on: 2.7, 4.3, 6.2_

  - [ ] 6.4 /exam/session/[attemptId]/result 成绩页
    - 重写 `src/app/(student)/exam/session/[attemptId]/result/page.tsx`:`<Card padded>` 顶部居中渲染通过/未通过视觉(`Trophy h-16 w-16 text-emerald-600` 或 `Frown h-16 w-16 text-destructive`),数据网格 2×3(<sm 单列):得分/用时/正确率 + 答对(Badge success)/答错(Badge destructive)/未答(Badge outline),CardFooter 三个按钮(继续学习 default / 看错题 outline / 返回首页 ghost)(R3.4、R7.5、R8.6、§9.4)。
    - 移除原 emoji `🎉` `❌`(R3.1)。
    - **References**: [R3.1, R3.2, R3.4, R7.5, R8.6] [§9.4]
    - _Depends on: 2.2, 2.3, 2.4, 4.3_

  - [ ] 6.5 /exam/wrong 错题本与 wrong-list
    - 重写 `src/app/(student)/exam/wrong/page.tsx` 与 `_components/wrong-list.tsx`:筛选条 `SelectNative`(题库 / 章节)+ `Input`(关键字 + lucide `Search` 图标),列表项 `<Card interactive>` 含题号 + Badge outline 章节 + 题干 2 行截断 + 我的错答(Badge destructive)/正确答案(Badge success),CardFooter 两个按钮(R8.5、§9.5)。
    - 自有 Pagination 组件基于 Owned Button(`<Button size="sm" variant="outline">`)。
    - **References**: [R3.2, R3.3, R8.5, R11.3, R15.4] [§9.5]
    - _Depends on: 2.2, 2.3, 2.4, 2.5, 4.3_

  - [ ] 6.6 /exam/history 列表与 [attemptId] 详情
    - 重写 `src/app/(student)/exam/history/page.tsx`:表格列 `日期 / 模式 Badge / 题库 / 得分 / 用时 / 操作`,`<md` 折叠为卡片列表,行 hover `hover:bg-accent/40`(R4.2、R8.5、§9.6)。
    - 重写 `src/app/(student)/exam/history/[attemptId]/page.tsx`:复用 6.4 的成绩卡 + 6.2 的 `QuestionView`(`state=correct/wrong`)做逐题回放,顶部 `<Button variant="ghost"><ChevronLeft />返回记录</Button>`(R8.5)。
    - **References**: [R4.2, R8.5, R12.2] [§9.6]
    - _Depends on: 2.2, 2.3, 2.4, 4.3, 6.2_

- [ ] 7. 阶段 6:Admin_Surface 页面

  - [ ] 7.1 admin (protected) layout 与 /admin 工作台首页
    - 重写 `src/app/admin/(protected)/layout.tsx`:用 `<AdminShell>` 包裹 `{children}`,传入 session 用户(R9.1、§8.2)。
    - 重写 `src/app/admin/(protected)/page.tsx`:顶部 4 列(lg)/2 列(md)/1 列(<md)stat 卡片(图标 + Badge 趋势 + 数字 + 描述),中部两列布局(最近活动 + 快捷入口),底部可选 `<Alert variant="warning">`(R9.2、§9.7)。
    - **References**: [R3.2, R3.3, R9.1, R9.2, R12.2] [§8.2, §9.7]
    - _Depends on: 2.2, 2.3, 2.4, 4.4_

  - [ ] 7.2 /admin/banks 列表、/new 与 delete-bank-button
    - 重写 `src/app/admin/(protected)/banks/page.tsx`:筛选 `Input` + 主 CTA `<Button><Plus />新建题库</Button>`,表格视图(lg+)/卡片视图(<lg)切换,空状态居中 `<Inbox h-16 w-16 text-muted-foreground />` + 文案 + 主 CTA(R3.2、R9.3、R12.2、§9.8)。
    - 重写 `src/app/admin/(protected)/banks/new/page.tsx`:单列 `BankForm`(用 7.3 中实现的版本)。
    - 重写 `src/app/admin/(protected)/banks/delete-bank-button.tsx`:用 2.7 新 Dialog 做确认,Button variant=destructive size=sm(R15.2)。
    - **References**: [R3.2, R9.3, R12.2, R15.2] [§9.8]
    - _Depends on: 2.2, 2.3, 2.4, 2.5, 2.7, 7.1_

  - [ ] 7.3 /admin/banks/[id]、bank-form、category-section
    - 重写 `src/app/admin/(protected)/banks/[id]/page.tsx`:左列 `BankForm` 右列 `CategorySection`,sm 以下单列堆叠(R9.3、§9.8)。
    - 重写 `bank-form.tsx`:`Input`(题库名)+ `Textarea`(描述)+ `SelectNative`(分类)+ `<Button size="lg">` 提交,`react-hook-form` 受控适配(R13.1、R13.2、R15.10)。
    - 重写 `category-section.tsx`:列表 + 增删按钮使用 Owned Button + 2.7 Dialog 确认,移除 Radix 依赖(R15.2)。
    - **References**: [R9.3, R10.2, R11.2, R13.1, R13.2, R15.2, R15.10] [§9.8]
    - _Depends on: 2.2, 2.3, 2.5, 2.6, 2.7, 7.1_

  - [ ] 7.4 /admin/categories 与 categories-client
    - 重写 `src/app/admin/(protected)/categories/page.tsx`(RSC) 与 `categories-client.tsx`(`'use client'`):`<ul role="tree">` 树形列表,每项右侧操作按钮组(`Pencil` / `Trash2` 用 lucide,destructive 用 `<Button variant="destructive" size="sm">`),空状态 `<ListTree h-16 w-16 />` + CTA。删除确认改用 2.7 Dialog,移除原 Radix Dialog(R3.2、R9.4、R15.2、§9.9)。
    - **References**: [R3.2, R9.4, R15.2] [§9.9]
    - _Depends on: 2.2, 2.3, 2.4, 2.5, 2.7, 7.1_

  - [ ] 7.5 /admin/login-logs
    - 重写 `src/app/admin/(protected)/login-logs/page.tsx`:筛选条 `Input` + `SelectNative`(状态)+ 日期范围,表格列 `时间 / 用户 / IP / UA / 状态 Badge / 操作`,状态徽章 `success` "成功"+ `CheckCircle2` / `destructive` "失败"+ `XCircle` / `warning` "冻结"+ `Lock`(R3.2、R9.5、R11.3、§9.10)。
    - 分页器复用 6.5 的 Owned Pagination 模式。
    - **References**: [R3.2, R9.5, R11.3] [§9.10]
    - _Depends on: 2.2, 2.4, 2.5, 7.1_

  - [ ] 7.6 /admin/questions 与子路由
    - 重写 `src/app/admin/(protected)/questions/**/page.tsx`(及 `_components`):列表使用与 7.2 相同的表格/卡片切换样式,导入 / 编辑表单复用 7.3 的 `BankForm` 模式(R9.6、§9 同类规范)。
    - 移除任何残留的 Radix / cva / emoji 图标(R3.1、R3.2、R15.2)。
    - **References**: [R3.1, R3.2, R9.6, R13.1, R15.2] [§9.7, §9.8]
    - _Depends on: 2.2, 2.3, 2.4, 2.5, 2.7, 7.1_

- [ ] 8. 阶段 7:依赖移除、Correctness Properties 与 Pre-Delivery 验收

  - [ ] 8.1 PBT 1:Banned_Packages 不出现于 dependencies
    - 新增 `src/__tests__/properties/banned-packages.property.test.ts`,使用 `vitest + fast-check` 任意置换 Banned_Packages 名集合,断言 `package.json.dependencies` 中均不存在,且不存在 `@radix-ui/` 前缀键(≥100 次迭代,§6 Property 1)。
    - **References**: [R2.5, R15.2] [§6 Property 1]
    - _Depends on: 1.1_

  - [ ] 8.2 PBT 2:源码反模式扫描全称缺席
    - 新增 `src/__tests__/properties/source-anti-patterns.property.test.ts`:用 `fast-check` 在 `src/**/*.{ts,tsx}` 文件集合 × `AntiPatternRegexSet`(hex 字面量、像素值类、禁用图标库 import、禁用包 import、emoji-as-icon 字符、形变 hover、低不透明玻璃)上做笛卡尔抽样,任一组合不得匹配(≥100 次迭代,§6 Property 2)。
    - **References**: [R2.2, R3.1, R3.2, R3.3, R4.4, R5.3, R5.4, R15.2, R15.8] [§6 Property 2]
    - _Depends on: 6.6, 7.6_

  - [ ] 8.3 PBT 3:Owned_Components 焦点与禁用基线
    - 新增 `src/__tests__/properties/owned-focus-disabled.property.test.ts`:在 `OwnedComponentMatrix`(C × variant × size × disabled)上 `fast-check` 抽样渲染,断言 disabled=false 含 `focus-visible:ring-2 focus-visible:ring-ring`、disabled=true 含 `opacity-50` 与(`cursor-not-allowed` 或 `pointer-events-none`)(≥100 次迭代,§6 Property 3)。
    - **References**: [R4.5, R15.5, R15.6] [§6 Property 3]
    - _Depends on: 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 8.4 PBT 4:触控目标 ≥ 44×44
    - 新增 `src/__tests__/properties/touch-target.property.test.ts`:对 Button(size ∈ {md,lg} × 全部 variant)断言 `min-h-11` 与高度类同时存在;对 Checkbox 包裹层断言存在祖先含 `min-h-11 min-w-11`(≥100 次迭代,§6 Property 4)。
    - **References**: [R11.5, R15.4] [§6 Property 4]
    - _Depends on: 2.2, 2.6_

  - [ ] 8.5 PBT 5:状态语义不依赖单一颜色
    - 新增 `src/__tests__/properties/dual-cue.property.test.ts`:对 Checkbox(checked ∈ {true,false})与 OptionView(state ∈ {idle,selected,correct,wrong,correct-answer})抽样渲染,语义状态下断言同时存在 lucide `<svg>` 与对应色调类(`text-primary` / `text-emerald-700` / `text-destructive`)(≥100 次迭代,§6 Property 5)。
    - **References**: [R8.4, R11.3, R15.7] [§6 Property 5]
    - _Depends on: 2.6, 6.2_

  - [ ] 8.6 PBT 6:ThemeToggle 状态机
    - 新增 `src/__tests__/properties/theme-toggle.property.test.ts`:用 `fast-check` 抽 `(stored, system, k)` ∈ {null,'light','dark'} × {'light','dark'} × [0,5],在 jsdom 中模拟 `localStorage` 与 `matchMedia`,运行 `themeInitScript` + 模拟 k 次点击 ThemeToggle,断言 `<html>.classList.contains('dark')` 与 `localStorage.getItem('theme')==='dark'` 等价、二者每次点击同步翻转(≥100 次迭代,§6 Property 6)。
    - **References**: [R16.2, R16.3, R16.4, R16.5] [§6 Property 6]
    - _Depends on: 3.1, 3.2_

  - [ ] 8.7 PBT 7:Server Action 签名稳定
    - 新增 `src/__tests__/properties/server-action-signature.property.test.ts` 与 `__snapshots__/server-actions.snap`:用 `ts-morph` 提取 `src/app/**/actions.ts` 全部 `export async function` 的参数类型 + 返回类型 + zod schema 文本,首次运行写入 baseline 快照,后续以 `fast-check` 抽样函数集合并断言签名等于 baseline(≥100 次迭代,§6 Property 7)。
    - 首次运行前需在重构最早 commit 之前的 baseline 上生成快照(可用一条 `pnpm test --update` 在干净分支生成)。
    - **References**: [R13.1, R13.2] [§6 Property 7]
    - _Depends on: 6.6, 7.6_

  - [ ] 8.8 PBT 8:URL 路由稳定
    - 新增 `src/__tests__/properties/route-stability.property.test.ts`:`BaselineRoutes` 集合硬编码 17 条基线 URL(§6 Property 8 列表),用 `fast-check` 抽样路由,断言重构后 `src/app/**/page.tsx` 经路由组规则解析后存在对应文件(用 fs glob + Next.js 路由组消除规则)(≥100 次迭代,§6 Property 8)。
    - **References**: [R13.4] [§6 Property 8]
    - _Depends on: 5.1, 5.2, 5.3, 5.4, 6.1, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 8.9 PBT 9:Shell 最大宽度单一性
    - 新增 `src/__tests__/properties/shell-max-width.property.test.ts`:`fast-check` 抽样 `src/app/(student)/**/page.tsx` 与 `src/app/admin/(protected)/**/page.tsx` 文件,断言前者出现的 `max-w-*` 类只属于 `{'max-w-3xl'}`、后者只属于 `{'max-w-7xl'}`(≥100 次迭代,§6 Property 9)。
    - **References**: [R6.3] [§6 Property 9]
    - _Depends on: 6.6, 7.6_

  - [ ] 8.10 移除 Banned_Packages 并 pnpm install
    - 执行 `pnpm remove @radix-ui/react-checkbox @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-radio-group @radix-ui/react-select @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-toast class-variance-authority tailwindcss-animate`,随后 `pnpm install`(R13.5、§11.1)。
    - 跑 `pnpm lint && pnpm typecheck && pnpm test --run` 三条命令全部通过(R13.3)。
    - 在仓库根产出 `BANNED_REMOVAL_NOTES.md` 记录 `pnpm-lock.yaml` 改动摘要(直接 / 传递依赖被移除清单),供 PR 描述引用(R13.5)。
    - **References**: [R2.5, R13.3, R13.5, R15.2] [§11.1]
    - _Depends on: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [ ] 8.11 逐页填写 Pre-Delivery Checklist Verification
    - 对 1.4 中预生成的 11 个 `design-system/pages/<page>.md` 逐个填写 `# Checklist Verification` 章节(SKILL.md 5 类共 16 项 × 11 页 ≈ 176 个勾选位),勾选项必须显式 `[x]` 或在后追加 `// reason: ...` 标注延后原因(R14.1、R14.2、R14.3)。
    - 内容需基于真实代码核对:对每页跑 `pnpm test --run` + 渲染快照断言,把通过结果回填到对应页面文件。
    - **References**: [R14.1, R14.2, R14.3] [§3.5, §11.3]
    - _Depends on: 8.10_

## Notes

- 任务编号 `X.Y` 即为 spec-task-execution 子代理的执行单元,每条限定 1–3 个文件 + 必要测试,可在单次调用内闭环。
- PBT 任务(8.1–8.9)是 Correctness Properties 的强制验证,**不**标记 `*`(对应 R13.3 + design §6,不可跳过)。
- `_Depends on:_` 行直接列出前置任务编号,任务调度器据此构造 DAG;同 wave 任务可并行,见末尾 Task Dependency Graph。
- 凡涉及修改 `actions.ts` 入参/返回、Prisma schema、URL 路由、`auth.ts`、`middleware.ts` 的改动均被禁止(R13.1);允许同步重写 `onSubmit` / 受控值适配代码以接住新组件 API(R13.2、R15.10)。
- 不包含覆盖率指标、e2e 浏览器跑测、生产部署、人工 code review 等非可执行任务。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.1"] },
    { "id": 3, "tasks": ["2.7", "3.2"] },
    { "id": 4, "tasks": ["3.3", "4.1", "8.1", "8.3", "8.4"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["4.3", "4.4", "8.6"] },
    { "id": 7, "tasks": ["5.1", "5.2", "5.3", "5.4", "6.2", "7.1"] },
    { "id": 8, "tasks": ["6.1", "6.4", "6.5", "6.6", "7.2", "7.3", "7.4", "7.5", "7.6", "8.5"] },
    { "id": 9, "tasks": ["6.3"] },
    { "id": 10, "tasks": ["8.2", "8.7", "8.8", "8.9"] },
    { "id": 11, "tasks": ["8.10"] },
    { "id": 12, "tasks": ["8.11"] }
  ]
}
```
