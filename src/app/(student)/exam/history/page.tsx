import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function ExamHistoryPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">答题记录</h1>
      <Card>
        <CardHeader>
          <CardTitle>开发中</CardTitle>
          <CardDescription>P3 阶段实现:历次答题记录、得分、用时</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
