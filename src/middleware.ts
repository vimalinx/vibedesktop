import { NextResponse, type NextRequest } from "next/server";
import { isAllowedHost } from "@/lib/public-origin";

/** Every request, page or API, must address the app by a loopback name or the configured public origin. */
export function middleware(request: NextRequest) {
  if (isAllowedHost(request.headers.get("host"))) return NextResponse.next();
  return NextResponse.json(
    { error: { code: "host_not_allowed", message: "This host name is not allowed. Open Vibe Desktop at localhost or 127.0.0.1, or set VIBE_PUBLIC_ORIGIN." } },
    { status: 421 }
  );
}

export const config = {
  runtime: "nodejs",
  matcher: "/:path*"
};
