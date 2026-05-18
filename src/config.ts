import * as path from 'node:path';

export const CACHE_DIR = path.join(process.cwd(), '.cache');
export const BROWSER_PROFILE_DIR = path.join(CACHE_DIR, 'playwright-profile');
export const USER_AGENT_CACHE_FILE = path.join(CACHE_DIR, 'user-agent.json');
