/** @type {import('next').NextConfig} */
const nextConfig = {
  // 100% CSR — 서버 기능 없음
  output: 'standalone',
  // Web Worker 번들링 허용
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

module.exports = nextConfig;
