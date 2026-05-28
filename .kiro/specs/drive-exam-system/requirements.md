# Requirements Document

## Introduction

驾考答题系统(`drive-exam-system`)是一套面向中文驾考学员、教练、机构管理员的 Web 应用,提供科目一/科目四/自定义题库的多模式练习、模拟考试、错题本、教练统计、多角色 RBAC、异地登录冻结等能力。系统采用前台/后台分离结构,适配桌面与移动端。

本需求文档的事实来源是仓库根目录的 `SYSTEM-FEATURES.md`(v1.0),覆盖其全部 14 节内容(项目概述、技术栈、数据模型、路由、鉴权与异地登录、答题引擎五种模式、Server Actions、UI 组件、RBAC 矩阵、批量导入、PBT 测试基建、部署、路线、易丢点)。

本期实现范围对应 `SYSTEM-FEATURES.md §13.1` 已完成的 P0/P1/前后台分离/P2/P3 全部条目;P4(用户管理)、P5(数据统计)、P6(题库抓取)不在本期需求内。

UI/视觉层规范由 `frontend-design` 与 `ui-ux-pro-max` 两个 skills 全权负责,本文档只描述与业务行为强相关的 UI 行为约束(如响应式、移动端折叠侧栏、答题图片占位、模考倒计时刻度等)。

整套技术栈必须满足在 2 核 2GB 内存(2C2G)的轻量服务器上以 Docker Compose 形式稳定运行的硬性资源约束(详见 Requirement 30、Requirement 31)。

## Glossary

- **Drive_Exam_System**:整套驾考答题系统,本文档定义的目标系统。
- **Auth_System**:鉴权子系统,基于 Auth.js v5 Credentials + JWT + bcryptjs 实现。
- **Login_Logger**:登录日志记录子系统,产出 `LoginLog` 实体。
- **RBAC_System**:角色权限子系统,管理 `Role` / `Permission` / `RolePermission`。
- **Bank_Manager**:题库 CRUD 子系统。
- **Category_Manager**:全局分类 CRUD 子系统,分类跨题库共享。
- **Question_Manager**:题目 CRUD 子系统,负责单题管理与题型校验。
- **Importer**:批量导入子系统,负责 JSON 与 Excel 两种来源的预览与提交。
- **Exam_Engine**:答题引擎,纯函数集合,包含 `judger` / `wrongbook` / `snapshot` / `question-loader` / `queries` 五个模块。
- **Session_Manager**:答题会话管理子系统,实现 `startSession` / `submitAnswer` / `finishSession` / `abandonSession` / `resumeSession` / `adoptExpiredMock` Server Actions。
- **Question_Loader**:`Exam_Engine` 内的题目加载模块,函数签名为 `loadQuestionsForMode(prismaClient, input)`。
- **Judger**:`Exam_Engine` 内的答案规范化与比对模块,导出 `normalizeAnswer` / `compareAnswer` / `isSubmittable` / `clampCostMs`。
- **Wrongbook_Engine**:`Exam_Engine` 内的错题本状态机模块,导出 `applyExamResult`。
- **Snapshot_Serializer**:`Exam_Engine` 内的会话顺序持久化模块,导出 `serializeOrder` / `parseOrder` / `serializeCategoryIds` / `parseCategoryIds`。
- **Mock_Timer**:模考倒计时客户端组件,1 秒 tick,基于 `expiresAt - Date.now()` 计算剩余时间。
- **Middleware**:Next.js 中间件层,负责未登录拦截与跨界访问拦截。
- **Pagination_Query**:分页查询助手集合(`listWrongQuestions` / `listAttempts` / `listStudents` / `getStudentSummary`)。
- **UI_Layer**:前端界面层,视觉规范由 `frontend-design` skill 与 `ui-ux-pro-max` skill 共同提供。
- **Deployment_Bundle**:Docker 镜像与 docker-compose 部署产物。
- **Test_Suite**:Vitest + fast-check + jsdom + Testing Library 测试基建。
- **MOCK_CONFIG**:模考配置常量表,`bankCode -> { count, durationMs, passScore }`。
- **EARS**:Easy Approach to Requirements Syntax,本文档使用的需求模式语法。
- **PBT**:Property-Based Testing,基于性质的测试方法,本系统引擎层强制使用。
- **strictLogin**:`Role.strictLogin` 布尔字段,为 `true` 的角色启用异地登录冻结。
- **deviceId**:由 FingerprintJS 在客户端登录前计算得到的设备指纹字符串。
- **questionOrder**:`ExamAttempt.questionOrder` 字段,会话创建时一次性冻结的题目顺序快照(JSON 字符串数组)。
- **categoryIds**:`ExamAttempt.categoryIds` 字段,CHAPTER 模式会话创建时冻结的分类选择(JSON 字符串数组)。
- **expiresAt**:`ExamAttempt.expiresAt` 字段,仅 MOCK 模式有值,值为 `startedAt + duration`。
- **costMs**:`ExamRecord.costMs` 字段,单题作答耗时,单位毫秒,合法范围 `[0, 3_600_000]`。
- **mastered**:`WrongQuestion.mastered` 布尔字段,表示该错题是否已掌握。
- **rightCount**:`WrongQuestion.rightCount` 字段,连续答对计数,达到 3 触发 mastered=true,答错重置为 0。
- **2C2G**:2 核 CPU + 2GB 内存的轻量服务器规格,本期硬性部署目标。

## Requirements

### Requirement 1: RBAC 角色与权限点初始化

**User Story:** 作为系统设计者,我希望系统初始化即包含固定的 5 个角色与 30 个权限点,这样所有访问控制都基于稳定的权限码。

#### Acceptance Criteria

1. THE RBAC_System SHALL 在种子数据中创建 5 个角色,其 `code` 字段取值集合恰为 `{super_admin, admin, teacher, student_strict, student_normal}`。
2. THE RBAC_System SHALL 在种子数据中创建 30 个权限点,按 7 个 `group` 字段分组,分组取值恰为 `{用户管理, 角色权限, 题库管理, 题目管理, 答题, 统计, 系统}`。
3. THE RBAC_System SHALL 至少包含以下权限码:`exam:practice`, `exam:mock`, `stats:self`, `stats:all`, `bank:read`, `bank:write`, `question:read`, `question:write`, `question:import`, `category:write`, `user:read`, `user:write`, `user:unfreeze`, `user:reset-password`, `role:read`, `role:edit-permissions`, `log:read`。
4. THE RBAC_System SHALL 将 `Role.isSystem=true` 的内置角色标记为不可删除。
5. THE RBAC_System SHALL 将 `code=student_strict` 的角色 `strictLogin` 字段置为 `true`,其他四个角色 `strictLogin` 字段置为 `false`。

