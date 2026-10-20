/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async redirects() {
    return [
      {
        source: "/junction",
        destination: "/junctions",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
