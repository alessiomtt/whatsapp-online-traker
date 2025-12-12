/**
 * Script to create test contacts with fake activity history
 * Run with: npx ts-node scripts/create-test-contacts.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'tracker.db');
const db = new Database(dbPath);

console.log('[TEST] Creating test contacts with activity history...\n');

// Test contact 1: Mario Rossi
const contact1 = {
    jid: '3331234567@s.whatsapp.net',
    phone: '3331234567',
    name: 'Mario Rossi (TEST)'
};

// Test contact 2: Luca Bianchi
const contact2 = {
    jid: '3339876543@s.whatsapp.net',
    phone: '3339876543',
    name: 'Luca Bianchi (TEST)'
};

// Create sessions (archived for testing)
function createSession(jid: string, phone: string, name: string): number {
    // Check if session already exists
    const existing = db.prepare('SELECT id FROM sessions WHERE jid = ?').get(jid) as { id: number } | undefined;
    if (existing) {
        console.log(`[TEST] Session for ${name} already exists (ID: ${existing.id})`);
        return existing.id;
    }

    const result = db.prepare(`
        INSERT INTO sessions (jid, phone_number, custom_name, is_active, is_archived, archived_at)
        VALUES (?, ?, ?, 0, 1, datetime('now'))
    `).run(jid, phone, name);

    console.log(`[TEST] Created session for ${name} (ID: ${result.lastInsertRowid})`);
    return result.lastInsertRowid as number;
}

// Generate activity events with overlaps
function generateEvents(sessionId: number, jid: string, startDaysAgo: number = 7) {
    // Clear existing events for this session
    db.prepare('DELETE FROM activity_logs WHERE session_id = ?').run(sessionId);

    const now = Date.now();
    const events: { type: string; timestamp: Date }[] = [];

    // Generate events for the past N days
    for (let day = startDaysAgo; day >= 0; day--) {
        const dayStart = new Date(now - day * 24 * 60 * 60 * 1000);
        dayStart.setHours(0, 0, 0, 0);

        // Morning session (7-9 AM) - partial overlap designed
        const morningOnline = new Date(dayStart);
        morningOnline.setHours(7, Math.floor(Math.random() * 30), 0, 0);
        events.push({ type: 'online', timestamp: morningOnline });

        const morningOffline = new Date(morningOnline);
        morningOffline.setHours(9, Math.floor(Math.random() * 30), 0, 0);
        events.push({ type: 'offline', timestamp: morningOffline });

        // Lunch session (12-14) - good overlap window
        const lunchOnline = new Date(dayStart);
        lunchOnline.setHours(12, Math.floor(Math.random() * 20), 0, 0);
        events.push({ type: 'online', timestamp: lunchOnline });

        const lunchStandby = new Date(lunchOnline);
        lunchStandby.setMinutes(lunchStandby.getMinutes() + 45);
        events.push({ type: 'standby', timestamp: lunchStandby });

        const lunchOffline = new Date(dayStart);
        lunchOffline.setHours(14, Math.floor(Math.random() * 30), 0, 0);
        events.push({ type: 'offline', timestamp: lunchOffline });

        // Evening session (21-23) - main overlap window
        const eveningOnline = new Date(dayStart);
        eveningOnline.setHours(21, Math.floor(Math.random() * 30), 0, 0);
        events.push({ type: 'online', timestamp: eveningOnline });

        const eveningStandby = new Date(eveningOnline);
        eveningStandby.setHours(22, 15 + Math.floor(Math.random() * 15), 0, 0);
        events.push({ type: 'standby', timestamp: eveningStandby });

        const eveningOnline2 = new Date(eveningStandby);
        eveningOnline2.setMinutes(eveningOnline2.getMinutes() + 10);
        events.push({ type: 'online', timestamp: eveningOnline2 });

        const eveningOffline = new Date(dayStart);
        eveningOffline.setHours(23, Math.floor(Math.random() * 30), 0, 0);
        events.push({ type: 'offline', timestamp: eveningOffline });
    }

    // Add start event at the beginning
    const startEvent = new Date(now - startDaysAgo * 24 * 60 * 60 * 1000);
    events.unshift({ type: 'start', timestamp: startEvent });

    // Add stop event at the end
    events.push({ type: 'stop', timestamp: new Date() });

    // Insert all events
    const stmt = db.prepare(`
        INSERT INTO activity_logs (session_id, jid, event_type, timestamp)
        VALUES (?, ?, ?, ?)
    `);

    for (const event of events) {
        stmt.run(sessionId, jid, event.type, event.timestamp.toISOString());
    }

    console.log(`[TEST] Generated ${events.length} events for session ${sessionId}`);
}

// Generate events for contact 2 with slight time shifts to create overlaps
function generateEventsContact2(sessionId: number, jid: string, startDaysAgo: number = 7) {
    // Clear existing events for this session
    db.prepare('DELETE FROM activity_logs WHERE session_id = ?').run(sessionId);

    const now = Date.now();
    const events: { type: string; timestamp: Date }[] = [];

    // Generate events for the past N days
    for (let day = startDaysAgo; day >= 0; day--) {
        const dayStart = new Date(now - day * 24 * 60 * 60 * 1000);
        dayStart.setHours(0, 0, 0, 0);

        // Morning session (8-10 AM) - overlaps with contact 1's morning
        const morningOnline = new Date(dayStart);
        morningOnline.setHours(8, Math.floor(Math.random() * 20), 0, 0);
        events.push({ type: 'online', timestamp: morningOnline });

        const morningOffline = new Date(morningOnline);
        morningOffline.setHours(10, Math.floor(Math.random() * 30), 0, 0);
        events.push({ type: 'offline', timestamp: morningOffline });

        // Lunch session (12:30-13:30) - overlaps with contact 1's lunch
        const lunchOnline = new Date(dayStart);
        lunchOnline.setHours(12, 30 + Math.floor(Math.random() * 15), 0, 0);
        events.push({ type: 'online', timestamp: lunchOnline });

        const lunchOffline = new Date(dayStart);
        lunchOffline.setHours(13, 30 + Math.floor(Math.random() * 30), 0, 0);
        events.push({ type: 'offline', timestamp: lunchOffline });

        // Evening session (21:30-00:00) - overlaps with contact 1's evening
        const eveningOnline = new Date(dayStart);
        eveningOnline.setHours(21, 30 + Math.floor(Math.random() * 15), 0, 0);
        events.push({ type: 'online', timestamp: eveningOnline });

        const eveningStandby = new Date(eveningOnline);
        eveningStandby.setHours(22, 30 + Math.floor(Math.random() * 15), 0, 0);
        events.push({ type: 'standby', timestamp: eveningStandby });

        const eveningOnline2 = new Date(eveningStandby);
        eveningOnline2.setMinutes(eveningOnline2.getMinutes() + 5);
        events.push({ type: 'online', timestamp: eveningOnline2 });

        const eveningOffline = new Date(dayStart);
        eveningOffline.setDate(eveningOffline.getDate() + 1); // next day
        eveningOffline.setHours(0, Math.floor(Math.random() * 30), 0, 0);
        events.push({ type: 'offline', timestamp: eveningOffline });
    }

    // Add start event at the beginning
    const startEvent = new Date(now - startDaysAgo * 24 * 60 * 60 * 1000);
    events.unshift({ type: 'start', timestamp: startEvent });

    // Add stop event at the end
    events.push({ type: 'stop', timestamp: new Date() });

    // Insert all events
    const stmt = db.prepare(`
        INSERT INTO activity_logs (session_id, jid, event_type, timestamp)
        VALUES (?, ?, ?, ?)
    `);

    for (const event of events) {
        stmt.run(sessionId, jid, event.type, event.timestamp.toISOString());
    }

    console.log(`[TEST] Generated ${events.length} events for session ${sessionId}`);
}

// Run
try {
    const session1Id = createSession(contact1.jid, contact1.phone, contact1.name);
    const session2Id = createSession(contact2.jid, contact2.phone, contact2.name);

    generateEvents(session1Id, contact1.jid, 7);
    generateEventsContact2(session2Id, contact2.jid, 7);

    console.log('\n[TEST] ✅ Test contacts created successfully!');
    console.log('\nContacts created:');
    console.log(`  📱 ${contact1.name} (${contact1.phone}) - Archived`);
    console.log(`  📱 ${contact2.name} (${contact2.phone}) - Archived`);
    console.log('\nThey have overlapping activity in:');
    console.log('  - Morning: ~8:00-9:00');
    console.log('  - Lunch: ~12:30-14:00');
    console.log('  - Evening: ~21:30-23:00');
    console.log('\nGo to the Compare page and select both contacts to test!');

} catch (err) {
    console.error('[TEST] Error:', err);
} finally {
    db.close();
}
