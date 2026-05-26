# 驾考答题系统 · 功能沉淀文档

> **目的**:把这套系统已经实现 / 已经设计成型的全部功能、数据模型、业务规则、关键算法,沉淀成一份**与具体代码实现无关**的规格文档。
> 下次拿任意 LLM + 任意一套 frontend / agent skills,只要喂这份文档就能直接重写整个系统,不会丢任何业务行为。
>
> **生成依据**:仓库原 `README.md` + `.kiro/specs/exam-modes/{requirements,design,tasks}.md` + `.kiro/specs/ui-redesign/{requirements,design,tasks}.md` 综合整理,不依赖任何 `src/` 实现细节。

---

## 1. 项目概述

**产品**:驾考理论答题系统(科目一 / 科目四 / 自定义题库)
**用户群**:中文学员、教练、机构管理员
**形态**:**前台 / 后台分离**的 Web App,适配手机和电脑
**核心价值**:多模式练习 + 模拟考试 + 错题本 + 教练统计 + 多题库 + 多角色 RBAC + 异地登录冻结

---

## 2. 技术栈基线(可替换)

下表是**当前实现**的栈,但本文档刻意不把任何业务规则绑定到具体框架上,重写时可换栈,只要保留语义。

| 层级 | 当前实现 | 关键约束 |
|---|---|---|
| 前端框架 | Next.js 14 App Router + TS | 必须支持 SSR / RSC / 受保护路由 |
| 状态/表单 | React Hook Form + Zod | 表单需做客户端 + 服务端双重校验 |
| 后端 | Next.js Server Actions + Route Handler | 服务端动作必须可被 zod 校验入参 |
| 鉴权 | Auth.js v5 (Credentials / JWT) + bcryptjs | 密码需 hash;JWT 中嵌入 `roleCode` 用于权限缓存 |
| 数据库 | SQLite(开发)+ Prisma | 生产可换 Postgres,schema 不变 |
| 设备识别 | FingerprintJS | 用于异地登录判定的 `deviceId` |
| 导入 | 内置 JSON 解析 + `xlsx` | Excel 模板可下载 |
| 测试 | Vitest + fast-check + jsdom + Testing Library | 引擎层强制 PBT |
| 部署 | Docker + docker-compose | SQLite 文件落到挂载卷 `./data/prod.db` |
| 包管理 | pnpm 9.15.4 (corepack 锁定) | — |

---

## 3. 数据模型

下面用语义化字段描述,不写 Prisma DSL,迁移到任何 ORM 都通用。

### 3.1 `User`(用户)

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string (cuid) | 主键 |
| username | string unique | 登录名 |
| passwordHash | string | bcrypt hash |
| name | string? | 显示名 |
| roleId | FK→Role | 当前角色 |
| status | enum `ACTIVE` / `FROZEN` / `DISABLED` | 冻结后无法登录,需管理员解冻 |
| lastLoginIp | string? | 上次成功登录 IP |
| lastLoginDeviceId | string? | 上次成功登录设备指纹 |
| createdAt / updatedAt | Date | — |

### 3.2 `Role` / `Permission` / `RolePermission`(RBAC)

- `Role { id, code, name, strictLogin, isSystem }`
  - `code` 取值固定 5 个:`super_admin` / `admin` / `teacher` / `student_strict` / `student_normal`
  - `strictLogin=true` 的角色启用异地登录冻结
  - `isSystem=true` 表示内置角色,不允许删除
- `Permission { id, code, group, name }`,共 30 个权限点,分 7 组:用户管理 / 角色权限 / 题库管理 / 题目管理 / 答题 / 统计 / 系统
- `RolePermission { roleId, permissionId }` 多对多
- **超级管理员的权限是代码常量**,数据库里是否勾选都按"全部权限"返回。其它角色权限可在 `/admin/roles/[id]/edit` 编辑,**变更在用户下次登录时生效**(JWT 缓存)。

关键权限点(本期至少要保留这些,其它由功能演进):

| 权限码 | 含义 |
|---|---|
| `exam:practice` | 进行任意非模考练习 |
| `exam:mock` | 进行模拟考试 |
| `stats:self` | 查看自己的成绩 |
| `stats:all` | 查看所有学员的成绩(教练 / 管理员) |
| `bank:read` / `bank:write` | 题库读 / 写 |
| `question:read` / `question:write` / `question:import` | 题目相关 |
| `category:write` | 分类管理 |
| `user:read` / `user:write` / `user:unfreeze` / `user:reset-password` | 用户管理(P4) |
| `role:read` / `role:edit-permissions` | 角色权限编辑(仅 super_admin) |
| `log:read` | 登录日志 |

### 3.3 `LoginLog`(登录日志)

