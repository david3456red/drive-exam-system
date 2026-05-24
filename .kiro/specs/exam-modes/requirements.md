# Requirements Document

## Introduction

本文档定义驾考答题系统的"答题模式"功能需求。该功能为学员提供五种练习模式：顺序练习、随机练习、章节练习、模拟考试和错题重做。系统需跟踪答题进度、记录答案、维护错题本，并允许教练查看学员成绩。

## Glossary

- **答题引擎**: 负责加载题目、接收答案、判定正误并记录结果的核心模块
- **顺序模式**: 按题目在题库中的顺序依次呈现
- **随机模式**: 从题库中随机抽取题目呈现
- **章节模式**: 按分类（Category）筛选题目进行练习
- **模拟考试模式**: 模拟真实考试环境，含倒计时和评分
- **错题重做模式**: 从用户错题本中抽取未掌握题目进行重做
- **答题会话（ExamAttempt）**: 一次答题会话记录，包含模式、状态、得分等元数据
- **答题记录（ExamRecord）**: 单题作答记录，包含用户答案、正误、用时
- **错题本（WrongQuestion）**: 记录用户答错的题目及掌握状态
- **题库（QuestionBank）**: 如科目一、科目四
- **分类（Category）**: 全局分类，支持父子层级，用于章节练习的筛选维度
- **学员（Student）**: student_strict 或 student_normal 角色的用户
- **教练（Teacher）**: 可查看所有学员答题成绩的用户

## Requirements

### Requirement 1: 开始答题会话

**User Story:** 作为学员，我希望通过选择题库和练习模式来开始答题，以便进入答题环节。

#### Acceptance Criteria

1. WHEN 学员选择一个题库和练习模式时，THE 答题引擎 SHALL 创建一条 ExamAttempt 记录，模式为对应值（SEQUENTIAL、RANDOM、CHAPTER、MOCK 或 WRONG_REVIEW），状态设为 ONGOING，bankId 存储所选题库 ID，totalCount 设为本次加载的题目数量。
2. WHEN 学员开始章节模式时，THE 答题引擎 SHALL 要求学员至少选择一个分类后才加载题目。
3. IF 学员开始章节模式且所选分类下没有题目，THEN THE 答题引擎 SHALL 显示"所选分类下暂无题目"的提示并阻止创建会话。
4. WHEN 学员开始错题重做模式时，THE 答题引擎 SHALL 仅加载该学员错题本中 mastered 为 false 的题目。
5. IF 所选题库中没有任何题目，THEN THE 答题引擎 SHALL 显示"该题库暂无题目"的提示并阻止创建会话。
6. IF 学员开始错题重做模式且错题本中没有未掌握的题目，THEN THE 答题引擎 SHALL 显示"暂无需要重做的错题"的提示并阻止创建会话。
7. WHEN 学员开始模拟考试模式时，THE 答题引擎 SHALL 从题库中随机抽取固定数量的题目（科目一: 100 题，科目四: 50 题，其他题库: min(题库总题数, 50)）。
8. IF 学员在同一题库和模式下已有一个状态为 ONGOING 的会话，THEN THE 答题引擎 SHALL 提示学员选择继续已有会话或放弃后重新开始。

### Requirement 2: 顺序练习

**User Story:** 作为学员，我希望按顺序逐题练习，以便系统地刷完整个题库。

#### Acceptance Criteria

1. WHILE 处于顺序模式时，THE 答题引擎 SHALL 按题目创建时间升序呈现所选题库中的题目。
2. WHILE 处于顺序模式时，THE 答题引擎 SHALL 允许学员导航到下一题（非最后一题时）和上一题（非第一题时）。
3. IF 学员已到达题库最后一题，THEN THE 答题引擎 SHALL 提示所有题目已完成并禁止继续前进。
4. WHILE 处于顺序模式时，THE 答题引擎 SHALL 持久化学员在每个题库中的当前位置，以便下次进入时能在 2 秒内恢复到上次位置。
5. WHILE 处于顺序模式时，THE 答题引擎 SHALL 以"第 N/M 题"的格式显示当前题号和总题数（N 为当前位置，M 为题库总题数）。
6. IF 所选题库中没有题目，THEN THE 答题引擎 SHALL 显示空状态提示并禁用导航控件。

### Requirement 3: 随机练习

**User Story:** 作为学员，我希望随机顺序练习题目，以便在不依赖记忆顺序的情况下检验知识掌握程度。