### Requirement 2: 超级管理员权限代码常量

**User Story:** 作为系统安全负责人,我希望超级管理员的权限是代码常量而非数据库记录,这样即使有人篡改 `RolePermission` 表也无法降级超级管理员。

#### Acceptance Criteria

1. WHEN Auth_System 解析当前用户角色码时,IF 角色码等于 `super_admin`,THEN THE Auth_System SHALL 在权限检查时返回"全部权限"集合,忽略 `RolePermission` 表的实际记录。
2. THE UI_Layer SHALL 在 `/admin/roles/[id]/edit` 页面禁止对 `code=super_admin` 的角色提交权限变更。
3. IF 任意非 super_admin 用户访问 `/admin/roles/[id]/edit`,THEN THE Middleware SHALL 拒绝访问并返回 302 至 `/admin`。

### Requirement 3: 角色权限编辑与 JWT 缓存

**User Story:** 作为超级管理员,我希望可以编辑非 super_admin 角色的权限,并且变更在用户下次登录时生效,这样授权变更可被追踪且不会引发"瞬时权限"风险。

#### Acceptance Criteria

1. WHERE 当前会话用户角色码为 `super_admin`,THE RBAC_System SHALL 允许在 `/admin/roles/[id]/edit` 编辑除 `super_admin` 以外的任意角色的权限点勾选。
2. THE Auth_System SHALL 在签发 JWT 时把 `roleCode` 字段嵌入 token claim。
3. WHEN 角色权限被修改后,THE Auth_System SHALL 仅在该角色下用户的下一次登录时刷新其权限缓存,在已存在的有效 JWT 上保留旧权限。
4. THE UI_Layer SHALL 在权限编辑页面显著提示文案"变更将在用户下次登录时生效"。

### Requirement 4: 用户状态机

**User Story:** 作为管理员,我希望用户拥有三态状态字段,这样可以精确区分正常、被异地冻结与被禁用三种情况。

#### Acceptance Criteria

1. THE Auth_System SHALL 把 `User.status` 字段限制在枚举 `{ACTIVE, FROZEN, DISABLED}` 范围内。
2. IF 待登录用户的 `status` 不等于 `ACTIVE`,THEN THE Auth_System SHALL 拒绝登录并写入对应失败 LoginLog。
3. WHERE 用户 `status=FROZEN`,THE Auth_System SHALL 仅允许具有 `user:unfreeze` 权限的管理员将其改回 `ACTIVE`。

### Requirement 5: 凭据登录与 bcrypt 密码

**User Story:** 作为终端用户,我希望使用用户名 + 密码登录,这样无需第三方账号即可使用系统。

#### Acceptance Criteria

1. THE Auth_System SHALL 仅暴露 Credentials 一种登录方式,且不向外提供任何公开注册入口。
2. THE Auth_System SHALL 使用 `bcryptjs` 对 `User.passwordHash` 字段进行散列与比对。
3. THE Drive_Exam_System SHALL 在种子数据中创建用户名为 `${INITIAL_ADMIN_USERNAME}`(默认 `admin`)、密码为 `${INITIAL_ADMIN_PASSWORD}`(默认 `Admin@123`)的初始账号,角色码为 `admin`。
4. THE Drive_Exam_System SHALL 不强制初始账号在首次登录时修改密码。
5. WHEN 用户在登录失败后再次登录,THE Auth_System SHALL 不向客户端泄露失败原因细节,前端仅显示"用户名或密码错误"。

### Requirement 6: 设备指纹与登录提交

**User Story:** 作为风控负责人,我希望登录请求附带设备指纹,这样可以基于设备维度判定异地登录。

#### Acceptance Criteria

1. THE UI_Layer SHALL 在 `/login` 与 `/admin/login` 页面提交登录表单之前调用 FingerprintJS 计算 `deviceId` 字段。
2. WHEN 登录表单被提交,THE UI_Layer SHALL 在表单 payload 中携带 `deviceId` 字段。
3. IF 客户端因任何原因未能计算出 `deviceId`,THEN THE Auth_System SHALL 拒绝该登录请求并写入 `success=false, reason=DEVICE_FINGERPRINT_MISSING` 的 LoginLog。
4. THE Auth_System SHALL 不在服务端为缺失的 `deviceId` 填充任何默认值。

### Requirement 7: 异地登录冻结

**User Story:** 作为机构运营,我希望严格学员账号在 IP 或设备发生变化时被自动冻结,这样可以防止学员账号被多人共用。

#### Acceptance Criteria

1. WHEN 一次登录尝试到达 Auth_System,WHERE 该用户角色 `strictLogin=true`,IF 本次请求的 `ip != User.lastLoginIp` 或本次 `deviceId != User.lastLoginDeviceId`,THEN THE Auth_System SHALL 将 `User.status` 置为 `FROZEN`,拒绝本次登录,并写入 `success=false, reason=FROZEN_BY_REMOTE` 的 LoginLog。
2. WHEN 一次登录成功,THE Auth_System SHALL 把本次 `ip` 与 `deviceId` 写入 `User.lastLoginIp` 与 `User.lastLoginDeviceId`。
3. WHERE 用户角色 `strictLogin=false`,THE Auth_System SHALL 不执行 IP 与 `deviceId` 比对。
4. IF 用户被冻结后由具备 `user:unfreeze` 权限的管理员解冻,THEN THE Auth_System SHALL 把该用户的 `lastLoginIp` 与 `lastLoginDeviceId` 一并清空,使下次登录视作首次。

### Requirement 8: 登录日志记录

**User Story:** 作为管理员,我希望系统记录每一次登录尝试(无论成功与否),这样可以审计异常行为。

#### Acceptance Criteria