| 字段 | 说明 |
|---|---|
| id | — |
| userId | FK→User,失败登录可为空 |
| username | 冗余,用于失败时记录尝试用户名 |
| ip | 来源 IP |
| deviceId | 设备指纹 |
| userAgent | UA |
| success | bool |
| reason | enum `OK` / `WRONG_PASSWORD` / `USER_NOT_FOUND` / `FROZEN_BY_REMOTE` / `DISABLED` 等 |
| createdAt | — |

### 3.4 `QuestionBank`(题库)

| 字段 | 说明 |
|---|---|
| id | — |
| code | 业务码,固定示例 `subject_1` / `subject_4`,内置题库不可删 |
| name | 显示名 |
| isBuiltin | bool,内置题库 `true` 时不可删 |
| createdAt | — |

### 3.5 `Category`(全局分类,跨题库共享)

| 字段 | 说明 |
|---|---|
| id | — |
| name | 同一 `parentId` 下唯一 |
| parentId | FK→Category?,支持多级 |
| createdAt | — |

> 设计要点:**分类是全局的、跨题库的**,不是某一题库私有。原因:驾考多题库间标签经常重叠(如"交通信号""违章罚则"),共享分类避免维护两套。

### 3.6 `Question`(题目)

| 字段 | 说明 |
|---|---|
| id | — |
| bankId | FK→QuestionBank |
| type | enum `SINGLE` / `MULTI` / `JUDGE` |
| content | 题干文本 |
| imageUrl | string? 题图 |
| options | JSON 数组 `[{ key: 'A', text: '...' }, ...]`,JUDGE 题约定为 `[{key:'T',text:'正确'},{key:'F',text:'错误'}]` |
| answer | string,SINGLE 单字母 `'B'`、MULTI 升序拼接 `'AC'`、JUDGE `'T'`/`'F'` |
| explanation | string? 解析 |
| tags | JSON 数组 `string[]` |
| createdAt | — |

### 3.7 `QuestionCategory`(题目↔分类多对多)

`{ questionId, categoryId }`。一个题目可挂多个分类。

### 3.8 `ExamAttempt`(答题会话)

| 字段 | 说明 |
|---|---|
| id | — |
| userId | FK→User |
| bankId | FK→QuestionBank?(`WRONG_REVIEW` 模式可为空) |
| mode | enum `SEQUENTIAL` / `RANDOM` / `CHAPTER` / `MOCK` / `WRONG_REVIEW` |
| status | enum `ONGOING` / `FINISHED` / `ABANDONED` |
| **questionOrder** | JSON `string[]`,会话创建时**冻结**的题目顺序快照 |
| **currentIndex** | int,默认 0,断点续答位置 |
| **categoryIds** | JSON `string[]`,CHAPTER 模式选中的分类 |
| **expiresAt** | Date?,仅 MOCK 模式;`startedAt + duration`,过期由兜底逻辑处理 |
| startedAt | Date |
| finishedAt | Date? |
| totalCount | int? 结束时回填 |
| correctCount | int? 结束时回填 |
| score | int? `Math.round(correctCount / totalCount * 100)`,0 题取 0 |
| durationMs | int? `finishedAt - startedAt` |

复合索引:`(userId, mode, status)`。

### 3.9 `ExamRecord`(答题记录,逐题)

| 字段 | 说明 |
|---|---|
| id | — |
| attemptId | FK→ExamAttempt |
| questionId | FK→Question |
| userAnswer | string,已规范化(去空白、大写、MULTI 升序去重) |
| isCorrect | bool |
| costMs | int,**钳制到 [0, 3_600_000]**(0 ms 到 1 小时) |
| createdAt | — |

唯一约束:`(attemptId, questionId)` —— 同一会话同一题幂等,同题二次提交直接返回错误,不修改任何数据。

### 3.10 `WrongQuestion`(错题本)

| 字段 | 说明 |
|---|---|
| id | — |
| userId | FK→User |
| questionId | FK→Question |
| wrongCount | int |
| rightCount | int,**重做时连续答对累加,答错重置为 0** |
| mastered | bool,**rightCount ≥ 3 时置 true;mastered=true 时再答错重置 rightCount=0 + mastered=false** |
| lastWrongAt | Date,最近一次答错时间 |

唯一约束:`(userId, questionId)`。

---

## 4. 路由清单

### 4.1 公开

| URL | 内容 |
|---|---|
| `/` | 公开首页(Landing),根据登录态显示不同 CTA |
| `/login` | 学生登录 |
| `/admin/login` | 后台登录(管理员 / 教练 / 超级管理员) |

### 4.2 学生前台(路由组 `(student)`)

