/**
 * 错题本状态机模块(Wrongbook_Engine)。
 *
 * 纯函数,零依赖。仅描述"上一条错题状态 + 本次答题结果 → 新错题状态"的转移规则,
 * 不负责任何持久化操作。具体的 upsert / 删除策略由 `submitAnswer` Server Action
 * 在事务内完成。
 *
 * 6 条转移规则与单调性约束的来源见 Requirement 20.1..20.7,
 * 接口签名见 design.md 「`wrongbook.ts` 接口」一节。
 */

/**
 * 错题状态:对应数据表 `WrongQuestion` 中与状态机相关的字段子集。
 *
 * - `wrongCount`:历史累计答错次数,单调不减。
 * - `rightCount`:自上次答错以来连续答对次数;一旦再次答错立即归零。
 * - `mastered`:是否已掌握。`true` 时再次答错会回退到 `false`(Requirement 20.4)。
 * - `lastWrongAt`:最近一次答错的时间戳,单调不减。
 */
export type WrongState = {
  wrongCount: number;
  rightCount: number;
  mastered: boolean;
  lastWrongAt: Date;
};

/**
 * 错题本状态机。返回 `null` 表示"不创建错题"。
 *
 * 6 条转移规则(Requirement 20.1..20.6):
 * 1. `prev == null && isCorrect === true` → 返回 `null`,不创建错题。
 * 2. `prev == null && isCorrect === false` →
 *      `{ wrongCount: 1, rightCount: 0, mastered: false, lastWrongAt: now }`。
 * 3. `prev != null && isCorrect === false && prev.mastered === false` →
 *      `prev` 的副本,`wrongCount += 1`,`rightCount = 0`,`lastWrongAt = now`。
 * 4. `prev != null && isCorrect === false && prev.mastered === true` →
 *      `prev` 的副本,`wrongCount += 1`,`rightCount = 0`,
 *      `mastered = false`,`lastWrongAt = now`。
 * 5. `prev != null && isCorrect === true && prev.rightCount + 1 < 3` →
 *      `prev` 的副本,`rightCount += 1`,其它字段不变。
 * 6. `prev != null && isCorrect === true && prev.rightCount + 1 >= 3` →
 *      `prev` 的副本,`rightCount += 1`,`mastered = true`。
 *
 * 单调性(Requirement 20.7):对任意输入,
 * `next.wrongCount >= (prev?.wrongCount ?? 0)` 且
 * `next.lastWrongAt >= (prev?.lastWrongAt ?? Epoch)`。
 */
export function applyExamResult(
  prev: WrongState | null,
  isCorrect: boolean,
  now: Date,
): WrongState | null {
  // 规则 1 & 2:从未做过错题。
  if (prev == null) {
    if (isCorrect) {
      return null;
    }
    return {
      wrongCount: 1,
      rightCount: 0,
      mastered: false,
      lastWrongAt: now,
    };
  }

  // 规则 3 & 4:已有错题,这次又答错。
  if (!isCorrect) {
    return {
      wrongCount: prev.wrongCount + 1,
      rightCount: 0,
      // mastered=true 时答错需回退为 false(规则 4);否则保持 false(规则 3)。
      mastered: false,
      lastWrongAt: now,
    };
  }

  // 规则 5 & 6:已有错题,这次答对。
  const nextRightCount = prev.rightCount + 1;
  return {
    wrongCount: prev.wrongCount,
    rightCount: nextRightCount,
    // 连续答对达到 3 次切换到已掌握;否则保持 prev.mastered。
    mastered: nextRightCount >= 3 ? true : prev.mastered,
    lastWrongAt: prev.lastWrongAt,
  };
}
