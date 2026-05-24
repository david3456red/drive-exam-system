# 驾考答题系统 (drive-exam-system)

驾考理论答题系统:支持科一 / 科四 / 自定义题库,多角色 RBAC,异地登录冻结,适配手机和电脑。

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

## 核心特性

- **多角色 RBAC**:超级管理员 / 管理员 / 教练 / 严格学员 / 普通学员,共 30 个权限点
- **异地登录冻结**:`student_strict` 角色在 IP 或设备变化时自动冻结,需管理员解冻
- **首次登录强制改密**:初始账号 `admin / Admin@123`,登录后必须修改
- **完整审计**:每次登录(成功 / 失败 / 冻结)都写入 `LoginLog`
- **响应式 UI**:手机 / 平板 / 电脑均适配

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
# 访问 http://localhost:3000
# 默认账号:admin / Admin@123 (首次登录会强制改密)
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

## 角色与权限

| 角色 | 异地登录冻结 | 主要权限 |
|------|:----------:|---------|
| `super_admin` 超级管理员 | ❌ | 全部权限 |
| `admin` 管理员 | ❌ | 题库 / 用户 / 日志 / 导入 / 抓取(无角色管理) |
| `teacher` 教练 | ❌ | 答题 + 全部学员成绩 |
| `student_strict` 严格学员 | ✅ | 答题 + 自己成绩 |
| `student_normal` 普通学员 | ❌ | 答题 + 自己成绩 |

异地登录判定逻辑:
```
若 角色.strictLogin = true 且 (本次IP ≠ 上次成功登录IP 或 本次设备ID ≠ 上次成功登录设备ID)
   ⇒ 冻结账号,需管理员解冻
```

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

## 已完成 (P0 + P1)

- [x] Next.js 14 + Tailwind + shadcn 骨架
- [x] Prisma + SQLite + 完整 schema
- [x] Auth.js v5 + Credentials provider
- [x] 异地登录检测与自动冻结
- [x] RBAC 权限点 + 角色 + 中间件
- [x] 登录页 + 设备指纹
- [x] 首次登录强制改密
- [x] 顶栏 / 侧栏 / 仪表盘 / 占位页
- [x] 登录日志页
- [x] Docker / docker-compose / 部署文档
- [x] 种子数据(5 角色 + 30 权限 + 2 题库 + admin 账号)
- [x] 切换到 pnpm(固定 v9.15.4 via corepack)

## 待实现

- [ ] **P2**:题库 CRUD、自定义分类、JSON / Excel 批量导入
- [ ] **P3**:答题模式(顺序 / 随机 / 章节 / 模拟考试 / 错题重做)
- [ ] **P4**:用户管理、角色管理、解冻操作
- [ ] **P6**:题库抓取