| URL | 内容 |
|---|---|
| `/exam` | 题库 + 模式选择;Server 端先调 `adoptExpiredMock` 兜底 |
| `/exam/session/[attemptId]` | 答题主界面(按 mode 分派 PracticePlayer / RandomPlayer / MockPlayer) |
| `/exam/session/[attemptId]/result` | 答题成绩汇总 |
| `/exam/wrong` | 错题本(题库 + 掌握状态筛选) |
| `/exam/history` | 答题记录列表 |
| `/exam/history/[attemptId]` | 单次答题逐题详情 |

### 4.3 后台

| URL | 角色 |
|---|---|
| `/admin` | 工作台 |
| `/admin/banks`、`/admin/banks/new`、`/admin/banks/[id]` | 题库 CRUD |
| `/admin/questions`、`/admin/questions/new`、`/admin/questions/[id]`、`/admin/questions/import` | 题目 + 批量导入 |
| `/admin/categories` | 全局分类管理(树形) |
| `/admin/users`(P4) | 用户管理 |
| `/admin/roles` | 角色权限列表 |
| `/admin/roles/[id]/edit` | 编辑角色权限,**仅 `super_admin`** |
| `/admin/student-stats` | 学员成绩列表(`stats:all`) |
| `/admin/student-stats/[userId]` | 单学员答题历史(`stats:all`) |
| `/admin/login-logs` | 登录日志(`log:read`) |

### 4.4 通用

| URL | 内容 |
|---|---|
| `/change-password` | 自助修改密码,改完强制重新登录 |
| `/api/exam/abandon` (POST) | sendBeacon 兜底接口,模考关闭浏览器时触发 |
| `/admin/questions/import/template` (GET) | 下载 Excel 导入模板 |

### 4.5 登录后跳转规则

| 角色 | 落地页 |
|---|---|
| `super_admin` / `admin` / `teacher` | `/admin` |
| `student_strict` / `student_normal` | `/exam` |

跨界访问:学员访问 `/admin/*` 或反之,中间件拦截并 302 回各自 home。

---

## 5. 鉴权与登录

### 5.1 凭据登录

- 仅用户名 + 密码,bcrypt 校验
- **没有公开注册**,只有 `super_admin` 与 `admin` 能创建账号
- 默认初始账号 `admin / Admin@123` 由 seed 写入,不强制改

### 5.2 异地登录冻结

```
若 user.role.strictLogin = true 且
   (本次 ip ≠ user.lastLoginIp 或 本次 deviceId ≠ user.lastLoginDeviceId)
   ⇒ user.status = FROZEN
   ⇒ 写 LoginLog(success=false, reason=FROZEN_BY_REMOTE)
   ⇒ 拒绝登录,需 user:unfreeze 权限的管理员解冻
```

仅 `student_strict` 启用,其它角色 `strictLogin=false`。

### 5.3 设备指纹

由前端 FingerprintJS 在登录时计算 `deviceId`,通过登录表单一并提交。

### 5.4 改密自助

`/change-password`:旧密码 + 新密码 + 确认;成功后立刻清除 session,要求重新登录。

### 5.5 登录日志

每次登录尝试(成功 / 失败)都写一条 `LoginLog`。日志页支持:状态筛选、时间范围筛选、关键字(用户名 / IP)。

---

## 6. 答题引擎(核心,务必精确还原)

> **重写时把这一节当 spec 来写测试。引擎层是纯函数,不依赖任何具体框架。**

### 6.1 五种模式

| 模式 | 题目集合 | 顺序 | 题量 | 是否可断点续答 |
|---|---|---|---|---|
| `SEQUENTIAL` 顺序 | 整库 | 按 `Question.createdAt asc` | 全部 | ✅ |
| `RANDOM` 随机 | 整库 | Fisher–Yates 打乱 | 全部 | ✅(从 `currentIndex` 续;不允许往回翻) |
| `CHAPTER` 章节 | `categoryIds` 及全部子孙分类下的题目交集 | 按 `Question.createdAt asc` | 全部命中 | ✅ |
| `MOCK` 模考 | 整库随机抽 N 题 | 随机 | `MOCK_CONFIG[bankCode].count` | ❌(超时自动交卷) |
| `WRONG_REVIEW` 错题重做 | 当前用户 `mastered=false` 的错题 | 按 `lastWrongAt desc` | 全部命中 | ✅ |

### 6.2 `MOCK_CONFIG`(模考配置)

| bankCode | 题量 | 时长 | 通过线 |
|---|---|---|---|
| `subject_1` | 100 | 45 分钟 | 90 分 |
| `subject_4` | 50 | 30 分钟 | 90 分 |
| `__default`(其它题库兜底) | 50 | 30 分钟 | 90 分 |

辅助函数 `getMockConfig(bankCode)`,未命中走 `__default`。

### 6.3 会话快照不变量