1. WHEN 任意登录尝试到达 Auth_System,THE Login_Logger SHALL 写入一条 `LoginLog` 记录,包含 `userId`(失败可空)、`username`、`ip`、`deviceId`、`userAgent`、`success`、`reason`、`createdAt` 字段。
2. THE Login_Logger SHALL 把 `reason` 字段限制在枚举 `{OK, WRONG_PASSWORD, USER_NOT_FOUND, FROZEN_BY_REMOTE, DISABLED, DEVICE_FINGERPRINT_MISSING}` 范围内。
3. WHERE 当前用户具备 `log:read` 权限,THE UI_Layer SHALL 在 `/admin/login-logs` 页面提供按状态、时间范围、关键字(用户名 / IP)三类筛选项。
4. IF 当前用户不具备 `log:read` 权限,THEN THE Middleware SHALL 拒绝访问 `/admin/login-logs` 并返回 302 至各自 portal 主页。

### Requirement 9: 自助修改密码与强制重新登录

**User Story:** 作为已登录用户,我希望能在 `/change-password` 自助修改密码,并在修改成功后被强制重新登录,这样可以避免新旧 session 共存。

#### Acceptance Criteria

1. WHEN 已登录用户访问 `/change-password`,THE UI_Layer SHALL 渲染包含"旧密码"、"新密码"、"确认新密码"三个字段的表单。
2. IF 旧密码校验不通过,THEN THE Auth_System SHALL 返回 `{ ok:false, error:'旧密码错误' }` 并保留当前 session。
3. WHEN 修改密码成功,THE Auth_System SHALL 立刻清除当前 session 并要求用户重新登录。
4. THE UI_Layer SHALL 同时使用 React Hook Form + Zod 在客户端校验三个字段非空与新密码一致性,Server Action 一侧 SHALL 重复同样的 zod 校验。

### Requirement 10: 题库 CRUD 与不可删约束

**User Story:** 作为管理员,我希望可以管理题库,但内置题库与含题题库不可被误删,这样可以避免数据连锁丢失。

#### Acceptance Criteria

1. THE Bank_Manager SHALL 在 `/admin/banks` 页面提供题库的列表、新建、编辑、删除四种操作。
2. THE Bank_Manager SHALL 把 `code` 字段在新建时设为业务码,`subject_1` 与 `subject_4` 由种子数据写入并标记 `isBuiltin=true`。
3. IF 待删除题库 `isBuiltin=true`,THEN THE Bank_Manager SHALL 拒绝删除并返回 `{ ok:false, error:'内置题库不可删除' }`。
4. IF 待删除题库下题目数量大于 0,THEN THE Bank_Manager SHALL 拒绝删除并返回 `{ ok:false, error:'题库下尚有题目,无法删除' }`。

### Requirement 11: 全局分类管理(跨题库共享)

**User Story:** 作为管理员,我希望分类是全局且跨题库共享的,这样多个题库间重叠的标签(如"交通信号""违章罚则")只需维护一份。

#### Acceptance Criteria

1. THE Category_Manager SHALL 在 `Category` 实体中不存储 `bankId` 外键,分类对全部题库共享可见。
2. IF 用户尝试在同一 `parentId` 下创建或重命名为已存在的同名分类,THEN THE Category_Manager SHALL 拒绝该操作并返回 `{ ok:false, error:'同级分类名重复' }`。
3. WHEN 一个分类被删除,THE Category_Manager SHALL 在同一事务中删除所有引用该分类的 `QuestionCategory` 记录。
4. THE UI_Layer SHALL 在 `/admin/categories` 以树形结构展示多级分类,支持新建、改名、改父分类、删除四种操作。

### Requirement 12: 题目 CRUD 与按题型校验答案

**User Story:** 作为管理员,我希望题目按题型(SINGLE/MULTI/JUDGE)分别校验答案,这样可以避免数据脏入库。

#### Acceptance Criteria

1. THE Question_Manager SHALL 把 `Question.type` 字段限制在枚举 `{SINGLE, MULTI, JUDGE}` 范围内。
2. WHEN 创建或编辑题目时,IF `type=SINGLE`,THEN THE Question_Manager SHALL 校验 `answer` 长度为 1 且为大写字母 `A`-`F` 之一,且 `answer` 引用的字母对应的选项必须存在且非空。
3. WHEN 创建或编辑题目时,IF `type=MULTI`,THEN THE Question_Manager SHALL 校验 `answer` 长度 ≥ 2,字符为大写字母 `A`-`F` 子集,且为升序无重复,且每个字母对应的选项均存在且非空。
4. WHEN 创建或编辑题目时,IF `type=JUDGE`,THEN THE Question_Manager SHALL 强制 `options=[{key:'T',text:'正确'},{key:'F',text:'错误'}]` 且 `answer ∈ {T, F}`。
5. THE Question_Manager SHALL 在题目表单中允许多选挂载多个 `Category`,允许填写字符串数组 `tags`。
6. THE UI_Layer SHALL 在 `/admin/questions` 列表页提供题型、题库、关键字三类筛选与分页。

### Requirement 13: JSON 批量导入(预览 + 提交两步)

**User Story:** 作为管理员,我希望可以粘贴 JSON 批量导入题目,并通过"预览校验 → 确认导入"两步完成,这样可以在落库前看到非法行明细。

#### Acceptance Criteria

1. THE Importer SHALL 接受顶层为数组 `[ {...} ]` 或对象 `{ "questions": [ {...} ] }` 两种 JSON 形态。
2. WHEN 用户提交预览请求,THE Importer SHALL 调用 `previewImport(payload)` 并返回 `{ valid: Question[], invalid: { row:number, errors:string[] }[] }` 的结果,不写库。
3. WHEN 用户提交确认导入请求,THE Importer SHALL 调用 `commitImport(payload)`,对每条合法 `categories[]` 内的分类名执行按名 upsert(不存在创建,存在复用)。
4. IF 导入条目的 `answer` 与 `type` 校验失败,THEN THE Importer SHALL 把该条目归入 `invalid` 列表并附带具体错误码,但不影响其它合法条目的导入。
5. THE UI_Layer SHALL 在导入页区分展示"将导入 N 条"与"跳过 M 条非法记录"两个数字。

### Requirement 14: Excel 批量导入与模板下载

**User Story:** 作为管理员,我希望可以通过 Excel 模板批量导入题目,且多值列(分类、标签)使用 `|` 作为分隔符,这样可以避免与逗号在中文文本中的歧义。

#### Acceptance Criteria

