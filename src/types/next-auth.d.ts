import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      name: string | null;
      roleName: string;
      permissions: string[];
      mustChangePassword: boolean;
    };
  }

  interface User {
    id: string;
    username: string;
    name?: string | null;
    roleName: string;
    permissions: string[];
    mustChangePassword: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    username?: string;
    name?: string | null;
    roleName?: string;
    permissions?: string[];
    mustChangePassword?: boolean;
  }
}
