# Windows 10 新机开发环境安装指南

本文档用于在一台全新的 Windows 10 电脑上搭建本项目的开发环境。

项目当前技术栈：

- Next.js 14 + React 18 + TypeScript
- Prisma 5 + SQLite
- pnpm 9.15.4
- Node.js 20+
- Vitest / Testing Library
- Docker Compose 可用于生产部署或容器化验证

> 建议所有安装命令使用 PowerShell。安装阶段可以用“以管理员身份运行”的 PowerShell；日常开发不需要管理员权限。

## 1. 安装清单

| 类型 | 工具 | 是否必须 | 用途 |
| --- | --- | --- | --- |
| 包管理 | Windows Package Manager / winget | 必须 | 批量安装 Git、VS Code、nvm 等 |
| 代码管理 | Git for Windows | 必须 | 拉取代码、提交代码 |
| 编辑器 | Visual Studio Code | 必须 | 代码编辑、调试、扩展 |
| Node 版本管理 | nvm-windows | 必须 | 安装和切换 Node.js 版本 |
| Node.js | Node.js 20.x | 必须 | 运行 Next.js、Prisma、Vitest |
| JS 包管理 | Corepack + pnpm 9.15.4 | 必须 | 安装项目依赖和运行脚本 |
| Python 管理 | uv | 推荐 | 管理 Python 版本和 Python 工具 |
| Python | Python 3.12 或更新 | 推荐 | 通用开发工具；本项目本身不依赖 Python |
| 容器 | Docker Desktop + WSL 2 | 可选 | Docker 部署、容器构建验证 |
| 终端 | Windows Terminal | 推荐 | 更好的 PowerShell 体验 |

## 2. 新机基础准备

### 2.1 检查 Windows 版本

建议使用 Windows 10 22H2 64 位版本。

```powershell
winver
```

如果版本太旧，先通过“设置 -> 更新和安全 -> Windows 更新”升级系统。

### 2.2 检查 winget

```powershell
winget --version
winget source update
```

如果提示 `winget` 不存在，先安装或更新 Microsoft Store 里的“应用安装程序 App Installer”，然后重新打开 PowerShell。

### 2.3 建议的项目目录

建议把代码放在没有中文、没有空格的路径下，例如：

```powershell
mkdir D:\project\David
cd D:\project\David
```

## 3. 安装 Git

```powershell
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
```

安装后关闭当前 PowerShell，重新打开，再检查：

```powershell
git --version
```

配置 Git 用户信息：

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"
git config --global core.autocrlf true
git config --global init.defaultBranch main
git config --global core.longpaths true
git config --global --list
```

说明：

- `core.autocrlf true` 适合 Windows 日常开发。
- `core.longpaths true` 可以减少 Windows 长路径导致的依赖安装问题。

## 4. 安装 VS Code

```powershell
winget install --id Microsoft.VisualStudioCode -e --source winget --accept-package-agreements --accept-source-agreements
```

安装后检查：

```powershell
code --version
```

如果 `code` 命令不存在，重启 PowerShell；仍不存在时，在 VS Code 中打开命令面板，执行：

```text
Shell Command: Install 'code' command in PATH
```

推荐安装扩展：

```powershell
code --install-extension dbaeumer.vscode-eslint
code --install-extension Prisma.prisma
code --install-extension vitest.explorer
code --install-extension qwtel.sqlite-viewer
code --install-extension MS-CEINTL.vscode-language-pack-zh-hans
```

扩展用途：

- ESLint：检查 Next.js / TypeScript 代码。
- Prisma：查看和编辑 `prisma/schema.prisma`。
- Vitest Explorer：在编辑器里运行测试。
- SQLite Viewer：查看本地 SQLite 数据库文件。
- Chinese Language Pack：中文界面。

## 5. 安装 nvm-windows

本项目建议使用 nvm-windows 管理 Node.js，不建议直接安装 Node.js MSI 包。

如果新电脑已经安装过 Node.js，先卸载旧 Node.js，再安装 nvm-windows，避免路径冲突。

```powershell
winget install --id CoreyButler.NVMforWindows -e --source winget --accept-package-agreements --accept-source-agreements
```

安装完成后关闭 PowerShell，重新用“以管理员身份运行”打开 PowerShell，检查：

```powershell
nvm version
```

## 6. 安装 Node.js 20

项目的 `package.json` 要求：

```json
{
  "engines": {
    "node": ">=20.0.0"
  },
  "packageManager": "pnpm@9.15.4"
}
```

Dockerfile 当前也使用 `node:20-alpine`，所以新机开发建议先使用 Node.js 20.x。

先查看 nvm 可安装版本：

```powershell
nvm list available
```

安装 Node.js 20.x。下面示例使用 Node.js 20.19.5；如果 nvm 列表里有更新的 20.x，可以替换成列表里的最新 20.x。

```powershell
nvm install 20.19.5
nvm use 20.19.5
```

检查版本：

```powershell
node -v
npm -v
where node
```

正常情况下，`node -v` 应显示 `v20.x.x`。

> 如果 `nvm use` 提示权限不足，使用“以管理员身份运行”的 PowerShell 执行一次 `nvm use 20.19.5`。

## 7. 启用 Corepack 并安装 pnpm

Node.js 自带 Corepack。项目锁定 `pnpm@9.15.4`，所以不要随意安装最新版 pnpm。

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm -v
```

