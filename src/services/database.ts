/**
 * Database Service for Device Activity Tracker
 * 
 * Uses better-sqlite3 for high-performance SQLite operations.
 * Handles session persistence and activity logging.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database interfaces
export interface Session {
    id: number;
    jid: string;
    phone_number: string;
    custom_name: string | null;
    profile_pic_url: string | null;
    started_at: string;
    stopped_at: string | null;
    archived_at: string | null;
    is_active: number;
    is_archived: number;
    probe_method: string; // 'reaction' or 'delete'
}

export interface ActivityLog {
    id: number;
    session_id: number;
    jid: string;
    event_type: string;
    rtt_value: number | null;
    avg_rtt: number | null;
    median_rtt: number | null;
    threshold: number | null;
    state: string | null;
    device_jid: string | null;
    timestamp: string;
}

export interface LogEventData {
    sessionId: number;
    jid: string;
    eventType: 'rtt' | 'online' | 'offline' | 'standby' | 'calibrating' | 'start' | 'stop';
    rttValue?: number;
    avgRtt?: number;
    medianRtt?: number;
    threshold?: number;
    state?: string;
    deviceJid?: string;
}

let db: Database.Database | null = null;

/**
 * Initialize the database connection and create tables
 */
export function initDatabase(): Database.Database {
    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'tracker.db');
    db = new Database(dbPath);

    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');

    // Create tables
    db.exec(`
        -- Sessions table
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jid TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            custom_name TEXT,
            profile_pic_url TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            stopped_at DATETIME,
            archived_at DATETIME,
            is_active INTEGER DEFAULT 1,
            is_archived INTEGER DEFAULT 0
        );

        -- Activity logs table
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            jid TEXT NOT NULL,
            event_type TEXT NOT NULL,
            rtt_value INTEGER,
            avg_rtt REAL,
            median_rtt REAL,
            threshold REAL,
            state TEXT,
            device_jid TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_logs_session ON activity_logs(session_id);
        CREATE INDEX IF NOT EXISTS idx_logs_jid ON activity_logs(jid);
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON activity_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_logs_event_type ON activity_logs(event_type);
        CREATE INDEX IF NOT EXISTS idx_sessions_jid ON sessions(jid);
        CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);
        CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(is_archived);
    `);

    // Migration: Add probe_method column if it doesn't exist (for existing databases)
    try {
        const columns = db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[];
        const hasProbeMethod = columns.some(col => col.name === 'probe_method');
        if (!hasProbeMethod) {
            db.exec(`ALTER TABLE sessions ADD COLUMN probe_method TEXT DEFAULT 'reaction'`);
            console.log('[DATABASE] Migration: Added probe_method column');
        }
    } catch {
        // Column might already exist
    }

    console.log('[DATABASE] Initialized at:', dbPath);
    return db;
}

/**
 * Get the database instance
 */