会话创建时**冻结**:
- `questionOrder` —— 题目顺序快照
- `categoryIds` —— CHAPTER 模式的分类选择
- `expiresAt` —— 仅 MOCK,`startedAt + duration`

之后**题库变化(增删题目、改题、改分类挂载)不影响进行中的会话**,会话始终按快照渲染。

### 6.4 答案规范化与比对(`judger`)

```
normalizeAnswer(type, raw):
  去空白、转大写
  type=MULTI: 拆字母 -> 升序去重 -> 拼接

compareAnswer(type, userAnswer, correctAnswer):
  对两端都先 normalize,然后比较
  type ∈ {SINGLE, JUDGE}:  字符串相等
  type = MULTI:            集合相等(任意顺序输入都返回 true)

isSubmittable(type, selectedCount, optionsCount):
  type ∈ {SINGLE, JUDGE}:  selectedCount === 1
  type = MULTI:            2 <= selectedCount <= optionsCount

clampCostMs(value):
  返回 max(0, min(value, 3_600_000))
```

**Property(必须用 PBT 验):**
1. SINGLE/JUDGE 时 `compareAnswer == (a===b)`
2. MULTI 时,把正确答案任意排列输入都返回 `true`,把任何不等集合输入都返回 `false`
3. `isSubmittable` 真值表全覆盖
4. `clampCostMs` 输出永远在 `[0, 3_600_000]`

### 6.5 错题本状态机(`wrongbook`)

`applyExamResult(prev, isCorrect, now) -> next`:

| 触发条件 | 动作 |
|---|---|
| `prev == null` 且 `isCorrect=true` | 返回 `null`(不创建错题) |
| `prev == null` 且 `isCorrect=false` | 创建 `{ wrongCount:1, rightCount:0, mastered:false, lastWrongAt:now }` |
| `prev != null` 且 `isCorrect=false` 且 `prev.mastered=false` | `wrongCount+1`,`rightCount=0`,`lastWrongAt=now` |
| `prev != null` 且 `isCorrect=false` 且 `prev.mastered=true` | `wrongCount+1`,`rightCount=0`,**`mastered=false`**,`lastWrongAt=now`(掌握态被打回) |
| `prev != null` 且 `isCorrect=true` 且 `rightCount+1 < 3` | `rightCount+1`,其它不变 |
| `prev != null` 且 `isCorrect=true` 且 `rightCount+1 >= 3` | `rightCount+1`,**`mastered=true`** |

**单调性**:`next.wrongCount >= prev?.wrongCount ?? 0`,`next.lastWrongAt >= prev?.lastWrongAt ?? Epoch`(用 PBT 验)。

### 6.6 题目加载(`question-loader`)

`loadQuestionsForMode(prismaClient, input)` 返回 `{ questionIds, questions, expiresAt? }`,各模式细则:

- **SEQUENTIAL** / **CHAPTER**:`Question` 按 `createdAt asc`;CHAPTER 先递归展开 `categoryIds` 得到全部后代分类(辅助函数 `expandCategoryDescendants`),再 inner join `QuestionCategory`
- **RANDOM**:取整库,Fisher–Yates 打乱
- **MOCK**:从整库随机抽 `MOCK_CONFIG[bankCode].count` 题;不足时返回特殊错误码,由调用方转成"题目不足无法开考"
- **WRONG_REVIEW**:从 `WrongQuestion` 取 `mastered=false`,按 `lastWrongAt desc`,再 `findMany` 题目正文

**Property:**
- 5 种模式产出的 `questionOrder` 都不重复
- SEQUENTIAL/CHAPTER 排序严格 `createdAt asc`
- CHAPTER 题目集合 = 入参分类树(含后代)交集
- WRONG_REVIEW 只产出 `mastered=false` 的题,且按 `lastWrongAt desc`

### 6.7 顺序持久化(`snapshot`)

```
serializeOrder(ids: string[]) -> string         // JSON
parseOrder(json: string) -> string[]            // 失败 / 非数组 / 非字符串元素 -> 返回 []
serializeCategoryIds / parseCategoryIds         // 同上
```

`parseOrder(serializeOrder(xs)) === xs`(往返性,PBT 验)。

---

## 7. Server Actions(后端动作)

下面只列**业务契约**,实现可换语言 / 框架,只要保留入参 zod、返回 `{ ok: true, data }` / `{ ok: false, error }` 的契约。

### 7.1 答题相关

#### `startSession(input)`

zod `discriminatedUnion('mode', ...)`:

```
SEQUENTIAL / RANDOM:  { mode, bankId }
CHAPTER:              { mode, bankId, categoryIds: string[] (>=1) }
MOCK:                 { mode, bankId }
WRONG_REVIEW:         { mode }       // bankId 为 null
```

