import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida mínima autocontenida para el deploy en EC2.
  output: "standalone",
  // pdfkit (generación del informe PDF) se mantiene externo, no empaquetado.
  // Se usa su build standalone con fuentes embebidas, así que no requiere
  // incluir archivos .afm aparte.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
