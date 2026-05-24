'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SelectNative } from '@/components/ui/select-native';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_DISPLAY,
  type QuestionType,
  type QuestionOption,
} from '@/lib/question-types';
import { createQuestion, updateQuestion, listCategoriesByBank } from './actions';

export type QuestionFormInitial = {
  id?: string;
  bankId: string;
  type: QuestionType;
  content: string;
  imageUrl: string | null;
  options: QuestionOption[];
  answer: string;
  explanation: string | null;
  categoryIds: string[];
  tags: string[];
};

const DEFAULT_OPTIONS: QuestionOption[] = [
  { key: 'A', text: '' },
  { key: 'B', text: '' },
  { key: 'C', text: '' },
  { key: 'D', text: '' },
];

export function QuestionForm({
  initial,
  banks,
}: {
  initial?: QuestionFormInitial;
  banks: { id: string; name: string; code: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const isEdit = !!initial?.id;

  const [bankId, setBankId] = useState(initial?.bankId ?? banks[0]?.id ?? '');
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'SINGLE');
  const [content, setContent] = useState(initial?.content ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [options, setOptions] = useState<QuestionOption[]>(
    initial?.options?.length ? initial.options : DEFAULT_OPTIONS,
  );
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [tagsCsv, setTagsCsv] = useState((initial?.tags ?? []).join(','));
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    initial?.categoryIds ?? [],
  );

  const [allCategories, setAllCategories] = useState<{ id: string; name: string }[]>([]);

  // Reload categories whenever the bank changes.
  useEffect(() => {
    if (!bankId) {
      setAllCategories([]);
      return;
    }
    let cancelled = false;
    listCategoriesByBank(bankId).then((cats) => {
      if (!cancelled) setAllCategories(cats);
    });
    return () => {
      cancelled = true;
    };
  }, [bankId]);

  // When bank changes, drop category selections that no longer apply.
  useEffect(() => {
    const valid = new Set(allCategories.map((c) => c.id));
    setSelectedCategoryIds((prev) => prev.filter((id) => valid.has(id)));
  }, [allCategories]);

  const usedKeys = useMemo(() => new Set(options.map((o) => o.key.toUpperCase())), [options]);
  const nextKey = useMemo(() => {
    for (const k of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      if (!usedKeys.has(k)) return k;
    }
    return 'X';
  }, [usedKeys]);

  function addOption() {
    setOptions((prev) => [...prev, { key: nextKey, text: '' }]);
  }
  function removeOption(idx: number) {
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  }
  function setOptionField(idx: number, field: 'key' | 'text', val: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, [field]: val } : o)));
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const payload = {
      bankId,
      type,
      content: content.trim(),
      imageUrl: imageUrl.trim() || null,
      options:
        type === 'JUDGE'
          ? []
          : options
              .map((o) => ({ key: o.key.trim().toUpperCase(), text: o.text }))
              .filter((o) => o.key && o.text.trim()),
      answer: answer.trim().toUpperCase(),
      explanation: explanation.trim() || null,
      categoryIds: selectedCategoryIds,
      tags: tagsCsv
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    startTransition(async () => {
      const res = isEdit
        ? await updateQuestion(initial!.id!, payload)
        : await createQuestion(payload);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? '已保存' : '已创建');
      router.push('/admin/questions');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-3xl">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bankId">题库</Label>
          <SelectNative
            id="bankId"
            value={bankId}
            onChange={(e) => setBankId(e.target.value)}
            disabled={pending}
            required
          >
            {banks.length === 0 && <option value="">(请先创建题库)</option>}
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </SelectNative>
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">题型</Label>
          <SelectNative
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as QuestionType)}
            disabled={pending}
            required
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_DISPLAY[t]} ({t})
              </option>
            ))}
          </SelectNative>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">题干</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          disabled={pending}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="imageUrl">图片 URL(可选)</Label>
        <Input
          id="imageUrl"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
          disabled={pending}
        />
      </div>

      {type !== 'JUDGE' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>选项</Label>
            <Button type="button" variant="outline" size="sm" onClick={addOption} disabled={pending}>
              <Plus className="h-3.5 w-3.5 mr-1" /> 添加选项
            </Button>
          </div>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  value={opt.key}
                  onChange={(e) => setOptionField(i, 'key', e.target.value)}
                  className="w-16 text-center font-mono"
                  maxLength={2}
                  disabled={pending}
                />
                <Input
                  value={opt.text}
                  onChange={(e) => setOptionField(i, 'text', e.target.value)}
                  className="flex-1"
                  placeholder="选项内容"
                  disabled={pending}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeOption(i)}
                  disabled={pending || options.length <= 2}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="answer">答案</Label>
        <Input
          id="answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value.toUpperCase())}
          placeholder={
            type === 'SINGLE'
              ? '一个字母,如 B'
              : type === 'MULTI'
                ? '多个字母连写,如 AC'
                : 'T(对)或 F(错)'
          }
          disabled={pending}
          required
          maxLength={8}
        />
      </div>

      <div className="space-y-2">
        <Label>分类(可选)</Label>
        {allCategories.length === 0 ? (
          <p className="text-xs text-muted-foreground">该题库还没有分类。</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border rounded-md p-3">
            {allCategories.map((cat) => (
              <label key={cat.id} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={selectedCategoryIds.includes(cat.id)}
                  onCheckedChange={() => toggleCategory(cat.id)}
                  disabled={pending}
                />
                <span>{cat.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">标签(可选,英文逗号分隔)</Label>
        <Input
          id="tags"
          value={tagsCsv}
          onChange={(e) => setTagsCsv(e.target.value)}
          placeholder="基础, 信号灯"
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="explanation">答案解析(可选)</Label>
        <Textarea
          id="explanation"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={2}
          disabled={pending}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          取消
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? '保存中...' : isEdit ? '保存' : '创建'}
        </Button>
      </div>
    </form>
  );
}
