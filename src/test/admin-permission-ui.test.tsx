import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminHomePage from '@/app/admin/page';
import BanksPage from '@/app/admin/banks/page';
import CategoriesPage from '@/app/admin/categories/page';
import QuestionsPage from '@/app/admin/questions/page';
import QuestionDetailPage from '@/app/admin/questions/[id]/page';

const authState = vi.hoisted(() => ({
  user: {
    id: 'teacher-1',
    username: 'teacher',
    name: 'Teacher',
    roleCode: 'teacher',
    permissionCodes: [
      'bank:read',
      'category:read',
      'question:read',
      'stats:all',
      'log:read',
    ],
  },
}));

const prismaMock = vi.hoisted(() => ({
  category: {
    findMany: vi.fn(),
  },
  loginLog: {
    count: vi.fn(),
  },
  question: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  questionBank: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    count: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/server-session', () => ({
  requireUser: vi.fn(() => authState.user),
}));

vi.mock('@/app/admin/actions', () => ({
  createBankAction: '/admin/banks/create',
  createCategoryAction: '/admin/categories/create',
  deleteBankAction: '/admin/banks/delete',
  deleteCategoryAction: '/admin/categories/delete',
  deleteQuestionAction: '/admin/questions/delete',
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

describe('admin permission-aware UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      id: 'teacher-1',
      username: 'teacher',
      name: 'Teacher',
      roleCode: 'teacher',
      permissionCodes: [
        'bank:read',
        'category:read',
        'question:read',
        'stats:all',
        'log:read',
      ],
    };
  });

  it('hides question write and import entry points for read-only teachers', async () => {
    seedDashboardCounts();
    const home = render(await AdminHomePage());

    expect(screen.queryByRole('link', { name: '新建题目' })).not.toBeInTheDocument();

    home.unmount();
    seedQuestionList();
    render(await QuestionsPage({ searchParams: {} }));

    expect(screen.queryByRole('link', { name: '新建题目' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '批量导入' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '悟空同步' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '详情' })).toBeInTheDocument();
  });

  it('hides bank and category mutation controls for read-only teachers', async () => {
    prismaMock.questionBank.findMany.mockResolvedValue([
      {
        id: 'bank-1',
        code: 'C1_K1',
        name: '小车科目一',
        isBuiltin: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        _count: { questions: 0, attempts: 0 },
      },
    ]);
    const banks = render(await BanksPage({ searchParams: {} }));

    expect(screen.queryByRole('heading', { name: '新建或更新题库' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看题目' })).toBeInTheDocument();

    banks.unmount();
    prismaMock.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: '交通标志',
        parentId: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        _count: { children: 0, questions: 0 },
      },
    ]);
    render(await CategoriesPage({ searchParams: {} }));

    expect(screen.queryByRole('heading', { name: '新建分类' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    expect(screen.getByText('交通标志')).toBeInTheDocument();
  });

  it('hides question detail edit and delete controls for read-only teachers', async () => {
    prismaMock.question.findUnique.mockResolvedValue({
      id: 'question-1',
      bankId: 'bank-1',
      type: 'SINGLE',
      content: '驾驶机动车遇到这个标志时应当减速慢行。',
      imageUrl: null,
      options: JSON.stringify([
        { key: 'A', text: '减速慢行' },
        { key: 'B', text: '加速通过' },
      ]),
      answer: 'A',
      explanation: '警告标志前应减速观察。',
      tags: JSON.stringify(['标志']),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      bank: { id: 'bank-1', name: '小车科目一' },
      categories: [],
      _count: { records: 0, wrongs: 0 },
    });

    render(await QuestionDetailPage({ params: { id: 'question-1' }, searchParams: {} }));

    expect(screen.queryByRole('link', { name: '编辑题目' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除题目' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看解析' })).toBeInTheDocument();
  });
});

function seedDashboardCounts(): void {
  prismaMock.questionBank.count.mockResolvedValue(17);
  prismaMock.question.count.mockResolvedValue(22691);
  prismaMock.user.count.mockResolvedValue(2);
  prismaMock.loginLog.count.mockResolvedValue(15);
}

function seedQuestionList(): void {
  prismaMock.questionBank.findMany.mockResolvedValue([
    { id: 'bank-1', name: '小车科目一', createdAt: new Date('2026-01-01T00:00:00Z') },
  ]);
  prismaMock.question.findMany.mockResolvedValue([
    {
      id: 'question-1',
      content: '驾驶机动车遇到这个标志时应当减速慢行。',
      type: 'SINGLE',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      bank: { id: 'bank-1', name: '小车科目一' },
      categories: [],
    },
  ]);
  prismaMock.question.count.mockResolvedValue(1);
}
