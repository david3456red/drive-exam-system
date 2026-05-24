# Implementation Plan: 答题模式 (Exam Modes)

## Overview

本任务列表把 P3 答题模式功能的设计拆分为可增量交付的编码步骤。先搭建测试基础设施和数据层，再自底向上实现 `examEngine` 纯函数与对应属性测试，然后是 Server Actions、UI 子组件、页面，最后用集成测试串起完整闭环。

实现栈：Next.js 14 + TypeScript + Prisma + SQLite + Vitest + fast-check + shadcn/ui，包管理器使用 `pnpm`。

权限点 `exam:practice` / `exam:mock` / `stats:self` / `stats:all` 已在 `prisma/seed.ts` 中存在，本期无需新增。

## Tasks

- [x] 1. 搭建测试基础设施
  - [x] 1.1 安装并配置 Vitest 与 fast-check
    - 用 `pnpm add -D vitest @vitest/coverage-v8 @vitejs/plugin-react fast-check @testing-library/react @testing-library/jest-dom jsdom` 安装依赖
    - 在仓库根目录新建 `vitest.config.ts`，配置 `test.environment = 'jsdom'`、`test.setupFiles = ['./vitest.setup.ts']`、`resolve.alias` 与 `tsconfig.json` 的 `paths` 一致（`@/*` → `src/*`）
    - 新建 `vitest.setup.ts` 引入 `@testing-library/jest-dom`
    - 在 `package.json` 的 `scripts` 中追加 `"test": "vitest run"` 与 `"test:watch": "vitest"`
    - 在 `tsconfig.json` 的 `include` 中追加 `src/**/__tests__/**/*` 与 `vitest.setup.ts`，在 `compilerOptions.types` 中追加 `"vitest/globals"`
    - 用一个最小用例（`expect(1+1).toBe(2)`）验证 `pnpm test` 能跑通
    - _Requirements: Testing Strategy_

  - [x] 1.2 编写共享 fast-check Arbitraries
    - 新建 `src/lib/exam-engine/__tests__/arbitraries.ts`
    - 实现 `arbQuestionType`（`'SINGLE' | 'MULTI' | 'JUDGE'`）、`arbOptionLetter`（A-F）、`arbAnswerForType(type)`（SINGLE/JUDGE 单字母、MULTI 至少 2 个升序拼接的字母）、`arbQuestion`（产出 id/type/answer/options/createdAt 字段一致的题目）
    - 实现 `arbCategoryTree(maxDepth=3)`、`arbWrongQuestionState`（覆盖 mastered/not-mastered、rightCount 0~3 的组合）
    - 在文件头注释中标注 "Feature: exam-modes — Shared arbitraries"
    - _Requirements: Testing Strategy_

- [x] 2. Prisma schema 变更与迁移
  - [x] 2.1 给 `ExamAttempt` 添加快照字段与复合索引
    - 修改 `prisma/schema.prisma` 中 `ExamAttempt` 模型：新增 `questionOrder String @default("[]")`、`currentIndex Int @default(0)`、`categoryIds String @default("[]")`、`expiresAt DateTime?`
    - 新增复合索引 `@@index([userId, mode, status])`
    - 保持其余字段与索引不变
    - _Requirements: 1.1, 1.7, 1.8, 2.4, 3.1, 3.5, 4.1, 4.5, 5.1, 5.3, 5.9_

  - [x] 2.2 应用 schema 变更并重新生成 Prisma Client
    - 运行 `pnpm db:push` 把字段同步到 `prisma/prisma/dev.db`
    - 运行 `pnpm db:generate` 让 `@prisma/client` 类型包含新字段
    - 验证：`tsc --noEmit` 不报新字段相关错误
    - _Requirements: Data Models_

- [x] 3. examEngine 类型与配置
  - [x] 3.1 创建 `src/lib/exam-engine/types.ts`
    - 导出 `EXAM_MODES`、`ExamMode`、`ATTEMPT_STATUS`、`AttemptStatus`、`EXAM_MODE_DISPLAY` 与设计 §Data Models 一致
    - 导出 `MOCK_CONFIG`：`subject_1` → 100 题 / 45 分钟 / 90 分；`subject_4` → 50 题 / 30 分钟 / 90 分；`__default` → 50 题 / 30 分钟 / 90 分
    - 导出 `getMockConfig(bankCode: string)` 帮助函数，未匹配时返回 `__default`
    - 导出统一的 `ActionResult<T>` 类型（与 `banks/actions.ts` 的写法一致）
    - _Requirements: 5.1, 5.3, 5.7_