1. WHEN 用户访问 `/admin/questions/import/template`(GET),THE Importer SHALL 返回带列名 `type, content, imageUrl, optionA, optionB, optionC, optionD, optionE, optionF, answer, categories, explanation, tags` 的 `.xlsx` 模板。
2. THE Importer SHALL 把 `categories` 与 `tags` 两列按竖线 `|`(U+007C)分隔解析为字符串数组。
3. IF Excel 行的 `answer` 引用的字母对应列(如 `answer='B'` 但 `optionB` 为空)为空,THEN THE Importer SHALL 把该行标记为非法并附带错误 `OPTION_MISSING_FOR_ANSWER`。
4. WHEN Excel 导入预览完成,THE Importer SHALL 复用与 JSON 导入相同的 `previewImport` / `commitImport` 契约,UI 流程亦为"预览 → 确认"两步。

### Requirement 15: 五种答题模式定义

**User Story:** 作为学员,我希望能选择 5 种答题模式中的任意一种开始练习,这样可以覆盖顺序、随机、章节、模考、错题重做五类备考场景。

#### Acceptance Criteria

1. THE Exam_Engine SHALL 把 `ExamAttempt.mode` 字段限制在枚举 `{SEQUENTIAL, RANDOM, CHAPTER, MOCK, WRONG_REVIEW}` 范围内。
2. WHEN `mode=SEQUENTIAL`,THE Question_Loader SHALL 加载题库整库题目并按 `Question.createdAt` 升序排列。
3. WHEN `mode=RANDOM`,THE Question_Loader SHALL 加载题库整库题目并按 Fisher–Yates 算法打乱顺序。
4. WHEN `mode=CHAPTER`,THE Question_Loader SHALL 把入参 `categoryIds` 通过 `expandCategoryDescendants` 展开为含全部后代分类的集合,并加载所有命中题目按 `Question.createdAt` 升序排列。
5. WHEN `mode=MOCK`,THE Question_Loader SHALL 从题库整库随机抽取 `MOCK_CONFIG[bankCode].count` 题。
6. WHEN `mode=WRONG_REVIEW`,THE Question_Loader SHALL 加载当前用户 `WrongQuestion.mastered=false` 的题目并按 `lastWrongAt` 降序排列。
7. THE Exam_Engine SHALL 保证 `RANDOM` 与 `MOCK` 两种模式产出的 `questionOrder` 在会话生命周期内不允许往回翻页。

### Requirement 16: 模考配置常量(MOCK_CONFIG)

**User Story:** 作为产品负责人,我希望模考的题量、时长、通过线由常量表统一配置,这样不同题库可以差异化设置而代码无需改动业务逻辑。

#### Acceptance Criteria

1. THE Exam_Engine SHALL 提供 `MOCK_CONFIG` 常量与 `getMockConfig(bankCode)` 函数,返回 `{ count, durationMs, passScore }`。
2. THE Exam_Engine SHALL 把 `MOCK_CONFIG['subject_1']` 设为 `{ count: 100, durationMs: 45 * 60 * 1000, passScore: 90 }`。
3. THE Exam_Engine SHALL 把 `MOCK_CONFIG['subject_4']` 设为 `{ count: 50, durationMs: 30 * 60 * 1000, passScore: 90 }`。
4. WHEN `getMockConfig(bankCode)` 的入参未命中显式键,THE Exam_Engine SHALL 返回默认配置 `{ count: 50, durationMs: 30 * 60 * 1000, passScore: 90 }`。

### Requirement 17: 会话快照不变量

**User Story:** 作为答题用户,我希望会话开始后,即使管理员同时在改题库,我看到的题目顺序与题面也保持一致,这样可以避免答题中途题目漂移。

#### Acceptance Criteria

1. WHEN `startSession` 创建一个新的 `ExamAttempt`,THE Session_Manager SHALL 在同一事务中一次性写入 `questionOrder`、`categoryIds`(CHAPTER 模式)、`expiresAt`(MOCK 模式)三个快照字段。
2. WHILE `ExamAttempt.status=ONGOING`,THE Session_Manager SHALL 不允许任何路径修改该会话的 `questionOrder`、`categoryIds`、`expiresAt`。
3. WHEN 题库题目、分类挂载或题目内容在会话进行期间发生变化,THE Session_Manager SHALL 仅按 `questionOrder` 中的题目 ID 加载题面渲染,忽略后续新增题。
4. THE Snapshot_Serializer SHALL 把 `questionOrder` 与 `categoryIds` 以 JSON 字符串形式持久化,且 `parseOrder(serializeOrder(xs))` 与 `parseCategoryIds(serializeCategoryIds(xs))` 在所有合法字符串数组上等于 `xs`。
5. IF `parseOrder` 或 `parseCategoryIds` 接收到非 JSON、非数组、或包含非字符串元素的输入,THEN THE Snapshot_Serializer SHALL 返回空数组 `[]`,不抛异常。

### Requirement 18: 断点续答(非 MOCK 模式)

**User Story:** 作为学员,我希望非模考会话支持中途离开后从原位置继续,这样可以利用碎片时间练习。

#### Acceptance Criteria

1. WHEN `startSession` 被调用,THE Session_Manager SHALL 先按 `(userId, bankId, mode, status='ONGOING')` 查询是否已有进行中会话。
2. IF 步骤 1 查到已有会话,THEN THE Session_Manager SHALL 直接返回 `{ ok:true, data:{ attemptId, resumed:true } }` 且不创建新会话。
3. WHERE `mode=MOCK`,THE Session_Manager SHALL 在 `expiresAt < now` 的会话上拒绝续答,转为兜底结算路径(见 Requirement 21)。
4. THE Session_Manager SHALL 在每次成功 `submitAnswer` 后,将 `ExamAttempt.currentIndex` 设置为下一道未答题的索引。
5. WHERE `mode ∈ {RANDOM, MOCK}`,THE UI_Layer SHALL 禁用"上一题"按钮。

### Requirement 19: 答案规范化、比对、可提交判定与耗时钳制

**User Story:** 作为引擎设计者,我希望答案的规范化、比对、可提交判定、耗时钳制四个工具函数行为可被独立测试,这样答题正确性可以以 PBT 形式严格验证。

#### Acceptance Criteria

