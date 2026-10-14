/** Elta3lem Next.js configuration: keep the client-first UI deployable in the managed web environment. */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native / server-only database drivers are loaded by Node at runtime, never
  // bundled (msnodesqlv8 is a native ODBC addon used for Windows authentication).
  serverExternalPackages: ["sharp", "pdf-parse", "mssql", "msnodesqlv8"],
  images: { unoptimized: true },
};

export default nextConfig;