- [x] 4. examEngine: judger（答案比对与提交可用性）
  - [x] 4.1 实现 `src/lib/exam-engine/judger.ts`
    - 实现 `normalizeAnswer(type, raw)`：去空白、转大写；MULTI 按字母升序去重拼接
    - 实现 `compareAnswer(type, userAnswer, correctAnswer)`：内部调用 `normalizeAnswer` 后比较；MULTI 按集合相等
    - 实现 `isSubmittable(type, selectedCount, optionsCount)`：SINGLE/JUDGE 要求恰好 1，MULTI 要求 `2 <= selectedCount <= optionsCount`
    - 实现 `clampCostMs(value)`：钳制到 `[0, 3_600_000]`
    - 全部为纯函数，无 I/O
    - _Requirements: 7.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 4.2 编写 `compareAnswer` 属性测试
    - 文件：`src/lib/exam-engine/__tests__/judger.compare.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 7: 答案比对函数语义"
    - **Property 7: 答案比对函数语义**
    - **Validates: Requirements 7.1**
    - 用 fast-check 的 `arbAnswerForType` 构造样本，对 SINGLE/JUDGE 验证 `compareAnswer == (a===b)`，对 MULTI 验证集合相等且对正确答案的任意排列都返回 `true`
    - `numRuns: 200`

  - [ ]* 4.3 编写 `isSubmittable` 属性测试
    - 文件：`src/lib/exam-engine/__tests__/judger.submittable.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 11: 提交按钮的可用性谓词"
    - **Property 11: 提交按钮的可用性谓词**
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.5**
    - `numRuns: 100`

