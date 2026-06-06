import type { ImportRow } from '@/lib/import/types';

export const WUKONG_BASE_URL = 'http://wukongjiaogui.com';
export const WUKONG_SOURCE_SITE = 'wukong';

export type WukongCredentials = {
  username: string;
  password: string;
};

export type WukongSession = {
  cookie: string;
};

export type WukongBankSeed = {
  bankCode: string;
  bankName: string;
  vehicleCode: string;
  subjectCode: string;
  km?: string;
  displayOrder?: number;
};

export type WukongCatalogItem = WukongBankSeed & {
  title: string;
  questionCount: number;
  km: string;
  zj: string;
  zx: string;
  fl: string;
  sourceKey: string;
};

export const DEFAULT_WUKONG_BANKS: readonly WukongBankSeed[] = [
  { bankCode: 'C1_K1', bankName: '小车科目一', vehicleCode: 'C1', subjectCode: 'K1', km: '21', displayOrder: 10 },
  { bankCode: 'C1_K4', bankName: '小车科目四', vehicleCode: 'C1', subjectCode: 'K4', km: '22', displayOrder: 20 },
  { bankCode: 'C1_TS', bankName: '小车脱审', vehicleCode: 'C1', subjectCode: 'TS', km: '210', displayOrder: 30 },
  { bankCode: 'C1_MF', bankName: '小车满分学习', vehicleCode: 'C1', subjectCode: 'MF', km: '25', displayOrder: 40 },
  { bankCode: 'B2_K1', bankName: '客车科目一', vehicleCode: 'B2', subjectCode: 'K1', km: '21', displayOrder: 110 },
  { bankCode: 'B2_K4', bankName: '客车科目四', vehicleCode: 'B2', subjectCode: 'K4', km: '22', displayOrder: 120 },
  { bankCode: 'A2_K1', bankName: '货车科目一', vehicleCode: 'A2', subjectCode: 'K1', km: '21', displayOrder: 210 },
  { bankCode: 'A2_K4', bankName: '货车科目四', vehicleCode: 'A2', subjectCode: 'K4', km: '22', displayOrder: 220 },
  { bankCode: 'M1_K1', bankName: '摩托车科目一', vehicleCode: 'M1', subjectCode: 'K1', km: '35', displayOrder: 310 },
  { bankCode: 'M1_K4', bankName: '摩托车科目四', vehicleCode: 'M1', subjectCode: 'K4', km: '36', displayOrder: 320 },
  { bankCode: 'SL_SL', bankName: '三力测试', vehicleCode: 'SL', subjectCode: 'SL', km: '39', displayOrder: 410 },
] as const;

export type WukongQuestion = {
  Id: number | string;
  Name: string;
  txid?: number | string | null;
  Image?: string | null;
  daxxa?: string | null;
  daxxanr?: string | null;
  daxxb?: string | null;
  daxxbnr?: string | null;
  daxxc?: string | null;
  daxxcnr?: string | null;
  daxxd?: string | null;
  daxxdnr?: string | null;
  daxxe?: string | null;
  daxxenr?: string | null;
  Source?: string | null;
  Content?: string | null;
};

export type WukongQuestionPage = {
  pindex: number;
  userCount: number;
  pagecount: number;
  infoContent: WukongQuestion[];
};

export type MapWukongQuestionOptions = {
  bankCode: string;
  categories: string[];
  sourceKey: string;
};