export function getDatabase(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Create a new tracking session or reactivate an existing stopped session
 * 
 * IMPORTANT: When restarting tracking for a contact, we should reuse the existing
 * stopped session instead of creating a new one. This prevents duplicate sessions
 * from accumulating in the archive.
 */
export function createSession(jid: string, phoneNumber: string): Session {
    const database = getDatabase();

    // Check if there's already an active session for this JID
    const activeSession = database.prepare(`
        SELECT * FROM sessions WHERE jid = ? AND is_active = 1
    `).get(jid) as Session | undefined;

    if (activeSession) {
        // Return existing active session
        return activeSession;
    }

    // Check if there's a stopped (but not archived) session that we can reactivate
    const stoppedSession = database.prepare(`
        SELECT * FROM sessions WHERE jid = ? AND is_active = 0 AND is_archived = 0
        ORDER BY stopped_at DESC LIMIT 1
    `).get(jid) as Session | undefined;

    if (stoppedSession) {
        // Reactivate the stopped session instead of creating a new one
        database.prepare(`
            UPDATE sessions 
            SET is_active = 1, stopped_at = NULL, started_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(stoppedSession.id);

        // Return the reactivated session
        return database.prepare(`SELECT * FROM sessions WHERE id = ?`).get(stoppedSession.id) as Session;
    }

    // No existing session found, create a new one
    const stmt = database.prepare(`
        INSERT INTO sessions (jid, phone_number, is_active, is_archived)
        VALUES (?, ?, 1, 0)
    `);

    const result = stmt.run(jid, phoneNumber);

    return database.prepare(`SELECT * FROM sessions WHERE id = ?`).get(result.lastInsertRowid) as Session;
}

/**
 * Update session with custom name
 */
export function updateSessionName(jid: string, customName: string): void {
    const database = getDatabase();
    database.prepare(`
        UPDATE sessions SET custom_name = ? WHERE jid = ? AND is_active = 1
    `).run(customName, jid);
}

/**
 * Update session with profile picture URL
 */
export function updateSessionProfilePic(jid: string, profilePicUrl: string | null): void {
    const database = getDatabase();
    database.prepare(`
        UPDATE sessions SET profile_pic_url = ? WHERE jid = ? AND is_active = 1
    `).run(profilePicUrl, jid);
}

/**
 * Update session probe method
 */
export function updateSessionProbeMethod(jid: string, probeMethod: string): void {
    const database = getDatabase();
    database.prepare(`
        UPDATE sessions SET probe_method = ? WHERE jid = ? AND is_active = 1
    `).run(probeMethod, jid);
}

/**
 * Get session probe method
 */
export function getSessionProbeMethod(jid: string): string {
    const database = getDatabase();
    const result = database.prepare(`
        SELECT probe_method FROM sessions WHERE jid = ? AND is_active = 1
    `).get(jid) as { probe_method: string } | undefined;
    return result?.probe_method || 'reaction';
}

/**
 * Stop a tracking session (mark as inactive)
 */
export function stopSession(jid: string): void {
    const database = getDatabase();
    database.prepare(`
        UPDATE sessions 
        SET is_active = 0, stopped_at = CURRENT_TIMESTAMP 
        WHERE jid = ? AND is_active = 1
    `).run(jid);
}

/**
 * Archive a session
 */
export function archiveSession(jid: string): void {
    const database = getDatabase();
    database.prepare(`
        UPDATE sessions 
        SET is_archived = 1, archived_at = CURRENT_TIMESTAMP 
        WHERE jid = ? AND is_active = 0 AND is_archived = 0
    `).run(jid);
}

/**
 * Restore a session from archive (doesn't restart tracking, just removes from archive)
 */
export function restoreSession(jid: string): Session | undefined {
    const database = getDatabase();

    // Get the archived session
    const session = database.prepare(`
        SELECT * FROM sessions WHERE jid = ? AND is_archived = 1
        ORDER BY archived_at DESC LIMIT 1
    `).get(jid) as Session | undefined;

    if (session) {
        database.prepare(`
            UPDATE sessions 
            SET is_archived = 0, archived_at = NULL 
            WHERE id = ?
        `).run(session.id);
    }

    return session;
}

/**
 * Permanently delete a session and its logs
 */
export function deleteSession(jid: string): void {
    const database = getDatabase();

    // Delete logs first (foreign key constraint)
    database.prepare(`
        DELETE FROM activity_logs WHERE session_id IN (
            SELECT id FROM sessions WHERE jid = ?
        )
    `).run(jid);

    // Delete session
    database.prepare(`DELETE FROM sessions WHERE jid = ?`).run(jid);
}

/**
 * Log an activity event
 */
export function logEvent(data: LogEventData): void {
    const database = getDatabase();

    // Use ISO timestamp with local timezone instead of SQLite's UTC CURRENT_TIMESTAMP
    const timestamp = new Date().toISOString();

    database.prepare(`
        INSERT INTO activity_logs (
            session_id, jid, event_type, rtt_value, avg_rtt, 
            median_rtt, threshold, state, device_jid, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.sessionId,
        data.jid,
        data.eventType,
        data.rttValue ?? null,
        data.avgRtt ?? null,
        data.medianRtt ?? null,
        data.threshold ?? null,
        data.state ?? null,
        data.deviceJid ?? null,
        timestamp
    );
}

/**
 * Get logs for a session
 */
export function getSessionLogs(jid: string, limit: number = 100, offset: number = 0): ActivityLog[] {
    const database = getDatabase();

    return database.prepare(`
        SELECT al.* FROM activity_logs al
        INNER JOIN sessions s ON al.session_id = s.id
        WHERE s.jid = ?
        ORDER BY al.timestamp DESC
        LIMIT ? OFFSET ?
    `).all(jid, limit, offset) as ActivityLog[];
}

/**
 * Get total count of session logs for pagination
 */
export function getSessionLogsCount(jid: string): number {
    const database = getDatabase();

    const result = database.prepare(`
        SELECT COUNT(*) as count FROM activity_logs al
        INNER JOIN sessions s ON al.session_id = s.id
        WHERE s.jid = ?
    `).get(jid) as { count: number };

    return result?.count || 0;
}
/**
 * Get activity events (state changes only, not RTT measurements) for a session
 * Returns events like: start, stop, online, offline, standby, calibrating
 * Supports pagination with offset
 */
export function getActivityEvents(jid: string, limit: number = 100, offset: number = 0): ActivityLog[] {
    const database = getDatabase();

    return database.prepare(`
        SELECT al.* FROM activity_logs al
        INNER JOIN sessions s ON al.session_id = s.id
        WHERE s.jid = ? AND al.event_type != 'rtt'
        ORDER BY al.timestamp DESC
        LIMIT ? OFFSET ?
    `).all(jid, limit, offset) as ActivityLog[];
}

/**
 * Get total count of activity events for a session (for pagination)
 */
export function getActivityEventsCount(jid: string): number {
    const database = getDatabase();

    const result = database.prepare(`
        SELECT COUNT(*) as count FROM activity_logs al
        INNER JOIN sessions s ON al.session_id = s.id
        WHERE s.jid = ? AND al.event_type != 'rtt'
    `).get(jid) as { count: number };

    return result?.count || 0;
}

/**
 * Get logs for a specific session ID
 */
export function getLogsBySessionId(sessionId: number, limit: number = 100): ActivityLog[] {
    const database = getDatabase();

    return database.prepare(`
        SELECT * FROM activity_logs 
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
    `).all(sessionId, limit) as ActivityLog[];
}

/**
 * Get all active sessions
 */
export function getActiveSessions(): Session[] {
    const database = getDatabase();
    return database.prepare(`
        SELECT * FROM sessions WHERE is_active = 1 ORDER BY started_at DESC
    `).all() as Session[];
}

/**
 * Get all archived sessions
 */
export function getArchivedSessions(): Session[] {
    const database = getDatabase();
    return database.prepare(`
        SELECT * FROM sessions WHERE is_archived = 1 ORDER BY archived_at DESC
    `).all() as Session[];
}

/**
 * Get all stopped (but not archived) sessions
 */
export function getStoppedSessions(): Session[] {
    const database = getDatabase();
    return database.prepare(`
        SELECT * FROM sessions WHERE is_active = 0 AND is_archived = 0 ORDER BY stopped_at DESC
    `).all() as Session[];
}

/**
 * Mark all active sessions as stopped (used on server restart)
 * This ensures consistency - if server restarts, we can't guarantee tracking was running
 */
export function markAllActiveAsStopped(): number {
    const database = getDatabase();
    const result = database.prepare(`
        UPDATE sessions 
        SET is_active = 0, stopped_at = CURRENT_TIMESTAMP 
        WHERE is_active = 1
    `).run();

    if (result.changes > 0) {
        console.log(`[DATABASE] Marked ${result.changes} active sessions as stopped on server restart`);
    }

    return result.changes;
}


/**
 * Get session by JID
 */
export function getSessionByJid(jid: string): Session | undefined {
    const database = getDatabase();
    return database.prepare(`
        SELECT * FROM sessions WHERE jid = ? AND is_active = 1
    `).get(jid) as Session | undefined;
}

/**
 * Get most recent session for a JID (active or stopped, not archived)
 */
export function getMostRecentSession(jid: string): Session | undefined {
    const database = getDatabase();
    return database.prepare(`
        SELECT * FROM sessions WHERE jid = ? AND is_archived = 0
        ORDER BY started_at DESC LIMIT 1
    `).get(jid) as Session | undefined;
}

/**
 * Clear all data from the database (admin function)
 * Deletes all sessions and activity logs
 */
export function clearAllData(): void {
    const database = getDatabase();

    // Delete all activity logs first (foreign key constraint)
    database.prepare(`DELETE FROM activity_logs`).run();

    // Delete all sessions
    database.prepare(`DELETE FROM sessions`).run();

    console.log('[DATABASE] All data cleared');
}

/**
 * Get all sessions (active, stopped, and archived) for comparison selection
 * Returns a unified list of all contacts that can be compared
 */
export function getAllSessionsForComparison(): Session[] {
    const database = getDatabase();
    return database.prepare(`
        SELECT * FROM sessions 
        ORDER BY 
            CASE 
                WHEN is_active = 1 THEN 0 
                WHEN is_archived = 0 THEN 1 
                ELSE 2 
            END,
            started_at DESC
    `).all() as Session[];
}

/**
 * Get activity events for a JID within a specific date range
 * Used for comparison feature to fetch events within selected time period
 */
export function getActivityEventsInRange(
    jid: string,
    startDate: string,
    endDate: string
): ActivityLog[] {
    const database = getDatabase();
    return database.prepare(`
        SELECT al.* FROM activity_logs al
        INNER JOIN sessions s ON al.session_id = s.id
        WHERE s.jid = ? 
          AND al.event_type IN ('online', 'offline', 'standby', 'start', 'stop', 'calibrating', 'calibration_end')
          AND al.timestamp >= ?
          AND al.timestamp <= ?
        ORDER BY al.timestamp ASC
    `).all(jid, startDate, endDate) as ActivityLog[];
}

/**
 * Get all activity events for a JID (no date limit) - for full history comparison
 */
export function getActivityEventsForComparison(jid: string): ActivityLog[] {
    const database = getDatabase();
    return database.prepare(`
        SELECT al.* FROM activity_logs al
        INNER JOIN sessions s ON al.session_id = s.id
        WHERE s.jid = ? 
          AND al.event_type IN ('online', 'offline', 'standby', 'start', 'stop', 'calibrating', 'calibration_end')
        ORDER BY al.timestamp ASC
    `).all(jid) as ActivityLog[];
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        console.log('[DATABASE] Connection closed');
    }
}

// ============================================
// DATABASE UTILITIES FOR ADMIN PANEL
// ============================================

export interface DbStats {
    fileSizeBytes: number;
    fileSizeMB: string;
    totalSessions: number;
    activeSessions: number;
    stoppedSessions: number;
    archivedSessions: number;
    totalEvents: number;
    oldestEvent: string | null;
    newestEvent: string | null;
    lastModified: string;
}

/**
 * Get database statistics
 */
export function getDbStats(): DbStats {
    const database = getDatabase();
    const dataDir = path.join(process.cwd(), 'data');
    const dbPath = path.join(dataDir, 'tracker.db');

    // File stats
    let fileSizeBytes = 0;
    let lastModified = new Date().toISOString();
    try {
        const stats = fs.statSync(dbPath);
        fileSizeBytes = stats.size;
        lastModified = stats.mtime.toISOString();
    } catch { /* ignore */ }

    // Session counts
    const totalSessions = (database.prepare('SELECT COUNT(*) as count FROM sessions').get() as any).count;
    const activeSessions = (database.prepare('SELECT COUNT(*) as count FROM sessions WHERE is_active = 1').get() as any).count;
    const archivedSessions = (database.prepare('SELECT COUNT(*) as count FROM sessions WHERE is_archived = 1').get() as any).count;
    const stoppedSessions = (database.prepare('SELECT COUNT(*) as count FROM sessions WHERE is_active = 0 AND is_archived = 0').get() as any).count;

    // Events count
    const totalEvents = (database.prepare('SELECT COUNT(*) as count FROM activity_logs').get() as any).count;

    // Event date range
    const oldestEvent = (database.prepare('SELECT MIN(timestamp) as ts FROM activity_logs').get() as any)?.ts || null;
    const newestEvent = (database.prepare('SELECT MAX(timestamp) as ts FROM activity_logs').get() as any)?.ts || null;

    return {
        fileSizeBytes,
        fileSizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(2),
        totalSessions,
        activeSessions,
        stoppedSessions,
        archivedSessions,
        totalEvents,
        oldestEvent,
        newestEvent,
        lastModified
    };
}

/**
 * Get all sessions for overview (active, stopped, archived)
 */
export function getAllSessionsOverview(): Session[] {
    const database = getDatabase();
    return database.prepare(`
        SELECT * FROM sessions 
        ORDER BY 
            is_active DESC,
            is_archived ASC,
            started_at DESC
    `).all() as Session[];
}

/**
 * Purge old activity logs (older than specified days)
 * Returns number of deleted rows
 */
export function purgeOldLogs(days: number): number {
    const database = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString();

    const result = database.prepare(`
        DELETE FROM activity_logs WHERE timestamp < ?
    `).run(cutoffStr);

    // Vacuum to reclaim space
    database.exec('VACUUM');

    console.log(`[DATABASE] Purged ${result.changes} logs older than ${days} days`);
    return result.changes;
}

/**
 * Clear all activity logs (keeps sessions)
 * Returns number of deleted rows
 */
export function clearAllLogs(): number {
    const database = getDatabase();
    const result = database.prepare('DELETE FROM activity_logs').run();
    database.exec('VACUUM');
    console.log(`[DATABASE] Cleared all ${result.changes} activity logs`);
    return result.changes;
}

/**
 * Execute a raw SQL query (SELECT only for safety)
 * Returns query results or error message
 */
export function executeRawQuery(sql: string): { success: boolean; data?: any[]; error?: string; rowCount?: number } {
    const database = getDatabase();

    // Sanitize: only allow SELECT statements
    const trimmedSql = sql.trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT')) {
        return { success: false, error: 'Solo query SELECT sono permesse per sicurezza' };
    }

    // Block dangerous keywords even in SELECT
    const dangerousKeywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE', 'REPLACE'];
    for (const keyword of dangerousKeywords) {
        if (trimmedSql.includes(keyword)) {
            return { success: false, error: `Keyword "${keyword}" non permesso nelle query` };
        }
    }

    try {
        const results = database.prepare(sql).all();
        return { success: true, data: results, rowCount: results.length };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export interface TableSchema {
    tableName: string;
    columns: { name: string; type: string; notnull: number; pk: number }[];
}

/**
 * Get database table schema
 */
export function getTableSchema(): TableSchema[] {
    const database = getDatabase();
    const tables = database.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all() as { name: string }[];

    return tables.map(table => {
        const columns = database.prepare(`PRAGMA table_info(${table.name})`).all() as any[];
        return {
            tableName: table.name,
            columns: columns.map(col => ({
                name: col.name,
                type: col.type,
                notnull: col.notnull,
                pk: col.pk
            }))
        };
    });
}

export interface EventsFilter {
    jid?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}

export interface EventsBrowserResult {
    events: ActivityLog[];
    totalCount: number;
    page: number;
    totalPages: number;
}

/**
 * Browse activity events with filters and pagination
 */
export function getEventsWithFilters(filters: EventsFilter): EventsBrowserResult {
    const database = getDatabase();
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    let whereClause = '1=1';
    const params: any[] = [];

    if (filters.jid) {
        whereClause += ' AND al.jid = ?';
        params.push(filters.jid);
    }

    if (filters.eventType) {
        whereClause += ' AND al.event_type = ?';
        params.push(filters.eventType);
    }

    if (filters.startDate) {
        whereClause += ' AND al.timestamp >= ?';
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        whereClause += ' AND al.timestamp <= ?';
        params.push(filters.endDate);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM activity_logs al WHERE ${whereClause}`;
    const totalCount = (database.prepare(countQuery).get(...params) as any).count;

    // Get paginated results
    const dataQuery = `
        SELECT al.* FROM activity_logs al 
        WHERE ${whereClause}
        ORDER BY al.timestamp DESC
        LIMIT ? OFFSET ?
    `;
    const events = database.prepare(dataQuery).all(...params, limit, offset) as ActivityLog[];

    return {
        events,
        totalCount,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(totalCount / limit)
    };
}

/**
 * Get list of unique event types in the database
 */
export function getEventTypes(): string[] {
    const database = getDatabase();
    const result = database.prepare(`
        SELECT DISTINCT event_type FROM activity_logs ORDER BY event_type
    `).all() as { event_type: string }[];
    return result.map(r => r.event_type);
}

/**
 * Get database file path for export
 */
export function getDatabasePath(): string {
    const dataDir = path.join(process.cwd(), 'data');
    return path.join(dataDir, 'tracker.db');
}

/**
 * Import database from buffer (overwrites existing)
 * WARNING: This is destructive and stops all trackers
 */
export function importDatabase(buffer: Buffer): { success: boolean; error?: string } {
    try {
        // Close current connection
        closeDatabase();

        const dataDir = path.join(process.cwd(), 'data');
        const dbPath = path.join(dataDir, 'tracker.db');

        // Backup existing
        const backupPath = path.join(dataDir, `tracker_backup_${Date.now()}.db`);
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, backupPath);
        }

        // Write new database
        fs.writeFileSync(dbPath, buffer);

        // Reinitialize
        initDatabase();

        console.log('[DATABASE] Imported new database successfully');
        return { success: true };
    } catch (err: any) {
        console.error('[DATABASE] Import failed:', err);
        return { success: false, error: err.message };
    }
}

