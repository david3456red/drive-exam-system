# 技术文档

本文档面向开发、维护和部署人员，描述当前项目的架构、目录、数据流、测试和部署方式。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web 框架 | Next.js 14 App Router |
| UI | React Server Components + 少量 Client Components + 原生 CSS |
| 服务端交互 | Server Actions + Route Handlers |
| 数据库 | SQLite |
| ORM | Prisma 5 |
| 测试 | Vitest、fast-check、Testing Library、jest-dom |
| 鉴权 | 签名 Cookie 会话 |
| 部署 | Docker Compose，单 Node.js 进程 |

## 设计目标

- 面向 2C2G 单机部署。
- 默认使用 SQLite，避免 PostgreSQL、Redis、Elasticsearch 等常驻外部进程。
- Server Actions 直接在服务端完成业务写入，减少 API 层重复。
- 引擎层尽量保持纯函数，便于属性测试。
- UI 保持轻量、响应式、可访问，不依赖大型组件库。

## 目录结构

```text
src/
  app/
    actions/                  # 通用 auth actions
    admin/                    # 后台页面与后台 Server Actions
    api/exam/abandon/         # sendBeacon 兜底 Route Handler
    change-password/          # 自助改密
    exam/                     # 学员答题端页面与 actions
    login/                    # 学员登录
    globals.css               # 全局 UI token 和组件样式
    layout.tsx                # 全局布局与导航
  lib/
    exam-engine/              # 答题引擎、快照、错题状态机、分页查询
    import/                   # JSON/Excel 导入流水线
    auth-pipeline.ts          # 登录决策流水线
    admin-user-policy.ts      # 后台用户管理策略
    db.ts                     # Prisma Client 单例
    display.ts                # UI 展示格式化
    enums.ts                  # 枚举事实来源
    permissions.ts            # 权限码与权限判定
    question-validate.ts      # 题目题型校验
    server-session.ts         # 服务端会话读写
    session.ts                # 签名 Cookie token
prisma/
  schema.prisma               # SQLite schema
  seed.ts                     # 权限、角色、账号、题库、示例题
docker/
  entrypoint.sh               # 容器启动脚本
docs/
  FUNCTIONAL.md               # 功能文档
  TECHNICAL.md                # 技术文档
```

## 核心数据模型

| 模型 | 用途 |
| --- | --- |
| `User` | 用户账号、状态、最近登录信息 |
| `Role` / `Permission` / `RolePermission` | RBAC 权限体系 |
| `LoginLog` | 登录审计日志 |
| `QuestionBank` | 题库 |
| `Category` | 全局分类树 |
| `Question` | 题目，选项和标签以 JSON 字符串存储 |
| `QuestionCategory` | 题目与分类多对多关系 |
| `ExamAttempt` | 一次答题会话，保存题目快照、状态和统计 |
| `ExamRecord` | 单题作答记录，`(attemptId, questionId)` 唯一 |
| `WrongQuestion` | 错题本，`(userId, questionId)` 唯一 |

SQLite 不支持 Prisma enum，枚举字段统一以 `String` 存储，合法取值由 `src/lib/enums.ts`、Zod 和业务校验共同约束。

## 会话与权限

### 会话 token

- 会话存储在 Cookie 中，名称由 `SESSION_COOKIE_NAME` 定义。
- `src/lib/session.ts` 使用 HMAC 生成和验证签名。
- `src/lib/server-session.ts` 提供 `getCurrentUser()`、`requireUser()`、写入和清除 Cookie。

### Middleware

`src/middleware.ts` 负责轻量路由隔离：

- 未登录访问后台跳转 `/admin/login`。
- 未登录访问学员端跳转 `/login`。
- 学员访问 `/admin/*` 跳转 `/exam`。
- 后台角色访问 `/exam/*` 跳转 `/admin`。
- 非超级管理员访问角色权限编辑页跳转 `/admin`。

业务权限仍以 Server Component / Server Action 内的 `requireUser(permission)` 为准。

### 登录流水线

`src/lib/auth-pipeline.ts` 负责：

- 设备指纹缺失拒绝。
- 用户不存在、密码错误、冻结、禁用等分支。
- 严格登录角色的异地登录冻结。
- 写入 `LoginLog`。
- 返回会话所需的用户与权限码。

### 后台用户策略

`src/lib/admin-user-policy.ts` 封装用户管理的跨页面策略：

- `canAssignRole`：只有 `super_admin` 可以把新用户分配为 `super_admin`。
- `canManageUserRole`：只有 `super_admin` 可以修改超级管理员账号状态或重置其密码。
- `buildStatusUpdateData`：冻结用户恢复为 `ACTIVE` 时，同时清空 `lastLoginIp` 和 `lastLoginDeviceId`，让严格登录用户重新建立登录基线。

## 答题引擎

### 纯函数模块

| 文件 | 职责 |
| --- | --- |
| `judger.ts` | 答案规范化、比对、是否可提交、耗时钳制 |
| `submission-guard.ts` | 校验提交题目是否属于当前会话快照 |
| `wrongbook.ts` | 错题本状态机 |
| `snapshot.ts` | `questionOrder` / `categoryIds` JSON 序列化 |
| `mock-config.ts` | 模考题量、时长、通过线配置 |

### 数据读取模块

| 文件 | 职责 |
| --- | --- |
| `question-loader.ts` | 按模式生成题目 ID 快照 |
| `queries.ts` | 错题、历史、学员统计分页查询 |

### 会话流程

`src/app/exam/actions.ts` 负责会话写入：

