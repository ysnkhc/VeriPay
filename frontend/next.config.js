/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // BACKEND_ORIGIN is the internal backend URL for server-side proxying.
    // Set this in Vercel env vars to your backend deployment URL.
    // Locally, this is not needed (frontend talks directly to backend via NEXT_PUBLIC_BACKEND_URL).
    const backendOrigin = process.env.BACKEND_ORIGIN;
    if (backendOrigin) {
      return [
        {
          source: "/api/:path*",
          destination: `${backendOrigin}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
