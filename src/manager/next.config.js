/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  distDir: '.next',
  generateEtags: false,
  compress: false,
  outputFileTracingRoot: __dirname,
  trailingSlash: false,
}

module.exports = nextConfig
