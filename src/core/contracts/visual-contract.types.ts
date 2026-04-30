export type VisualPlatform = 'web' | 'android' | 'ios';
export type VisualViewport = 'desktop' | 'responsive' | 'mobile';

export interface VisualMask {
  ref?: string;
  rect?: { x: number; y: number; width: number; height: number };
  description?: string;
}

export interface VisualThresholds {
  pixelRatio?: number;
  pixelCount?: number;
  perceptual?: number;
}

export interface VisualTelemetryConfig {
  enabled?: boolean;
  emitOnLoad?: boolean;
  metadata?: Record<string, unknown>;
}

export interface VisualSnapshotTarget {
  platforms?: VisualPlatform[];
  viewports?: VisualViewport[];
  fullPage?: boolean;
}

export interface VisualSnapshot {
  id: string;
  description?: string;
  regionRef: string;
  maskRefs?: string[];
  masks?: VisualMask[];
  platforms?: VisualPlatform[];
  viewports?: VisualViewport[];
  target?: VisualSnapshotTarget;
  thresholds?: VisualThresholds;
  tags?: string[];
  telemetry?: VisualTelemetryConfig;
}

export interface VisualContract {
  feature: string;
  version: string;
  snapshots: VisualSnapshot[];
  defaults?: {
    thresholds?: VisualThresholds;
    platforms?: VisualPlatform[];
    viewports?: VisualViewport[];
  };
}
