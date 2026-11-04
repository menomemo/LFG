import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* packages/core ships TypeScript source rather than a build artefact, so
     Next transpiles it like first-party code. One fewer build step to keep in
     sync, and the boundary is enforced by lint rather than by packaging. */
  transpilePackages: ['@lfg/core'],
  typedRoutes: true,
};

export default nextConfig;
