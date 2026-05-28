# Implementation Plan: 驾考答题系统(drive-exam-system)

## Overview

按"基础设施 → 引擎层 → 鉴权与 RBAC → 业务模块(题库/分类/题目/导入)→ 答题会话 → 前后台 UI → 部署"的顺序构建系统。引擎层 (`src/lib/exam-engine/`) 是纯函数模块,先于 Server Actions 实现并由 fast-check PBT 守护 12 条核心不变量(CP-1..CP-12)。Server Actions 调用引擎并以事务壳负责持久化。前后台路由通过 Next.js 路由组 + Middleware 双层强制隔离。

实现语言:TypeScript(Next.js 14 App Router + Prisma + Auth.js v5)。

每条任务引用具体的需求子条款(如 `_Requirements: 17.1, 17.2_`);PBT 任务额外标注其对应的 CP 编号与 `Validates: Requirements ...`。

## Tasks

- [x] 1. 初始化项目脚手架与基础设施
  - [x] 1.1 初始化 Next.js + TypeScript + pnpm 项目骨架
    - 创建 `package.json`,`packageManager` 字段固定 `pnpm@9.15.4`,启用 corepack
    - 安装依赖:`next@14`、`react`、`typescript`、`@types/*`、`zod`、`react-hook-form`、`@hookform/resolvers`、`bcryptjs`、`@types/bcryptjs`、`@fingerprintjs/fingerprintjs`、`xlsx`
    - 安装 dev 依赖:`vitest`、`fast-check`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`、`@vitejs/plugin-react`
    - 编写 `tsconfig.json`、`next.config.mjs`(`output: 'standalone'`)、`.eslintrc`、`.gitignore`
    - 添加 npm scripts:`dev` / `build` / `start` / `db:push` / `db:migrate` / `db:seed` / `db:reset` / `db:studio` / `lint` / `typecheck` / `test` / `test:watch`,`build` 前置 `prisma generate`
    - _Requirements: 32.1, 32.2, 32.3_

  - [x] 1.2 配置 Vitest + jsdom + fast-check + Testing Library
    - 创建 `vitest.config.ts`(`environment: 'jsdom'`、`globals: true`、`setupFiles: ['./vitest.setup.ts']`)
    - 创建 `vitest.setup.ts`,`expect.extend(matchers)` 接入 `@testing-library/jest-dom`
    - 创建独立的 `vitest.integration.config.ts`,使用 `DATABASE_URL=file:./prisma/test.db`
    - 默认 `pnpm test` 走 `--run` 单次执行
    - _Requirements: 29.1, 29.3, 29.4_

  - [x] 1.3 设计 Prisma schema 与初始迁移
    - 创建 `prisma/schema.prisma`,定义全部模型:`User`、`Role`、`Permission`、`RolePermission`、`LoginLog`、`QuestionBank`、`Category`、`Question`、`QuestionCategory`、`ExamAttempt`、`ExamRecord`、`WrongQuestion`
    - 定义枚举:`UserStatus`、`LoginReason`、`QuestionType`、`ExamMode`、`ExamStatus`
    - 添加复合唯一约束:`Category.@@unique([parentId, name])`、`ExamRecord.@@unique([attemptId, questionId])`、`WrongQuestion.@@unique([userId, questionId])`
    - 添加索引:`LoginLog (userId, createdAt)` + `(createdAt)`、`Question (bankId, createdAt)`、`ExamAttempt (userId, mode, status)` + `(userId, startedAt)`、`WrongQuestion (userId, mastered, lastWrongAt)`
    - 运行 `pnpm prisma migrate dev --name init` 生成首次迁移
    - 创建 `src/lib/db.ts` 单例 Prisma Client
    - _Requirements: 4.1, 11.2, 25.1, 30.2_


- [x] 2. 实现引擎层纯函数模块(`src/lib/exam-engine/`)
  - [x] 2.1 实现 `judger.ts`:答案规范化、比对、可提交、耗时钳制
    - 导出 `QuestionType`、`normalizeAnswer(type, raw)`、`compareAnswer(type, userAnswer, correctAnswer)`、`isSubmittable(type, selectedCount, optionsCount)`、`clampCostMs(value)`
    - `normalizeAnswer` 去除空白并大写,`MULTI` 时拆字母升序去重再拼接
    - `compareAnswer` SINGLE/JUDGE 字符串相等,MULTI 集合相等
    - `clampCostMs` 用 `Number.isFinite` 检查,NaN/非数值返回 0,否则 `max(0, min(value, 3_600_000))`
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [x]* 2.2 编写 `judger` PBT 测试(CP-7 + CP-11 + clampCostMs)
    - **Property 7: compareAnswer 答案语义** —— SINGLE/JUDGE 等价于 normalize 后字符串相等;MULTI 任意排列输入 correctAnswer 都返回 true,不等集合返回 false
    - **Property 11: isSubmittable 真值表** —— SINGLE/JUDGE 等价于 `selectedCount === 1`;MULTI 等价于 `2 <= selectedCount <= optionsCount`;非法 type 返回 false
    - 补充:`clampCostMs` 输出始终在 `[0, 3_600_000]` 闭区间
    - 文件 `src/test/judger.property.test.ts`,`numRuns >= 100`
    - **Validates: Requirements 19.2, 19.3, 19.4**

  - [x] 2.3 实现 `wrongbook.ts`:错题本状态机 `applyExamResult`
    - 导出 `WrongState` 类型与 `applyExamResult(prev, isCorrect, now)`
    - 实现 6 条转移规则(Requirement 20.1..20.6),返回 `null` 表示不创建错题
    - `prev.mastered=true` 答错时同步 `mastered=false` 与 `rightCount=0`(20.4)
    - `rightCount + 1 >= 3` 时切到 `mastered=true`(20.6)
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_

  - [x]* 2.4 编写 `wrongbook` PBT 测试(CP-8)
    - **Property 8: 错题本状态机 6 条转移 + 单调性** —— 6 条转移规则全覆盖;`next.wrongCount >= prev.wrongCount`;`next.lastWrongAt >= prev.lastWrongAt`;mastered 仅按"rightCount+1>=3 ⇒ true"与"mastered=true 时答错 ⇒ false 且 rightCount=0"两条路径转移
    - 文件 `src/test/wrongbook.property.test.ts`,`numRuns >= 100`
    - **Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7**

  - [x] 2.5 实现 `snapshot.ts`:会话快照序列化
    - 导出 `serializeOrder` / `parseOrder` / `serializeCategoryIds` / `parseCategoryIds`
    - `parseOrder` / `parseCategoryIds` 对非 JSON、非数组、含非字符串元素的输入返回 `[]` 不抛异常
    - _Requirements: 17.4, 17.5_

  - [x]* 2.6 编写 `snapshot` PBT 测试(往返 + safe-fail)
    - **Property: 序列化往返一致** —— `parseOrder(serializeOrder(xs)) === xs` 对所有合法字符串数组成立
    - **Property: parseOrder safe-fail** —— 对任意非法输入返回空数组,不抛异常
    - 文件 `src/test/snapshot.property.test.ts`,`numRuns >= 100`
    - **Validates: Requirements 17.4, 17.5**

  - [x] 2.7 实现 `mock-config.ts`:模考配置常量
    - 导出 `MockConfig` 类型、`MOCK_CONFIG` 冻结常量、`getMockConfig(bankCode)`
    - `subject_1`: `{ count: 100, durationMs: 45*60*1000, passScore: 90 }`
    - `subject_4`: `{ count: 50, durationMs: 30*60*1000, passScore: 90 }`
    - 未命中显式键时返回默认配置 `{ count: 50, durationMs: 30*60*1000, passScore: 90 }`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 2.8 实现 `question-loader.ts`:五种模式题目加载
    - 导出 `LoadInput`、`LoadResult`、`loadQuestionsForMode(prisma, input)`、`expandCategoryDescendants(prisma, rootIds)`
    - SEQUENTIAL/CHAPTER 按 `(createdAt asc, id asc)` 双键稳定排序
    - RANDOM 全库 Fisher–Yates 洗牌(种子来自 `crypto.randomBytes`)
    - CHAPTER 通过 `expandCategoryDescendants` 递归展开后代分类闭包
    - MOCK 整库随机抽 `MOCK_CONFIG[bankCode].count` 题,题数不足返回 `INSUFFICIENT_QUESTIONS`
    - WRONG_REVIEW 加载 `mastered=false` 的错题按 `lastWrongAt` 降序
    - 空集时返回对应 `BANK_EMPTY` / `CHAPTER_EMPTY` / `NO_WRONG_QUESTIONS`
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6_

  - [-]* 2.9 编写 `question-loader` PBT 测试(CP-2 / CP-3 / CP-4 / CP-5)
    - **Property 2: questionOrder 快照不变量** —— 题目 ID 不重复;长度与模式规则一致;是来源集合的排列
    - **Property 3: SEQUENTIAL/CHAPTER 严格 createdAt 升序** —— `Q[i].createdAt <= Q[i+1].createdAt`,相等时 ID 字典序稳定
    - **Property 4: CHAPTER 后代分类闭包** —— questionOrder 集合等于 `expandCategoryDescendants(categoryIds)` 题目并集
    - **Property 5: WRONG_REVIEW 集合与排序** —— 严格等于 `mastered=false` 题目按 `lastWrongAt desc` 排序
    - 使用 `prisma/test.db` + 夹具种子,文件 `src/test/question-loader.property.test.ts`,`numRuns >= 100`
    - **Validates: Requirements 15.2, 15.3, 15.4, 15.5, 15.6**

  - [x] 2.10 实现 `queries.ts`:分页查询助手
    - 导出 `Page<T>` 类型与 `listWrongQuestions` / `listAttempts` / `listStudents` / `getStudentSummary`
    - 用 `prisma.$transaction([findMany, count])` 保证 `total` 与 `items` 同事务快照
    - `pageSize` 默认 20,非法 `page <= 0` 视为 1,`pageSize > 100` 截断为 100
    - `listAttempts` 按 `(startedAt desc, id desc)` 稳定排序,仅返回 `status ∈ {FINISHED, ABANDONED}`
    - `listWrongQuestions` 支持 `bankId?` 与 `masteredFilter ∈ {all, mastered, unmastered}`
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [-]* 2.11 编写 `queries` PBT 测试(CP-12)
    - **Property 12: 分页查询不变量** —— `items.length <= pageSize`;`(page-1)*pageSize + items.length <= total`;跨页主键无重复;跨页并集大小符合公式;`listAttempts` 仅含 FINISHED/ABANDONED 且按 `startedAt desc` 排
    - 文件 `src/test/queries.property.test.ts`,`numRuns >= 100`
    - **Validates: Requirements 26.1, 26.2, 26.3, 26.4, 26.5**

- [~] 3. 检查点 - 引擎层全部 PBT 通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. 实现鉴权与 RBAC 子系统
  - [x] 4.1 实现权限常量与 `hasPermission` / `requirePermission`
    - 创建 `src/lib/permissions.ts`,导出 `ALL_PERMISSION_CODES` 常量(覆盖 30 个权限码)、`PermissionCode` 类型、`hasPermission(session, code)`、`requirePermission(session, code)`
    - `super_admin` 在 `hasPermission` 中短路返回 `true`,优先级高于 DB 记录
    - 定义 `UnauthorizedError` 类
    - _Requirements: 1.3, 2.1_

  - [-]* 4.2 编写 `permissions` PBT 测试
    - **Property: super_admin 全权限** —— 对任意权限码 `hasPermission({roleCode:'super_admin'}, anyCode) === true`
    - 文件 `src/test/permissions.property.test.ts`,`numRuns >= 50`
    - **Validates: Requirements 2.1**

  - [x] 4.3 实现 RBAC 种子脚本 `prisma/seed.ts`
    - upsert 5 个 Role(`super_admin/admin/teacher/student_strict/student_normal`),`student_strict.strictLogin=true`,其余 false,`isSystem=true`
    - upsert 30 个 Permission,按 7 group 分组(用户管理/角色权限/题库管理/题目管理/答题/统计/系统)
    - 按 §RBAC 速查表写 `RolePermission` 关联
    - upsert 2 个内置 QuestionBank:`subject_1` / `subject_4`,`isBuiltin=true`
    - upsert 1 个初始 User:`username=$INITIAL_ADMIN_USERNAME`(默认 `admin`)、`passwordHash=bcrypt($INITIAL_ADMIN_PASSWORD)`(默认 `Admin@123`)、roleCode=`admin`
    - 在 `package.json` 中接入 `db:seed` 脚本
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.3, 5.4, 10.2_

  - [x] 4.4 实现 `loginPipeline` 与异地登录冻结逻辑
    - 创建 `src/lib/auth-pipeline.ts`,导出 `loginPipeline({ username, password, deviceId, ip, userAgent })`
    - 缺失 `deviceId` → 写 LoginLog `reason=DEVICE_FINGERPRINT_MISSING` 并拒绝
    - 用户不存在 → `USER_NOT_FOUND`;状态 DISABLED → `DISABLED`;状态 FROZEN → `FROZEN_BY_REMOTE`(拒绝)
    - bcrypt 比对失败 → `WRONG_PASSWORD`
    - `role.strictLogin=true` 且(`ip != lastLoginIp` 或 `deviceId != lastLoginDeviceId`)→ 把 `User.status` 置 FROZEN,写 `FROZEN_BY_REMOTE`,拒绝
    - 成功登录:更新 `lastLoginIp` / `lastLoginDeviceId`,写 `reason=OK`,返回 user 含 `roleCode` + 一次性查询的 `permissionCodes`
    - _Requirements: 4.1, 4.2, 5.2, 5.5, 6.3, 6.4, 7.1, 7.2, 7.3, 8.1, 8.2_

  - [-]* 4.5 编写 `loginPipeline` PBT/集成测试
    - **Property: 缺失 deviceId 永远拒绝** —— 任意输入若 `deviceId=''` 则返回 null 并写 `DEVICE_FINGERPRINT_MISSING`
    - **Property: 异地登录冻结** —— `strictLogin=true` 且 IP/Device 任一变化触发 FROZEN
    - **Property: strictLogin=false 不比对** —— 普通学员/教练/管理员变 IP/Device 不触发冻结
    - **Property: LoginLog 写入完整性** —— 任意尝试都写一条,reason 在枚举范围内
    - 文件 `src/test/auth.integration.test.ts`,`numRuns >= 50`
    - **Validates: Requirements 6.3, 7.1, 7.3, 8.1, 8.2**

  - [~] 4.6 配置 Auth.js v5 与 JWT
    - 创建 `src/lib/auth.ts`,定义 `authConfig`:Credentials provider 调用 `loginPipeline`、`session.strategy='jwt'`、`pages.signIn='/login'`
    - `jwt` callback 把 `userId` / `roleCode` / `permissionCodes` 写入 token
    - `session` callback 把同样字段写到 `session.user`
    - 扩展 next-auth 模块声明(`src/types/next-auth.d.ts`)
    - 创建 `auth-redirect.ts`:`homeForRole(roleCode)` 决定登录后跳 `/admin` 或 `/exam`
    - _Requirements: 3.2, 3.3, 5.1, 27.7_

  - [~] 4.7 实现 Middleware 路由拦截
    - 创建 `src/middleware.ts`,导出基于 Auth.js 的中间件
    - 公开路由白名单:`/`、`/login`、`/admin/login`
    - 未登录受保护路由 → 按前缀重定向到 `/login` 或 `/admin/login`
    - `student_strict / student_normal` 访问 `/admin/*` → 302 `/exam`
    - `super_admin / admin / teacher` 访问 `/exam/*` → 302 `/admin`
    - 路径匹配 `/admin/roles/[id]/edit` 且角色非 `super_admin` → 302 `/admin`
    - `matcher` 排除 `_next` 与静态资源
    - _Requirements: 2.3, 27.5, 27.6_

  - [ ]* 4.8 编写 Middleware 集成测试
    - 用 `NextRequest` mock 构造各角色访问场景,断言重定向目标
    - **Validates: Requirements 27.5, 27.6, 2.3**

- [ ] 5. 实现登录页与改密页
  - [~] 5.1 实现 FingerprintJS 客户端 hook
    - 创建 `src/lib/fingerprint.ts`,封装 `getDeviceId()` 异步函数(load + visitorId)
    - 在登录页表单提交前同步取 `deviceId`,缺失时禁用提交按钮 + 错误提示
    - _Requirements: 6.1, 6.2_

  - [~] 5.2 实现 `/login` 与 `/admin/login` 共享 `LoginForm` 组件
    - 创建 `src/app/login/page.tsx`、`src/app/admin/login/page.tsx`、`src/components/auth/LoginForm.tsx`
    - React Hook Form + Zod 校验 username/password 非空
    - 提交时携带 `deviceId`,错误时统一显示"用户名或密码错误"或"账号已冻结,请联系管理员解冻"
    - 登录成功按 `homeForRole(roleCode)` 跳转
    - _Requirements: 5.5, 6.1, 6.2, 27.7_

  - [~] 5.3 实现 `/change-password` 自助改密
    - 创建 `src/app/change-password/page.tsx` 与 `actions/change-password.ts`
    - 表单字段:旧密码、新密码、确认新密码;React Hook Form + Zod 双层校验
    - Server Action 校验旧密码(bcrypt.compare),写新 `passwordHash`(bcrypt.hash)
    - 修改成功后调用 `signOut({ redirectTo: '/login' })`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 5.4 编写 LoginForm 与 change-password 组件测试
    - 断言缺失 deviceId 时提交按钮 disabled
    - 断言旧密码错误时不清除 session
    - _Requirements: 6.1, 9.2_

- [ ] 6. 实现题库 / 分类 / 题目 CRUD 业务模块
  - [~] 6.1 实现题库 Server Actions
    - 创建 `src/app/admin/banks/actions.ts`:`createBank` / `updateBank` / `deleteBank`
    - zod schema 校验 `code/name`
    - `deleteBank` 检查 `isBuiltin=true` 拒绝并返回 `'内置题库不可删除'`
    - 检查 `prisma.question.count({ where:{ bankId } }) > 0` 拒绝并返回 `'题库下尚有题目,无法删除'`
    - 全部 Action 经 `requirePermission(session, 'bank:write')`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 6.2 编写题库 CRUD 集成测试
    - 内置题库删除应被拒
    - 含题题库删除应被拒
    - **Validates: Requirements 10.3, 10.4**

  - [~] 6.3 实现全局分类 Server Actions
    - 创建 `src/app/admin/categories/actions.ts`:`createCategory` / `renameCategory` / `moveCategory` / `deleteCategory`
    - 利用 Prisma `@@unique([parentId, name])` 捕获 P2002 错误,返回 `'同级分类名重复'`
    - `deleteCategory` 在事务中级联删除 `QuestionCategory` 关联记录
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 6.4 编写分类约束 PBT 测试
    - **Property: 同 parent 同名拒绝** —— 任意 `(parentId, name)` 重复创建/改名都返回 `'同级分类名重复'`
    - 文件 `src/test/category.integration.test.ts`,`numRuns >= 50`
    - **Validates: Requirements 11.2**

  - [x] 6.5 实现题目题型校验工具
    - 创建 `src/lib/question-validate.ts`,导出 `ImportRowSchema`(zod)与 `validateQuestionPayload(payload)`
    - SINGLE: `answer` 长度 1 且 `[A-F]`,且对应选项存在且非空
    - MULTI: `answer` 长度 ≥ 2,字符 `[A-F]` 子集,升序无重复,各对应选项非空
    - JUDGE: 强制 `options=[{key:'T',text:'正确'},{key:'F',text:'错误'}]`,`answer ∈ {T,F}`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 6.6 编写题目题型校验 PBT 测试
    - **Property: SINGLE/MULTI/JUDGE 答案校验** —— 合法输入通过、各类非法输入被拒并返回对应错误码
    - 文件 `src/test/question-validate.property.test.ts`,`numRuns >= 100`
    - **Validates: Requirements 12.2, 12.3, 12.4**

  - [~] 6.7 实现题目 CRUD Server Actions
    - 创建 `src/app/admin/questions/actions.ts`:`createQuestion` / `updateQuestion` / `deleteQuestion`
    - zod 校验入参 → `validateQuestionPayload` 二次校验 → 事务写入 + 多对多 `QuestionCategory` 同步
    - 支持 `tags` JSON 字符串数组
    - _Requirements: 12.1, 12.5_

- [ ] 7. 实现批量导入(JSON + Excel)
  - [x] 7.1 定义共享导入契约
    - 创建 `src/lib/import/types.ts`:`ImportRow`、`PreviewResult`、`CommitResult`、`ImportSource` 接口
    - 创建 `src/lib/import/validate.ts`:`validateRow(row, rowIndex)` 复用 `ImportRowSchema` 与 `OPTION_MISSING_FOR_ANSWER` 等错误码
    - _Requirements: 13.4, 14.3_

  - [~] 7.2 实现 JSON 导入源
    - 创建 `src/lib/import/json-source.ts`,导出 `jsonSource: ImportSource`
    - 接受顶层数组 `[ {...} ]` 或对象 `{ "questions": [ {...} ] }` 两种形态
    - _Requirements: 13.1_

  - [~] 7.3 实现 Excel 导入源与模板生成
    - 创建 `src/lib/import/excel-source.ts`:`excelSource: ImportSource` 与 `generateExcelTemplate(): Buffer`
    - 表头列:`type, content, imageUrl, optionA..optionF, answer, categories, explanation, tags`
    - `categories` 与 `tags` 列以 `|`(U+007C)分隔
    - `answer` 引用的字母对应列为空时返回 `OPTION_MISSING_FOR_ANSWER`
    - 创建 Route Handler `src/app/admin/questions/import/template/route.ts` 提供 GET 下载
    - _Requirements: 14.1, 14.2, 14.3_

  - [~] 7.4 实现 `previewImport` / `commitImport`
    - 创建 `src/lib/import/index.ts`,导出两个函数
    - `previewImport`:解析 → 逐行 validate → 返回 `{ valid, invalid }`,不写库
    - `commitImport`:事务内对所有 `categories[]` 名称做顶层 `parentId=null` 的 `prisma.category.upsert`,逐条插入 Question + QuestionCategory
    - 一行非法不影响其它行
    - 完成后 `revalidatePath('/admin/questions')`
    - _Requirements: 13.2, 13.3, 13.4, 14.4_

  - [ ]* 7.5 编写导入 PBT 测试
    - **Property: JSON 两种形态** —— 数组与 `{questions:[...]}` 都被正确解析
    - **Property: 预览不写库** —— `previewImport` 调用前后 DB 无变化
    - **Property: 分类按名 upsert** —— 同名分类只创建一次,后续复用
    - **Property: 非法不影响合法** —— 混合行中合法条目正常落库,非法仅落 `invalid` 列表
    - **Property: `|` 分隔解析往返** —— `parse(serialize(xs)) === xs`
    - **Property: OPTION_MISSING_FOR_ANSWER** —— `answer` 字母对应列空时必含此错误码
    - 文件 `src/test/import.property.test.ts`,`numRuns >= 50`
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 14.2, 14.3**

  - [~] 7.6 实现导入 UI 与 Server Actions
    - 创建 `src/app/admin/questions/import/page.tsx` 与 `actions.ts`
    - 两步流程:预览(显示"将导入 N 条" + "跳过 M 条非法记录" + invalid 行明细)→ 确认提交
    - 支持文件上传(.xlsx)与粘贴 JSON 两种入口
    - 经 `requirePermission(session, 'question:import')`
    - _Requirements: 13.5, 14.4_

- [~] 8. 检查点 - CRUD 与导入子系统稳定
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. 实现答题会话 Server Actions(`Session_Manager`)
  - [~] 9.1 实现 `startSession` 与会话快照写入
    - 创建 `src/app/exam/actions/session.ts`,导出 `startSession(input)`
    - zod `discriminatedUnion('mode', ...)` 校验五种模式入参
    - 先按 `(userId, bankId, mode, status='ONGOING')` 查询断点续答会话,命中则返回 `{ ok:true, data:{ attemptId, resumed:true } }`
    - 否则调用 `loadQuestionsForMode` → 在同一事务一次性写入 `questionOrder`、`categoryIds`(CHAPTER 模式)、`expiresAt`(MOCK 模式 = `now + MOCK_CONFIG[bankCode].durationMs`)
    - `revalidatePath('/exam')`
    - _Requirements: 17.1, 17.2, 17.3, 18.1, 18.2_

  - [ ]* 9.2 编写 `startSession` PBT 集成测试(CP-1)
    - **Property 1: startSession 字段一致性** —— `mode = input.mode`、`status = ONGOING`、`currentIndex = 0`;长度与模式题量规则一致;`categoryIds` 仅 CHAPTER 非空;`expiresAt` 仅 MOCK 非空且等于 `startedAt + durationMs`
    - **Property: ONGOING 复用** —— 同 `(userId, bankId, mode)` 二次调用复用而非新建
    - 文件 `src/test/session.integration.test.ts`(共享),`numRuns >= 100`
    - **Validates: Requirements 15, 16, 17.1, 18.1**

  - [~] 9.3 实现 `resumeSession` / `submitAnswer`
    - `resumeSession({ attemptId })`:校验归属与 `status=ONGOING`,返回 `{ attemptId, currentIndex, mode }`
    - `submitAnswer({ attemptId, questionId, userAnswer, costMs })` 以事务实现
      1. 校验会话归属、`status=ONGOING`
      2. MOCK 且 `expiresAt < now` → 当场 `finalizeAttempt(_, _, 'ABANDONED')`,返回 `'考试已超时'`
      3. 检查 `(attemptId, questionId)` 已存在 → 返回 `'该题已提交'`,不修改任何数据
      4. `normalizeAnswer` + `clampCostMs` 后写入 `ExamRecord`
      5. `compareAnswer` 计算 `isCorrect`
      6. `applyExamResult` upsert `WrongQuestion`
      7. 推进 `ExamAttempt.currentIndex` 至下一道未答索引
      8. MOCK 模式响应**移除** `correctAnswer` 与 `explanation`
      9. 最后一题响应附 `finished:true` 但不自动结束会话
    - _Requirements: 18.4, 19.5, 19.6, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 25.1, 25.2_

  - [ ]* 9.4 编写 `submitAnswer` PBT 集成测试(CP-6 + CP-9)
    - **Property 6: submitAnswer 字段语义** —— `userAnswer = normalizeAnswer(...)`、`costMs ∈ [0, 3_600_000]`、`isCorrect = compareAnswer(...)`
    - **Property 9: 同会话同题幂等** —— 重复 `(attemptId, questionId)` 调用都返回 `'该题已提交'`,DB 状态不变(ExamRecord 行数、WrongQuestion 字段、currentIndex 一致)
    - **Property: MOCK 模式响应移除答案** —— 响应字段不包含 `correctAnswer / explanation`
    - 文件 `src/test/session.integration.test.ts`,`numRuns >= 100`
    - **Validates: Requirements 19.5, 19.6, 21.2, 21.4, 21.5, 25.1, 25.2**

  - [~] 9.5 实现 `finalizeAttempt` 内部 helper 与 `finishSession` / `abandonSession`
    - `finalizeAttempt(tx, attemptId, finalStatus)`:MOCK 模式补齐 `questionOrder` 中缺失题的空记录 `{userAnswer:'', isCorrect:false, costMs:0}`;计算 `totalCount/correctCount/score/durationMs` 写回 `ExamAttempt`(`score = totalCount===0 ? 0 : Math.round(correctCount/totalCount*100)`);`revalidatePath('/exam/history')`
    - `finishSession({ attemptId })` 调用 `finalizeAttempt(_, _, 'FINISHED')`
    - `abandonSession({ attemptId })` 调用 `finalizeAttempt(_, _, 'ABANDONED')`
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [ ]* 9.6 编写 `finalizeAttempt` PBT 集成测试(CP-10)
    - **Property 10: 会话结束统计字段公式** —— MOCK 补齐后 `totalCount = questionOrder.length`、`correctCount = COUNT(isCorrect=true)`、`score = round(c/t*100)`、`durationMs = finishedAt - startedAt`、`0 <= score <= 100`
    - 文件 `src/test/session.integration.test.ts`,`numRuns >= 100`
    - **Validates: Requirements 22.2, 22.3**

  - [~] 9.7 实现 `adoptExpiredMock` 与 `/api/exam/abandon` Route Handler
    - 在 `actions/session.ts` 导出 `adoptExpiredMock(userId)`,扫 `mode='MOCK' AND status='ONGOING' AND expiresAt < now-60000`,逐个 `finalizeAttempt(_, _, 'ABANDONED')`
    - 创建 Route Handler `src/app/api/exam/abandon/route.ts`,POST 接收 `{ attemptId }`,校验 session 归属后调用 `abandonSession`
    - `/exam` RSC 入口 layout/page 中调用 `adoptExpiredMock(currentUser.id)`,失败不阻塞
    - _Requirements: 22.5, 23.1, 23.2, 23.3, 23.4_

  - [~] 9.8 实现 `toggleMastered` Server Action
    - 创建 `src/app/exam/wrong/actions.ts`,导出 `toggleMastered({ wrongId, mastered })`
    - 按 `(wrongId, userId)` 双条件校验归属;不归属返回 `'无权操作'`
    - `mastered: true→false` 时事务内同步 `rightCount=0`
    - `revalidatePath('/exam/wrong')`
    - _Requirements: 24.1, 24.2, 24.3_

- [~] 10. 检查点 - 答题会话主路径全部 PBT 通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. 实现学生前台 UI(`(student)` 路由组)
  - [~] 11.1 实现 `StudentShell` layout 与 `/exam` 主页
    - 创建 `src/app/(student)/layout.tsx`(含顶栏 + 用户菜单 + 错题/历史快捷入口)
    - 创建 `src/app/(student)/exam/page.tsx`,RSC 中调用 `adoptExpiredMock(currentUser.id)`
    - 渲染 `ExamModePicker`:列出题库 + 5 种模式按钮;ONGOING 时显示"继续上次"+"放弃后重开"
    - _Requirements: 23.1, 27.2_

  - [~] 11.2 实现 `QuestionView` 与图片占位
    - 创建 `src/components/exam/QuestionView.tsx`,渲染题干、`imageUrl`(`<Image onError>` 切换占位图标 + "图片加载失败"文案)、选项
    - SINGLE/JUDGE 用 RadioGroup,MULTI 用 Checkbox
    - 提交按钮 `disabled={!isSubmittable(type, selected.length, options.length)}`
    - 关键交互元素最小触控尺寸 ≥ 44 × 44 CSS px
    - _Requirements: 28.2, 28.4, 28.5_

  - [~] 11.3 实现 `PracticePlayer` / `RandomPlayer`
    - SEQUENTIAL/CHAPTER/WRONG_REVIEW 共用 `PracticePlayer`(上一题/下一题可用,`AnswerFeedback` 可见)
    - `RandomPlayer` 禁用"上一题",`AnswerFeedback` 可见
    - 提交后由 Server Action 返回的 `correctAnswer/explanation` 渲染 `AnswerFeedback`
    - _Requirements: 18.5, 28.5_

  - [~] 11.4 实现 `MockPlayer` + `Mock_Timer` + `SubmitConfirmDialog` + sendBeacon 兜底
    - `MockPlayer`:禁用"上一题";不渲染 `AnswerFeedback`(双保险:Server Action 已剥离 + 组件不挂载)
    - `Mock_Timer`:1 秒 tick 重新计算 `remainingMs = max(0, expiresAt - Date.now())`,归零回调 `onTimeUp` → `finishSession`
    - 顶栏交卷按钮先开 `SubmitConfirmDialog`,确认后才调用 `finishSession`
    - 绑定 `beforeunload`:仅 `mode=MOCK` 且 `status=ONGOING` 时通过 `navigator.sendBeacon('/api/exam/abandon', JSON.stringify({ attemptId }))`
    - _Requirements: 18.5, 28.6, 28.7, 28.8_

  - [ ]* 11.5 编写 `MockPlayer` / `Mock_Timer` 组件测试
    - 断言 MOCK 模式不渲染 `AnswerFeedback`
    - 断言 RANDOM/MOCK 不渲染"上一题"按钮
    - 断言 `Mock_Timer` 1s tick 与归零触发 `onTimeUp`
    - 断言图片加载失败渲染占位
    - _Requirements: 18.5, 28.4, 28.6, 28.7_

  - [~] 11.6 实现 `CategorySelectDialog` 与会话路由
    - 创建 `CategorySelectDialog`:多选树形,至少选 1 才可"开始"
    - 创建 `src/app/(student)/exam/session/[attemptId]/page.tsx`:按 `mode` 分派到对应 Player
    - 创建 `src/app/(student)/exam/session/[attemptId]/result/page.tsx`:展示成绩、对错列表与解析(MOCK 仍展示)
    - _Requirements: 27.2_

  - [~] 11.7 实现 `/exam/wrong` 与 `/exam/history` 列表
    - 创建 `src/app/(student)/exam/wrong/page.tsx`,RSC 调用 `listWrongQuestions(...)` 并支持 `bankId` / `masteredFilter` 筛选
    - 客户端组件用 `useTransition` 实现乐观切换 mastered,失败 toast 回滚
    - 创建 `src/app/(student)/exam/history/page.tsx`(`listAttempts(...)`)与 `[attemptId]/page.tsx`(详情:每题对错 + 用户答案 + 正确答案)
    - _Requirements: 24.4, 26.1, 26.5, 27.2_

- [ ] 12. 实现后台 UI(`/admin/*`)
  - [~] 12.1 实现 `AdminShell` layout 与权限菜单过滤
    - 创建 `src/app/admin/layout.tsx`:顶栏 + 侧栏 + 主内容
    - `viewport ≤ 768px` 时侧栏折叠为抽屉(顶栏菜单按钮触发,`useMediaQuery('(max-width: 768px)')`)
    - 侧栏菜单项配置 `requires?: PermissionCode`,通过 `hasPermission` 过滤无权菜单
    - _Requirements: 28.3, 28.9_

  - [~] 12.2 实现题库管理页面
    - 创建 `src/app/admin/banks/page.tsx`、`new/page.tsx`、`[id]/page.tsx`
    - 渲染 `BankList` / `BankForm` / `DeleteBankButton`
    - 内置或含题题库的删除按钮显示禁用态 + tooltip 说明原因
    - _Requirements: 10.1, 10.3, 10.4_

  - [~] 12.3 实现分类管理页面
    - 创建 `src/app/admin/categories/page.tsx`,渲染 `CategoriesClient` 树形组件
    - 支持新建、改名、改父分类、删除四种操作
    - _Requirements: 11.4_

  - [~] 12.4 实现题目管理页面
    - 创建 `src/app/admin/questions/page.tsx`、`new/page.tsx`、`[id]/page.tsx`
    - `QuestionsFilter` 提供题型、题库、关键字三类筛选与分页
    - `QuestionForm` 按 `Question.type` 动态校验答案与选项,JUDGE 锁定选项为 `[正确/错误]`
    - 支持多选挂载分类与字符串数组 tags
    - _Requirements: 12.5, 12.6_

  - [~] 12.5 实现角色权限编辑页面
    - 创建 `src/app/admin/roles/page.tsx`(列表)与 `[id]/edit/page.tsx`
    - `EditRoleForm` 按 group 分组渲染权限点 checkbox
    - `code=super_admin` 角色编辑按钮永远 disabled,且 Middleware 已拦截非 super_admin 访问
    - 显著提示文案"变更将在用户下次登录时生效"
    - 经 `requirePermission(session, 'role:edit-permissions')`
    - _Requirements: 2.2, 3.1, 3.4_

  - [~] 12.6 实现登录日志页面
    - 创建 `src/app/admin/login-logs/page.tsx`
    - 提供按状态(success)、时间范围、关键字(username/ip)三类筛选
    - 经 `requirePermission(session, 'log:read')`
    - _Requirements: 8.3, 8.4_

  - [~] 12.7 实现教练学员统计页面
    - 创建 `src/app/admin/student-stats/page.tsx` 与 `[userId]/page.tsx`
    - `StudentStatsList` 调用 `listStudents(...)` 分页;`StudentDetail` 调用 `getStudentSummary(userId)` 与 `listAttempts({ userId })`,带题库 + 模式筛选
    - 经 `requirePermission(session, 'stats:all')`
    - _Requirements: 26.1_

  - [~] 12.8 实现 `/admin` 主页与 `/admin/users` 占位
    - 创建 `src/app/admin/page.tsx` 渲染各模块入口卡片(按权限过滤)
    - 创建 `src/app/admin/users/page.tsx` 占位页(P4 标记 "待开发")
    - _Requirements: 27.3_

- [~] 13. 检查点 - 全部 UI 路由可访问且无权限路径正确拦截
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. 实现部署产物与 2C2G 资源约束
  - [~] 14.1 编写 `Dockerfile`(多阶段 + Next.js standalone)
    - 三阶段:`deps`(corepack pnpm + install) → `builder`(prisma generate + pnpm build) → `runner`(non-root user + 复制 `.next/standalone` + `static` + `public` + `prisma` + `.prisma` 客户端)
    - 入口 `docker/entrypoint.sh`:启动时执行 `prisma migrate deploy` + `db:seed`(幂等),然后 `node server.js`
    - 镜像单层未压缩 ≤ 800 MB
    - _Requirements: 30.1, 30.4, 31.4_

  - [~] 14.2 编写 `docker-compose.yml`
    - 单 service `drive-exam-system`:`build: .`、`ports: ["3000:3000"]`、`volumes: ["./data:/data"]`、`env_file: .env`
    - 通过 `DATABASE_URL=file:/data/prod.db` 指向挂载卷
    - `restart: unless-stopped`
    - _Requirements: 30.1, 30.2_

  - [~] 14.3 编写 `.env.example` 与文档
    - 列出 `AUTH_SECRET`(`openssl rand -base64 32` 生成)、`INITIAL_ADMIN_USERNAME`(默认 `admin`)、`INITIAL_ADMIN_PASSWORD`(默认 `Admin@123`)、`DATABASE_URL`、`NEXTAUTH_URL`
    - 在 README 中写明 `docker compose up -d --build` 一键部署、备份方式(复制 `./data/prod.db`)
    - _Requirements: 30.3_

- [~] 15. 最终检查点 - 所有测试通过,构建通过,Docker 镜像构建通过
  - 执行 `pnpm lint` / `pnpm typecheck` / `pnpm test --run` 全绿
  - 执行 `pnpm build` 成功
  - 执行 `docker compose build` 成功且镜像 ≤ 800 MB
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标记 `*` 的子任务为可选测试任务,可在快速 MVP 中跳过,但 PBT 测试是 Requirement 29.2 的硬性要求,正式交付前必须全部完成
- 每个任务都关联到具体需求子条款编号,便于 Traceability
- 引擎层(任务 2)是纯函数零依赖,先于 Server Actions(任务 4–9)实现,因为后者直接调用前者
- 答题会话的 5 条离场路径(主动交卷 / 计时归零 / 主动放弃 / sendBeacon / adoptExpiredMock 兜底)由任务 9 与任务 11.4 协同覆盖
- MOCK 模式的"三处防泄露"在三个任务点强制实施:任务 9.3 Server Action 剥离 `correctAnswer/explanation`、任务 11.4 `MockPlayer` 不挂载 `AnswerFeedback`、任务 9.5 `finalizeAttempt` 补齐空记录
- PBT 强度统一为 CP-1..CP-12 每条 `numRuns >= 100`,补充性质 `numRuns >= 50`(Requirement 29.2)
- 视觉规范由 `frontend-design` 与 `ui-ux-pro-max` skill 提供,本任务列表只描述业务行为,不包含视觉 token / 配色 / 字体等任务

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.3", "2.5", "2.7"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.6", "2.8", "4.1", "4.3"] },
    { "id": 4, "tasks": ["2.9", "2.10", "4.2", "4.4", "6.5", "7.1"] },
    { "id": 5, "tasks": ["2.11", "4.5", "4.6", "6.6", "7.2", "7.3"] },
    { "id": 6, "tasks": ["4.7", "5.1", "6.1", "6.3", "6.7", "7.4"] },
    { "id": 7, "tasks": ["4.8", "5.2", "5.3", "6.2", "6.4", "7.5", "7.6", "9.1"] },
    { "id": 8, "tasks": ["5.4", "9.2", "9.3", "9.5", "9.7", "9.8"] },
    { "id": 9, "tasks": ["9.4", "9.6", "11.1", "11.2"] },
    { "id": 10, "tasks": ["11.3", "11.4", "11.6", "11.7", "12.1"] },
    { "id": 11, "tasks": ["11.5", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8"] },
    { "id": 12, "tasks": ["14.1", "14.2", "14.3"] }
  ]
}
```