- [x] 5. examEngine: wrongbook（错题本状态机）
  - [x] 5.1 实现 `src/lib/exam-engine/wrongbook.ts`
    - 定义 `WrongState` 类型 `{ wrongCount, rightCount, mastered, lastWrongAt }`（不含 id）
    - 实现纯函数 `applyExamResult(prev: WrongState | null, isCorrect: boolean, now: Date): WrongState | null`，严格按设计 §错题本状态机详细规则的真值表
    - 答对且 `prev == null` 时返回 `null`（不创建条目）
    - `mastered=true` 再答错时重置 `rightCount=0` 并把 `mastered` 置回 `false`
    - 答对且 `rightCount + 1 >= 3` 时把 `mastered` 置 `true`
    - _Requirements: 6.2, 6.3, 6.4, 7.5, 7.6, 7.7_

  - [ ]* 5.2 编写错题本状态机属性测试
    - 文件：`src/lib/exam-engine/__tests__/wrongbook.apply.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 8: 错题本状态机转移规则"
    - **Property 8: 错题本状态机转移规则**
    - **Validates: Requirements 6.2, 6.3, 6.4, 7.5, 7.6, 7.7**
    - 验证全部 6 条转移规则；额外验证单调性：`next.wrongCount >= prev?.wrongCount ?? 0` 与 `next.lastWrongAt >= prev?.lastWrongAt ?? Epoch`
    - `numRuns: 200`

- [x] 6. examEngine: snapshot（题目顺序序列化）
  - [x] 6.1 实现 `src/lib/exam-engine/snapshot.ts`
    - 实现 `serializeOrder(ids: string[]): string` 与 `parseOrder(json: string): string[]`
    - `parseOrder` 在解析失败、不是数组、元素不是字符串时返回 `[]` 并不抛错
    - 实现 `serializeCategoryIds` / `parseCategoryIds`，复用相同实现
    - _Requirements: Data Models_

  - [ ]* 6.2 编写 snapshot 往返单元测试
    - 文件：`src/lib/exam-engine/__tests__/snapshot.test.ts`
    - 用例：空数组、含特殊字符的 cuid 字符串、损坏 JSON、非字符串元素
    - 性质：`parseOrder(serializeOrder(xs)) === xs`
    - _Requirements: Data Models_

- [x] 7. examEngine: question-loader（按模式加载题目）
  - [x] 7.1 实现 `src/lib/exam-engine/question-loader.ts`
    - 导出 `loadQuestionsForMode(prismaClient, input)` 异步函数，按 `input.mode` 分支：
      - `SEQUENTIAL` / `CHAPTER`：按 `Question.createdAt asc` 返回；CHAPTER 通过递归展开 `categoryIds` 得到全部后代分类后用 `QuestionCategory` 关联过滤
      - `RANDOM`：取整库后用 Fisher–Yates 打乱
      - `MOCK`：根据 `MOCK_CONFIG[bankCode]` 抽取 `count` 题，不足则返回特殊错误码（由调用方转换为 5.2 错误文案）
      - `WRONG_REVIEW`：从 `WrongQuestion` 取 `mastered=false`，按 `lastWrongAt desc`，再 `findMany` 题目正文
    - 导出 `expandCategoryDescendants(prismaClient, ids)` 工具函数
    - 函数返回 `{ questionIds: string[], questions: Question[], expiresAt?: Date }`，由调用方再写入 `ExamAttempt`
    - _Requirements: 1.4, 1.7, 2.1, 3.1, 4.1, 4.2, 5.1, 6.1_

  - [ ]* 7.2 编写 question-loader 通用快照属性测试
    - 文件：`src/lib/exam-engine/__tests__/loader.snapshot.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 2: 各模式 questionOrder 快照的不变量"
    - **Property 2: 各模式 questionOrder 快照的不变量**
    - **Validates: Requirements 1.7, 3.1, 3.2, 5.1**
    - 用真实 Prisma + `prisma/test.db` 或在内存中 mock 的方式构造夹具；验证无重复、长度规则、来源集
    - `numRuns: 100`

  - [ ]* 7.3 编写 SEQUENTIAL/CHAPTER 排序属性测试
    - 文件：`src/lib/exam-engine/__tests__/loader.sequential.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 3: SEQUENTIAL / CHAPTER 模式按 createdAt 升序排列"
    - **Property 3: SEQUENTIAL / CHAPTER 模式按 createdAt 升序排列**
    - **Validates: Requirements 2.1, 4.2**

  - [ ]* 7.4 编写 CHAPTER 分类树过滤属性测试
    - 文件：`src/lib/exam-engine/__tests__/loader.chapter.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 4: CHAPTER 模式按分类树过滤"
    - **Property 4: CHAPTER 模式按分类树过滤**
    - **Validates: Requirements 4.1**
    - 用 `arbCategoryTree` 生成树，断言加载到的题目集合与 `descendantsOf(categoryIds)` 匹配定义一致

  - [ ]* 7.5 编写 WRONG_REVIEW 加载与排序属性测试
    - 文件：`src/lib/exam-engine/__tests__/loader.wrong.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 5: WRONG_REVIEW 题目加载与排序"
    - **Property 5: WRONG_REVIEW 题目加载与排序**
    - **Validates: Requirements 1.4, 6.1**

- [x] 8. 检查点 - examEngine 核心完成
  - 确保所有引擎层单元测试与属性测试通过，如有疑问请向用户确认。

- [x] 9. Server Actions: startSession / resumeSession
  - [x] 9.1 创建 `src/app/(student)/exam/actions.ts` 并实现 `startSession`
    - `'use server'` 文件头
    - 引入 `auth`、`prisma`、`hasPermission`、`zod`、`examEngine`
    - 用 zod `discriminatedUnion('mode', ...)` 校验 `StartSessionInput`
    - 权限校验：模式 `MOCK` 需 `exam:mock`，其它模式需 `exam:practice`
    - 调用 `loadQuestionsForMode` 后处理空集错误（1.3 / 1.5 / 1.6 / 4.4 / 5.2）
    - 1.8：先查询 `(userId, bankId, mode, status='ONGOING')` 的会话；存在时返回 `{ ok: true, data: { attemptId, resumed: true } }` 而不是新建
    - 创建 `ExamAttempt` 时写入 `questionOrder` / `categoryIds` / `currentIndex=0`，模考还要写 `expiresAt = now + durationMs`
    - 调用 `revalidatePath('/exam')` 与对应 session 路径
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 4.1, 5.1, 5.2_

  - [x] 9.2 在 `actions.ts` 中实现 `resumeSession`
    - 入参 `attemptId`；按 `(attemptId, userId)` 双条件查询，状态非 ONGOING 时返回错误
    - 仅返回 `{ ok: true }` 即可，主要由 Server Component 直接读取数据；该 Action 用于显式"继续上次"按钮
    - _Requirements: 2.4, 3.5, 4.5_

  - [ ]* 9.3 编写 `startSession` 不变量属性测试
    - 文件：`src/lib/exam-engine/__tests__/start-session.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 1: startSession 创建的 ExamAttempt 字段一致"
    - **Property 1: startSession 创建的 ExamAttempt 字段一致**
    - **Validates: Requirements 1.1**

