/**
 * 环境变量类型声明(Requirement 30.3 / 32 部署一致性)
 *
 * 仅用于类型检查;运行时仍由 process.env 访问。生产部署中所有变量由 docker-compose 注入。
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Node 运行模式 */
    readonly NODE_ENV: 'development' | 'production' | 'test'
    /** SQLite 数据库 URL,生产为 `file:/data/prod.db`(Requirement 30.2) */
    readonly DATABASE_URL: string
    /** 签名 Cookie 会话密钥;生产强制使用 `openssl rand -base64 32` 生成(Requirement 30.3) */
    readonly AUTH_SECRET: string
    /** 首次 seed 写入的初始管理员用户名(Requirement 5.3) */
    readonly INITIAL_ADMIN_USERNAME?: string
    /** 首次 seed 写入的初始管理员密码 */
    readonly INITIAL_ADMIN_PASSWORD?: string
    /** 是否写入演示学员/教练账号;设为 false 可跳过 */
    readonly SEED_DEMO_USERS?: string
  }
}

export { }
