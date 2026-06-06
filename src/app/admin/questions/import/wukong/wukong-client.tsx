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
      setMessage(`扫描完成：${next.items.length} 个章节`);
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
          ? `导入完成：新增 ${next.insertedCount} 题，跳过 ${next.skippedCount} 题`
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
          导入所选
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
            <span className="badge good">已选 {selectedItems.length} 章</span>
            <span className="badge">约 {totalQuestions} 题</span>
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

      {result?.ok && result.errors.length > 0 ? (
        <div className="error">
          {result.errors.slice(0, 6).join('；')}
          {result.errors.length > 6 ? `；另有 ${result.errors.length - 6} 条` : ''}
        </div>
      ) : null}
    </section>
  );
}
