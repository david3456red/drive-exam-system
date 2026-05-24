import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Read-only view of categories *used by* this bank's questions.
 *
 * Categories are global (see /admin/categories), so no CRUD here.
 * This block just shows the admin which tags are currently in play
 * for this bank, with a quick link to manage them globally.
 */
export function CategorySection({
  categories,
}: {
  categories: { id: string; name: string; questionCount: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between gap-2">
          <span>本题库使用的分类</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/categories">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> 全局分类管理
            </Link>
          </Button>
        </CardTitle>
        <CardDescription>
          下面列出至少有一道本题库题目挂载的分类(全局共享)。新增/重命名/删除请去全局页。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            本题库的题目还没有挂任何分类。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Badge key={c.id} variant="muted" className="gap-1.5">
                <span>{c.name}</span>
                <span className="opacity-60 font-mono">·{c.questionCount}</span>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