行为:
1. 鉴权:MOCK 需 `exam:mock`,其它需 `exam:practice`
2. **断点续答**:先查 `(userId, bankId, mode, status='ONGOING')`,**存在则直接返回 `{ ok:true, data:{ attemptId, resumed:true } }`**(不再新建)
3. 调 `loadQuestionsForMode`;空集时返回明确错误(题库无题 / 章节无题 / 题目不足 / 错题本为空)
4. 创建 `ExamAttempt` 时写入 `questionOrder`、`categoryIds`、`currentIndex=0`,MOCK 还要写 `expiresAt = now + duration`
5. `revalidatePath('/exam')` + 对应 session 路径
6. 返回 `{ ok:true, data:{ attemptId, resumed:false } }`

#### `resumeSession(attemptId)`

按 `(attemptId, userId)` 双条件查询;非 ONGOING 拒绝。Action 主要用来标记"显式继续上次"按钮的回执,主体数据由 RSC 直接读。

#### `submitAnswer(input)`

zod:`{ attemptId, questionId, userAnswer, costMs }`。

行为(整体放事务):
1. 查 `ExamAttempt` + 校验归属 + status=ONGOING
2. **MOCK 过期检查**:`expiresAt < now` 则当场结算成 ABANDONED 并拒绝本次提交
3. **同题幂等**:`ExamRecord(attemptId, questionId)` 已存在 → `{ ok:false, error:'该题已提交' }`,不修改任何数据
4. `userAnswer` 走 `normalizeAnswer`,`costMs` 走 `clampCostMs`
5. `compareAnswer` 判定 → 写 `ExamRecord`
6. `applyExamResult` → `WrongQuestion.upsert`,返回 null 不写
7. 推进 `currentIndex`;若是最后一题,响应里返回 `finished=true`(不在此结束会话,由前端引导跳到结果页或调 `finishSession`)
8. **MOCK 模式不返回 `correctAnswer` 与 `explanation`**(防作弊)

#### `finishSession(attemptId)`

抽公共 helper `finalizeAttempt(tx, attemptId, finalStatus)`:

1. 读 `questionOrder` 与已存 `ExamRecord`
2. **MOCK 模式**:为 `questionOrder` 中缺失记录的题补齐**空 `ExamRecord`**(`userAnswer=""`,`isCorrect=false`,`costMs=0`)以保证统计字段语义一致
3. 计算:`totalCount = questionOrder.length`,`correctCount`,`score = Math.round(correctCount/totalCount*100)`(0 题取 0),`durationMs = finishedAt - startedAt`
4. 写回 `status` / `finishedAt` / 三个统计字段
5. `revalidatePath('/exam/history')`

`finishSession` = `finalizeAttempt(_, _, 'FINISHED')`。

#### `abandonSession(attemptId)`

`finalizeAttempt(_, _, 'ABANDONED')`,**同样要补齐**(MOCK 超时与主动放弃语义一致)。

#### `adoptExpiredMock(userId?)`

查 `mode='MOCK' AND status='ONGOING' AND expiresAt < now - 60s` 的会话,逐个 ABANDONED + 补齐。由 `/exam` 页面在 RSC 加载时调用,作为模考超时的兜底(主路径仍是 `MockTimer` 客户端到点触发 `finishSession`)。

#### `toggleMastered({ wrongId, mastered })`

按 `(wrongId, userId)` 校验归属。`update` 时同时把 `rightCount` 重置为 0(取消掌握时),否则下次重做立刻又被自动掌握。`revalidatePath('/exam/wrong')`。

### 7.2 查询 helper(放在 `queries.ts`)

- `listWrongQuestions({ userId, page, pageSize=20, bankId?, masteredFilter?='all' })` → `{ items, total, page, pageSize }`
- `listAttempts({ userId, page, pageSize=20, bankId?, mode? })`,仅 `status in (FINISHED, ABANDONED)`,按 `startedAt desc`
- `listStudents({ page, pageSize=20 })`
- `getStudentSummary(userId)` → `{ totalAttempts, avgCorrectRate, lastPracticedAt }`

**分页不变量**:`items.length <= pageSize`,`(page-1)*pageSize + items.length <= total`,跨页无重复(用 PBT 验)。

### 7.3 题库 / 题目 / 分类(P2)

按常规 CRUD 即可,几条业务约束:

- **内置题库不可删**(`isBuiltin=true`)
- **含题题库不可删**(题数 >0 时拒绝)
- **同 `parentId` 下分类同名禁止**;删除分类时清理 `QuestionCategory` 引用
- 题目创建 / 编辑时按题型校验答案(SINGLE 1 字母,MULTI ≥2 字母升序,JUDGE 仅 `T/F`),选项数与答案合法性一致

### 7.4 批量导入(详见 §10)

