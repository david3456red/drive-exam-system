'use client';

import { Download, FileSpreadsheet, FileText, Inbox, Save, Search, Upload } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import type { CommitResult, PreviewResult } from '@/lib/import/types';
import {
  commitExcelImportAction,
  commitJsonImportAction,
  previewExcelImportAction,
  previewJsonImportAction,
} from './actions';

type BankOption = {
  id: string;
  name: string;
};

type SourceKind = 'json' | 'excel';

export function ImportClient({ banks }: { banks: BankOption[] }) {
  const [sourceKind, setSourceKind] = useState<SourceKind>('json');
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [jsonPayload, setJsonPayload] = useState('');
  const [excelBytes, setExcelBytes] = useState<number[]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const canCommit = useMemo(
    () => Boolean(preview && preview.valid.length > 0 && bankId),
    [bankId, preview],
  );

  async function onPreview() {
    setMessage('');
    setPreview(null);
    startTransition(async () => {
      const next =
        sourceKind === 'json'
          ? await previewJsonImportAction(jsonPayload)
          : await previewExcelImportAction(excelBytes);
      setPreview(next);
      setMessage(`预览完成：${next.valid.length} 条可导入，${next.invalid.length} 条将跳过`);
    });
  }

  async function onCommit() {
    if (!bankId) {
      setMessage('请选择题库');
      return;
    }

    startTransition(async () => {
      const result: CommitResult =
        sourceKind === 'json'
          ? await commitJsonImportAction(jsonPayload, bankId)
          : await commitExcelImportAction(excelBytes, bankId);
      if (result.ok) {
        setMessage(`导入完成：新增 ${result.insertedCount} 条，跳过 ${result.skippedCount} 条`);
        setPreview(null);
      } else {
        setMessage(result.error);
      }
    });
  }

  async function onFileChange(file: File | null) {
    setPreview(null);
    setFileName(file?.name ?? '');
    if (!file) {
      setExcelBytes([]);
      return;
    }
    const buffer = await file.arrayBuffer();
    setExcelBytes(Array.from(new Uint8Array(buffer)));
  }

  return (
    <section className="panel stack">
      {message ? <div className="notice">{message}</div> : null}

      <div className="grid">
        <div className="field">
          <label htmlFor="bankId">
            <Inbox size={15} aria-hidden="true" />
            导入到题库
          </label>
          <select id="bankId" value={bankId} onChange={(event) => setBankId(event.target.value)}>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sourceKind">
            <Upload size={15} aria-hidden="true" />
            来源
          </label>
          <select
            id="sourceKind"
            value={sourceKind}
            onChange={(event) => {
              setSourceKind(event.target.value as SourceKind);
              setPreview(null);
              setMessage('');
            }}
          >
            <option value="json">JSON</option>
            <option value="excel">Excel</option>
          </select>
        </div>
      </div>

      {sourceKind === 'json' ? (
        <div className="field">
          <label htmlFor="jsonPayload">
            <FileText size={15} aria-hidden="true" />
            JSON 内容
          </label>
          <textarea
            id="jsonPayload"
            value={jsonPayload}
            onChange={(event) => {
              setJsonPayload(event.target.value);
              setPreview(null);
            }}
            placeholder='[{"type":"SINGLE","content":"题干","optionA":"选项A","optionB":"选项B","answer":"B","categories":["交通标志"],"tags":["易错"]}]'
          />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="excelFile">
            <FileSpreadsheet size={15} aria-hidden="true" />
            Excel 文件
          </label>
          <input
            id="excelFile"
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          {fileName ? <span className="muted">{fileName}</span> : null}
        </div>
      )}

      <div className="cluster">
        <button
          className="primary"
          type="button"
          disabled={isPending || (sourceKind === 'json' ? !jsonPayload.trim() : excelBytes.length === 0)}
          onClick={onPreview}
        >
          <Search size={17} aria-hidden="true" />
          预览
        </button>
        <button type="button" disabled={isPending || !canCommit} onClick={onCommit}>
          <Save size={17} aria-hidden="true" />
          确认导入
        </button>
        <a className="button" href="/admin/questions/import/template">
          <Download size={17} aria-hidden="true" />
          下载模板
        </a>
      </div>

      {preview ? (
        <div className="stack">
          <div className="cluster">
            <span className="badge good">可导入 {preview.valid.length}</span>
            <span className="badge warn">跳过 {preview.invalid.length}</span>
          </div>
          {preview.invalid.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>行</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.invalid.map((row) => (
                    <tr key={`${row.row}-${row.errors.join(',')}`}>
                      <td>{row.row}</td>
                      <td>{row.errors.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
