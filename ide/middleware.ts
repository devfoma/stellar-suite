import { NextRequest, NextResponse } from "next/server";

const CORS_ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

const SENSITIVE_API_PATHS = ["/api/clippy", "/api/run-test", "/api/run-hook", "/api/format", "/api/audit"];

function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_API_PATHS.some((p) => pathname.startsWith(p));
}

function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return origin;
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!isSensitivePath(pathname)) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");

    if (!origin) {
      return new NextResponse(null, { status: 403 });
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (CORS_ALLOWED_ORIGINS.length === 0 || !CORS_ALLOWED_ORIGINS.includes(normalizedOrigin)) {
      return new NextResponse(null, { status: 403 });
    }

    const response = new NextResponse(null, { status: 204 });

    response.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");

    return response;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return NextResponse.json(
      { error: "Access denied", reason: "CORS policy violation" },
      { status: 403 }
    );
  }

  const normalizedOrigin = normalizeOrigin(origin);

  if (CORS_ALLOWED_ORIGINS.length === 0 || !CORS_ALLOWED_ORIGINS.includes(normalizedOrigin)) {
    return NextResponse.json(
      { error: "Access denied", reason: "CORS policy violation" },
      { status: 403 }
    );
  }

  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", normalizedOrigin);

  return response;
}

export const config = {
  matcher: ["/api/clippy/:path*", "/api/run-test/:path*", "/api/run-hook/:path*", "/api/format/:path*", "/api/audit/:path*"],
};