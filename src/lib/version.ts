/**
 * Release stamp (Task 30) — lets ANYONE verify in 2 seconds that a deployment
 * is running the current code: /api/health reports it, and the auth page +
 * landing footer show it as a tiny version tag. If the tag on screen differs
 * from the latest zip version, the browser/CDN is still serving an old build.
 */
export const APP_VERSION = '2026.10.16'
