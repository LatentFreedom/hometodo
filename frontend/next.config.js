/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export. There is no Next.js server and no Next.js API route: every API call
  // goes to the Cloudflare Worker in worker/.
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