#### Acceptance Criteria

1. WHILE 处于随机模式时，THE 答题引擎 SHALL 以会话创建时打乱的伪随机顺序呈现所选题库中的题目。
2. WHILE 处于随机模式时，THE 答题引擎 SHALL 在单次会话中不重复出题，直到所有题目都已呈现，此时会话标记为 FINISHED。
3. WHILE 处于随机模式时，THE 答题引擎 SHALL 显示当前进度，格式为"已答 N/M 题"（N 为已答题数，M 为题库总题数）。
4. WHILE 处于随机模式时，THE 答题引擎 SHALL 允许学员前进到下一题，但不允许回退到已答过的题目。
5. IF 学员恢复一个之前状态为 ONGOING 的随机模式会话，THEN THE 答题引擎 SHALL 按创建时确定的打乱顺序继续呈现剩余未展示的题目。

### Requirement 4: 章节练习

**User Story:** 作为学员，我希望按章节（分类）筛选题目进行练习，以便集中攻克特定知识领域。

#### Acceptance Criteria

1. WHEN 学员选择一个或多个分类时，THE 答题引擎 SHALL 仅加载属于所选分类（含所选分类的所有子分类）且在所选题库中的题目。
2. WHILE 处于章节模式时，THE 答题引擎 SHALL 按创建时间升序（与顺序模式相同）呈现筛选后的题目。
3. WHILE 处于章节模式时，THE 答题引擎 SHALL 显示所选分类名称和进度，格式为"第 N/M 题"。
4. IF 所选分类（含子分类）在所选题库中没有题目，THEN THE 答题引擎 SHALL 显示"所选分类下暂无匹配题目"的提示并阻止创建会话。
5. WHILE 处于章节模式时，THE 答题引擎 SHALL 允许学员在筛选集内前后导航，并持久化当前位置以便下次恢复。

### Requirement 5: 模拟考试

**User Story:** 作为学员，我希望参加带倒计时和评分的模拟考试，以便在真实考试条件下备考。

#### Acceptance Criteria

1. WHEN 学员开始模拟考试时，THE 答题引擎 SHALL 从题库中随机抽取指定数量的题目（科目一: 100 题，科目四: 50 题，其他题库: min(题库总题数, 50)），确保同一会话内不重复。
2. IF 题库中的题目数量少于配置的抽题数，THEN THE 答题引擎 SHALL 阻止开始考试并显示"题库题目不足，无法开始模拟考试"的错误提示。
3. WHILE 处于模拟考试模式时，THE 答题引擎 SHALL 显示倒计时（科目一: 45 分钟，科目四: 30 分钟，其他题库: 30 分钟），每秒更新一次剩余时间。
4. WHEN 倒计时归零时，THE 答题引擎 SHALL 自动提交所有已答题目，将未答题目标记为错误（userAnswer 为空），并将会话状态设为 FINISHED。
5. WHILE 处于模拟考试模式时，THE 答题引擎 SHALL 禁止学员回退到已答过的题目。
6. WHEN 学员在计时结束前主动交卷时，THE 答题引擎 SHALL 计算得分，将未答题目标记为错误，并将会话状态设为 FINISHED。
7. WHEN 模拟考试结束（交卷或超时）时，THE 答题引擎 SHALL 计算并显示得分百分比（score = correctCount / totalCount × 100），90% 及以上显示"通过"，否则显示"未通过"。
8. WHILE 处于模拟考试模式时，THE 答题引擎 SHALL 显示剩余时间、当前题号（从 1 开始）和总题数。
9. IF 学员在模拟考试期间离开页面或关闭浏览器，THEN THE 答题引擎 SHALL 将会话状态标记为 ABANDONED 并记录已用时长。

### Requirement 6: 错题重做

**User Story:** 作为学员，我希望重做之前答错的题目，以便巩固薄弱知识点。

#### Acceptance Criteria

1. WHILE 处于错题重做模式时，THE 答题引擎 SHALL 按 lastWrongAt 降序（最近答错的排前面）呈现错题本中未掌握的题目。
2. WHEN 学员在错题重做中答对一道题时，THE 答题引擎 SHALL 将该错题本条目的 rightCount 加 1。
3. WHEN 学员在错题重做中答错一道题时，THE 答题引擎 SHALL 将该条目的 rightCount 重置为 0，wrongCount 加 1，并更新 lastWrongAt。
4. WHEN 错题本条目的 rightCount 达到 3 时，THE 答题引擎 SHALL 将该条目的 mastered 设为 true。
5. WHILE 处于错题重做模式时，THE 答题引擎 SHALL 显示错题本中未掌握题目的总数。

