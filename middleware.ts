import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect API routes
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // In local dev, do not enforce
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const required = process.env.APP_ADMIN_KEY || "";
  if (!required) return NextResponse.json({ error: "Server missing APP_ADMIN_KEY" }, { status: 500 });

  const provided = req.headers.get("x-app-key") || "";
  if (provided !== required) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"]
};