1. THE Judger SHALL 提供 `normalizeAnswer(type, raw)` 函数,行为为:去除全部空白、转大写;若 `type=MULTI`,则把字母拆开升序去重再拼接;返回字符串。
2. THE Judger SHALL 提供 `compareAnswer(type, userAnswer, correctAnswer)` 函数,在两端先 `normalizeAnswer` 再比较;`type ∈ {SINGLE, JUDGE}` 时为字符串相等;`type=MULTI` 时为集合相等。
3. THE Judger SHALL 提供 `isSubmittable(type, selectedCount, optionsCount)` 函数,`type ∈ {SINGLE, JUDGE}` 时返回 `selectedCount === 1`,`type=MULTI` 时返回 `2 <= selectedCount <= optionsCount`。
4. THE Judger SHALL 提供 `clampCostMs(value)` 函数,对任意输入返回 `max(0, min(value, 3_600_000))`,即输出始终在闭区间 `[0, 3_600_000]` 内。
5. WHEN `submitAnswer` 写入 `ExamRecord.userAnswer`,THE Session_Manager SHALL 先用 `normalizeAnswer` 规范化用户输入再持久化。
6. WHEN `submitAnswer` 写入 `ExamRecord.costMs`,THE Session_Manager SHALL 先用 `clampCostMs` 钳制再持久化。

### Requirement 20: 错题本状态机

**User Story:** 作为学员,我希望错题本能根据连续答对/答错自动管理"已掌握"状态,这样错题重做模式只关注真正未掌握的题。

#### Acceptance Criteria

1. WHEN `applyExamResult(prev, isCorrect, now)` 满足 `prev == null` 且 `isCorrect = true`,THE Wrongbook_Engine SHALL 返回 `null`(不创建错题)。
2. WHEN `applyExamResult` 满足 `prev == null` 且 `isCorrect = false`,THE Wrongbook_Engine SHALL 返回 `{ wrongCount:1, rightCount:0, mastered:false, lastWrongAt:now }`。
3. WHEN `applyExamResult` 满足 `prev != null` 且 `isCorrect = false` 且 `prev.mastered = false`,THE Wrongbook_Engine SHALL 返回 `prev` 的副本并令 `wrongCount += 1, rightCount = 0, lastWrongAt = now`。
4. WHEN `applyExamResult` 满足 `prev != null` 且 `isCorrect = false` 且 `prev.mastered = true`,THE Wrongbook_Engine SHALL 返回 `prev` 的副本并令 `wrongCount += 1, rightCount = 0, mastered = false, lastWrongAt = now`。
5. WHEN `applyExamResult` 满足 `prev != null` 且 `isCorrect = true` 且 `prev.rightCount + 1 < 3`,THE Wrongbook_Engine SHALL 返回 `prev` 的副本并令 `rightCount += 1`,其它字段不变。
6. WHEN `applyExamResult` 满足 `prev != null` 且 `isCorrect = true` 且 `prev.rightCount + 1 >= 3`,THE Wrongbook_Engine SHALL 返回 `prev` 的副本并令 `rightCount += 1, mastered = true`。
7. THE Wrongbook_Engine SHALL 保证对任意输入,`next.wrongCount >= (prev?.wrongCount ?? 0)` 与 `next.lastWrongAt >= (prev?.lastWrongAt ?? Epoch)` 单调性始终成立。

### Requirement 21: submitAnswer Server Action 契约

**User Story:** 作为后端契约设计者,我希望 `submitAnswer` 是事务性、幂等且对 MOCK 模式不泄露答案的,这样可以保证数据一致与防作弊。

#### Acceptance Criteria

1. THE Session_Manager SHALL 把 `submitAnswer` 的入参用 zod 校验为 `{ attemptId: string, questionId: string, userAnswer: string, costMs: number }`。
2. WHEN `submitAnswer` 执行,THE Session_Manager SHALL 在同一数据库事务中校验会话归属、校验 `status=ONGOING`、校验 MOCK 模式 `expiresAt > now`、写入 `ExamRecord`、调用 `applyExamResult` 写入 `WrongQuestion`、推进 `currentIndex`。
3. IF MOCK 模式会话的 `expiresAt < now`,THEN THE Session_Manager SHALL 当场把会话结算为 `ABANDONED` 并拒绝本次提交,返回 `{ ok:false, error:'考试已超时' }`。
4. IF `(attemptId, questionId)` 在 `ExamRecord` 上已存在,THEN THE Session_Manager SHALL 返回 `{ ok:false, error:'该题已提交' }`,并且 SHALL NOT 修改任何数据。
5. WHERE `ExamAttempt.mode = MOCK`,THE Session_Manager SHALL 在 `submitAnswer` 的成功响应中**移除** `correctAnswer` 与 `explanation` 两个字段。
6. WHEN 当前题目是 `questionOrder` 的最后一题,THE Session_Manager SHALL 在响应中返回 `finished: true`,但不在此自动结束会话。

### Requirement 22: finishSession / abandonSession 与 MOCK 空记录补齐

**User Story:** 作为统计设计者,我希望模考会话即使有未答题,也会被补齐空记录,这样统计字段(题数、正确数、得分、用时)的语义始终一致。

#### Acceptance Criteria

1. THE Session_Manager SHALL 提供内部 helper `finalizeAttempt(tx, attemptId, finalStatus)`,被 `finishSession` 与 `abandonSession` 共用。
2. WHERE `ExamAttempt.mode = MOCK`,WHEN `finalizeAttempt` 执行,THE Session_Manager SHALL 为 `questionOrder` 中**未存在 `ExamRecord`** 的题目补齐空记录 `{ userAnswer:'', isCorrect:false, costMs:0 }`。
3. WHEN `finalizeAttempt` 执行,THE Session_Manager SHALL 计算 `totalCount = questionOrder.length`,`correctCount = ExamRecord 中 isCorrect=true 的数量`,`score = totalCount === 0 ? 0 : Math.round(correctCount / totalCount * 100)`,`durationMs = finishedAt - startedAt`,并把这四个字段连同 `status` 与 `finishedAt` 写回 `ExamAttempt`。
4. WHEN `finalizeAttempt` 完成,THE Session_Manager SHALL 调用 `revalidatePath('/exam/history')`。
5. THE Session_Manager SHALL 暴露 `POST /api/exam/abandon` 路由,允许浏览器在关闭时通过 `navigator.sendBeacon` 提交 `{ attemptId }` 触发 `abandonSession`。

