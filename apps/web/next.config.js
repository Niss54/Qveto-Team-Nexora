/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL;

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@qveto/shared'],
  async rewrites() {
    if (!backendUrl) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl.replace(/\/+$/, '')}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
