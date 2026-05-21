import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function ExamPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">答题练习</h1>
      <Card>
        <CardHeader>
          <CardTitle>开发中</CardTitle>
          <CardDescription>P3 阶段实现:顺序 / 随机 / 章节 / 模拟考试</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          骨架已就绪,等题库录入后开放此功能。
        </CardContent>
      </Card>
    </div>
  );
}
