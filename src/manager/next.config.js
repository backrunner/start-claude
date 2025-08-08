/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  distDir: '.next',
  generateEtags: false,
  compress: false,
}

module.exports = nextConfig