- `previewImport(payload)` → `{ valid: Question[], invalid: { row:number, errors:string[] }[] }`
- `commitImport(payload)` → 实际写库,导入时 upsert 全局分类,已存在则复用

---

## 8. UI 业务组件结构(语义层)

### 8.1 学生答题页

| 组件 | 作用 |
|---|---|
| `QuestionView` | 渲染题干 + 图片(`onError` 占位)+ 选项;SINGLE/JUDGE 用 RadioGroup,MULTI 用 Checkbox。受控 `value` / `onChange` / `disabled` |
| `AnswerFeedback` | 提交后展示对错 + 高亮差异 + 解析;**MOCK 模式不渲染** |
| `ProgressBar` | 顺序/章节/错题:`第 N/M 题`;随机:`已答 N/M 题`;模考:`第 N/M 题 + 倒计时插槽` |
| `MockTimer` | 客户端 1s tick,`remainingMs = max(0, expiresAt - Date.now())`;归零回调 `onTimeUp` |
| `SubmitConfirmDialog` | 显示未答题数,确认才触发 `onConfirm` |
| `CategorySelectDialog` | 多选树形分类,至少选 1 才能"开始" |
| `ExamModePicker` | `/exam` 主选择卡片,每题库 5 个模式按钮;ONGOING 时按钮变成"继续上次"+"放弃后重开"次级动作 |
| `PracticePlayer` | SEQUENTIAL / CHAPTER / WRONG_REVIEW 共用,可上一题 / 下一题 |
| `RandomPlayer` | 禁用"上一题" |
| `MockPlayer` | 禁用"上一题",嵌 `MockTimer`,`AnswerFeedback` 不渲染,顶栏"交卷"过 `SubmitConfirmDialog` 调 `finishSession`;`useEffect` 绑 `beforeunload` → `navigator.sendBeacon('/api/exam/abandon', JSON.stringify({ attemptId }))` |

### 8.2 学生其它

- `WrongList` / 错题筛选条:题库下拉 + 掌握状态 tabs(全部 / 未掌握 / 已掌握);乐观更新 + 失败回滚 + toast
- `HistoryList` + 详情:状态徽章(`FINISHED` / `ABANDONED`),ABANDONED 详情仅展示有 ExamRecord 的题目

### 8.3 后台

- `AdminShell`(顶栏 + 侧栏 + 主内容,移动端折叠侧栏),侧栏导航 + 权限过滤(无权限菜单不渲染)
- `BankList` / `BankForm` / `DeleteBankButton`
- `QuestionList` / `QuestionsFilter`(题型/题库/关键字)/ `QuestionForm`(动态选项 + 多分类多选 + 标签)/ `ImportForm`(粘贴 JSON / 上传 Excel,预览 → 确认两步)
- `CategoriesClient`(树形 + 增删改)
- `RolesList` / `EditRoleForm`(权限点按 group 分组,super_admin 不可编辑)
- `StudentStats` 列表 + 单学员详情,带题库/模式筛选
- `LoginLogsList`,带状态徽章 + 筛选

### 8.4 通用

- `Topbar`(品牌 + 导航 + ThemeToggle 候选 + 用户菜单 + 改密入口)
- `LoginForm` / `ChangePasswordForm`(react-hook-form + zod;FingerprintJS 在登录前算 deviceId)
- `Toaster`(全站通知,全站统一一份)

---

## 9. 角色 → 权限 → 行为速查表

| 行为 | 学员普通 | 学员严格 | 教练 | 管理员 | 超管 |
|---|:-:|:-:|:-:|:-:|:-:|
| 异地登录冻结 | ❌ | ✅ | ❌ | ❌ | ❌ |
| 进入 `/exam/*` | ✅ | ✅ | ✅ | ❌ | ❌ |
| 模考 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 查看自己的成绩 | ✅ | ✅ | ✅ | — | — |
| 查看所有学员成绩 | ❌ | ❌ | ✅ | ✅ | ✅ |
| 题库 / 题目 / 分类 CRUD | ❌ | ❌ | ❌ | ✅ | ✅ |
| 批量导入 | ❌ | ❌ | ❌ | ✅ | ✅ |
| 用户管理 / 解冻 / 重置密码 | ❌ | ❌ | ❌ | ✅ | ✅ |
| 角色权限编辑 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 登录日志 | ❌ | ❌ | ❌ | ✅ | ✅ |
| 自助改密 | ✅ | ✅ | ✅ | ✅ | ✅ |

跨界访问由中间件拦截。学员访问 `/admin/*` → 302 `/exam`,后台用户访问 `/exam/*` → 302 `/admin`。

---

## 10. 批量导入

### 10.1 流程

