// The About page's outside links and install commands: the one place to change them (HC-16).

export const REPO_URL = 'https://github.com/schaferandrew/crucible';
export const REPO_NAME = 'schaferandrew/crucible';
export const CLONE_URL = `${REPO_URL}.git`;
export const VERSIONING_URL = `${REPO_URL}/blob/main/docs/versioning.md`;
/** Used when the suite's catalog names no changelog. */
export const DEFAULT_CHANGELOG_URL = `${REPO_URL}/blob/main/SUITE_CHANGELOG.md`;

export const INSTALL_SNIPPET = `git clone ${CLONE_URL}
cd crucible
uv sync
uv run crucible run`;
