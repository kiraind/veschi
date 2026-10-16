// Computes the next release version from the latest release tag.
// Used by .github/workflows/release.yml: `node scripts/release-version.mjs <bump> [last-tag]`
// prints the new version (without the `v`); with no last tag the first release is 1.0.0.
import { pathToFileURL } from 'node:url';

export const BUMPS = ['patch', 'minor', 'major'];
export const FIRST_VERSION = '1.0.0';

/**
 * @param {string | undefined} lastTag release tag such as `v1.2.3`, or nothing before the first release
 * @param {string} bump one of BUMPS
 * @returns {string}
 */
export function nextVersion(lastTag, bump) {
	if (!BUMPS.includes(bump))
		throw new Error(`Unknown bump "${bump}", expected ${BUMPS.join(', ')}`);
	if (!lastTag) return FIRST_VERSION;
	const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(lastTag);
	if (!match) throw new Error(`Release tag "${lastTag}" is not vMAJOR.MINOR.PATCH`);
	const [major, minor, patch] = match.slice(1).map(Number);
	if (bump === 'major') return `${major + 1}.0.0`;
	if (bump === 'minor') return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const [bump, lastTag] = process.argv.slice(2);
	console.log(nextVersion(lastTag || undefined, bump));
}