### Requirement 7: 答案提交与判定

**User Story:** 作为学员，我希望提交答案后立即获得反馈，以便实时从错误中学习。

#### Acceptance Criteria

1. WHEN 学员提交答案时，THE 答题引擎 SHALL 创建一条 ExamRecord，包含用户答案、正误判定（通过比较 userAnswer 与题目的 answer 字段）、以及答题用时（costMs，单位毫秒，范围 0~3,600,000）。
2. WHEN 学员在顺序模式、随机模式、章节模式或错题重做模式中答对时，THE 答题引擎 SHALL 立即显示正确标识和解析（如有）。
3. WHEN 学员在顺序模式、随机模式、章节模式或错题重做模式中答错时，THE 答题引擎 SHALL 立即显示正确答案、用视觉区分学员选项与正确选项、并显示解析（如有）。
4. WHILE 处于模拟考试模式时，THE 答题引擎 SHALL 记录 ExamRecord 但不显示对错反馈、正确答案或解析，直到考试结束。
5. WHEN 学员答错且该题不在错题本中时，THE 答题引擎 SHALL 创建新的错题本条目，wrongCount 设为 1，lastWrongAt 设为当前时间。
6. WHEN 学员答错且该题已在错题本中时，THE 答题引擎 SHALL 将 wrongCount 加 1 并更新 lastWrongAt 为当前时间。
7. WHEN 学员答错且该题的错题本条目 mastered 为 true 时，THE 答题引擎 SHALL 将 mastered 设为 false 并将 rightCount 重置为 0。
8. IF 学员对同一会话中已有 ExamRecord 的题目再次提交答案，THEN THE 答题引擎 SHALL 拒绝提交并保留原始记录不变。

### Requirement 8: 答题会话结束与统计

**User Story:** 作为学员，我希望在练习结束后看到成绩汇总，以便了解自己的表现。

#### Acceptance Criteria

1. WHEN 学员答完所有题目后点击"结束"按钮时，THE 答题引擎 SHALL 将会话状态更新为 FINISHED 并设置 finishedAt 为当前时间。
2. WHEN 学员在未答完所有题目时点击"放弃"按钮时，THE 答题引擎 SHALL 将会话状态更新为 ABANDONED 并设置 finishedAt 为当前时间。
3. WHEN 会话结束（状态变为 FINISHED 或 ABANDONED）时，THE 答题引擎 SHALL 计算并存储：totalCount（已答题数，即 ExamRecord 数量）、correctCount（isCorrect 为 true 的数量）、score（ROUND(correctCount / totalCount * 100)，整数 0~100）、durationMs（从 startedAt 到 finishedAt 的毫秒数）。
4. WHEN 会话结束时，THE 答题引擎 SHALL 显示汇总：总答题数、正确数、正确率（百分比）、用时（格式化为分:秒）。
5. IF 浏览器关闭或学员在活跃会话中离开页面，THEN THE 答题引擎 SHALL 保持会话为 ONGOING 状态且不修改得分字段，以便学员稍后恢复。
6. IF 会话结束时 totalCount 为 0，THEN THE 答题引擎 SHALL 将 score 设为 0 并显示零值汇总。

### Requirement 9: 答题记录查看

**User Story:** 作为学员，我希望查看历史答题记录，以便追踪学习进度。

#### Acceptance Criteria

1. THE 答题引擎 SHALL 显示学员的 ExamAttempt 分页列表（每页 20 条），仅显示状态为 FINISHED 或 ABANDONED 的记录，按 startedAt 降序排列。
2. THE 答题引擎 SHALL 为每条记录显示：练习模式、题库名称（bankId 为空时显示"错题回顾"）、开始时间（格式"YYYY-MM-DD HH:mm"）、总题数、正确数、正确率（保留一位小数）、用时（格式"mm:ss"）。
3. IF 学员没有匹配的答题记录，THEN THE 答题引擎 SHALL 显示空状态提示"暂无答题记录"。
4. WHEN 学员点击一条状态为 FINISHED 的记录时，THE 答题引擎 SHALL 显示逐题详情，包括题目内容、学员答案、正确答案、是否正确。
5. IF 学员点击一条状态为 ABANDONED 的记录，THEN THE 答题引擎 SHALL 仅显示有 ExamRecord 的题目，并标注该次练习未完成。

