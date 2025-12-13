/**
 * Configuration file for Device Activity Tracker
 *
 * Contains all configurable constants and values used throughout the application.
 * Values can be overridden via environment variables or custom config JSON.
 *
 * Based on research methodology from:
 * "Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users on Mobile Instant Messengers"
 * by Gegenhuber et al., University of Vienna & SBA Research
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProbeIntervalConfig {
    min: number;    // Minimum probe interval in ms
    max: number;    // Maximum probe interval in ms
    default: number; // Default probe interval in ms
}

export interface Config {
    probeInterval: ProbeIntervalConfig;
    offlineThreshold: number;      // RTT above this indicates offline (ms)
    thresholdMultiplier: number;   // Multiplier for median RTT to calculate threshold
    globalHistoryLimit: number;    // Max measurements stored globally
    deviceHistoryLimit: number;    // Max measurements stored per device
    recentRttCount: number;        // Number of recent RTTs for moving average
    probeTimeout: number;          // Timeout for probe ACK (ms)
    serverPort: number;
    corsOrigin: string;
    clientApiUrl: string;
}

// Subset of config that can be modified via admin panel
export interface EditableConfig {
    probeIntervalDefault: number;
    offlineThreshold: number;
    thresholdMultiplier: number;
    // Calibration settings
    calibrationProbeCount: number;  // Number of probes for calibration (default 5)
    warmupEnabled: boolean;         // Skip first N probes
    warmupProbeCount: number;       // Number of probes to skip (default 2)
    outlierFilterEnabled: boolean;  // Filter outliers > 3x median during calibration
    // Probe method settings
    defaultProbeMethod: 'reaction' | 'delete';  // Default method for new sessions
    // State confirmation (anti-flickering)
    stateConfirmationEnabled: boolean;  // Require consecutive confirmations before state change
    stateConfirmationCount: number;     // Number of consecutive same-state calculations required (default 3)
}

// Path to custom config file
const CUSTOM_CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

/**
 * Default configuration values (hardcoded, never changes)
 *
 * Probe intervals based on research paper:
 * - 2 seconds: Optimal for MediaTek-based devices (Xiaomi Poco M3 Pro 5G)
 * - 20 seconds: Used for some measurement scenarios
 * - 1 minute (60000ms): Required for Samsung Galaxy S23
 */
const defaultConfig: Config = {
    probeInterval: {
        min: 50,       // 50ms - minimum for high-frequency tracking
        max: 60000,    // 1 minute - maximum per paper (Samsung Galaxy S23)
        default: 2000  // Default to 2 seconds
    },
    offlineThreshold: 10000,       // 10 seconds - RTT above this indicates offline
    thresholdMultiplier: 0.9,      // 90% of median RTT as threshold
    globalHistoryLimit: 2000,      // Store up to 2000 measurements globally
    deviceHistoryLimit: 50,        // Store up to 50 measurements per device for calibration
    recentRttCount: 3,             // Use last 3 RTTs for moving average
    probeTimeout: 10000,           // 10 seconds timeout for probe ACK
    serverPort: 3001,
    corsOrigin: process.env.CORS_ORIGIN || "*",
    clientApiUrl: process.env.REACT_APP_API_URL || "http://localhost:3001"
};

/**
 * Get default editable config values
 */
export function getDefaultEditableConfig(): EditableConfig {
    return {
        probeIntervalDefault: defaultConfig.probeInterval.default,
        offlineThreshold: defaultConfig.offlineThreshold,
        thresholdMultiplier: defaultConfig.thresholdMultiplier,
        calibrationProbeCount: 5,
        warmupEnabled: false,
        warmupProbeCount: 10,
        outlierFilterEnabled: false,
        defaultProbeMethod: 'delete',  // Default to silent delete method
        stateConfirmationEnabled: true,  // Anti-flickering enabled by default
        stateConfirmationCount: 3        // Require 3 consecutive same-state calculations
    };
}

/**
 * Load custom config from JSON file if it exists
 */
function loadCustomConfig(): Partial<EditableConfig> | null {
    try {
        if (fs.existsSync(CUSTOM_CONFIG_PATH)) {
            const data = fs.readFileSync(CUSTOM_CONFIG_PATH, 'utf-8');
            const parsed = JSON.parse(data);
            return parsed;
        }
    } catch (err) {
        console.error('[CONFIG] Error loading custom config:', err);
    }
    return null;
}

