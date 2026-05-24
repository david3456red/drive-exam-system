'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectNative } from '@/components/ui/select-native';
import { QUESTION_TYPES, QUESTION_TYPE_DISPLAY } from '@/lib/question-types';

export function QuestionsFilter({
  banks,
}: {
  banks: { id: string; name: string; code: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [bankId, setBankId] = useState(sp.get('bank') ?? '');
  const [type, setType] = useState(sp.get('type') ?? '');
  const [keyword, setKeyword] = useState(sp.get('q') ?? '');

  function apply() {
    const params = new URLSearchParams();
    if (bankId) params.set('bank', bankId);
    if (type) params.set('type', type);
    if (keyword.trim()) params.set('q', keyword.trim());
    const qs = params.toString();
    router.push(qs ? `/admin/questions?${qs}` : '/admin/questions');
  }

  function clear() {
    setBankId('');
    setType('');
    setKeyword('');
    router.push('/admin/questions');
  }

  return (
    <div className="grid gap-3 md:grid-cols-4 items-end">
      <div className="space-y-1">
        <Label className="text-xs">题库</Label>
        <SelectNative value={bankId} onChange={(e) => setBankId(e.target.value)}>
          <option value="">全部题库</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectNative>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">题型</Label>
        <SelectNative value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部题型</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_DISPLAY[t]}
            </option>
          ))}
        </SelectNative>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">关键字(题干)</Label>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          placeholder="输入关键字..."
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={apply} className="flex-1">
          <Search className="h-4 w-4 mr-1" /> 筛选
        </Button>
        <Button variant="outline" onClick={clear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
