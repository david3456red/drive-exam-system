import type { ComponentProps } from 'react';
import { ClipboardList, FilePlus2, FolderTree, Image as ImageIcon, Save, Tags } from 'lucide-react';

import { QUESTION_TYPE_LABEL } from '@/lib/display';
import { QUESTION_TYPES, type QuestionType } from '@/lib/enums';
import type { QuestionOption } from '@/lib/question-validate';

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

type BankOption = {
  id: string;
  name: string;
};

type CategoryOption = {
  id: string;
  name: string;
};

export type QuestionFormInitialQuestion = {
  id: string;
  bankId: string;
  type: QuestionType;
  content: string;
  imageUrl: string | null;
  options: QuestionOption[];
  answer: string;
  explanation: string | null;
  tags: string[];
  categoryIds: string[];
};

type QuestionFormProps = {
  action: ComponentProps<'form'>['action'];
  banks: BankOption[];
  categories: CategoryOption[];
  mode: 'new' | 'edit';
  initialQuestion?: QuestionFormInitialQuestion;
  lockedScoringFields?: boolean;
};

export function QuestionForm({
  action,
  banks,
  categories,
  mode,
  initialQuestion,
  lockedScoringFields = false,
}: QuestionFormProps) {
  const selectedCategories = new Set(initialQuestion?.categoryIds ?? []);
  const selectedType = initialQuestion?.type ?? 'SINGLE';
  const submitLabel = mode === 'edit' ? '保存题目' : '创建题目';

  return (
    <form action={action} className="panel stack">
      {mode === 'edit' && initialQuestion ? <input type="hidden" name="id" value={initialQuestion.id} /> : null}
      <div className="grid">
        <div className="field">
          <label htmlFor="bankId">
            <ClipboardList size={15} aria-hidden="true" />
            题库
          </label>
          <select id="bankId" name="bankId" defaultValue={initialQuestion?.bankId ?? ''} required>
            <option value="">请选择题库</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="type">
            <ClipboardList size={15} aria-hidden="true" />
            题型
          </label>
          <select id="type" name="type" defaultValue={selectedType} disabled={lockedScoringFields} required>
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="answer">
            <ClipboardList size={15} aria-hidden="true" />
            答案
          </label>
          <input
            id="answer"
            name="answer"
            defaultValue={initialQuestion?.answer ?? ''}
            disabled={lockedScoringFields}
            placeholder="B / AC / T"
            required
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="content">
          <FilePlus2 size={15} aria-hidden="true" />
          题干
        </label>
        <textarea id="content" name="content" defaultValue={initialQuestion?.content ?? ''} required />
      </div>

      {mode === 'edit' ? (
        <fieldset className="field">
          <legend>
            <ImageIcon size={15} aria-hidden="true" />
            图片处理
          </legend>
          <span className="muted">
            {initialQuestion?.imageUrl ? `当前图片：${initialQuestion.imageUrl}` : '当前未设置图片'}
          </span>
          <div className="grid">
            <div className="field">
              <label htmlFor="imageUrl">
                <ImageIcon size={15} aria-hidden="true" />
                新图片 URL
              </label>
              <input id="imageUrl" name="imageUrl" placeholder="https://..." />
              <span className="muted">留空会保留当前图片。</span>
            </div>
            <div className="field">
              <label htmlFor="imageFile">
                <ImageIcon size={15} aria-hidden="true" />
                上传新图片
              </label>
              <input id="imageFile" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
              <span className="muted">和新图片 URL 二选一，支持 JPG / PNG / WebP / GIF，单张不超过 5MB。</span>
            </div>
          </div>
          {initialQuestion?.imageUrl ? (
            <label className="badge">
              <input name="removeImage" type="checkbox" /> 移除当前图片
            </label>
          ) : null}
        </fieldset>
      ) : (
        <div className="grid">
          <div className="field">
            <label htmlFor="imageUrl">
              <ImageIcon size={15} aria-hidden="true" />
              图片 URL
            </label>
            <input id="imageUrl" name="imageUrl" placeholder="https://..." />
            <span className="muted">可填写外链或已有 /uploads 路径。</span>
          </div>
          <div className="field">
            <label htmlFor="imageFile">
              <ImageIcon size={15} aria-hidden="true" />
              上传图片
            </label>
            <input id="imageFile" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
            <span className="muted">和图片 URL 二选一，支持 JPG / PNG / WebP / GIF，单张不超过 5MB。</span>
          </div>
        </div>
      )}

      <section className="grid" aria-label="选项">
        {OPTION_KEYS.map((key) => (
          <div className="field" key={key}>
            <label htmlFor={`option${key}`}>选项 {key}</label>
            <input
              id={`option${key}`}
              name={`option${key}`}
              defaultValue={optionText(initialQuestion?.options ?? [], key)}
              disabled={lockedScoringFields}
            />
          </div>
        ))}
      </section>

      <div className="field">
        <label>
          <FolderTree size={15} aria-hidden="true" />
          分类
        </label>
        <div className="cluster">
          {categories.length === 0 ? (
            <span className="muted">暂无分类</span>
          ) : (
            categories.map((category) => (
              <label className="badge" key={category.id}>
                <input
                  name="categoryIds"
                  type="checkbox"
                  value={category.id}
                  defaultChecked={selectedCategories.has(category.id)}
                />{' '}
                {category.name}
              </label>
            ))
          )}
        </div>
      </div>

      <div className="field">
        <label htmlFor="explanation">
          <ClipboardList size={15} aria-hidden="true" />
          解析
        </label>
        <textarea id="explanation" name="explanation" defaultValue={initialQuestion?.explanation ?? ''} />
      </div>
      <div className="field">
        <label htmlFor="tags">
          <Tags size={15} aria-hidden="true" />
          标签
        </label>
        <input id="tags" name="tags" defaultValue={(initialQuestion?.tags ?? []).join('|')} placeholder="易错|标志|高速" />
      </div>

      <button className="primary" type="submit">
        <Save size={17} aria-hidden="true" />
        {submitLabel}
      </button>
    </form>
  );
}

function optionText(options: QuestionOption[], key: string): string {
  return options.find((option) => option.key === key)?.text ?? '';
}
