/**
 * RTT Analysis Service
 *
 * Extracted RTT analysis logic for better separation of concerns.
 * Handles median calculation, threshold computation, and state determination
 * based on RTT measurements.
 *
 * Based on research methodology from "Careless Whisper" paper.
 */

import { config, getCurrentEditableConfig, EditableConfig } from '../config';

export interface StateAnalysisResult {
    median: number;
    threshold: number;
    state: string;
    movingAvg: number;
    calibrationProgress?: {
        current: number;
        total: number;
        warmupRemaining?: number;
        warmupTotal?: number;
    };
}

/**
 * RTT Analyzer service for processing RTT measurements
 */
export class RttAnalyzer {
    private globalRttHistory: number[] = [];
    private cachedMedian: number = 0;
    private cachedThreshold: number = 0;
    private lastCalculationSize: number = 0;
    private readonly RECALCULATION_INTERVAL = 10; // Recalculate every 10 measurements

    // Per-instance configuration override
    private configOverride: Partial<EditableConfig> = {};

    // Warmup tracking
    private warmupCount: number = 0;
    private totalProbeCount: number = 0;

    // Track minimum RTT seen (for outlier detection)
    private minRttSeen: number = Infinity;

    // State confirmation (anti-flickering)
    private confirmedState: string = 'Calibrating...';  // Current confirmed state
    private pendingState: string | null = null;         // State waiting for confirmation
    private confirmationCount: number = 0;              // Consecutive calculations in pending state

    // Track offline→online transition for calibration reset
    private previousState: string = 'Calibrating...';
    private consecutiveOfflineCount: number = 0;
    private readonly OFFLINE_PROBES_BEFORE_RESET = 15;  // 15 probes = 30 seconds

    // Callbacks for logging warmup/calibration events
    public onWarmupStart?: () => void;
    public onWarmupEnd?: () => void;
    public onCalibrationStart?: () => void;
    private warmupStarted: boolean = false;
    private calibrationStarted: boolean = false;

    /**
     * Set per-instance configuration override
     */
    setConfigOverride(config: Partial<EditableConfig>) {
        this.configOverride = config;
        // Invalidate cache when config changes (e.g. threshold multiplier)
        this.cachedThreshold = 0;
    }

    /**
     * Get effective configuration (global defaults + overrides)
     */
    private getEffectiveConfig(): EditableConfig {
        return {
            ...getCurrentEditableConfig(),
            ...this.configOverride
        };
    }

    /**
     * Add RTT measurement to global history
     * @param rtt Round-trip time in milliseconds
     */
    addMeasurement(rtt: number): void {
        const editableConfig = this.getEffectiveConfig();
        this.totalProbeCount++;

        // Warmup: skip first N probes if enabled
        if (editableConfig.warmupEnabled && this.warmupCount < editableConfig.warmupProbeCount) {
            // Trigger warmup start callback on first warmup probe
            if (!this.warmupStarted) {
                this.warmupStarted = true;
                this.onWarmupStart?.();
            }

            this.warmupCount++;
            console.log(`[RTT ANALYZER] Warmup probe ${this.warmupCount}/${editableConfig.warmupProbeCount} - skipping`);

            // Trigger warmup end callback when warmup completes
            if (this.warmupCount >= editableConfig.warmupProbeCount) {
                this.onWarmupEnd?.();
            }
            return;
        }

        // Trigger calibration start callback on first calibration probe
        if (!this.calibrationStarted) {
            this.calibrationStarted = true;
            this.onCalibrationStart?.();
        }

        // Outlier filter ONLY during calibration phase
        // Uses min value comparison: reject if rtt > 5× minimum seen
        const calibrationRequired = editableConfig.calibrationProbeCount;
        const isCalibrating = this.globalRttHistory.length < calibrationRequired;

        if (editableConfig.outlierFilterEnabled && isCalibrating && this.globalRttHistory.length >= 1) {
            // Update min if this is a valid low value
            if (rtt > 0 && rtt < this.minRttSeen) {
                this.minRttSeen = rtt;
            }

            // Filter spike: rtt > 5× minimum seen
            if (this.minRttSeen < Infinity && rtt > this.minRttSeen * 5) {
                console.log(`[RTT ANALYZER] Outlier filtered during calibration: ${rtt}ms > 5x min (${this.minRttSeen}ms)`);
                return;
            }
        }

        // Add all valid RTTs to history
        if (rtt > 0 && rtt <= 60000) { // Allow up to 60 seconds
            this.globalRttHistory.push(rtt);

            // Track minimum RTT
            if (rtt < this.minRttSeen) {
                this.minRttSeen = rtt;
            }

            if (this.globalRttHistory.length > config.globalHistoryLimit) {
                this.globalRttHistory.shift();
            }
        }
    }

