import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next internals)
     * - sitemap.xml, robots.txt
     * - manifest.webmanifest, sw.js (PWA assets)
     * - imágenes estáticas en /public
     */
    "/((?!_next/static|_next/image|sitemap.xml|robots.txt|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
