import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client 单例。
 *
 * Next.js dev 模式下 HMR 会反复加载本模块,若每次都 new 一个 PrismaClient
 * 会导致连接耗尽与文件锁问题。这里把实例挂在 globalThis 上复用。
 *
 * 生产环境(NODE_ENV=production)的 Next.js standalone 仅加载一次,
 * 直接 new 也安全;但保持同一份代码路径更简单。
 */

declare global {
  // eslint-disable-next-line no-var
  var __drive_exam_prisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__drive_exam_prisma__ ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__drive_exam_prisma__ = prisma;
}

export default prisma;
