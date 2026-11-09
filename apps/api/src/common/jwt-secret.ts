/**
 * The key that signs sign-in tokens and seals undo copies. A deployed API never falls back to a value in the
 * repository: without `JWT_SECRET` anyone could sign a token as any user, so it refuses to start instead.
 * Local runs and the test scripts keep the old fallback.
 */
export const DEV_JWT_SECRET = 'dev-secret';

/** Deployed: NODE_ENV=production, or any Vercel environment (production and preview). */
export const isDeployed = (env: NodeJS.ProcessEnv = process.env) => env.NODE_ENV === 'production' || !!env.VERCEL;

export function jwtSecretProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.JWT_SECRET?.trim();
  if (!isDeployed(env)) return null;
  if (!secret || secret === DEV_JWT_SECRET) {
    return 'JWT_SECRET is not set. Set it to a long random string in the API project for every environment (production and preview); the API will not start without it.';
  }
  return null;
}

export function jwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const problem = jwtSecretProblem(env);
  if (problem) throw new Error(problem);
  return env.JWT_SECRET?.trim() || DEV_JWT_SECRET;
}