    /**
     * Calculate global median RTT
     * Recalculates if cache is stale or if forced
     * @param forceRecalculate Force recalculation even if cache exists
     * @returns Median RTT value
     */
    calculateMedian(forceRecalculate: boolean = false): number {
        if (this.globalRttHistory.length < config.recentRttCount) return 0;

        // Check if cache is stale (new measurements added since last calculation)
        const isCacheStale = this.globalRttHistory.length !== this.lastCalculationSize;

        // Use cached value only if cache is valid and not forced to recalculate
        if (!forceRecalculate && !isCacheStale && this.cachedMedian > 0 && this.lastCalculationSize > 0) {
            return this.cachedMedian;
        }

        // Recalculate median
        const sorted = [...this.globalRttHistory].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

        // Update cache
        this.cachedMedian = median;
        this.cachedThreshold = median * this.getEffectiveConfig().thresholdMultiplier;
        this.lastCalculationSize = this.globalRttHistory.length;

        return median;
    }

    /**
     * Calculate threshold based on median
     * Recalculates if cache is stale or if forced
     * @param forceRecalculate Force recalculation even if cache exists
     * @returns Threshold value (percentage of median)
     */
    calculateThreshold(forceRecalculate: boolean = false): number {
        const median = this.calculateMedian(forceRecalculate);

        // Check if cache is stale
        const isCacheStale = this.globalRttHistory.length !== this.lastCalculationSize;

        // Use cached threshold only if cache is valid and not forced to recalculate
        if (!forceRecalculate && !isCacheStale && this.cachedThreshold > 0 && this.lastCalculationSize > 0) {
            return this.cachedThreshold;
        }

        // Recalculate threshold
        const threshold = median * this.getEffectiveConfig().thresholdMultiplier;
        this.cachedThreshold = threshold;

        return threshold;
    }

