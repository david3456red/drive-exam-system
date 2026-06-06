import { describe, expect, it } from 'vitest';

import {
  buildWukongImageUrl,
  downloadWukongImage,
  fetchWukongQuestions,
  loginWukong,
  mapWukongQuestionToImportRow,
  parseWukongCatalogHtml,
} from '@/lib/import/wukong';

describe('wukong import mapping', () => {
  it('maps a Wukong single-choice question with image and analysis text', () => {
    const row = mapWukongQuestionToImportRow(
      {
        Id: 6922,
        Name: '这一组交通警察手势是什么信号？',
        txid: 11,
        Image: '20231130102751.jpg',
        daxxa: 'A',
        daxxanr: '右转弯信号',
        daxxb: 'B',
        daxxbnr: '减速慢行信号',
        daxxc: 'C',
        daxxcnr: '变道信号',
        daxxd: 'D',
        daxxdnr: '靠边停车信号',
        Source: 'C',
        Content:
          '<p><strong>分析：</strong>变道信号:右臂向前平伸。</p><p><strong>技巧：</strong>看到交警先看脸。</p>',
      },
      {
        bankCode: 'C1_K1',
        categories: ['内部考题1-1'],
        sourceKey: 'C1:21:113',
      },
    );

    expect(row).toEqual({
      type: 'SINGLE',
      content: '这一组交通警察手势是什么信号？',
      imageUrl: '20231130102751.jpg',
      optionA: '右转弯信号',
      optionB: '减速慢行信号',
      optionC: '变道信号',
      optionD: '靠边停车信号',
      answer: 'C',
      categories: ['内部考题1-1'],
      explanation: '分析：变道信号:右臂向前平伸。\n技巧：看到交警先看脸。',
      tags: ['wukong', 'C1:21:113'],
      bankCode: 'C1_K1',
      sourceSite: 'wukong',
      sourceQuestionId: '6922',
      sourceMeta: JSON.stringify({ sourceKey: 'C1:21:113', imageName: '20231130102751.jpg' }),
    });
  });

  it('maps judge and multi answers from Wukong source values', () => {
    const judge = mapWukongQuestionToImportRow(
      {
        Id: 1,
        Name: '判断题',
        txid: 12,
        daxxa: 'A',
        daxxanr: '√',
        daxxb: 'B',
        daxxbnr: '×',
        Source: '√',
        Content: '',
      },
      { bankCode: 'C1_K1', categories: [], sourceKey: 'C1:21:1' },
    );
    const multi = mapWukongQuestionToImportRow(
      {
        Id: 2,
        Name: '多选题',
        txid: 13,
        daxxa: 'A',
        daxxanr: '观察',
        daxxb: 'B',
        daxxbnr: '减速',
        daxxc: 'C',
        daxxcnr: '加速',
        Source: 'AB',
        Content: '',
      },
      { bankCode: 'C1_K1', categories: [], sourceKey: 'C1:21:2' },
    );

    expect(judge.type).toBe('JUDGE');
    expect(judge.answer).toBe('T');
    expect(multi.type).toBe('MULTI');
    expect(multi.answer).toBe('AB');
  });

  it('parses Wukong catalog chapter links and image URLs', () => {
    const catalog = parseWukongCatalogHtml(
      '<a href="stxylx.aspx?km=21&zj=113&fl=hm">内部考题1-1（52题）</a>' +
        '<a href="stxylx.aspx?km=21&zj=113&fl=hm">顺序练习</a>' +
        '<a href="stsjlx.aspx?km=21&zj=113&fl=hm">随机练习</a>',
      { bankCode: 'C1_K1', vehicleCode: 'C1', subjectCode: 'K1', bankName: '小车科目一' },
    );

    expect(catalog).toEqual([
      {
        bankCode: 'C1_K1',
        bankName: '小车科目一',
        vehicleCode: 'C1',
        subjectCode: 'K1',
        title: '内部考题1-1',
        questionCount: 52,
        km: '21',
        zj: '113',
        zx: '',
        fl: 'hm',
        sourceKey: 'C1:K1:21:113',
      },
    ]);
    expect(buildWukongImageUrl('20231130102751.jpg')).toBe(
      'http://wukongjiaogui.com/UpLoad/image/20231130102751.jpg',
    );
  });

  it('logs in, fetches paged questions, and downloads images with a supplied fetch', async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      calls.push(url);
      if (url.includes('Action=Action')) {
        return new Response('<script>ok</script>', {
          headers: {
            'set-cookie':
              'ASP.NET_SessionId=session; path=/; HttpOnly, MyCook=userId=1&username=test; path=/',
          },
        });
      }
      if (url.includes('pageContent')) {
        const body = JSON.stringify({
          pindex: calls.filter((item) => item.includes('pageContent')).length,
          userCount: 2,
          pagecount: 2,
          infoContent: [{ Id: calls.length, Name: '题目', txid: 12, Source: '×' }],
        });
        return new Response(body);
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png' },
      });
    };

    const session = await loginWukong({ username: 'u', password: 'p' }, fetchImpl);
    const questions = await fetchWukongQuestions(
      session,
      {
        bankCode: 'C1_K1',
        bankName: '小车科目一',
        vehicleCode: 'C1',
        subjectCode: 'K1',
        title: '内部考题',
        questionCount: 2,
        km: '21',
        zj: '113',
        zx: '',
        fl: 'hm',
        sourceKey: 'C1:K1:21:113',
      },
      fetchImpl,
    );
    const image = await downloadWukongImage('a.png', session, fetchImpl);

    expect(session.cookie).toBe('ASP.NET_SessionId=session; MyCook=userId=1&username=test');
    expect(questions).toHaveLength(2);
    expect(image).toEqual({ name: 'a.png', type: 'image/png', size: 3, bytes: [1, 2, 3] });
  });
});
