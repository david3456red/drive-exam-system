# 驾考答题系统 (drive-exam-system)

驾考理论答题系统:支持科一 / 科四 / 自定义题库,多角色 RBAC,异地登录冻结,
**前台 / 后台分离**,适配手机和电脑。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| 状态/表单 | React Hook Form + Zod |
| 后端 | Next.js Server Actions + Route Handlers |
| 鉴权 | Auth.js v5 (Credentials, JWT) + bcryptjs |
| 数据库 | SQLite + Prisma |
| 设备识别 | FingerprintJS |
| 导入 | JSON (内置) + xlsx (Excel) |
| 部署 | Docker + docker-compose |
| 包管理器 | **pnpm** (固定 v9.15.4 via corepack) |

## 路由总览

```
公开
  /                       公开首页(landing,任何人可访问)
  /login                  学生登录
  /admin/login            后台登录(管理员 / 教练 / 超级管理员)

学生前台 (group: (student))
  /exam                              题库 + 模式选择(顺序/随机/章节/模考/错题重做)
  /exam/session/[attemptId]          答题主界面(按模式分派 Player)
  /exam/session/[attemptId]/result   答题成绩汇总
  /exam/wrong                        错题本(筛选 + 标记掌握)
  /exam/history                      答题记录列表
  /exam/history/[attemptId]          单次答题逐题详情

后台
  /admin                  工作台
  /admin/banks            题库
  /admin/questions        题目(导入)
  /admin/categories       全局分类
  /admin/users            用户管理
  /admin/roles            角色权限列表
  /admin/roles/[id]/edit  ★ 编辑角色权限(仅超级管理员)
  /admin/student-stats    ★ 学员成绩(教练 / 管理员可见)
  /admin/student-stats/[userId]  单学员答题历史
  /admin/login-logs       登录日志

通用
  /change-password        自助修改密码(改完强制重新登录)
```

**登录后跳转规则**

| 角色 | 通过哪个入口都会跳到 |
|------|---------------------|
| `super_admin` / `admin` / `teacher` | `/admin` |
| `student_strict` / `student_normal` | `/exam` |

## 角色与权限

| 角色 | 异地登录冻结 | 主要权限 |
|------|:----------:|---------|
| `super_admin` 超级管理员 | ❌ | **全部权限**(代码常量,不可编辑) |
| `admin` 管理员 | ❌ | 题库 / 用户 / 日志 / 导入 / 抓取(可编辑) |
| `teacher` 教练 | ❌ | 答题 + 全部学员成绩(可编辑) |
| `student_strict` 严格学员 | ✅ | 答题 + 自己成绩(可编辑) |
| `student_normal` 普通学员 | ❌ | 答题 + 自己成绩(可编辑) |

权限点共 30 个,分为:用户管理 / 角色权限 / 题库管理 / 题目管理 / 答题 / 统计 / 系统。
**超级管理员可以在 `/admin/roles/[id]/edit` 编辑任何非 super_admin 角色的权限。**
变更将在用户**下次登录**时生效(JWT 缓存)。

异地登录判定逻辑:
```
若 角色.strictLogin = true 且 (本次IP ≠ 上次成功登录IP 或 本次设备ID ≠ 上次成功登录设备ID)
   ⇒ 冻结账号,需管理员解冻
```

## 账号体系

- **没有公开注册**。仅 `super_admin` 和 `admin` 可创建账号(P4 阶段提供 UI)。
- 默认初始账号:`admin / Admin@123`(由 seed 写入,**不强制**修改密码,但建议生产环境立刻改)。
- 自助改密入口在每个 portal 顶栏的 "修改密码" 链接。

## 本地开发

> 需要 Node.js 22+。**包管理器固定为 pnpm**(通过 `corepack` 自动启用,版本由 `package.json` 的 `packageManager` 字段锁定)。
> 第一次使用 pnpm 的话,先开启 corepack:`corepack enable`。

```bash
# 1. 安装依赖
pnpm install

# 2. 准备环境变量
cp .env.example .env

# 3. 创建数据库 + 应用迁移 + 种子数据
pnpm db:push
pnpm db:seed

# 4. 启动 dev server
pnpm dev
# 访问 http://localhost:3000   → 公开首页
# 访问 http://localhost:3000/login         → 学生登录
# 访问 http://localhost:3000/admin/login   → 后台登录
# 默认账号:admin / Admin@123
```

## 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发服务器 |
| `pnpm build` | 生产构建(含 prisma generate) |
| `pnpm start` | 启动生产服务器 |
| `pnpm db:push` | 同步 schema 到数据库(开发用) |
| `pnpm db:migrate` | 创建并应用迁移(生产用) |
| `pnpm db:seed` | 写入种子数据 |
| `pnpm db:reset` | 重置数据库(开发用,危险) |
| `pnpm db:studio` | 打开 Prisma Studio |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript 检查 |

## 数据模型

- `User` 用户(含 status: ACTIVE / FROZEN / DISABLED)
- `Role` 角色(strictLogin 标志)
- `Permission` / `RolePermission` 权限点 + 角色权限关联
- `LoginLog` 登录日志(IP / deviceId / userAgent / success / reason)
- `QuestionBank` 题库(科一 / 科四 / 可扩展)
- `Category` 自定义分类(支持父子层级)
- `Question` 题目(SINGLE / MULTI / JUDGE)
- `QuestionCategory` 题目-分类多对多
- `ExamAttempt` / `ExamRecord` 答题记录
- `WrongQuestion` 错题本

详见 `prisma/schema.prisma`。

## 部署(Docker)

推荐方案:**腾讯云轻量香港 2核2G**(免备案 ¥24/月)

