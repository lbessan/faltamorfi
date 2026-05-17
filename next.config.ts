import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

// Serwist agrega webpack config y Turbopack (default en Next 16 dev) se queja.
// Aplicamos withSerwist solo en producción; el build usa --webpack para
// generar el service worker.
export default isProd ? withSerwist(nextConfig) : nextConfig;
