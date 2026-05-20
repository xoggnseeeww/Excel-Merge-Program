/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Web Worker 번들링 + @/ alias 해석
  webpack: (config, { isServer }) => {
    // Worker 컨텍스트에서도 @/ alias 해석되도록 보장
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src'),
    };
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

module.exports = nextConfig;
