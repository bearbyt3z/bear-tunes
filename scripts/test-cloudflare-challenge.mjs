import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import fetch from 'node-fetch';
import { URL } from 'node:url';

import { fetchPageWithPersistentProfile } from '../dist/tools/web/browser-session.js';

const targetUrl = new URL(
  'https://zerocaptcha.io/captcha-test/cloudflare-interactive-challenge',
);

const expectedPageMarker =
  /Cloudflare WAF interactive challenge test page/i;

const manualTimeoutMs = Number(
  process.env.CF_CHALLENGE_MANUAL_TIMEOUT_MS ?? 90_000,
);

async function probeChallenge() {
  const response = await fetch(targetUrl, {
    redirect: 'manual',
  });

  const observation = {
    status: response.status,
    cfMitigated: response.headers.get('cf-mitigated'),
    contentType: response.headers.get('content-type'),
  };

  response.body?.destroy();

  return {
    ...observation,
    challengeDetected:
      observation.cfMitigated?.trim().toLowerCase() === 'challenge',
  };
}

async function main() {
  if (!Number.isSafeInteger(manualTimeoutMs) || manualTimeoutMs <= 0) {
    throw new Error(
      'CF_CHALLENGE_MANUAL_TIMEOUT_MS must be a positive integer.',
    );
  }

  console.log('Cloudflare integration test');
  console.log(`Target: ${ targetUrl.toString() } `);
  console.log(`Manual verification timeout: ${ manualTimeoutMs } ms`);
  console.log('');

  const probe = await probeChallenge();

  console.log('Initial HTTP probe:');
  console.log(JSON.stringify(probe, null, 2));
  console.log('');

  if (!probe.challengeDetected) {
    console.warn(
      'INCONCLUSIVE: the initial HTTP response did not contain ' +
        'cf-mitigated: challenge. The challenge precondition was not confirmed.',
    );
    process.exitCode = 2;
    return;
  }

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), 'bear-tunes-cloudflare-challenge-'),
  );

  try {
    console.log(
      'Starting fetchPageWithPersistentProfile() with a fresh browser profile.',
    );
    console.log(
      'If a visible browser opens, complete any requested verification manually.',
    );
    console.log('');

    const result = await fetchPageWithPersistentProfile(targetUrl, {
      browserProfileDir: join(temporaryRoot, 'browser-profile'),
      userAgentCacheFile: join(temporaryRoot, 'user-agent-cache.json'),
      manualTimeoutMs,
    });

    const html = result.html ?? '';
    const targetPageLoaded = expectedPageMarker.test(html);
    const headfulAttemptWasRun = result.attempts.some(
      (attempt) => attempt.method === 'browser-headful',
    );

    console.log('Browser result:');
    console.log(
      JSON.stringify(
        {
          success: result.success,
          targetPageLoaded,
          headfulAttemptWasRun,
          attempts: result.attempts.map((attempt) => ({
            method: attempt.method,
            success: attempt.success,
            reason: attempt.reason ?? null,
            status: attempt.status ?? null,
          })),
        },
        null,
        2,
      ),
    );

    if (result.success && !targetPageLoaded) {
      console.error(
        'FAIL: the browser fetch reported success, but the expected ' +
          'ZeroCaptcha page marker was not found.',
      );
      process.exitCode = 1;
      return;
    }

    if (!headfulAttemptWasRun) {
      console.warn(
        'INCONCLUSIVE: the expected page may have loaded in the headless ' +
          'attempt, so waitUntilResolvedPage() was not exercised.',
      );
      process.exitCode = 2;
      return;
    }

    if (!result.success || !targetPageLoaded) {
      console.error(
        'FAIL: the visible-browser attempt did not return the expected page. ' +
          'Check the attempt reasons and whether manual verification completed.',
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      'PASS: the visible-browser attempt returned the expected ZeroCaptcha page.',
    );
  } finally {
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  console.error('Cloudflare integration test failed unexpectedly.');
  console.error(error);
  process.exitCode = 1;
});
