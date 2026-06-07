'use client';

import { CheckSquare, DownloadCloud, KeyRound, RefreshCw, Search, Square } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import type { WukongCatalogItem } from '@/lib/import/wukong';
import {
  importWukongCatalogAction,
  scanWukongCatalogAction,
  type WukongImportResult,
} from './actions';

export function WukongImportClient() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [items, setItems] = useState<WukongCatalogItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<WukongImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedItems = useMemo(
    () => items.filter((item) => selected.includes(item.sourceKey)),
    [items, selected],
  );
  const bankCount = new Set(items.map((item) => item.bankCode)).size;
  const selectedBankCount = new Set(selectedItems.map((item) => item.bankCode)).size;
  const scannedQuestions = items.reduce((sum, item) => sum + item.questionCount, 0);
  const totalQuestions = selectedItems.reduce((sum, item) => sum + item.questionCount, 0);
  const allSelected = items.length > 0 && selected.length === items.length;

  function onScan() {
    setMessage('');
    setResult(null);
    startTransition(async () => {
      const next = await scanWukongCatalogAction(username, password);
      if (!next.ok) {
        setMessage(next.error);
        return;
      }
      setItems(next.items);
      setSelected(next.items.map((item) => item.sourceKey));
      const nextBankCount = new Set(next.items.map((item) => item.bankCode)).size;
      const nextQuestions = next.items.reduce((sum, item) => sum + item.questionCount, 0);
      setMessage(`扫描完成：${nextBankCount} 个题库，${next.items.length} 个章节，约 ${nextQuestions} 题`);
    });
  }

  function onImport() {
    setMessage('');
    setResult(null);
    startTransition(async () => {
      const next = await importWukongCatalogAction(username, password, selectedItems);
      setResult(next);
      setMessage(
        next.ok
          ? `同步完成：新增 ${next.insertedCount} 题，更新 ${next.updatedCount} 题，跳过 ${next.skippedCount} 题`
          : next.error,
      );
    });
  }

  function toggleAll() {
    setSelected(allSelected ? [] : items.map((item) => item.sourceKey));
  }

  function toggleOne(key: string) {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  return (
    <section className="panel stack">
      {message ? <div className={result?.ok === false ? 'error' : 'notice'}>{message}</div> : null}

      <div className="grid">
        <div className="field">
          <label htmlFor="wukongUsername">
            <KeyRound size={15} aria-hidden="true" />
            授权账号
          </label>
          <input
            id="wukongUsername"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="悟空交规用户名"
          />
        </div>
        <div className="field">
          <label htmlFor="wukongPassword">
            <KeyRound size={15} aria-hidden="true" />
            授权密码
          </label>
          <input
            id="wukongPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="仅本次使用，不保存"
          />
        </div>
      </div>

      <div className="cluster">
        <button className="primary" type="button" disabled={isPending || !username || !password} onClick={onScan}>
          <Search size={17} aria-hidden="true" />
          扫描题库
        </button>
        <button type="button" disabled={isPending || selectedItems.length === 0} onClick={onImport}>
          <DownloadCloud size={17} aria-hidden="true" />
          同步所选
        </button>
        <button type="button" disabled={items.length === 0} onClick={toggleAll}>
          {allSelected ? <CheckSquare size={17} aria-hidden="true" /> : <Square size={17} aria-hidden="true" />}
          {allSelected ? '取消全选' : '全选'}
        </button>
        {isPending ? (
          <span className="badge warn">
            <RefreshCw size={15} aria-hidden="true" />
            处理中
          </span>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="stack">
          <div className="cluster">
            <span className="badge good">扫描 {bankCount} 个题库</span>
            <span className="badge">共 {items.length} 章</span>
            <span className="badge">约 {scannedQuestions} 题</span>
            <span className="badge warn">已选 {selectedBankCount} 个题库 / {selectedItems.length} 章 / 约 {totalQuestions} 题</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>选择</th>
                  <th>题库</th>
                  <th>章节</th>
                  <th>题量</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.sourceKey}>
                    <td>
                      <input
                        aria-label={`选择 ${item.bankName} ${item.title}`}
                        type="checkbox"
                        checked={selected.includes(item.sourceKey)}
                        onChange={() => toggleOne(item.sourceKey)}
                      />
                    </td>
                    <td>{item.bankName}</td>
                    <td>{item.title}</td>
                    <td>{item.questionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {result?.ok ? (
        <div className="grid" aria-label="同步结果">
          <ResultMetric label="题库" value={result.bankCount} />
          <ResultMetric label="章节" value={result.chapterCount} />
          <ResultMetric label="读取题目" value={result.questionCount} />
          <ResultMetric label="新增" value={result.insertedCount} />
          <ResultMetric label="更新" value={result.updatedCount} />
          <ResultMetric label="跳过" value={result.skippedCount} />
          <ResultMetric label="图片失败" value={result.imageFailedCount} />
        </div>
      ) : null}

      {result?.ok && result.errors.length > 0 ? (
        <div className="error">
          {result.errors.slice(0, 6).join('；')}
          {result.errors.length > 6 ? `；另有 ${result.errors.length - 6} 条` : ''}
        </div>
      ) : null}
    </section>
  );
}

function ResultMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card compact-metric">
      <span>{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}