```bash
# 1. 准备 .env(用 openssl 生成 AUTH_SECRET)
echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env
echo "INITIAL_ADMIN_USERNAME=admin" >> .env
echo "INITIAL_ADMIN_PASSWORD=Admin@123" >> .env

# 2. 启动
docker compose up -d --build

# 3. 访问
# http://<your-ip>:3000
# (用 nginx + certbot 反向代理 + HTTPS)
```

SQLite 数据持久化在 `./data/prod.db`,直接复制此文件即可备份。

## 已完成

### P0 + P1(骨架 + 鉴权)
- [x] Next.js 14 + Tailwind + shadcn 骨架
- [x] Prisma + SQLite + 完整 schema
- [x] Auth.js v5 + Credentials provider
- [x] 异地登录检测与自动冻结
- [x] RBAC 权限点 + 角色 + 中间件
- [x] 登录页 + 设备指纹
- [x] 顶栏 / 侧栏 / 仪表盘 / 占位页
- [x] 登录日志页
- [x] Docker / docker-compose / 部署文档
- [x] 种子数据(5 角色 + 30 权限 + 2 题库 + admin 账号)
- [x] pnpm + corepack

### 前后台分离 + 可编辑权限
- [x] 公开首页 `/`(任何人可见,根据登录态显示不同 CTA)
- [x] 前台 `(student)` 路由组:学生登录、答题主页、错题本、记录
- [x] 后台 `/admin/*`:独立登录页、独立 sidebar、所有管理页
- [x] 学生 / 管理 portal 两套视觉风格
- [x] 登录后按角色自动分流,跨界访问被中间件拦截
- [x] **可编辑角色权限**(`/admin/roles/[id]/edit`,仅超级管理员)
- [x] 移除首次登录强制改密(改密自助、可选)

### P2(题库 + 分类 + 题目 + 批量导入)
- [x] 题库 CRUD(`/admin/banks`):新建 / 编辑 / 删除(内置题库不可删,含题题库不可删)
- [x] **全局分类管理**(`/admin/categories`):分类是跨题库共享的,适合驾考多题库共用标签的场景
- [x] 分类 CRUD:新建 / 改名 / 改父分类 / 删除(同名+同父唯一,删除时清理引用)
- [x] 题目 CRUD(`/admin/questions`):列表 + 题型/题库/关键字过滤 + 分页
- [x] 单题表单:动态选项、按题型校验答案、多分类多选(全局)、标签
- [x] **JSON 批量导入**(粘贴或包装在 `{ questions: [...] }`)
- [x] **Excel 批量导入**(`.xlsx`,模板可下载)
- [x] 导入流程:**预览校验** → 看到合法/不合法行数 + 错误明细 → **确认导入**
- [x] 导入时自动 upsert 全局分类,已存在则复用

### P3(答题模式 + 错题本 + 教练统计)
- [x] **五种答题模式**:顺序练习 / 随机练习 / 章节练习 / 模拟考试 / 错题重做
- [x] **统一答题引擎**(`src/lib/exam-engine/`):judger / wrongbook / snapshot / question-loader / queries
- [x] **会话快照**:创建会话时冻结题目顺序与筛选范围,后续题库变化不影响进行中会话
- [x] **断点续答**:非模考会话支持中途离开后从原位置继续
- [x] **模拟考试**:倒计时(科一 45 分钟 / 科四 30 分钟)、90% 通过线、超时自动交卷、防回退
- [x] **模考超时兜底**:`adoptExpiredMock` 自动结算遗留过期会话
- [x] **错题本状态机**:连续答对 3 次自动标记掌握,答错时重置;支持手动切换
- [x] **答题记录**(`/exam/history`)+ 逐题详情(选项高亮 + 解析)
- [x] **错题本管理**(`/exam/wrong`):题库 / 掌握状态筛选,乐观更新
- [x] **教练查看学员成绩**(`/admin/student-stats`):学员列表 + 单学员答题历史 + 题库/模式筛选
- [x] **响应式答题界面**:单选/多选/判断题适配,图片加载失败占位
- [x] **离场处理**:模考关闭浏览器时通过 `sendBeacon` 自动 abandon
- [x] **测试基建**:Vitest + fast-check + jsdom + Testing Library

## 待实现

- [ ] **P4**:用户管理、用户 CRUD、解冻、重置密码
- [ ] **P5**:数据统计(学员仪表盘、班级排行、知识点掌握度、答题趋势图)
- [ ] **P6**:题库抓取

## 题目导入格式

### JSON

支持顶层数组 `[ {...} ]` 或 `{ "questions": [ {...} ] }`,每条:

```json
{
  "type": "SINGLE",                       // SINGLE | MULTI | JUDGE
  "content": "黄灯亮时表示什么?",
  "imageUrl": null,
  "options": [
    { "key": "A", "text": "禁止通行" },
    { "key": "B", "text": "警示,谨慎通行" }
  ],
  "answer": "B",                          // 单选 "B"; 多选 "AC"; 判断 "T"/"F"
  "categories": ["交通信号", "基础"],     // 顶层分类名,导入时不存在则自动创建
  "explanation": "黄灯亮起是警示信号...",
  "tags": ["信号灯", "基础"]
}
```

### Excel

下载模板:`/admin/questions/import/template`(也可以在导入页面点 "下载 Excel 模板")

| 列名 | 说明 |
|------|------|
| `type` | `SINGLE` / `MULTI` / `JUDGE` |
| `content` | 题干(必填) |
| `imageUrl` | 题图 URL(可选) |
| `optionA` ~ `optionF` | 选项(单/多选必填,判断留空) |
| `answer` | `B` / `AC` / `T` / `F` |
| `categories` | 多个分类用 `\|` 分隔 |
| `explanation` | 答案解析(可选) |
| `tags` | 标签,多个用 `\|` 分隔 |