`/admin/questions/import`:**预览校验 → 看到合法/不合法行数 + 错误明细 → 确认导入**。

### 10.2 JSON

支持顶层数组 `[ {...}, ... ]` 或 `{ "questions": [ {...}, ... ] }`,每条:

```json
{
  "type": "SINGLE",
  "content": "黄灯亮时表示什么?",
  "imageUrl": null,
  "options": [
    { "key": "A", "text": "禁止通行" },
    { "key": "B", "text": "警示,谨慎通行" }
  ],
  "answer": "B",
  "categories": ["交通信号", "基础"],
  "explanation": "黄灯亮起是警示信号...",
  "tags": ["信号灯", "基础"]
}
```

### 10.3 Excel

模板下载:`/admin/questions/import/template`(导入页"下载 Excel 模板"按钮)。

| 列名 | 说明 |
|---|---|
| `type` | `SINGLE` / `MULTI` / `JUDGE` |
| `content` | 题干(必填) |
| `imageUrl` | 题图 URL(可选) |
| `optionA` ~ `optionF` | 选项(SINGLE/MULTI 必填,JUDGE 留空) |
| `answer` | `B` / `AC` / `T` / `F` |
| `categories` | 多分类用 `\|` 分隔(垂直管道) |
| `explanation` | 解析(可选) |
| `tags` | 多标签用 `\|` 分隔 |

### 10.4 行为约束

- 导入时分类按名 upsert(不存在创建,存在复用),自动挂到题目 `QuestionCategory`
- 一行非法不影响其它行;UI 区分"将导入 N 条 / 跳过 M 条"
- 答案与题型不匹配的行视为非法(如 SINGLE 给了 `'AC'`)
- `optionA..F` 实际填充与 `answer` 引用的字母必须一致(如答案 `'B'` 但 `optionB` 为空 → 非法)

---

## 11. 测试基建(必须保留)

| 工具 | 用途 |
|---|---|
| Vitest | 单元 + 集成 |
| fast-check | PBT(引擎层强制) |
| jsdom | 客户端组件渲染环境 |
| @testing-library/react + jest-dom | 组件断言 |

PBT 必须覆盖的 12 条引擎不变量(每条 ≥100 次迭代):

1. `startSession` 创建的 ExamAttempt 字段一致
2. 各模式 `questionOrder` 快照不变量(无重复、长度规则、来源集)
3. SEQUENTIAL/CHAPTER 严格 `createdAt asc`
4. CHAPTER 按分类树(含后代)过滤
5. WRONG_REVIEW 加载 + `lastWrongAt desc`
6. `submitAnswer` ExamRecord 字段(规范化、clamp、isCorrect)
7. `compareAnswer` 答案语义(SINGLE/JUDGE 字符相等;MULTI 集合相等)
8. 错题本状态机 6 条转移规则 + 单调性
9. 同会话同题目幂等
10. 会话结束的统计字段公式(包括 MOCK 补齐空记录)
11. `isSubmittable` 真值表
12. 分页查询不变量(items 不超 pageSize、跨页无重复、累计 ≤ total)

集成测试用专用 `DATABASE_URL=file:./prisma/test.db`,每测前 `db:reset` + 夹具种子。

---

## 12. 部署

### 12.1 开发

```bash
corepack enable                       # 第一次用 pnpm
pnpm install
cp .env.example .env
pnpm db:push
pnpm db:seed
pnpm dev
# http://localhost:3000          公开首页
# http://localhost:3000/login         学生登录
# http://localhost:3000/admin/login   后台登录
# 默认账号 admin / Admin@123
```

### 12.2 生产(Docker)

