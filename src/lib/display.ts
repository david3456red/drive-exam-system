import type { ExamMode, ExamStatus, QuestionType } from '@/lib/enums';

export const EXAM_MODE_LABEL: Record<ExamMode, string> = {
  SEQUENTIAL: '顺序练习',
  RANDOM: '随机练习',
  CHAPTER: '章节练习',
  CHAPTER_RANDOM: '章节随机',
  MOCK: '模拟考试',
  WRONG_REVIEW: '错题重做',
};

export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  ONGOING: '进行中',
  FINISHED: '已完成',
  ABANDONED: '已放弃',
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE: '单选',
  MULTI: '多选',
  JUDGE: '判断',
};

export type QuestionOption = {
  key: string;
  text: string;
};

export function parseQuestionOptions(raw: string): QuestionOption[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (
          item &&
          typeof item === 'object' &&
          'key' in item &&
          'text' in item &&
          typeof item.key === 'string' &&
          typeof item.text === 'string'
        ) {
          return { key: item.key, text: item.text };
        }
        return null;
      })
      .filter((item): item is QuestionOption => item !== null);
  } catch {
    return [];
  }
}

export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export function formatDuration(ms: number | null | undefined): string {
 if (!ms || ms < 0) return '00:00';
 const totalSeconds = Math.floor(ms / 1000);
 const hours = Math.floor(totalSeconds / 3600);
 const minutes = Math.floor((totalSeconds % 3600) / 60);
 const seconds = totalSeconds % 60;
 if (hours > 0) {
 return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
 }
 return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value}%`;
}
