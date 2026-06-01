# 驾考答题系统

轻量可部署的驾考练习与后台题库管理系统。当前实现面向 2C2G 单机服务器：Next.js 14 App Router、Server Actions、Prisma、SQLite、原生 CSS、签名 Cookie 会话和 RBAC 权限控制。

## 文档入口

- [功能文档](docs/FUNCTIONAL.md)：角色、业务流程、页面与功能清单。
- [技术文档](docs/TECHNICAL.md)：架构、目录、数据模型、测试、部署与运维。

## 默认账号

`pnpm db:seed` 会写入：

- 超级管理员：`admin / Admin@123`
- 演示学员：`student / Student@123`
- 演示教练：`teacher / Teacher@123`

生产环境建议首次登录后立即修改密码。设置 `SEED_DEMO_USERS=false` 可跳过演示账号。
生产环境必须设置非占位的 `AUTH_SECRET`，否则系统会拒绝签发/校验登录会话。

## 当前实现要点

- 种子数据内置 `super_admin`、`admin`、`teacher`、`student_strict`、`student_normal` 5 个角色和 30 个权限点。
- `super_admin` 拥有全部权限；非超级管理员不能创建、修改状态或重置超级管理员账号。
- 学员端支持顺序、随机、章节、模拟考试和错题重做；答题会话使用固定题目快照，提交时会拒绝不属于当前会话的题目。
- 答题页会记录本题耗时，服务端会钳制异常耗时；模拟考试关闭页面时会兜底放弃，正常提交表单不会触发误放弃。
- 严格登录角色会在异地或设备指纹变化时被冻结；后台解冻为 `ACTIVE` 时会清除原登录 IP/设备基线。

## 本地开发

要求 Node.js 20+，包管理器使用 `pnpm@9.15.4`。

```bash
pnpm install
copy .env.example .env
pnpm db:push
pnpm db:seed
pnpm dev
```

访问：

- 首页：http://localhost:3000
- 学员登录：http://localhost:3000/login
- 后台登录：http://localhost:3000/admin/login

## 常用命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm build
pnpm db:seed
pnpm db:studio
```

Windows 本地默认关闭 Next standalone 输出，避免 pnpm symlink 权限问题。Docker 构建会通过 `NEXT_STANDALONE=true` 打开 standalone 输出。

## Docker 部署

```bash
copy .env.example .env
# 修改 .env 中 AUTH_SECRET，生产建议使用：openssl rand -base64 32
docker compose up -d --build
```

容器启动时会执行：

1. `prisma migrate deploy`
2. `pnpm db:seed`
3. `node server.js`

SQLite 数据库位于 `./data/prod.db`。备份时停止容器或确保无写入后复制该文件即可。

## 数据初始化

种子脚本会在内置题库为空时生成示例数据：

- 科目一：100 道示例题
- 科目四：50 道示例题
- 4 个章节分类
- 5 个内置角色与 30 个权限点

这些题目用于跑通系统流程，正式运营请通过后台录入或导入真实题库。

## 交付检查

当前代码已通过：

- `pnpm test`
- `pnpm test:integration`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

当前环境没有安装 Docker CLI，因此 Docker 镜像构建与容器内存实测需要在有 Docker 的机器上执行。
