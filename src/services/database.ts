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
 * Create a new tracking session
 */
export function createSession(jid: string, phoneNumber: string): Session {
    const database = getDatabase();

    // Check if there's already an active session for this JID
    const existing = database.prepare(`
        SELECT * FROM sessions WHERE jid = ? AND is_active = 1
    `).get(jid) as Session | undefined;

    if (existing) {
        // Return existing active session
        return existing;
    }

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

    database.prepare(`
        INSERT INTO activity_logs (
            session_id, jid, event_type, rtt_value, avg_rtt, 
            median_rtt, threshold, state, device_jid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.sessionId,
        data.jid,
        data.eventType,
        data.rttValue ?? null,
        data.avgRtt ?? null,
        data.medianRtt ?? null,
        data.threshold ?? null,
        data.state ?? null,
        data.deviceJid ?? null
    );
}

/**
 * Get logs for a session
 */
export function getSessionLogs(jid: string, limit: number = 100): ActivityLog[] {
    const database = getDatabase();

    return database.prepare(`
        SELECT al.* FROM activity_logs al
        INNER JOIN sessions s ON al.session_id = s.id
        WHERE s.jid = ?
        ORDER BY al.timestamp DESC
        LIMIT ?
    `).all(jid, limit) as ActivityLog[];
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
 * Close the database connection
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        console.log('[DATABASE] Connection closed');
    }
}