1. `startSessionAction` 创建或恢复进行中会话。
2. 创建会话时写入 `questionOrder`、`categoryIds`、`expiresAt`。
3. `submitAnswerAction` 先用 `resolveSubmittedQuestion` 确认提交题目属于 `questionOrder` 快照。
4. 通过校验后写入 `ExamRecord`，更新错题本，按快照位置推进 `currentIndex`。
5. `CostInput` 在表单提交时写入本题耗时，服务端 `clampCostMs` 将耗时限制在 `[0, 3_600_000]`。
6. `finishAttemptAction` / `abandonAttemptAction` 调用 `finalizeAttempt`。
7. `finalizeAttempt` 按 `questionOrder.length` 计算总题数，只统计快照内正确记录，避免分数超过 100。
8. 模考结算时为未答题补齐空 `ExamRecord`。
9. `/api/exam/abandon` 接收浏览器关闭时的 `sendBeacon`；`MockEffects` 会在正常表单提交期间短暂抑制该 beacon，避免提交跳转被误判为放弃。

## 导入流水线

导入代码在 `src/lib/import/`：

| 文件 | 职责 |
| --- | --- |
| `types.ts` | 共享导入类型 |
| `json-source.ts` | JSON 解析和行规范化 |
| `excel-source.ts` | Excel 解析和模板生成 |
| `validate.ts` | 行级校验 |
| `index.ts` | `previewImport` / `commitImport` |

关键约束：

- 预览阶段不写库。
- 提交阶段在事务内写题目和题目分类。
- 非法行只进入 `invalid`，不影响合法行。
- 传入明确 `bankId` 时优先使用该题库，避免导入行里的旧 `bankCode` 覆盖页面选择。

## UI 说明

- 全局设计 token 在 `src/app/globals.css`。
- 使用 `--bg`、`--surface`、`--ink`、`--primary`、`--accent` 等 CSS 变量。
- 页面最大宽度为 `1180px`，移动端使用 `calc(100% - 20px)`。
- 表单控件和按钮最小高度为 `44px`。
- 答题图片使用 `QuestionImage` 客户端组件，加载失败时显示可访问 fallback。
- 不使用大型 UI 组件库，减少 bundle 和运行时内存。

## 测试

### 默认测试

```bash
pnpm test
```

覆盖：

- 引擎层属性测试。
- 答题提交快照校验。
- 答题耗时输入和模考关闭页副作用。
- 权限属性测试。
- 后台用户管理策略。
- 生产环境 `AUTH_SECRET` 强校验。
- 题型校验属性测试。
- 导入解析/预览属性测试。
- UI 组件测试。

### 集成测试

```bash
pnpm test:integration
```

集成测试使用专用 SQLite 文件 `prisma/test.db`，通过 `DATABASE_URL=file:./test.db` 指向 schema 相对路径。每个集成测试 suite 会重置 schema，避免污染开发库。

覆盖：

- 登录流水线。
- 导入落库。
- 会话结算统计。

### 其它检查

```bash
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm build` 会先执行 `prisma generate`，再执行 `next build`。

## 本地运行

要求 Node.js 20+，包管理器使用 `pnpm@9.15.4`。

```bash
pnpm install
copy .env.example .env
pnpm db:push
pnpm db:seed
pnpm dev
```

访问：

- 首页：`http://localhost:3000`
- 学员登录：`http://localhost:3000/login`
- 后台登录：`http://localhost:3000/admin/login`

## 环境变量

| 变量 | 用途 | 默认/说明 |
| --- | --- | --- |
| `DATABASE_URL` | Prisma 数据库连接 | 本地示例为 `file:./prisma/dev.db`；Docker 中为 `file:/data/prod.db` |
| `AUTH_SECRET` | 签名 Cookie 会话密钥 | 生产环境必须设置为非占位强随机值 |
| `INITIAL_ADMIN_USERNAME` | 初始超级管理员用户名 | 默认 `admin` |
| `INITIAL_ADMIN_PASSWORD` | 初始超级管理员首次创建密码 | 默认 `Admin@123`；seed 的 update 分支不会重置已存在账号密码 |
| `SEED_DEMO_USERS` | 是否写入演示学员和教练 | 设为 `false` 可跳过 |
| `NEXT_STANDALONE` | 是否启用 Next standalone 输出 | Docker 构建/运行使用 `true`，Windows 本地默认不启用 |

## Docker 部署

```bash
copy .env.example .env
docker compose up -d --build
```

生产前必须修改：

- `AUTH_SECRET`，必须是非占位强随机值；生产环境缺失或仍为示例占位值时，会拒绝签发/校验登录会话。
- 初始管理员密码或首次登录后立即改密
- 是否保留 `SEED_DEMO_USERS`

容器启动流程：

1. `prisma migrate deploy`
2. `pnpm db:seed`
3. `node server.js`

数据文件：

- 容器内：`/data/prod.db`
- 宿主机：`./data/prod.db`

当前开发环境未安装 Docker CLI，镜像构建和 2C2G 容器内 RSS 实测需在有 Docker 的机器上执行。

## 2C2G 约束建议

- 保持 SQLite 单文件部署。
- 不引入 Redis、Elasticsearch、Kafka 等常驻进程。
- 不引入大型 UI 框架或富文本编辑器。
- 导入大 Excel 时建议按批次拆分，避免单次解析过大文件。
- 生产部署使用 `NEXT_STANDALONE=true` 构建 standalone 输出。
- 如题库图片来自外链，继续使用原生 `img`，避免 Next Image 远端域名配置和优化进程开销。

## 维护注意事项

- 修改权限码时同步 `src/lib/permissions.ts`、`prisma/seed.ts` 和相关文档。
- 修改题型时同步 `src/lib/enums.ts`、`src/lib/question-validate.ts`、导入模板和前端表单。
- 修改 Prisma schema 后运行 `pnpm db:push` 或创建迁移。
- 不要提交 `.env`、`.next/`、本地 SQLite 数据库和测试数据库。
