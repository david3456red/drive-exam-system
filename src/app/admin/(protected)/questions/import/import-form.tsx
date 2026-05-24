'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, FileSpreadsheet, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectNative } from '@/components/ui/select-native';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { previewImport, commitImport, type ImportPreview } from './actions';

type Bank = { id: string; name: string; code: string };

const JSON_EXAMPLE = `[
  {
    "type": "SINGLE",
    "content": "黄灯亮时表示什么?",
    "options": [
      { "key": "A", "text": "禁止通行" },
      { "key": "B", "text": "警示,谨慎通行" }
    ],
    "answer": "B",
    "categories": ["交通信号", "基础"],
    "explanation": "黄灯亮起是警示信号..."
  }
]`;

export function ImportForm({ banks }: { banks: Bank[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [kind, setKind] = useState<'json' | 'excel'>('json');
  const [jsonText, setJsonText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState('');

  function buildFormData(): FormData | null {
    const fd = new FormData();
    fd.set('bankId', bankId);
    fd.set('kind', kind);
    if (kind === 'json') {
      if (!jsonText.trim()) {
        setError('请粘贴 JSON 内容');
        return null;
      }
      fd.set('text', jsonText);
    } else {
      if (!file) {
        setError('请选择 .xlsx 文件');
        return null;
      }
      fd.set('file', file);
    }
    return fd;
  }

  function onPreview() {
    setError('');
    setPreview(null);
    const fd = buildFormData();
    if (!fd) return;
    if (!bankId) {
      setError('请选择目标题库');
      return;
    }
    startTransition(async () => {
      const res = await previewImport(fd);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      setPreview(res);
    });
  }

  function onCommit() {
    if (!preview) return;
    if (!window.confirm(`即将导入 ${preview.validCount} 道题到 "${preview.bankName}",${preview.invalidCount} 行将被跳过。确认?`)) {
      return;
    }
    setError('');
    const fd = buildFormData();
    if (!fd) return;
    startTransition(async () => {
      const res = await commitImport(fd);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(
        `已导入 ${res.committed} 道题${res.newCategories.length ? `,新增分类 ${res.newCategories.length} 个` : ''}`,
      );
      router.push('/admin/questions');
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bankId">目标题库</Label>
              <SelectNative
                id="bankId"
                value={bankId}
                onChange={(e) => {
                  setBankId(e.target.value);
                  setPreview(null);
                }}
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
              <Label>导入格式</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={kind === 'json' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setKind('json');
                    setPreview(null);
                  }}
                  disabled={pending}
                >
                  <FileText className="h-4 w-4 mr-1" /> JSON
                </Button>
                <Button
                  type="button"
                  variant={kind === 'excel' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setKind('excel');
                    setPreview(null);
                  }}
                  disabled={pending}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
                </Button>
              </div>
            </div>
          </div>

          {kind === 'json' ? (
            <div className="space-y-2">
              <Label htmlFor="jsonText">JSON 内容</Label>
              <Textarea
                id="jsonText"
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setPreview(null);
                }}
                rows={12}
                disabled={pending}
                placeholder={JSON_EXAMPLE}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                支持顶层数组 <code>[...]</code> 或包装对象 <code>{'{ "questions": [...] }'}</code>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="file">.xlsx 文件</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                }}
                disabled={pending}
              />
              <Link
                href="/admin/questions/import/template"
                className="text-xs text-primary underline inline-flex items-center"
              >
                <Download className="h-3.5 w-3.5 mr-1" /> 下载 Excel 模板
              </Link>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={onPreview} disabled={pending}>
              {pending ? '处理中...' : '预览校验'}
            </Button>
            {preview && preview.validCount > 0 && (
              <Button onClick={onCommit} disabled={pending} variant="default" className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-4 w-4 mr-1" /> 确认导入 {preview.validCount} 条
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="总行数" value={preview.totalRows} />
              <Stat label="合法" value={preview.validCount} variant="success" />
              <Stat label="不合法" value={preview.invalidCount} variant={preview.invalidCount > 0 ? 'warn' : 'default'} />
            </div>

            {preview.errors.length > 0 && (
              <div className="space-y-2">
                <div className="font-semibold flex items-center gap-1 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" /> 不合法行(显示前 50 条):
                </div>
                <ul className="text-xs space-y-1 border rounded-md p-3 max-h-60 overflow-auto bg-red-50 dark:bg-red-950/30">
                  {preview.errors.map((e) => (
                    <li key={e.rowIndex} className="font-mono">
                      第 {e.rowIndex} 行 — {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.samples.length > 0 && (
              <div className="space-y-2">
                <div className="font-semibold text-sm">合法行预览(前 5 条):</div>
                <ul className="text-xs space-y-2 border rounded-md p-3 max-h-72 overflow-auto">
                  {preview.samples.map((s) => (
                    <li key={s.rowIndex} className="border-b pb-2 last:border-b-0">
                      <div className="text-muted-foreground">第 {s.rowIndex} 行 — {s.preview.type}</div>
                      <div className="font-medium">{s.preview.content}</div>
                      <div className="text-muted-foreground">
                        答案: <span className="font-mono">{s.preview.answer}</span>
                        {s.preview.categories.length > 0 && (
                          <span className="ml-3">分类: {s.preview.categories.join(', ')}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: number;
  variant?: 'default' | 'success' | 'warn';
}) {
  const colors =
    variant === 'success'
      ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
      : variant === 'warn'
        ? 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400'
        : 'bg-muted/50';
  return (
    <div className={`rounded-md p-3 ${colors}`}>
      <div className="text-xs">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