确认输出：

```text
9.15.4
```

如果 `pnpm` 命令找不到，关闭 PowerShell 后重新打开，再执行：

```powershell
corepack enable
pnpm -v
```

## 8. 安装 uv

本项目运行不依赖 Python，但建议安装 uv，用于管理 Python 版本、运行 Python 脚本或后续自动化工具。

推荐使用 uv 官方安装脚本：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

安装后重新打开 PowerShell，检查：

```powershell
uv --version
```

也可以使用 winget 安装：

```powershell
winget install --id astral-sh.uv -e --source winget --accept-package-agreements --accept-source-agreements
```

## 9. 安装 Python

### 方案 A：通过 uv 安装 Python，推荐

如果只是为了通用开发工具，建议安装 Python 3.12，兼容性比较稳。

```powershell
uv python install 3.12
uv python list
uv run --python 3.12 python --version
```

如果你希望使用更新的稳定版，也可以安装更新版本：

```powershell
uv python install 3.14
uv run --python 3.14 python --version
```

### 方案 B：通过 winget 安装全局 Python

如果你希望系统里直接有 `python` / `py` 命令，可以使用 winget：

```powershell
winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
py -3.12 --version
```

如果同时使用 uv 和系统 Python，日常建议优先使用 uv 管理项目级 Python，避免不同项目之间版本互相影响。

## 10. 可选：安装 Windows Terminal

```powershell
winget install --id Microsoft.WindowsTerminal -e --source winget --accept-package-agreements --accept-source-agreements
```

安装后可以用 Windows Terminal 打开 PowerShell，体验会比传统终端更好。

## 11. 可选：安装 Docker Desktop

本项目本地开发默认使用 SQLite，不要求安装 Docker。

如果你要验证 Docker 部署或构建镜像，需要安装 Docker Desktop。Windows 10 上建议先启用 WSL 2：

```powershell
wsl --install
wsl --update
```

执行后按提示重启电脑。

然后安装 Docker Desktop：

```powershell
winget install --id Docker.DockerDesktop -e --source winget --accept-package-agreements --accept-source-agreements
```

安装后打开 Docker Desktop，确认使用 WSL 2 backend。检查：

```powershell
docker --version
docker compose version
```

Docker 方式启动项目：

```powershell
cd D:\project\David\drive-exam-system
Copy-Item .env.example .env
notepad .env
docker compose up -d --build
```

注意：

- 生产或 Docker 运行前必须修改 `.env` 里的 `AUTH_SECRET`。
- Docker 运行时数据库文件在宿主机的 `./data/prod.db`。

## 12. 拉取项目代码

如果代码还没有下载到新电脑：

```powershell
cd D:\project\David
git clone <你的仓库地址> drive-exam-system
cd drive-exam-system
```

如果已经复制了项目目录，直接进入项目：

```powershell
cd D:\project\David\drive-exam-system
```

检查项目文件：

```powershell
dir
git status
```

## 13. 安装项目依赖

```powershell
cd D:\project\David\drive-exam-system
pnpm install
```

如果你切换过 Node.js 版本，建议重新安装依赖：

```powershell
Remove-Item -Recurse -Force node_modules
pnpm install
```

## 14. 配置本地环境变量

复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

生成一个随机 `AUTH_SECRET`：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

打开 `.env`：

```powershell
notepad .env
```

把生成的随机值填入：

```env
AUTH_SECRET=这里替换成上一步生成的随机值
DATABASE_URL=file:./prisma/dev.db
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=Admin@123
SEED_DEMO_USERS=true
```

也可以使用 PowerShell 生成随机密钥：

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

## 15. 初始化数据库

本地数据库使用 SQLite，不需要安装 MySQL、PostgreSQL 或 Redis。

