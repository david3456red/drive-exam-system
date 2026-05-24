/**
 * 答题模式 (Exam Modes) - 错题本状态机
 *
 * 本模块实现错题本条目的纯函数状态机,描述 `WrongQuestion` 在一次答题事件后的演化规则:
 *
 * - 入参:旧条目 `prev`(可能为 `null` 表示题目不在错题本中)与本次答题是否正确 `isCorrect`。
 * - 返回:新的错题本条目快照,或 `null` 表示"无需创建/保留条目"。
 *
 * 状态机规则严格遵循设计文档第 8 条 Property:
 *
 * | prev                          | isCorrect | next                                                                       |
 * | ----------------------------- | --------- | -------------------------------------------------------------------------- |
 * | `null`                        | `false`   | `wrongCount=1, rightCount=0, mastered=false, lastWrongAt=now`              |
 * | `null`                        | `true`    | `null`(不创建条目;错题本只记录至少错过一次的题)                            |
 * | 已存在,`mastered=false`       | `false`   | `wrongCount += 1, rightCount=0, mastered=false, lastWrongAt=now`           |
 * | 已存在,`mastered=true`        | `false`   | `wrongCount += 1, rightCount=0, mastered=false, lastWrongAt=now`(重置)     |
 * | 已存在                        | `true`    | `rightCount += 1` ;若 `rightCount >= 3` 则同时把 `mastered` 置 `true`     |
 *
 * 单调性保证:
 * - `next.wrongCount >= prev?.wrongCount ?? 0`
 * - `next.lastWrongAt >= prev?.lastWrongAt ?? Epoch`
 *
 * 全部为纯函数,无任何 I/O 或 side effect,可在客户端与服务端共用,
 * 也便于单元测试与 fast-check 属性测试。
 */

/**
 * 错题本条目的核心字段(不含 `id` / `userId` / `questionId` 等持久化键),
 * 与 Prisma `WrongQuestion` 模型的可变字段一致。
 */
export interface WrongState {
  /** 累计答错次数 */
  wrongCount: number;
  /** 自上次答错以来连续答对次数;答错时重置为 0 */
  rightCount: number;
  /** 是否已掌握(连续答对 3 次自动置 true,再答错时重置为 false) */
  mastered: boolean;
  /** 最近一次答错的时间 */
  lastWrongAt: Date;
}

/** 连续答对多少次自动标记掌握 */
const MASTERY_THRESHOLD = 3;

/**
 * 根据本次答题事件计算错题本条目的下一个状态。
 *
 * - `prev = null` 表示题目当前不在错题本中。
 *   - 答错:新建条目(`wrongCount=1`)。
 *   - 答对:返回 `null`,不创建条目(错题本只收录至少错过一次的题)。
 * - `prev != null` 表示已在错题本。
 *   - 答错:`wrongCount += 1`,`rightCount` 重置为 0,`mastered` 重置为 `false`,
 *     `lastWrongAt` 更新为 `now`(无论原 `mastered` 是 true 还是 false)。
 *   - 答对:`rightCount += 1`;达到阈值 3 时把 `mastered` 置 `true`,
 *     其它字段(`wrongCount` / `lastWrongAt`)保持不变。
 *
 * @param prev      旧条目;`null` 表示题目当前不在错题本中
 * @param isCorrect 本次答题是否正确
 * @param now       本次答题的时间戳;答错时写入 `lastWrongAt`
 * @returns 新的错题本条目;`null` 表示"无需创建条目"(仅当 `prev=null` 且答对)
 */
export function applyExamResult(
  prev: WrongState | null,
  isCorrect: boolean,
  now: Date,
): WrongState | null {
  // 题目不在错题本中
  if (prev === null) {
    if (isCorrect) {
      // 答对且原本不在错题本:不创建条目
      return null;
    }
    // 首次答错:新建条目
    return {
      wrongCount: 1,
      rightCount: 0,
      mastered: false,
      lastWrongAt: now,
    };
  }

  // 已在错题本中
  if (!isCorrect) {
    // 答错:无论原本是否已掌握,都重置 rightCount / mastered,并累加 wrongCount
    return {
      wrongCount: prev.wrongCount + 1,
      rightCount: 0,
      mastered: false,
      lastWrongAt: now,
    };
  }

  // 已在错题本中且答对:rightCount += 1,达到阈值则置 mastered
  const nextRightCount = prev.rightCount + 1;
  return {
    wrongCount: prev.wrongCount,
    rightCount: nextRightCount,
    mastered: prev.mastered || nextRightCount >= MASTERY_THRESHOLD,
    lastWrongAt: prev.lastWrongAt,
  };
}