/**
 * Save custom config to JSON file
 */
export function saveCustomConfig(editableConfig: EditableConfig): boolean {
    try {
        // Ensure data directory exists
        const dataDir = path.dirname(CUSTOM_CONFIG_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(CUSTOM_CONFIG_PATH, JSON.stringify(editableConfig, null, 2), 'utf-8');
        console.log('[CONFIG] Saved custom config to', CUSTOM_CONFIG_PATH);
        return true;
    } catch (err) {
        console.error('[CONFIG] Error saving custom config:', err);
        return false;
    }
}

/**
 * Delete custom config file (reset to defaults)
 */
export function resetToDefaultConfig(): boolean {
    try {
        if (fs.existsSync(CUSTOM_CONFIG_PATH)) {
            fs.unlinkSync(CUSTOM_CONFIG_PATH);
            console.log('[CONFIG] Deleted custom config, reset to defaults');
        }
        return true;
    } catch (err) {
        console.error('[CONFIG] Error resetting config:', err);
        return false;
    }
}

/**
 * Check if using custom config
 */
export function hasCustomConfig(): boolean {
    return fs.existsSync(CUSTOM_CONFIG_PATH);
}

/**
 * Get current editable config (custom if exists, else defaults)
 */
export function getCurrentEditableConfig(): EditableConfig {
    const custom = loadCustomConfig();
    const defaults = getDefaultEditableConfig();

    if (custom) {
        return {
            probeIntervalDefault: custom.probeIntervalDefault ?? defaults.probeIntervalDefault,
            offlineThreshold: custom.offlineThreshold ?? defaults.offlineThreshold,
            thresholdMultiplier: custom.thresholdMultiplier ?? defaults.thresholdMultiplier,
            calibrationProbeCount: custom.calibrationProbeCount ?? defaults.calibrationProbeCount,
            warmupEnabled: custom.warmupEnabled ?? defaults.warmupEnabled,
            warmupProbeCount: custom.warmupProbeCount ?? defaults.warmupProbeCount,
            outlierFilterEnabled: custom.outlierFilterEnabled ?? defaults.outlierFilterEnabled,
            defaultProbeMethod: custom.defaultProbeMethod ?? defaults.defaultProbeMethod,
            stateConfirmationEnabled: custom.stateConfirmationEnabled ?? defaults.stateConfirmationEnabled,
            stateConfirmationCount: custom.stateConfirmationCount ?? defaults.stateConfirmationCount
        };
    }

    return defaults;
}

/**
 * Get full configuration with custom overrides applied
 */
export function getConfig(): Config {
    const customEditable = loadCustomConfig();

    return {
        probeInterval: {
            min: parseInt(process.env.PROBE_INTERVAL_MIN || String(defaultConfig.probeInterval.min), 10),
            max: parseInt(process.env.PROBE_INTERVAL_MAX || String(defaultConfig.probeInterval.max), 10),
            default: customEditable?.probeIntervalDefault ??
                parseInt(process.env.PROBE_INTERVAL_DEFAULT || String(defaultConfig.probeInterval.default), 10)
        },
        offlineThreshold: customEditable?.offlineThreshold ??
            parseInt(process.env.OFFLINE_THRESHOLD || String(defaultConfig.offlineThreshold), 10),
        thresholdMultiplier: customEditable?.thresholdMultiplier ??
            parseFloat(process.env.THRESHOLD_MULTIPLIER || String(defaultConfig.thresholdMultiplier)),
        globalHistoryLimit: parseInt(process.env.GLOBAL_HISTORY_LIMIT || String(defaultConfig.globalHistoryLimit), 10),
        deviceHistoryLimit: parseInt(process.env.DEVICE_HISTORY_LIMIT || String(defaultConfig.deviceHistoryLimit), 10),
        recentRttCount: parseInt(process.env.RECENT_RTT_COUNT || String(defaultConfig.recentRttCount), 10),
        probeTimeout: parseInt(process.env.PROBE_TIMEOUT || String(defaultConfig.probeTimeout), 10),
        serverPort: parseInt(process.env.PORT || String(defaultConfig.serverPort), 10),
        corsOrigin: process.env.CORS_ORIGIN || defaultConfig.corsOrigin,
        clientApiUrl: process.env.REACT_APP_API_URL || defaultConfig.clientApiUrl
    };
}

// Export singleton config instance
export const config = getConfig();