export async function loginWukong(
  credentials: WukongCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<WukongSession> {
  const response = await fetchImpl(`${WUKONG_BASE_URL}/index.aspx?Action=Action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: new URLSearchParams({
      Name: credentials.username,
      pwd: credentials.password,
      remember_me: 'true',
    }),
    redirect: 'manual',
  });
  const cookie = response.headers
    .get('set-cookie')
    ?.split(/,\s*(?=[^=]+=)/)
    .map((item) => item.split(';')[0])
    .join('; ');
  if (!cookie) {
    throw new Error('WUKONG_LOGIN_FAILED');
  }
  return { cookie };
}

export async function scanWukongCatalog(
  session: WukongSession,
  banks: WukongBankSeed[],
  fetchImpl: typeof fetch = fetch,
): Promise<WukongCatalogItem[]> {
  const out: WukongCatalogItem[] = [];
  for (const bank of banks) {
    const html = await fetchWukongText(`home.aspx?flz=${bank.vehicleCode}&km=${bank.km ?? subjectToKm(bank.subjectCode)}`, session, fetchImpl);
    out.push(...parseWukongCatalogHtml(html, bank));
  }
  return out;
}

export async function fetchWukongQuestions(
  session: WukongSession,
  item: WukongCatalogItem,
  fetchImpl: typeof fetch = fetch,
): Promise<WukongQuestion[]> {
  const first = await fetchWukongQuestionPage(session, item, 1, fetchImpl);
  const out = [...first.infoContent];
  for (let page = 2; page <= first.pagecount; page++) {
    const next = await fetchWukongQuestionPage(session, item, page, fetchImpl);
    out.push(...next.infoContent);
  }
  return out;
}

export function parseWukongCatalogHtml(
  html: string,
  bank: WukongBankSeed,
): WukongCatalogItem[] {
  const out: WukongCatalogItem[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\b[\s\S]*?href=["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkRe)) {
    const href = decodeHtml(match[1] ?? '');
    const text = htmlToText(match[2] ?? '').replace(/\s+/g, '');
    const url = href.match(/stxylx\.aspx\?km=([^&]+)&zj=([^&]+)(?:&zx=([^&]+))?&fl=([^&]+)/i);
    const count = text.match(/^(.+?)（(\d+)题）$/);
    if (!url || !count) continue;

    const km = url[1]!;
    const zj = url[2]!;
    const zx = url[3] ?? '';
    const fl = url[4]!;
    const sourceKey = `${bank.vehicleCode}:${bank.subjectCode}:${km}:${zj}`;
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey);
    out.push({
      ...bank,
      title: count[1]!,
      questionCount: Number(count[2]),
      km,
      zj,
      zx,
      fl,
      sourceKey,
    });
  }
  return out;
}

export function mapWukongQuestionToImportRow(
  question: WukongQuestion,
  options: MapWukongQuestionOptions,
): ImportRow {
  const answer = normalizeWukongAnswer(question.Source);
  const type = detectQuestionType(question, answer);
  const imageName = question.Image?.trim() || undefined;
  const sourceMeta = {
    sourceKey: options.sourceKey,
    ...(imageName ? { imageName } : {}),
  };

  return {
    type,
    content: question.Name.trim(),
    imageUrl: imageName,
    optionA: optionText(question.daxxanr),
    optionB: optionText(question.daxxbnr),
    optionC: optionText(question.daxxcnr),
    optionD: optionText(question.daxxdnr),
    optionE: optionText(question.daxxenr),
    answer,
    categories: options.categories,
    explanation: htmlToText(question.Content ?? '') || undefined,
    tags: [WUKONG_SOURCE_SITE, options.sourceKey],
    bankCode: options.bankCode,
    sourceSite: WUKONG_SOURCE_SITE,
    sourceQuestionId: String(question.Id),
    sourceMeta: JSON.stringify(sourceMeta),
  };
}

export function buildWukongImageUrl(imageName: string): string {
  return `${WUKONG_BASE_URL}/UpLoad/image/${encodeURIComponent(imageName)}`;
}

export async function downloadWukongImage(
  imageName: string,
  session: WukongSession,
  fetchImpl: typeof fetch = fetch,
): Promise<{ name: string; type: string; size: number; bytes: number[] }> {
  const response = await fetchImpl(buildWukongImageUrl(imageName), {
    headers: wukongHeaders(session),
  });
  if (!response.ok) {
    throw new Error(`WUKONG_IMAGE_DOWNLOAD_FAILED:${imageName}`);
  }
  const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
  return {
    name: imageName,
    type: response.headers.get('content-type') ?? mimeFromName(imageName),
    size: bytes.length,
    bytes,
  };
}

async function fetchWukongQuestionPage(
  session: WukongSession,
  item: WukongCatalogItem,
  page: number,
  fetchImpl: typeof fetch,
): Promise<WukongQuestionPage> {
  const response = await fetchImpl(`${WUKONG_BASE_URL}/Handler.aspx?type=pageContent`, {
    method: 'POST',
    headers: {
      ...wukongHeaders(session),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      kmsid: item.km,
      zjsid: item.zj,
      zxsid: item.zx,
      page: String(page),
    }),
  });
  return JSON.parse(await decodeWukongResponse(response)) as WukongQuestionPage;
}

async function fetchWukongText(
  path: string,
  session: WukongSession,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(new URL(path, WUKONG_BASE_URL).toString(), {
    headers: wukongHeaders(session),
  });
  return decodeWukongResponse(response);
}

async function decodeWukongResponse(response: Response): Promise<string> {
  const bytes = Buffer.from(await response.arrayBuffer());
  return new TextDecoder('gb18030').decode(bytes);
}

function wukongHeaders(session: WukongSession): Record<string, string> {
  return {
    Cookie: session.cookie,
    'User-Agent': 'Mozilla/5.0',
  };
}

function detectQuestionType(question: WukongQuestion, answer: string): ImportRow['type'] {
  if (String(question.txid ?? '') === '12' || isJudgePair(question)) return 'JUDGE';
  if (answer.length > 1) return 'MULTI';
  return 'SINGLE';
}

function normalizeWukongAnswer(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim().toUpperCase();
  if (value === '√' || value === 'TRUE') return 'T';
  if (value === '×' || value === 'X' || value === 'FALSE') return 'F';
  return Array.from(new Set(value.replace(/[^A-F]/g, '').split(''))).sort().join('');
}

function isJudgePair(question: WukongQuestion): boolean {
  const a = question.daxxanr?.trim();
  const b = question.daxxbnr?.trim();
  return a === '√' && b === '×';
}

function optionText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n'),
  );
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function subjectToKm(subjectCode: string): string {
  switch (subjectCode) {
    case 'K4':
      return '22';
    case 'MF':
      return '25';
    case 'SL':
      return '39';
    case 'TS':
      return '210';
    default:
      return '21';
  }
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}
