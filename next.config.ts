import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida mínima autocontenida para empaquetar en Docker (App Runner).
  output: "standalone",
};

export default nextConfig;
