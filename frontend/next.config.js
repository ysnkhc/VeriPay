/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // On Vercel Services, backend is at /_/backend.
    // Rewrite /api/* to /_/backend/api/* so frontend code can call /api/* as usual.
    return [
      {
        source: "/api/:path*",
        destination: "/_/backend/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
