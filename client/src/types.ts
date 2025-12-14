export interface EditableConfig {
    probeIntervalDefault: number;
    probeIntervalBusy?: number;
    deleteProbeIntervalDefault?: number;
    deleteProbeIntervalBusy?: number;
    offlineThreshold: number;
    standbyThreshold: number;
    standbyWindow?: number;
    thresholdMultiplier: number;
    warmupEnabled: boolean;
    warmupProbeCount: number;
    calibrationProbeCount: number;
    outlierFilterEnabled: boolean;
    recentRttCount?: number;
    globalHistoryLimit?: number;
    corsOrigin?: string;
    defaultProbeMethod: 'reaction' | 'delete';
    stateConfirmationEnabled?: boolean;
    stateConfirmationCount?: number;
    minRttFilter?: number;
}
