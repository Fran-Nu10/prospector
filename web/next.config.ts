import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los templates y los JSON de prospectos viven fuera de web/, en la raíz
  // del repo: el tracing y la compilación tienen que poder salir de web/.
  outputFileTracingRoot: path.join(__dirname, ".."),
  experimental: {
    externalDir: true,
  },
  // Los archivos de templates/ resuelven paquetes contra web/node_modules
  // (node walkea hacia arriba desde templates/ y no los encontraría).
  webpack: (config) => {
    config.resolve.modules = [
      ...(config.resolve.modules ?? []),
      path.join(__dirname, "node_modules"),
    ];
    return config;
  },
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