### Requirement 23: adoptExpiredMock 兜底

**User Story:** 作为可靠性设计者,我希望即使学员在模考超时前直接关闭浏览器导致 sendBeacon 也未到达,系统也能在下次进入 `/exam` 时把这些遗留会话自动结算,这样 ONGOING 列表不会越积越多。

#### Acceptance Criteria

1. WHEN `/exam` 页面在 RSC 加载时执行,THE Session_Manager SHALL 调用 `adoptExpiredMock(userId)`。
2. THE Session_Manager SHALL 在 `adoptExpiredMock` 中筛选 `mode='MOCK' AND status='ONGOING' AND expiresAt < now - 60_000`(即 `expiresAt` 早于 60 秒前)的全部会话。
3. WHEN `adoptExpiredMock` 处理每条遗留会话,THE Session_Manager SHALL 调用 `finalizeAttempt(_, _, 'ABANDONED')` 完成结算并补齐空记录。
4. THE Session_Manager SHALL 保留客户端 `Mock_Timer` 1 秒 tick 触发 `finishSession` 的主路径,`adoptExpiredMock` 仅作兜底,二者顺序不敏感(同一会话被两条路径同时触发时,后到者按 Requirement 21.4 的幂等返回错误)。

### Requirement 24: toggleMastered 与 rightCount 重置

**User Story:** 作为学员,我希望可以手动把已掌握的错题标记为未掌握,并且系统自动重置 `rightCount`,这样下一次重做不会因为旧的连胜记录立即又被自动 mastered。

#### Acceptance Criteria

1. WHEN `toggleMastered({ wrongId, mastered })` 被调用,THE Wrongbook_Engine SHALL 按 `(wrongId, userId)` 双条件校验归属;不归属时返回 `{ ok:false, error:'无权操作' }`。
2. WHEN `toggleMastered` 把某条错题从 `mastered=true` 切换到 `mastered=false`,THE Wrongbook_Engine SHALL 在同一事务中把 `rightCount` 重置为 0。
3. WHEN `toggleMastered` 执行成功,THE Session_Manager SHALL 调用 `revalidatePath('/exam/wrong')`。
4. THE UI_Layer SHALL 在 `/exam/wrong` 列表项使用乐观更新切换 mastered 标志,失败时回滚并 toast 报错。

### Requirement 25: ExamRecord 同题幂等约束

**User Story:** 作为数据一致性设计者,我希望同一会话同一题不可被重复写入,这样可以避免重复计分。

#### Acceptance Criteria

1. THE Drive_Exam_System SHALL 在 `ExamRecord` 表上对 `(attemptId, questionId)` 建立唯一约束。
2. IF 任何路径尝试以已存在的 `(attemptId, questionId)` 插入 `ExamRecord`,THEN THE Session_Manager SHALL 拒绝该插入并按 Requirement 21.4 的契约返回错误。

### Requirement 26: 分页查询不变量

**User Story:** 作为列表页设计者,我希望错题、记录、学员三类列表的分页结果具有可预测的不变量,这样前端无需做去重与计数兜底。

#### Acceptance Criteria

1. THE Pagination_Query SHALL 提供 `listWrongQuestions({ userId, page, pageSize=20, bankId?, masteredFilter?='all' })`、`listAttempts({ userId, page, pageSize=20, bankId?, mode? })`、`listStudents({ page, pageSize=20 })`、`getStudentSummary(userId)` 四个函数。
2. THE Pagination_Query SHALL 保证返回结构 `{ items, total, page, pageSize }`,且对任意合法分页参数,`items.length <= pageSize`。
3. THE Pagination_Query SHALL 保证 `(page-1) * pageSize + items.length <= total` 始终成立。
4. THE Pagination_Query SHALL 保证遍历所有合法页码时,`items` 间无重复 ID 且全部 ID 的并集大小等于 `min(total, totalPages * pageSize)`。
5. WHERE `listAttempts` 被调用,THE Pagination_Query SHALL 仅返回 `status ∈ {FINISHED, ABANDONED}` 的记录,按 `startedAt` 降序排列。

### Requirement 27: 路由清单与跨界访问拦截

**User Story:** 作为前后台分离设计者,我希望学生与后台用户互不可访问对方的路由,这样 UI 边界由 Middleware 强制而非靠页面层 redirect。

#### Acceptance Criteria

1. THE Drive_Exam_System SHALL 提供以下公开路由可在未登录状态访问:`/`、`/login`、`/admin/login`。
2. THE Drive_Exam_System SHALL 提供以下学生前台路由(路由组 `(student)`):`/exam`、`/exam/session/[attemptId]`、`/exam/session/[attemptId]/result`、`/exam/wrong`、`/exam/history`、`/exam/history/[attemptId]`。
3. THE Drive_Exam_System SHALL 提供以下后台路由:`/admin`、`/admin/banks`、`/admin/banks/new`、`/admin/banks/[id]`、`/admin/questions`、`/admin/questions/new`、`/admin/questions/[id]`、`/admin/questions/import`、`/admin/categories`、`/admin/users`(P4 占位)、`/admin/roles`、`/admin/roles/[id]/edit`、`/admin/student-stats`、`/admin/student-stats/[userId]`、`/admin/login-logs`。
4. THE Drive_Exam_System SHALL 提供以下通用路由:`/change-password`、`POST /api/exam/abandon`、`GET /admin/questions/import/template`。
5. WHEN 角色码为 `student_strict` 或 `student_normal` 的用户请求任意 `/admin/*` 路由,THE Middleware SHALL 返回 302 至 `/exam`。
6. WHEN 角色码为 `super_admin`、`admin` 或 `teacher` 的用户请求任意 `/exam/*` 路由,THE Middleware SHALL 返回 302 至 `/admin`。
7. WHEN 用户登录成功后,THE Auth_System SHALL 按以下规则跳转:`super_admin` / `admin` / `teacher` 跳 `/admin`,`student_strict` / `student_normal` 跳 `/exam`。

### Requirement 28: UI 行为与视觉规范

**User Story:** 作为前端工程师,我希望视觉风格由 `frontend-design` 与 `ui-ux-pro-max` skills 全权负责,而业务相关的 UI 行为(响应式、移动端折叠侧栏、答题图片占位、模考倒计时)由本文档明确,这样视觉与业务两条线互不干扰。

