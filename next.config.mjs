/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 构建时打开 standalone 输出;Windows 本地默认关闭,避免 pnpm
  // symlink 在受限权限下导致构建末尾失败。
  output: process.env.NEXT_STANDALONE === 'true' ? 'standalone' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  // 不启用 instrumentationHook 等会带来 RSS 上涨的实验特性(Requirement 31.1)
  experimental: {
    // bcryptjs / @prisma/client 仅运行在 Server 端,标记为外置以避免 bundle 进 RSC bundle
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
}

export default nextConfig