    /**
     * Determine device state based on RTT analysis
     * @param recentRtts Array of recent RTT measurements (typically last 3)
     * @param currentRtt Current RTT measurement
     * @param currentState Current device state
     * @returns Analysis result with state and metrics
     */
    determineState(recentRtts: number[], currentRtt: number, currentState: string): StateAnalysisResult {
        // If marked OFFLINE due to high RTT, keep that state
        if (currentState === 'OFFLINE' && currentRtt > config.offlineThreshold) {
            return {
                median: this.calculateMedian(),
                threshold: this.calculateThreshold(),
                state: 'OFFLINE',
                movingAvg: currentRtt
            };
        }

        // Calculate device's moving average
        const movingAvg = recentRtts.length > 0
            ? recentRtts.reduce((a, b) => a + b, 0) / recentRtts.length
            : currentRtt;

        // Calculate global median and threshold
        // Always ensure we have valid calculations when determining state
        const historySize = this.globalRttHistory.length;

        // Recalculate if we have enough data and cache is stale or needs refresh
        const shouldRecalculate = historySize >= config.recentRttCount && (
            historySize - this.lastCalculationSize >= this.RECALCULATION_INTERVAL ||
            this.lastCalculationSize === 0 ||
            this.cachedMedian === 0
        );

        let median = this.cachedMedian;
        let threshold = this.cachedThreshold;
        const effectiveConfig = this.getEffectiveConfig(); // Get merged config

        if (shouldRecalculate && historySize >= config.recentRttCount) {
            // Recalculate median and threshold
            const sorted = [...this.globalRttHistory].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            threshold = median * effectiveConfig.thresholdMultiplier;

            // Update cache
            this.cachedMedian = median;
            this.cachedThreshold = threshold;
            this.lastCalculationSize = historySize;
        } else if (historySize >= config.recentRttCount && (median === 0 || threshold === 0)) {
            // Fallback: if cache is empty but we have data, calculate now
            const sorted = [...this.globalRttHistory].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            threshold = median * effectiveConfig.thresholdMultiplier;

            // Update cache
            this.cachedMedian = median;
            this.cachedThreshold = threshold;
            this.lastCalculationSize = historySize;
        }

        const editableConfig = effectiveConfig;
        const calibrationRequired = editableConfig.calibrationProbeCount;
        const warmupRemaining = editableConfig.warmupEnabled
            ? Math.max(0, editableConfig.warmupProbeCount - this.warmupCount)
            : 0;

        let rawState: string;  // State before confirmation
        let calibrationProgress: { current: number; total: number; warmupRemaining?: number; warmupTotal?: number } | undefined;

        if (historySize >= calibrationRequired) {
            // State determination: compare moving average to threshold
            // OLD LOGIC: Moving average below threshold = Active (device responding quickly)
            // NEW LOGIC (Dual Threshold): To be "Standby", RTT must be > threshold AND > standbyThreshold (default 5000ms)
            // This prevents false positives on fast networks where "3x median" is still very fast (e.g. median 20ms -> 3x = 60ms).
            const isSlow = movingAvg > threshold;
            const isAbsolutelySlow = movingAvg > editableConfig.standbyThreshold;

            rawState = (isSlow && isAbsolutelySlow) ? 'Standby' : 'Online';
        } else {
            // Not enough data points yet - still calibrating
            rawState = 'Calibrating...';
            calibrationProgress = {
                current: historySize,
                total: calibrationRequired,
                warmupRemaining: warmupRemaining > 0 ? warmupRemaining : undefined,
                warmupTotal: editableConfig.warmupEnabled ? editableConfig.warmupProbeCount : undefined
            };
        }

        // State Confirmation (Anti-flickering)
        // Only apply to Online/Standby states (not during calibration)
        let confirmedState = rawState;

        if (editableConfig.stateConfirmationEnabled && rawState !== 'Calibrating...') {
            const requiredConfirmations = editableConfig.stateConfirmationCount;

            // CRITICAL: If we just exited calibration, immediately accept the new state
            // Don't require confirmations for the initial transition from Calibrating -> Online/Standby
            if (this.confirmedState === 'Calibrating...') {
                this.confirmedState = rawState;
                this.pendingState = null;
                this.confirmationCount = 0;
                confirmedState = rawState;
                console.log(`[RTT ANALYZER] Calibration complete! Initial state: ${rawState}`);
            } else if (rawState === this.confirmedState) {
                // Same as confirmed state - reset any pending transition
                this.pendingState = null;
                this.confirmationCount = 0;
                confirmedState = this.confirmedState;
            } else if (rawState === this.pendingState) {
                // Same as pending state - increment confirmation count
                this.confirmationCount++;

                if (this.confirmationCount >= requiredConfirmations) {
                    // Confirmed! Transition to new state
                    this.confirmedState = rawState;
                    this.pendingState = null;
                    this.confirmationCount = 0;
                    confirmedState = rawState;
                    console.log(`[RTT ANALYZER] State confirmed: ${rawState} (after ${requiredConfirmations} consecutive triggers)`);
                } else {
                    // Still waiting for more confirmations
                    confirmedState = this.confirmedState;
                }
            } else {
                // New pending state - start counting
                this.pendingState = rawState;
                this.confirmationCount = 1;
                confirmedState = this.confirmedState;  // Keep old state until confirmed
            }
        } else if (rawState === 'Calibrating...') {
            // During calibration, just follow raw state
            this.confirmedState = rawState;
            confirmedState = rawState;
        } else {
            // State confirmation disabled - use raw state directly
            this.confirmedState = rawState;
            confirmedState = rawState;
        }

        // Ensure we have valid values (should not be 0 if we have enough data)
        if (historySize >= calibrationRequired && (median === 0 || threshold === 0)) {
            console.warn(`[RTT ANALYZER] Warning: Invalid median (${median}) or threshold (${threshold}) with ${historySize} measurements`);
        }

        return {
            median,
            threshold,
            state: confirmedState,
            movingAvg,
            calibrationProgress
        };
    }