推荐:腾讯云轻量香港 2 核 2G(免备案)。

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env
echo "INITIAL_ADMIN_USERNAME=admin"           >> .env
echo "INITIAL_ADMIN_PASSWORD=Admin@123"       >> .env
docker compose up -d --build
# 用 nginx + certbot 反向代理 + HTTPS
```

SQLite 数据库文件 `./data/prod.db` 复制即备份。

### 12.3 常用脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` | 生产构建(含 prisma generate) |
| `pnpm start` | 启动生产服务器 |
| `pnpm db:push` | 同步 schema(开发) |
| `pnpm db:migrate` | 创建并应用迁移(生产) |
| `pnpm db:seed` | 种子数据 |
| `pnpm db:reset` | 重置数据库(开发,危险) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm test` / `pnpm test:watch` | Vitest |

### 12.4 环境变量

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | SQLite 路径(本地 `file:./prisma/dev.db`,生产 `file:/data/prod.db`) |
| `AUTH_SECRET` | NextAuth 加密密钥,**生产必须用 `openssl rand -base64 32` 生成** |
| `AUTH_URL` | 部署域名(可选) |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | 首次 seed 写入,默认 `admin` / `Admin@123` |

---

## 13. 已完成 / 待实现路线

### 13.1 已完成

- **P0 + P1**:Next.js 骨架 + Prisma + Auth.js + RBAC + 异地冻结 + 登录日志 + Docker + seed
- **前后台分离**:公开首页 + `(student)` / `/admin/*` 两条分支 + 中间件分流 + 可编辑角色权限
- **P2**:题库 / 题目 / 全局分类 CRUD + JSON / Excel 批量导入(预览 + 确认)
- **P3**:五种答题模式 + 引擎层 + 会话快照 + 断点续答 + 模考超时兜底(`adoptExpiredMock`)+ 错题本状态机 + 答题记录 + 教练查看学员成绩 + sendBeacon 离场处理 + Vitest + fast-check 测试基建

### 13.2 待实现

- **P4** 用户管理:用户 CRUD、解冻、重置密码、批量发卡
- **P5** 数据统计:学员仪表盘、班级排行、知识点掌握度、答题趋势图、按章节弱项分析
- **P6** 题库抓取:第三方驾考题库自动同步

---

## 14. 重写时务必保留的"易丢点"

下面这些是**写新版时最容易遗漏**的隐性约束,单独列出来:

1. **会话快照**:`questionOrder` / `categoryIds` / `expiresAt` 三个字段必须在 `startSession` 时一次写入,后续题库变化不影响进行中会话
2. **断点续答**:同 `(userId, bankId, mode)` 已有 ONGOING 时不要新建,直接复用
3. **同题幂等**:`(attemptId, questionId)` 唯一约束 + 应用层"已存在直接返回错误,不修改"
4. **costMs 钳制**:0 ≤ costMs ≤ 3_600_000,前端可能传负数或巨大值
5. **answer 规范化**:写入 `ExamRecord.userAnswer` 前必须 normalize,MULTI 升序去重
6. **错题本掌握态打回**:`mastered=true` 再答错时 `rightCount=0` 且 `mastered=false`(不是直接累加 wrongCount 就完事)
7. **MOCK 不返回正确答案 / 解析**:`submitAnswer` 在 MOCK 模式时响应里去掉这两个字段
8. **MOCK 补齐空记录**:`finishSession` / `abandonSession` 时,MOCK 模式必须为 `questionOrder` 中没答的题补齐空 `ExamRecord`,否则统计字段语义错乱
9. **adoptExpiredMock**:`/exam` 页面 RSC 入口主动调用,兜底关闭浏览器导致没触发 sendBeacon 的会话;查询条件用 `expiresAt < now - 60s` 给客户端 timer 留余量
10. **toggleMastered 取消时重置 rightCount**:否则下次答对一次又被自动 mastered
11. **跨界访问拦截**:中间件层做,不要靠页面层 redirect
12. **JWT 缓存**:`roleCode` 嵌在 JWT 里,角色权限改了**下次登录才生效**(产品需要文案上提示)
13. **设备指纹**:登录前在前端算,通过表单提交,不要在服务端塞默认值
14. **超级管理员权限是代码常量**:数据库 `RolePermission` 怎么改都不影响,UI 上 `super_admin` 角色不允许编辑
15. **内置题库 / 含题题库 不可删**
16. **分类同 parent 下唯一**:删除时清理 `QuestionCategory` 引用
17. **导入分类 upsert**:已存在按名复用,不要重复建
18. **Excel 多值列分隔符是 `|`**(垂直管道,不是逗号)
19. **JUDGE 题选项约定**:`[{key:'T',text:'正确'},{key:'F',text:'错误'}]`,答案 `T` 或 `F`
20. **改密后强制重新登录**:`/change-password` 提交成功立刻清 session

---

## 15. 重写工作流建议

下次拿到新 skills(如 Anthropic Frontend Design + Superpowers)时,推荐顺序:

1. **保留这份 SYSTEM-FEATURES.md 不动**,作为唯一事实来源
2. 让新 skills 先生成 `prisma/schema.prisma`(对应 §3)
3. 实现 §6 引擎层(纯函数 + PBT,引擎过了再写其它),引擎是整个系统的"心脏",前面 12 条 PBT 不变量必须全绿
4. 实现 §7 Server Actions(对照引擎写薄壳)
5. 实现 §5 鉴权 + 中间件 + RBAC
6. 实现 §4 路由 + §8 UI 组件,UI 风格可全权交给 frontend-design skill,业务行为对照本文档
7. 实现 §10 导入,UI 优先做"预览 → 确认"两步
8. 跑通 §11 完整测试套
9. 用 §12 Docker 部署验收
10. 沿 §13 路线开 P4 / P5

---

> 文档版本:v1.0,基于 archive/pre-rewrite 分支 commit `a54fa2a` 整理。