- [x] 10. Server Actions: submitAnswer
  - [x] 10.1 在 `actions.ts` 中实现 `submitAnswer`
    - zod 校验入参 `{ attemptId, questionId, userAnswer, costMs }`
    - 用事务包裹：查询 `ExamAttempt` + 状态校验（非 ONGOING 拒绝）+ 模考过期校验（`now > expiresAt` 时调用 `finishSession` 内部逻辑并拒绝当前提交）
    - 同会话同题目幂等：`findFirst({ attemptId, questionId })` 存在则返回 `{ ok: false, error: '该题已提交' }`，不修改任何数据
    - `compareAnswer` 判定 → 写 `ExamRecord`（`userAnswer` 已规范化、`costMs` 已 clamp）
    - `applyExamResult` → `WrongQuestion.upsert`；返回 `null` 时不写入
    - 推进 `currentIndex`：若是答完最后一题，置 `finished=true`（响应里返回，不在此处直接结束会话）
    - 模考模式不返回 `correctAnswer` 与 `explanation`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ]* 10.2 编写 `submitAnswer` ExamRecord 字段不变量测试
    - 文件：`src/lib/exam-engine/__tests__/submit-answer.fields.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 6: 提交答案的 ExamRecord 字段不变量"
    - **Property 6: 提交答案的 ExamRecord 字段不变量**
    - **Validates: Requirements 7.1**

  - [ ]* 10.3 编写 `submitAnswer` 同题幂等属性测试
    - 文件：`src/lib/exam-engine/__tests__/submit-answer.idempotent.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 9: 同会话同题目的提交幂等"
    - **Property 9: 同会话同题目的提交幂等**
    - **Validates: Requirements 7.8**