#### Acceptance Criteria

1. THE UI_Layer SHALL 采用 `frontend-design` skill 与 `ui-ux-pro-max` skill 共同提供的视觉与交互规范作为整套样式系统的事实来源。
2. THE UI_Layer SHALL 在桌面与移动端两种 viewport 下提供等价的核心功能,且所有交互元素在移动端最小触控尺寸不小于 44 × 44 CSS 像素。
3. WHILE viewport 宽度 ≤ 768 CSS 像素,THE AdminShell 组件 SHALL 把侧栏折叠为抽屉式,顶栏提供菜单按钮触发抽屉。
4. WHEN `QuestionView` 渲染含 `imageUrl` 的题目,IF 图片加载失败,THEN THE UI_Layer SHALL 渲染占位图(图标 + "图片加载失败"文案),不允许图片缺失阻断答题。
5. THE UI_Layer SHALL 在 SINGLE / JUDGE 题型上使用 RadioGroup,在 MULTI 题型上使用 Checkbox,提交按钮的可用性由 `Judger.isSubmittable` 决定。
6. WHERE `ExamAttempt.mode = MOCK`,THE UI_Layer SHALL 不渲染 `AnswerFeedback` 组件,且顶栏交卷按钮经 `SubmitConfirmDialog` 二次确认后才调用 `finishSession`。
7. THE Mock_Timer 组件 SHALL 以 1 秒为 tick 间隔重新计算 `remainingMs = max(0, expiresAt - Date.now())`,在归零时回调 `onTimeUp`。
8. THE UI_Layer SHALL 在所有学生答题客户端组件中绑定 `beforeunload` 事件,WHERE `mode = MOCK`,IF 会话仍为 ONGOING,THEN THE UI_Layer SHALL 通过 `navigator.sendBeacon('/api/exam/abandon', JSON.stringify({ attemptId }))` 通知服务端兜底。
9. THE UI_Layer SHALL 在 `AdminShell` 侧栏对当前用户无权限的菜单项不渲染。

### Requirement 29: 测试基建与 PBT 强度

**User Story:** 作为质量保障负责人,我希望引擎层 12 条不变量都被 fast-check 覆盖且每条至少 100 次迭代,这样回归足以发现边界 bug。

#### Acceptance Criteria

1. THE Test_Suite SHALL 使用 Vitest 作为唯一测试运行器,使用 fast-check 作为唯一 PBT 库,使用 jsdom 作为客户端组件渲染环境,使用 `@testing-library/react` 与 `@testing-library/jest-dom` 作为组件断言库。
2. THE Test_Suite SHALL 为 §Correctness Properties 列出的 12 条引擎与分页层不变量各编写至少一条 fast-check 性质,每条性质 `fc.assert` 调用至少 100 次迭代(`numRuns >= 100`)。
3. WHEN `pnpm test` 在 CI 与本地以 `--run` 模式执行,THE Test_Suite SHALL 在不依赖 watch 模式的前提下完成全部用例。
4. THE Test_Suite SHALL 使用独立 `DATABASE_URL=file:./prisma/test.db`,在每个集成测试用例前执行 `db:reset` 与夹具种子,避免共用开发数据库。

### Requirement 30: 部署形态与 SQLite 持久化

**User Story:** 作为部署负责人,我希望系统以 Docker Compose 形式一键部署,且 SQLite 文件挂载在宿主目录便于备份,这样最小化运维负担。

#### Acceptance Criteria

1. THE Deployment_Bundle SHALL 提供 `Dockerfile` 与 `docker-compose.yml`,在 `docker compose up -d --build` 一条命令下完成构建与启动。
2. THE Deployment_Bundle SHALL 把 SQLite 数据库文件持久化到宿主路径 `./data/prod.db`,容器内对应路径为 `/data/prod.db`,通过 `DATABASE_URL=file:/data/prod.db` 指向。
3. THE Deployment_Bundle SHALL 在 `.env` 中要求至少配置 `AUTH_SECRET`、`INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD` 三个变量;`AUTH_SECRET` 在生产环境 SHALL 通过 `openssl rand -base64 32` 生成。
4. THE Deployment_Bundle SHALL 在容器启动时按需执行 `prisma migrate deploy` 与 `db:seed`,首次启动后写入初始管理员账号。

### Requirement 31: 2C2G 资源占用与构建产物约束

**User Story:** 作为运维成本负责人,我希望整套系统能稳定运行在 2 核 2GB 内存的轻量服务器(如腾讯云轻量香港 2C2G)上,这样最低部署成本受控。

#### Acceptance Criteria

1. THE Drive_Exam_System SHALL 在 2 核 2GB 内存的 Linux 服务器上以 Docker Compose 模式以单个 Node.js 进程稳定运行,稳态(空载)RSS 不大于 600 MB。
2. THE Drive_Exam_System SHALL 在生产负载(并发 ≤ 50)下保持单进程 RSS 不超过 1.2 GB,以为 SQLite 与系统进程预留剩余内存。
3. THE Deployment_Bundle SHALL 默认使用 SQLite 而非任何需要独立进程的数据库(如 PostgreSQL / MySQL / Redis),除非用户显式切换 `DATABASE_URL`。
4. THE Deployment_Bundle SHALL 通过 Next.js `output: 'standalone'` 等手段控制构建产物,`docker image` 单层未压缩大小不超过 800 MB。
5. THE Drive_Exam_System SHALL 不引入任何在 2C2G 上需要 ≥ 1 GB 常驻内存的第三方进程依赖(如 Elasticsearch、Kafka、独立 Redis 实例)。

### Requirement 32: 包管理器与脚本一致性

**User Story:** 作为开发者,我希望仓库锁定 pnpm 9.15.4 作为唯一包管理器,这样团队成员的 lockfile 与脚本行为一致。

#### Acceptance Criteria

1. THE Drive_Exam_System SHALL 在 `package.json` 的 `packageManager` 字段中固定值 `pnpm@9.15.4`,并通过 `corepack` 自动启用。
2. THE Drive_Exam_System SHALL 提供以下 npm scripts:`dev`、`build`、`start`、`db:push`、`db:migrate`、`db:seed`、`db:reset`、`db:studio`、`lint`、`typecheck`、`test`、`test:watch`。
3. THE Drive_Exam_System SHALL 在 `pnpm build` 中前置 `prisma generate`,确保生成的 Prisma Client 与 schema 同步。