```powershell
pnpm db:push
pnpm db:seed
```

执行后会创建本地开发数据库：

```text
prisma/dev.db
```

默认账号：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 超级管理员 | `admin` | `Admin@123` |
| 演示学员 | `student` | `Student@123` |
| 演示教练 | `teacher` | `Teacher@123` |

## 16. 启动开发服务器

```powershell
pnpm dev
```

访问：

- 首页：`http://localhost:3000`
- 学员登录：`http://localhost:3000/login`
- 后台登录：`http://localhost:3000/admin/login`

如果 3000 端口被占用：

```powershell
pnpm dev -- -p 3001
```

然后访问：

```text
http://localhost:3001
```

## 17. 常用开发命令

```powershell
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm build
pnpm db:push
pnpm db:migrate
pnpm db:seed
pnpm db:reset
pnpm db:studio
```

说明：

- `pnpm dev`：启动本地开发服务器。
- `pnpm typecheck`：TypeScript 类型检查。
- `pnpm lint`：Next.js ESLint 检查。
- `pnpm test`：运行单元测试和属性测试。
- `pnpm test:integration`：运行集成测试。
- `pnpm build`：生产构建，会先执行 `prisma generate`。
- `pnpm db:push`：把 Prisma schema 推到 SQLite 开发库。
- `pnpm db:migrate`：创建开发迁移。
- `pnpm db:seed`：写入角色、权限、默认账号和示例题。
- `pnpm db:studio`：打开 Prisma Studio 查看数据库。

## 18. 新机验收清单

安装完成后，建议逐条执行：

```powershell
git --version
code --version
nvm version
node -v
npm -v
pnpm -v
uv --version
uv run --python 3.12 python --version
```

项目内执行：

```powershell
cd D:\project\David\drive-exam-system
pnpm install
pnpm db:push
pnpm db:seed
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

能成功打开 `http://localhost:3000`，并且 `admin / Admin@123` 可以登录后台，就说明开发环境基本完成。

## 19. 常见问题

### 19.1 winget 不存在

处理：

1. 更新 Windows 10。
2. 打开 Microsoft Store，安装或更新“应用安装程序 App Installer”。
3. 重新打开 PowerShell。

### 19.2 nvm use 提示权限不足

处理：

```powershell
Start-Process powershell -Verb runAs
```

在新打开的管理员 PowerShell 中执行：

```powershell
nvm use 20.19.5
```

之后普通 PowerShell 也可以正常使用 Node.js。

### 19.3 node 版本不对

检查当前 Node 路径：

```powershell
where node
node -v
nvm list
```

如果看到旧 Node.js MSI 安装路径，先从“应用和功能”卸载旧 Node.js，然后重新执行：

```powershell
nvm use 20.19.5
node -v
```

### 19.4 pnpm 命令不存在

处理：

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm -v
```

仍不生效时，关闭终端重新打开。

### 19.5 Prisma 或数据库异常

常用修复：

```powershell
pnpm exec prisma generate
pnpm db:push
pnpm db:seed
```

如果开发库可以清空重来：

```powershell
pnpm db:reset
```

### 19.6 端口 3000 被占用

查看占用：

```powershell
netstat -ano | findstr :3000
```

直接换端口启动：

```powershell
pnpm dev -- -p 3001
```

### 19.7 依赖安装失败

先确认 Node 和 pnpm 版本：

```powershell
node -v
pnpm -v
```

清理后重装：

```powershell
Remove-Item -Recurse -Force node_modules
pnpm store prune
pnpm install --frozen-lockfile
```

注意：不要随意删除或重新生成 `pnpm-lock.yaml`，它用于锁定依赖版本。

## 20. 官方参考链接

- winget / Windows Package Manager：<https://learn.microsoft.com/windows/package-manager/winget/>
- Git for Windows：<https://git-scm.com/downloads/win>
- VS Code Windows 安装：<https://code.visualstudio.com/docs/setup/windows>
- nvm-windows：<https://github.com/coreybutler/nvm-windows>
- Node.js 20.19.5 发布说明：<https://nodejs.org/en/blog/release/v20.19.5>
- pnpm 安装说明：<https://pnpm.io/installation>
- uv 安装说明：<https://docs.astral.sh/uv/getting-started/installation/>
- Python Windows 使用说明：<https://docs.python.org/3/using/windows.html>
- WSL 安装说明：<https://learn.microsoft.com/windows/wsl/install>
- Docker Desktop Windows 安装：<https://docs.docker.com/desktop/setup/install/windows-install/>