    /**
     * Get current global history size
     * @returns Number of measurements in history
     */
    getHistorySize(): number {
        return this.globalRttHistory.length;
    }

    /**
     * Get cached median value
     * @returns Cached median or 0 if not calculated
     */
    getCachedMedian(): number {
        return this.cachedMedian;
    }

    /**
     * Get cached threshold value
     * @returns Cached threshold or 0 if not calculated
     */
    getCachedThreshold(): number {
        return this.cachedThreshold;
    }

    /**
     * Reset calibration data (warmup + RTT history) without full reset
     * Called when transitioning from offline to online to get fresh baseline
     */
    resetCalibration(): void {
        console.log('[RTT ANALYZER] Resetting calibration due to offline→online transition');
        this.globalRttHistory = [];
        this.cachedMedian = 0;
        this.cachedThreshold = 0;
        this.lastCalculationSize = 0;
        this.warmupCount = 0;
        this.totalProbeCount = 0;
        this.minRttSeen = Infinity;
        // Reset to calibrating state
        this.confirmedState = 'Calibrating...';
        this.pendingState = null;
        this.confirmationCount = 0;
        // Reset warmup/calibration tracking flags
        this.warmupStarted = false;
        this.calibrationStarted = false;
        // Keep previousState to track the transition that caused reset
    }

    /**
     * Check and handle offline→online transition based on RTT values
     * - During calibration: ANY OFFLINE→Online resets (want clean baseline)
     * - After calibration: Only 15+ consecutive OFFLINE→Online resets
     * @param currentRtt Current RTT measurement in ms
     * @returns true if calibration was reset
     */
    checkAndResetOnTransition(currentRtt: number): boolean {
        const editableConfig = getCurrentEditableConfig();
        const isStillCalibrating = this.globalRttHistory.length < editableConfig.calibrationProbeCount;

        // Determine if current probe indicates OFFLINE (high RTT) or ONLINE (low RTT)
        // Use a threshold: RTT > 5000ms is considered "offline behavior"
        const OFFLINE_RTT_THRESHOLD = 5000;
        const isCurrentlyOffline = currentRtt > OFFLINE_RTT_THRESHOLD;

        // Track consecutive OFFLINE probes (high RTT)
        if (isCurrentlyOffline) {
            this.consecutiveOfflineCount++;
            return false;
        }

        // Not OFFLINE (RTT is low = online) - check if we should reset
        const hadOfflineProbes = this.consecutiveOfflineCount > 0;

        if (hadOfflineProbes) {
            // During calibration: reset on ANY OFFLINE→Online (want clean baseline)
            if (isStillCalibrating) {
                console.log(`[RTT ANALYZER] During calibration: OFFLINE (${this.consecutiveOfflineCount} probes) → Online (RTT=${currentRtt}ms), resetting for clean baseline`);
                this.consecutiveOfflineCount = 0;
                this.resetCalibration();
                return true;
            }

            // After calibration: only reset if 15+ consecutive OFFLINE
            if (this.consecutiveOfflineCount >= this.OFFLINE_PROBES_BEFORE_RESET) {
                console.log(`[RTT ANALYZER] Prolonged OFFLINE (${this.consecutiveOfflineCount} probes) → Online (RTT=${currentRtt}ms), resetting calibration`);
                this.consecutiveOfflineCount = 0;
                this.resetCalibration();
                return true;
            }
        }

        // Reset counter when online
        this.consecutiveOfflineCount = 0;

        return false;
    }

    /**
     * Clear all cached values and history
     */
    reset(): void {
        this.globalRttHistory = [];
        this.cachedMedian = 0;
        this.cachedThreshold = 0;
        this.lastCalculationSize = 0;
        this.warmupCount = 0;
        this.totalProbeCount = 0;
        this.minRttSeen = Infinity;
        // Reset state confirmation
        this.confirmedState = 'Calibrating...';
        this.pendingState = null;
        this.confirmationCount = 0;
        this.previousState = 'Calibrating...';
        this.consecutiveOfflineCount = 0;
        // Reset warmup/calibration tracking flags
        this.warmupStarted = false;
        this.calibrationStarted = false;
    }
}