### Requirement 10: 错题本管理

**User Story:** 作为学员，我希望查看和管理错题本，以便集中攻克薄弱环节。

#### Acceptance Criteria

1. THE 答题引擎 SHALL 显示学员错题本的分页列表（每页 20 条），按 lastWrongAt 降序排列。
2. THE 答题引擎 SHALL 支持按题库和掌握状态筛选错题，默认显示全部（不区分是否已掌握）。
3. WHEN 学员手动将一条错题标记为"已掌握"时，THE 答题引擎 SHALL 将 mastered 设为 true 并即时更新界面（无需刷新页面）。
4. WHEN 学员取消一条已掌握错题的标记时，THE 答题引擎 SHALL 将 mastered 设为 false。
5. THE 答题引擎 SHALL 为每条错题显示：题目内容、错误次数、正确次数、掌握状态、最近答错时间。
6. IF 当前筛选条件下没有错题，THEN THE 答题引擎 SHALL 显示空状态提示"暂无错题"。
7. IF 标记/取消标记操作失败，THEN THE 答题引擎 SHALL 显示错误提示并保持界面上原来的掌握状态不变。

### Requirement 11: 教练查看学员成绩

**User Story:** 作为教练，我希望查看所有学员的答题成绩，以便监控学习进度并提供指导。

#### Acceptance Criteria

1. WHEN 拥有"stats:all"权限的教练访问学员成绩页面时，THE 答题引擎 SHALL 显示所有学员的分页列表（每页 20 人），包含：总答题次数、平均正确率（保留一位小数）、最近练习时间。
2. WHEN 教练点击某个学员时，THE 答题引擎 SHALL 显示该学员的答题历史，包含：练习模式、题库名称、总题数、正确数、正确率、用时、状态、开始时间，按开始时间降序排列（每页 20 条）。
3. WHEN 教练使用筛选功能时，THE 答题引擎 SHALL 支持按题库和练习模式（SEQUENTIAL、RANDOM、CHAPTER、MOCK、WRONG_REVIEW）筛选，仅显示匹配的记录。
4. IF 没有"stats:all"权限的教练尝试访问学员成绩页面，THEN THE 答题引擎 SHALL 拒绝访问并重定向到后台首页。
5. IF 学员列表或某学员的答题历史为空，THEN THE 答题引擎 SHALL 显示空状态提示"暂无数据"。

### Requirement 12: 答题界面交互

**User Story:** 作为学员，我希望有一个清晰、响应迅速的答题界面，以便专注于题目内容而不被 UI 干扰。

#### Acceptance Criteria

1. THE 答题引擎 SHALL 以单列布局显示题目内容、图片（如有）和选项：题目在上、图片居中、选项在下；窄屏（<640px）占满宽度，宽屏最大宽度 720px 居中显示。
2. WHEN 题目类型为单选（SINGLE）时，THE 答题引擎 SHALL 以单选按钮渲染选项，只允许选择一个，每个选项显示选项标号（如"A"、"B"）和内容。
3. WHEN 题目类型为多选（MULTI）时，THE 答题引擎 SHALL 以复选框渲染选项，允许选择 2 个到全部选项。
4. WHEN 题目类型为判断（JUDGE）时，THE 答题引擎 SHALL 渲染"正确"和"错误"两个互斥按钮，选择一个自动取消另一个。
5. THE 答题引擎 SHALL 提供提交按钮，单选和判断题至少选 1 个、多选题至少选 2 个后才可点击。
6. WHEN 学员点击提交按钮时，THE 答题引擎 SHALL 在 1 秒内记录答案并显示结果（对/错）、正确答案和解析（如有）。
7. IF 题目包含图片且图片加载失败，THEN THE 答题引擎 SHALL 显示占位符和替代文字，不阻止学员答题。
8. WHILE 处于模拟考试模式时，THE 答题引擎 SHALL 提供"交卷"按钮，WHEN 学员点击"交卷"时 SHALL 弹出确认对话框，显示未答题数（如有），确认后才提交。
9. WHEN 学员选择或取消选择选项时，THE 答题引擎 SHALL 在 100 毫秒内更新选项的视觉状态以提供即时交互反馈。