### Requirement 33: 可扩展开发流程(Superpowers)

**User Story:** 作为实现者,我希望开发过程可以借助 superpowers 类的代码生成与批量处理能力提升效率,但任何最终产物必须可用、可测、可部署。

#### Acceptance Criteria

1. THE Drive_Exam_System SHALL 不在运行时依赖任何 superpowers / 代码生成 skill 的接口;superpowers 仅作为开发期辅助。
2. WHEN superpowers 用于代码或文档生成,THE Drive_Exam_System SHALL 把产出代码纳入版本控制并通过 `pnpm lint`、`pnpm typecheck`、`pnpm test --run` 三项检查。
3. THE Drive_Exam_System SHALL 在测试套通过、构建通过、Docker 镜像构建通过三项门禁全部满足后才视作产物交付完成。

---

## Correctness Properties

下列 12 条引擎层与分页层不变量是 PBT 测试的执行依据,每条性质必须在 `Test_Suite` 中以 fast-check 实现,`numRuns >= 100`。所有性质独立于具体框架,仅依赖 `Exam_Engine` 与 `Pagination_Query` 的纯函数语义。

### CP-1: startSession 字段一致性

对于任意合法 `startSession` 入参 `input`,创建出的 `ExamAttempt` 满足:`mode = input.mode`、`status = ONGOING`、`currentIndex = 0`、`questionOrder.length` 与 `mode` 对应的 Requirement 15 题量规则一致、`categoryIds` 仅在 `mode = CHAPTER` 时非空、`expiresAt` 仅在 `mode = MOCK` 时非空且等于 `startedAt + MOCK_CONFIG[bankCode].durationMs`。

### CP-2: questionOrder 快照不重复且来源正确

对于五种模式产出的 `questionOrder`,以下三条同时成立:
- `questionOrder` 内题目 ID 不重复;
- `mode = SEQUENTIAL/CHAPTER/WRONG_REVIEW` 时 `questionOrder.length` 等于满足条件的题目集合大小;`mode = MOCK` 时 `questionOrder.length = MOCK_CONFIG[bankCode].count`(在题量充足条件下);`mode = RANDOM` 时 `questionOrder.length` 等于整库题数;
- `questionOrder` 是其来源题目集合的一个排列(子集 + 同元素)。

### CP-3: SEQUENTIAL/CHAPTER 严格 createdAt 升序

WHERE `mode ∈ {SEQUENTIAL, CHAPTER}`,`questionOrder` 对应的 `Question[]` 序列严格满足 `Q[i].createdAt <= Q[i+1].createdAt`,且对相等 `createdAt` 时序的稳定性由 `Question.id` 字典序保障。

### CP-4: CHAPTER 后代分类闭包

WHERE `mode = CHAPTER`,`questionOrder` 中的题目 ID 集合等于 `expandCategoryDescendants(categoryIds)` 对应分类树下题目的并集;不在该并集内的题目不会出现在 `questionOrder` 中。

### CP-5: WRONG_REVIEW 集合与排序

WHERE `mode = WRONG_REVIEW`,`questionOrder` 严格等于当前用户 `WrongQuestion.mastered = false` 的题目按 `lastWrongAt` 降序排列后的题目 ID 序列。

### CP-6: submitAnswer 字段语义

对任意合法 `submitAnswer` 调用,写入的 `ExamRecord` 满足:`userAnswer = normalizeAnswer(type, raw)`、`costMs ∈ [0, 3_600_000]`(已 `clampCostMs`)、`isCorrect = compareAnswer(type, userAnswer, correctAnswer)`。

### CP-7: compareAnswer 语义

`compareAnswer` 对所有 `(type, userAnswer, correctAnswer)` 满足:
- `type ∈ {SINGLE, JUDGE}` 时等价于规范化后字符串相等;
- `type = MULTI` 时,把 `correctAnswer` 任意排列输入都返回 `true`,把任何与正确答案集合不等的输入都返回 `false`。

### CP-8: 错题本状态机 6 条转移 + 单调性

`applyExamResult` 对 Requirement 20 列出的 6 条转移规则全覆盖,且对任意 `(prev, isCorrect, now)` 满足:
- `next.wrongCount >= (prev?.wrongCount ?? 0)`;
- `next.lastWrongAt >= (prev?.lastWrongAt ?? Epoch)`;
- `mastered` 转移仅按 Requirement 20 描述的两条路径发生(`rightCount + 1 >= 3 ⇒ true`,`mastered=true 时答错 ⇒ false`)。

### CP-9: 同会话同题幂等

对任意 `(attemptId, questionId)`,首次 `submitAnswer` 写入一条 `ExamRecord`,任意后续相同 `(attemptId, questionId)` 调用都返回 `{ ok:false, error:'该题已提交' }` 且数据库状态(`ExamRecord` 行数、`WrongQuestion` 字段、`ExamAttempt.currentIndex`)与首次成功写入后保持一致。

### CP-10: 会话结束统计字段公式(含 MOCK 补齐)

WHEN `finalizeAttempt` 执行,在 MOCK 模式下补齐空记录后,`ExamAttempt` 的统计字段满足:
- `totalCount = questionOrder.length`;
- `correctCount = COUNT(ExamRecord WHERE isCorrect = true)`;
- `score = totalCount === 0 ? 0 : Math.round(correctCount / totalCount * 100)`;
- `durationMs = finishedAt - startedAt`;
- `0 <= score <= 100`。

### CP-11: isSubmittable 真值表

`isSubmittable(type, selectedCount, optionsCount)` 满足:
- `type ∈ {SINGLE, JUDGE}` 时返回值等价于 `selectedCount === 1`;
- `type = MULTI` 时返回值等价于 `2 <= selectedCount <= optionsCount`;
- 全部其它输入返回 `false`。

### CP-12: 分页查询不变量

`Pagination_Query` 的四个函数对任意合法分页参数满足:
- `items.length <= pageSize`;
- `(page - 1) * pageSize + items.length <= total`;
- 跨页遍历所有合法页码所得 `items` 间不存在重复主键;
- 跨页 `items` 的并集大小等于 `min(total, ceil(total / pageSize) * pageSize)` 与实际命中行数中的较小值。
