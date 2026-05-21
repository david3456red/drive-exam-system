import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function RootPage() {
  const session = await auth();
  if (session?.user) {
    if (session.user.mustChangePassword) redirect('/change-password');
    redirect('/dashboard');
  }
  redirect('/login');
}
