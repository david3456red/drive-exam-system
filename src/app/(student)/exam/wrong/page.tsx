import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function WrongQuestionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">错题本</h1>
      <Card>
        <CardHeader>
          <CardTitle>开发中</CardTitle>
          <CardDescription>P3 阶段实现:错题列表、重做、自动掌握</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
