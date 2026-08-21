import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['html-pdf-node', 'inline-css', 'batch', 'emitter', 'pdf2pic', 'tesseract.js'],
  },
  webpack(config) {
    config.resolve.alias['@/lib'] = path.resolve(__dirname, 'lib');
    return config;
  },
};

export default nextConfig;
