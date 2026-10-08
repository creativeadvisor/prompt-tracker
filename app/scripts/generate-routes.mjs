// Generate src/routeTree.gen.ts before tsc + vite build.
//
// The TanStack Router Vite plugin generates this file on-the-fly during
// `vite dev` / `vite build`, but it's gitignored and `tsc -b` runs before
// `vite build` in our `npm run build` chain — so CI builds (Vercel) fail
// type-checking against a non-existent module. Running this script first
// drops the file in place so tsc sees it.

import { Generator, getConfig } from '@tanstack/router-generator'

const root = process.cwd()
const config = getConfig({}, root)
const generator = new Generator({ config, root })

await generator.run()

console.log('routeTree.gen.ts generated')
