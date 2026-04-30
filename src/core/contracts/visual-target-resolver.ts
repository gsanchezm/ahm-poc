import { hasLocatorKey, resolveLocator } from '../../kernel/locator-resolver';
import { VisualSnapshot } from './visual-contract.types';

export interface ResolvedVisualTarget {
  snapshotId: string;
  resolvedRegion: string | null;
  resolvedRegionStrategy: 'web' | 'android' | 'ios' | 'fallback' | 'unresolved';
  resolvedMasks: string[];
  unresolvedRefs: string[];
}

function detectStrategy(): ResolvedVisualTarget['resolvedRegionStrategy'] {
  const platform = (process.env.PLATFORM || 'web').toLowerCase();
  if (platform === 'web' || platform === 'android' || platform === 'ios') return platform;
  return 'fallback';
}

export function resolveVisualTarget(snapshot: VisualSnapshot, opts?: { strict?: boolean }): ResolvedVisualTarget {
  const strict = opts?.strict !== false;
  const unresolved: string[] = [];
  const out: ResolvedVisualTarget = {
    snapshotId: snapshot.id,
    resolvedRegion: null,
    resolvedRegionStrategy: 'unresolved',
    resolvedMasks: [],
    unresolvedRefs: unresolved,
  };

  if (!hasLocatorKey(snapshot.regionRef)) {
    unresolved.push(snapshot.regionRef);
  } else {
    try {
      out.resolvedRegion = resolveLocator(snapshot.regionRef);
      out.resolvedRegionStrategy = detectStrategy();
    } catch (e) {
      unresolved.push(snapshot.regionRef);
    }
  }

  for (const ref of snapshot.maskRefs ?? []) {
    if (!hasLocatorKey(ref)) {
      unresolved.push(ref);
      continue;
    }
    try {
      out.resolvedMasks.push(resolveLocator(ref));
    } catch {
      unresolved.push(ref);
    }
  }

  if (strict && unresolved.length > 0) {
    throw new Error(
      `[visual-target-resolver] snapshot '${snapshot.id}' has unresolved refs: ${unresolved.join(', ')}`,
    );
  }
  return out;
}