- [x] 11. Server Actions: finishSession / abandonSession / adoptExpiredMock
  - [x] 11.1 在 `actions.ts` 中实现 `finishSession`
    - 抽取内部 helper `finalizeAttempt(tx, attemptId, finalStatus)`：在事务中读取 `questionOrder` 与已存在 `ExamRecord`，给 `MOCK` 模式补齐缺失题目的空 `ExamRecord`（`userAnswer=""` / `isCorrect=false` / `costMs=0`）
    - 计算 `totalCount` / `correctCount` / `score=Math.round(correctCount/totalCount*100)`（0 题取 0）/ `durationMs = finishedAt - startedAt`
    - 写回 `status` / `finishedAt` / 上述字段，并调用 `revalidatePath('/exam/history')`
    - 公共 `finishSession(attemptId)` 校验权限并调用 `finalizeAttempt(_, _, 'FINISHED')`
    - _Requirements: 5.4, 5.6, 5.7, 8.1, 8.3, 8.4, 8.6_

  - [x] 11.2 在 `actions.ts` 中实现 `abandonSession`
    - 校验权限与归属；`finalizeAttempt(_, _, 'ABANDONED')`
    - 注意：MOCK 也用补齐 + 计分（与超时相同），保证统计字段语义一致
    - _Requirements: 5.9, 8.2_

  - [x] 11.3 在 `actions.ts` 中实现 `adoptExpiredMock`
    - 入参可选 `userId`（默认当前用户）；查询 `mode='MOCK' AND status='ONGOING' AND expiresAt < now - 60s` 的会话，逐个 `finalizeAttempt(_, _, 'ABANDONED')`
    - 由 `/exam` 页面的 Server Component 在加载时主动调用，作为兜底
    - _Requirements: 5.4, 5.9_

  - [ ]* 11.4 编写会话结束统计字段属性测试
    - 文件：`src/lib/exam-engine/__tests__/finalize.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 10: 会话结束的统计字段公式"
    - **Property 10: 会话结束的统计字段公式**
    - **Validates: Requirements 5.4, 5.6, 5.7, 5.9, 8.1, 8.2, 8.3, 8.6**

- [x] 12. Server Actions: toggleMastered + 错题本查询
  - [x] 12.1 在 `actions.ts` 中实现 `toggleMastered`
    - 入参 `{ wrongId, mastered }`，按 `(wrongId, userId)` 校验归属
    - `update` 时同时把 `rightCount` 重置为 0（取消掌握时）以避免下次重做立刻又被自动掌握
    - `revalidatePath('/exam/wrong')`
    - _Requirements: 10.3, 10.4, 10.7_

  - [x] 12.2 抽出错题本分页查询 helper
    - 在 `src/lib/exam-engine/queries.ts` 中实现 `listWrongQuestions({ userId, page, pageSize=20, bankId?, masteredFilter? })` 返回 `{ items, total, page, pageSize }`
    - 默认 `masteredFilter='all'`
    - 同文件实现 `listAttempts({ userId, page, pageSize=20, bankId?, mode? })`，仅取 `status in (FINISHED, ABANDONED)`，按 `startedAt desc`
    - 同文件实现 `listStudents({ page, pageSize=20 })` 与 `getStudentSummary(userId)`（总次数 / 平均正确率 / 最近练习时间），供教练后台使用
    - _Requirements: 9.1, 9.2, 10.1, 10.2, 11.1, 11.2_

- [x] 13. Route Handler 与 sendBeacon 兜底
  - [x] 13.1 创建 `src/app/api/exam/abandon/route.ts`
    - `POST` 处理 `Content-Type: application/json` 与 `text/plain`（sendBeacon 默认）的 body
    - 解析出 `attemptId` 后调用 `abandonSession(attemptId)`；忽略失败（保持 200）
    - 校验当前 session，没有 session 直接返回 204
    - _Requirements: 5.9_

- [x] 14. 检查点 - Server Actions 与 API 完成
  - 确保所有 Action 与 Route Handler 的属性测试与单元测试通过，如有疑问请向用户确认。

- [x] 15. UI 子组件
  - [x] 15.1 实现 `QuestionView` 组件
    - 文件：`src/app/(student)/exam/_components/question-view.tsx`
    - 单列布局：题目 → 图片（如有，用 `<img>` 加 `onError` 占位）→ 选项；窄屏占满，宽屏 `max-w-[720px] mx-auto`
    - SINGLE/JUDGE 用 `RadioGroup`，MULTI 用 `Checkbox`；JUDGE 渲染"正确/错误"两个互斥项
    - 暴露 `value` / `onChange` 受控接口与 `disabled` 标记
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7, 12.9_

  - [x] 15.2 实现 `AnswerFeedback` 组件
    - 文件：`src/app/(student)/exam/_components/answer-feedback.tsx`
    - props: `{ isCorrect, userAnswer, correctAnswer, explanation? }`
    - 答错时高亮学员所选与正确选项的差异，显示解析（若有）；模考模式由父组件控制不渲染本组件
    - _Requirements: 7.2, 7.3, 7.4_

  - [x] 15.3 实现 `ProgressBar` 组件
    - 文件：`src/app/(student)/exam/_components/progress-bar.tsx`
    - 顺序/章节/错题重做：`第 N/M 题`；随机：`已答 N/M 题`；模考：`第 N/M 题` + 倒计时插槽
    - _Requirements: 2.5, 3.3, 4.3, 5.8, 6.5_

  - [x] 15.4 实现 `MockTimer` 组件
    - 文件：`src/app/(student)/exam/_components/mock-timer.tsx`
    - 客户端 `useEffect` 每 1000ms 重算 `remainingMs = max(0, expiresAt - Date.now())`
    - 归零时调用传入的 `onTimeUp()`（由父组件触发 `finishSession`）
    - 仅基于 `expiresAt` 推算，不依赖客户端时钟绝对值
    - _Requirements: 5.3, 5.4_

  - [x] 15.5 实现 `SubmitConfirmDialog` 组件
    - 文件：`src/app/(student)/exam/_components/submit-confirm-dialog.tsx`
    - 显示未答题数；确认后才触发 `onConfirm`
    - 用 shadcn `Dialog`
    - _Requirements: 12.8_

  - [x] 15.6 实现 `CategorySelectDialog` 组件
    - 文件：`src/app/(student)/exam/_components/category-select-dialog.tsx`
    - 多选分类（含父子树形展示）；至少选 1 个才允许点"开始"
    - _Requirements: 1.2, 4.1_

- [x] 16. 学员前台页面
  - [x] 16.1 重写 `/exam` 模式选择页
    - 文件：`src/app/(student)/exam/page.tsx`
    - Server Component：先调 `adoptExpiredMock(userId)` 兜底过期模考，再读题库列表与该用户的 ONGOING 会话
    - 渲染题库卡片，每卡 5 个模式按钮；存在 `(bankId, mode)` 的 ONGOING 会话时按钮变为"继续上次"，并提供"放弃后重开"次级动作
    - 章节模式按钮触发 `CategorySelectDialog`；点"开始"调用 `startSession` 并 `router.push` 到 session 页
    - _Requirements: 1.1, 1.2, 1.5, 1.8_

  - [x] 16.2 实现 `/exam/session/[attemptId]` 页面骨架
    - 文件：`src/app/(student)/exam/session/[attemptId]/page.tsx`
    - Server Component：校验 `attempt.userId === session.user.id`，否则 `notFound()`；读取 `questionOrder`、`currentIndex`，预加载下一题题目
    - 把 `attempt.mode` 与必要 props 传给客户端 `SessionPlayer` 容器组件
    - _Requirements: 2.4, 3.5, 4.5_

  - [x] 16.3 实现 `PracticePlayer`（顺序/章节/错题重做共用）
    - 文件：`src/app/(student)/exam/session/[attemptId]/_components/practice-player.tsx`
    - 上一题/下一题导航；提交后立即显示 `AnswerFeedback`
    - 调 `submitAnswer`；服务端返回 `finished=true` 时跳到结果页
    - _Requirements: 2.1, 2.2, 2.3, 4.2, 6.1, 6.2, 6.3, 6.4, 7.2, 7.3_

  - [x] 16.4 实现 `RandomPlayer`
    - 文件：`src/app/(student)/exam/session/[attemptId]/_components/random-player.tsx`
    - 禁用"上一题"；最后一题提交后会话状态由服务端转 FINISHED，跳结果页
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 16.5 实现 `MockPlayer`
    - 文件：`src/app/(student)/exam/session/[attemptId]/_components/mock-player.tsx`
    - 嵌入 `MockTimer`、禁用"上一题"、`AnswerFeedback` 不渲染
    - 顶部"交卷"按钮触发 `SubmitConfirmDialog` → `finishSession`
    - 在 `useEffect` 中绑定 `beforeunload`：用 `navigator.sendBeacon('/api/exam/abandon', JSON.stringify({ attemptId }))`
    - _Requirements: 5.3, 5.5, 5.6, 5.8, 5.9, 7.4, 12.8_

  - [x] 16.6 实现 `/exam/session/[attemptId]/result` 结果页
    - 文件：`src/app/(student)/exam/session/[attemptId]/result/page.tsx`
    - Server Component：读取 attempt，渲染 `SessionSummary` 卡片（总题数、正确数、正确率一位小数、用时 `mm:ss`）
    - 模考模式额外显示"通过/未通过"标识（>=90 通过）
    - _Requirements: 5.7, 8.4, 8.6_

  - [x] 16.7 重写 `/exam/history` 列表页
    - 文件：`src/app/(student)/exam/history/page.tsx`
    - Server Component：用 `listAttempts` 分页查询，渲染表格
    - 列：练习模式（用 `EXAM_MODE_DISPLAY`）/ 题库名（bankId 为空显示"错题回顾"）/ 开始时间 / 总题数 / 正确数 / 正确率（一位小数）/ 用时
    - 空状态文案"暂无答题记录"
    - 分页参数 `?page=1`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 16.8 实现 `/exam/history/[attemptId]` 详情页
    - 文件：`src/app/(student)/exam/history/[attemptId]/page.tsx`
    - 校验归属；渲染逐题详情（题干 / 学员答案 / 正确答案 / 是否正确）
    - ABANDONED 状态加 `Badge` "未完成"，仅展示有 ExamRecord 的题目
    - _Requirements: 9.4, 9.5_

  - [x] 16.9 重写 `/exam/wrong` 错题本页
    - 文件：`src/app/(student)/exam/wrong/page.tsx`
    - Server Component：用 `listWrongQuestions` 分页查询；筛选条（题库下拉 + 掌握状态 tabs `全部/未掌握/已掌握`）通过 URL 参数传递
    - 客户端子组件渲染条目并提供"标记/取消掌握"按钮，调 `toggleMastered`，使用 `useTransition` 实现乐观更新；失败时回滚并 `sonner.toast.error`
    - 空状态文案"暂无错题"
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 17. 教练后台
  - [x] 17.1 实现 `/admin/student-stats` 学员列表页
    - 文件：`src/app/admin/(protected)/student-stats/page.tsx`
    - 在 Server Component 入口先 `hasPermission(user, 'stats:all')` 失败则 `redirect('/admin')`
    - 用 `listStudents` 分页查询；每行展示总答题次数 / 平均正确率（一位小数）/ 最近练习时间
    - 空状态文案"暂无数据"
    - 在 `src/lib/nav-config.ts` 的 `ADMIN_NAV` 中加入对应入口（`permission: 'stats:all'`）
    - _Requirements: 11.1, 11.4, 11.5_

  - [x] 17.2 实现 `/admin/student-stats/[userId]` 单学员历史页
    - 文件：`src/app/admin/(protected)/student-stats/[userId]/page.tsx`
    - 同样校验 `stats:all`
    - 用 `listAttempts` 加上 `bankId` 与 `mode` URL 筛选参数，渲染表格（含状态列）
    - 空状态文案"暂无数据"
    - _Requirements: 11.2, 11.3, 11.4, 11.5_

  - [ ]* 17.3 编写分页查询不变量属性测试
    - 文件：`src/lib/exam-engine/__tests__/queries.pagination.property.test.ts`
    - 文件头注释 "Feature: exam-modes, Property 12: 分页查询的不变量"
    - **Property 12: 分页查询的不变量**
    - **Validates: Requirements 9.1, 9.2, 9.5, 10.1, 10.2, 11.1, 11.2, 11.3**

- [ ] 18. 集成测试
  - [ ]* 18.1 完整模式流程集成测试
    - 文件：`src/lib/exam-engine/__tests__/integration.modes.test.ts`
    - 用专用 `DATABASE_URL=file:./prisma/test.db`，每个用例前 `db:reset` 再用夹具种子注入题库 / 题目 / 用户
    - 串起 `startSession → submitAnswer*N → finishSession` 验证 SEQUENTIAL / RANDOM / CHAPTER / MOCK / WRONG_REVIEW 五种模式落地数据正确
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 8.1_

  - [ ]* 18.2 断点续答集成测试
    - 验证非模考会话被中断后再次读取 `attempt`，`currentIndex` / `questionOrder` 仍可恢复到上次位置
    - _Requirements: 2.4, 3.5, 4.5, 8.5_

  - [ ]* 18.3 错题本流转集成测试
    - 模拟"答错 → 错题本生成 → 重做答对 3 次 → mastered=true → 答错时 mastered 重置"完整闭环
    - _Requirements: 6.4, 7.5, 7.6, 7.7_

  - [ ]* 18.4 模考超时兜底集成测试
    - 创建 `expiresAt` 已过 70 秒的 ONGOING 模考会话，调用 `adoptExpiredMock`，断言会话被 ABANDONED 并补齐空 `ExamRecord`
    - _Requirements: 5.4, 5.9_

- [x] 19. 最终检查点
  - 运行 `pnpm typecheck && pnpm lint && pnpm test`，全部通过；如有疑问请向用户确认。

## Notes

- 标 `*` 的子任务为可选测试任务，可在 MVP 阶段跳过；正式上线前建议补齐。
- 顶层任务从不带 `*`。
- 每个属性测试都通过文件头注释 `Feature: exam-modes, Property N: 标题` 与设计文档建立追溯。
- Server Actions 集中放在 `src/app/(student)/exam/actions.ts`，与教练后台 `student-stats` 路由分离；多个写动作共用同一文件因此被排在不同 wave 以避免并行写冲突。
- 权限点 `exam:practice` / `exam:mock` / `stats:self` / `stats:all` 已在系统中存在，本期不修改 `prisma/seed.ts`。
- 集成测试假设有专用 `prisma/test.db`，`vitest.setup.ts` 在 `describe` 级别管理事务回滚或使用 `db:reset`。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["2.2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.1", "5.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.2", "6.2", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "7.5", "15.1", "15.2", "15.3", "15.4", "15.5", "15.6"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["11.2"] },
    { "id": 12, "tasks": ["11.3"] },
    { "id": 13, "tasks": ["11.4", "12.1"] },
    { "id": 14, "tasks": ["12.2", "13.1"] },
    { "id": 15, "tasks": ["16.1", "16.2", "16.6", "16.7", "16.9", "17.1"] },
    { "id": 16, "tasks": ["16.3", "16.4", "16.5", "16.8", "17.2", "17.3"] },
    { "id": 17, "tasks": ["18.1", "18.2", "18.3", "18.4"] }
  ]
}
```
