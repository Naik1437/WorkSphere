import 'express';
import 'express-serve-static-core';

export interface RequestIdentity {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
  exp?: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    identity?: RequestIdentity;
  }
}

declare module 'express' {
  interface Request {
    identity?: RequestIdentity;
  }
}
