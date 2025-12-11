/**
 * Device Activity Tracker - Web Server
 *
 * HTTP server with Socket.IO for real-time tracking visualization.
 * Provides REST API and WebSocket interface for the React frontend.
 *
 * For educational and research purposes only.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import { Boom } from '@hapi/boom';
import { WhatsAppTracker } from './tracker';
import { validatePhoneNumber, createWhatsAppJid } from './utils/validation';
import { config } from './config';
import * as db from './services/database';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Clear Baileys E2EE session files for a specific phone number.
 * This is necessary to prevent the OFFLINE bug when restarting tracking.
 * Baileys caches encryption sessions that become stale after stopping tracking.
 * 
 * IMPORTANT: Sessions are stored with LID (Local Identifier) not just the phone number.
 * We need to find the LID mapping first, then delete all related session files.
 */
function clearBaileysSessions(phoneNumber: string): void {
    const authDir = path.join(process.cwd(), 'auth_info_baileys');

    if (!fs.existsSync(authDir)) {
        console.log(`[SESSION] Auth directory not found, skipping cleanup`);
        return;
    }

    try {
        const phoneWithoutPlus = phoneNumber.replace('+', '');
        let lidNumber: string | null = null;

        // First, try to find the LID mapping for this phone number
        const lidMappingFile = path.join(authDir, `lid-mapping-${phoneWithoutPlus}.json`);
        if (fs.existsSync(lidMappingFile)) {
            try {
                const mappingContent = fs.readFileSync(lidMappingFile, 'utf-8');
                const mapping = JSON.parse(mappingContent);
                // The mapping contains the LID number
                if (typeof mapping === 'string') {
                    lidNumber = mapping.split('@')[0].split(':')[0];
                } else if (mapping.lid) {
                    lidNumber = mapping.lid.split('@')[0].split(':')[0];
                }
                console.log(`[SESSION] Found LID mapping: ${phoneWithoutPlus} -> ${lidNumber}`);
            } catch (e) {
                console.log(`[SESSION] Could not parse LID mapping file`);
            }
        }

        const files = fs.readdirSync(authDir);
        let deletedCount = 0;

        // Find and delete session files related to this phone number AND its LID
        for (const file of files) {
            const shouldDelete =
                // Phone number based files
                (file.includes(phoneWithoutPlus) &&
                    (file.startsWith('session-') ||
                        file.startsWith('lid-mapping-') ||
                        file.startsWith('device-list-'))) ||
                // LID based files (if we found the LID)
                (lidNumber && file.includes(lidNumber) &&
                    (file.startsWith('session-') ||
                        file.startsWith('lid-mapping-')));

            if (shouldDelete) {
                const filePath = path.join(authDir, file);
                fs.unlinkSync(filePath);
                deletedCount++;
                console.log(`[SESSION] Deleted: ${file}`);
            }
        }

        if (deletedCount > 0) {
            console.log(`[SESSION] Cleared ${deletedCount} cached session files for ${phoneNumber}`);
        } else {
            console.log(`[SESSION] No cached sessions found for ${phoneNumber}`);
        }
    } catch (err) {
        console.error(`[SESSION] Error clearing sessions:`, err);
    }
}

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: config.corsOrigin,
        methods: ["GET", "POST"]
    }
});

let sock: any;
let isWhatsAppConnected = false;
const trackers: Map<string, WhatsAppTracker> = new Map(); // JID -> Tracker instance
const sessionIds: Map<string, number> = new Map(); // JID -> Session ID

// Initialize database on startup
console.log('[SERVER] Initializing database...');
db.initDatabase();

// Mark any "active" sessions as stopped since server is starting fresh
// This ensures consistency - if server restarts, tracking wasn't running
console.log('[SERVER] Cleaning up stale sessions...');
db.markAllActiveAsStopped();


async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'debug' }),
        markOnlineOnConnect: true,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code generated');
            io.emit('qr-code', qr);
        }

        if (connection === 'close') {
            isWhatsAppConnected = false;
            io.emit('connection-close');
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to:', lastDisconnect?.error);
            if (shouldReconnect) {
                console.log('Reconnecting...');
                connectToWhatsApp();
            } else {
                console.log('Logged out. Please delete auth_info_baileys folder and restart to re-authorize.');
            }
        } else if (connection === 'open') {
            isWhatsAppConnected = true;
            console.log('WhatsApp connected successfully!');
            io.emit('connection-open');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

io.on('connection', (socket) => {
    console.log('Client connected');

    if (isWhatsAppConnected) {
        socket.emit('connection-open');
    }

    socket.emit('tracked-contacts', Array.from(trackers.keys()));

    // Send archived contacts on connect
    const archivedSessions = db.getArchivedSessions();
    socket.emit('archived-contacts', archivedSessions.map(s => ({
        jid: s.jid,
        phoneNumber: s.phone_number,
        customName: s.custom_name,
        profilePic: s.profile_pic_url,
        archivedAt: s.archived_at,
        sessionId: s.id
    })));

    // Send stopped (but not archived) contacts on connect
    // This ensures contacts that were active before server restart are shown as stopped
    const stoppedSessions = db.getStoppedSessions();
    socket.emit('stopped-contacts', stoppedSessions.map(s => ({
        jid: s.jid,
        phoneNumber: s.phone_number,
        customName: s.custom_name,
        profilePic: s.profile_pic_url,
        stoppedAt: s.stopped_at,
        sessionId: s.id
    })));

    // Check if contact exists (active, stopped, or archived) before adding
    socket.on('check-contact-status', (number: string) => {
        const validation = validatePhoneNumber(number);
        if (!validation.isValid) {
            socket.emit('contact-status', {
                number,
                status: 'invalid',
                error: validation.error || 'Invalid phone number'
            });
            return;
        }

        const targetJid = createWhatsAppJid(validation.cleaned);

        // Check if actively being tracked
        if (trackers.has(targetJid)) {
            const session = db.getSessionByJid(targetJid);
            socket.emit('contact-status', {
                number,
                jid: targetJid,
                status: 'active',
                contactName: session?.custom_name || validation.cleaned,
                profilePic: session?.profile_pic_url
            });
            return;
        }

        // Check database for stopped or archived sessions
        const mostRecent = db.getMostRecentSession(targetJid);
        if (mostRecent) {
            socket.emit('contact-status', {
                number,
                jid: targetJid,
                status: 'stopped',
                contactName: mostRecent.custom_name || validation.cleaned,
                profilePic: mostRecent.profile_pic_url
            });
            return;
        }

        // Check for archived session
        const archivedSessions = db.getArchivedSessions();
        const archived = archivedSessions.find(s => s.jid === targetJid);
        if (archived) {
            socket.emit('contact-status', {
                number,
                jid: targetJid,
                status: 'archived',
                contactName: archived.custom_name || validation.cleaned,
                profilePic: archived.profile_pic_url,
                archivedAt: archived.archived_at
            });
            return;
        }

        // Not found - it's a new contact
        socket.emit('contact-status', {
            number,
            jid: targetJid,
            status: 'not_found'
        });
    });

    socket.on('add-contact', async (number: string) => {
        console.log(`Request to track: ${number}`);

        // Validate phone number
        const validation = validatePhoneNumber(number);
        if (!validation.isValid) {
            socket.emit('error', { jid: null, message: validation.error || 'Invalid phone number' });
            return;
        }

        const targetJid = createWhatsAppJid(validation.cleaned);

        // IMPORTANT FIX: If tracker already exists, stop and remove it first
        // This allows restarting tracking with clean state instead of rejecting
        if (trackers.has(targetJid)) {
            console.log(`[RESTART] Tracker already exists for ${targetJid}, stopping it first...`);
            const existingTracker = trackers.get(targetJid);
            if (existingTracker) {
                existingTracker.stopTracking();
                trackers.delete(targetJid);

                // Also clean up session ID
                const existingSessionId = sessionIds.get(targetJid);
                if (existingSessionId) {
                    db.logEvent({
                        sessionId: existingSessionId,
                        jid: targetJid,
                        eventType: 'stop'
                    });
                    db.stopSession(targetJid);
                    sessionIds.delete(targetJid);
                }
            }

            // CRITICAL: Clear cached Baileys E2EE sessions to prevent OFFLINE bug
            clearBaileysSessions(validation.cleaned);

            console.log(`[RESTART] Old tracker stopped, proceeding with fresh tracker...`);
        }

        try {
            // CRITICAL FIX: Force Baileys to refresh E2EE sessions for this JID
            // When restarting tracking, Baileys may have stale encryption sessions
            // that prevent message delivery. Calling onWhatsApp forces a refresh.
            console.log(`[SESSION] Verifying and refreshing Baileys session for ${targetJid}...`);
            const results = await sock.onWhatsApp(targetJid);
            const result = results?.[0];

            if (result?.exists) {
                // Check if this contact is currently archived and restore it first
                const archivedSessions = db.getArchivedSessions();
                const archivedSession = archivedSessions.find(s => s.jid === result.jid);
                if (archivedSession) {
                    console.log(`[ARCHIVE] Restoring ${result.jid} from archive before tracking...`);
                    db.restoreSession(result.jid);
                    // Notify clients that the contact was restored
                    io.emit('contact-restored', {
                        jid: result.jid,
                        phoneNumber: archivedSession.phone_number,
                        customName: archivedSession.custom_name,
                        profilePic: archivedSession.profile_pic_url
                    });
                }

                // Create session in database (will reuse stopped session if exists)
                const session = db.createSession(result.jid, validation.cleaned);
                sessionIds.set(result.jid, session.id);


                const tracker = new WhatsAppTracker(sock, result.jid, false, session.id);
                trackers.set(result.jid, tracker);

                tracker.onUpdate = (data) => {
                    io.emit('tracker-update', {
                        jid: result.jid,
                        ...(data as object)
                    });
                };

                tracker.startTracking();

                const ppUrl = await tracker.getProfilePicture();

                // Update session with profile pic
                if (ppUrl) {
                    db.updateSessionProfilePic(result.jid, ppUrl);
                }

                let contactName = validation.cleaned;
                try {
                    const contactInfo = await sock.onWhatsApp(result.jid);
                    if (contactInfo && contactInfo[0]?.notify) {
                        contactName = contactInfo[0].notify;
                        // Update session with contact name
                        db.updateSessionName(result.jid, contactName);
                    }
                } catch (err) {
                    console.log('[NAME] Could not fetch contact name, using number');
                }

                socket.emit('contact-added', { jid: result.jid, number: validation.cleaned });

                io.emit('profile-pic', { jid: result.jid, url: ppUrl });
                io.emit('contact-name', { jid: result.jid, name: contactName });

                // Log start event
                db.logEvent({
                    sessionId: session.id,
                    jid: result.jid,
                    eventType: 'start'
                });
            } else {
                socket.emit('error', { jid: targetJid, message: 'Number not on WhatsApp' });
            }
        } catch (err) {
            console.error(err);
            socket.emit('error', { jid: targetJid, message: 'Verification failed' });
        }
    });

    socket.on('remove-contact', (jid: string) => {
        console.log(`Request to stop tracking: ${jid}`);
        const tracker = trackers.get(jid);
        if (tracker) {
            tracker.stopTracking();
            trackers.delete(jid);

            // Log stop event and mark session as stopped
            const sessionId = sessionIds.get(jid);
            if (sessionId) {
                db.logEvent({
                    sessionId,
                    jid,
                    eventType: 'stop'
                });
                db.stopSession(jid);
            }
            sessionIds.delete(jid);

            socket.emit('contact-removed', jid);
        }
    });

    socket.on('archive-contact', (jid: string) => {
        console.log(`Request to archive: ${jid}`);
        db.archiveSession(jid);

        // Get session info to send back
        const archivedSessions = db.getArchivedSessions();
        const archived = archivedSessions.find(s => s.jid === jid);

        io.emit('contact-archived', {
            jid,
            session: archived ? {
                jid: archived.jid,
                phoneNumber: archived.phone_number,
                customName: archived.custom_name,
                profilePic: archived.profile_pic_url,
                archivedAt: archived.archived_at,
                sessionId: archived.id
            } : null
        });
    });

    socket.on('restore-contact', (jid: string) => {
        console.log(`Request to restore from archive: ${jid}`);
        const session = db.restoreSession(jid);

        if (session) {
            io.emit('contact-restored', {
                jid,
                phoneNumber: session.phone_number,
                customName: session.custom_name,
                profilePic: session.profile_pic_url
            });
        }
    });

    socket.on('delete-contact', (jid: string) => {
        console.log(`Request to permanently delete: ${jid}`);
        db.deleteSession(jid);
        io.emit('contact-deleted', jid);
    });

    socket.on('get-archived', () => {
        const archivedSessions = db.getArchivedSessions();
        socket.emit('archived-contacts', archivedSessions.map(s => ({
            jid: s.jid,
            phoneNumber: s.phone_number,
            customName: s.custom_name,
            profilePic: s.profile_pic_url,
            archivedAt: s.archived_at,
            sessionId: s.id
        })));
    });

    socket.on('get-stopped', () => {
        const stoppedSessions = db.getStoppedSessions();
        console.log(`[SERVER] Sending ${stoppedSessions.length} stopped sessions to client`);
        socket.emit('stopped-contacts', stoppedSessions.map(s => ({
            jid: s.jid,
            phoneNumber: s.phone_number,
            customName: s.custom_name,
            profilePic: s.profile_pic_url,
            stoppedAt: s.stopped_at,
            sessionId: s.id
        })));
    });


    socket.on('get-session-logs', (data: { jid: string, limit?: number }) => {
        const logs = db.getSessionLogs(data.jid, data.limit || 100);
        socket.emit('session-logs', { jid: data.jid, logs });
    });

    socket.on('update-name', (data: { jid: string, name: string }) => {
        console.log(`Request to rename ${data.jid} to ${data.name}`);
        db.updateSessionName(data.jid, data.name);
        io.emit('contact-name', data);
    });

    // ADMIN: Clear entire database
    socket.on('admin-clear-database', () => {
        console.log('[ADMIN] Request to clear entire database');

        // Stop all active trackers first
        trackers.forEach((tracker, jid) => {
            console.log(`[ADMIN] Stopping tracker for ${jid}`);
            tracker.stopTracking();
        });
        trackers.clear();
        sessionIds.clear();

        // Clear database
        db.clearAllData();

        console.log('[ADMIN] Database cleared successfully');

        // Notify all clients
        io.emit('database-cleared');
    });

    // ADMIN: Disconnect WhatsApp (delete auth and force re-login)
    socket.on('admin-disconnect-whatsapp', async () => {
        console.log('[ADMIN] Request to disconnect WhatsApp');

        const totalTrackers = trackers.size;
        let stoppedCount = 0;

        // Send initial progress
        socket.emit('disconnect-progress', {
            step: 1,
            message: `Fermando ${totalTrackers} monitoraggi...`,
            total: totalTrackers,
            completed: 0
        });

        // Step 1: Stop all active trackers AND save their state to database
        console.log(`[ADMIN] Step 1: Stopping ${totalTrackers} trackers and saving state...`);
        const activeJids = Array.from(trackers.keys());

        for (const jid of activeJids) {
            const tracker = trackers.get(jid);
            const sessionId = sessionIds.get(jid);

            if (tracker) {
                console.log(`[ADMIN] Stopping tracker for ${jid}`);
                tracker.stopTracking();
            }

            // Save stop event and mark session as stopped in database
            // Note: better-sqlite3 operations are SYNCHRONOUS, so they complete immediately
            if (sessionId) {
                db.logEvent({
                    sessionId: sessionId,
                    jid: jid,
                    eventType: 'stop'
                });
                db.stopSession(jid);
                stoppedCount++;
                console.log(`[ADMIN] Session ${jid} marked as stopped in database (${stoppedCount}/${totalTrackers})`);

                // Update progress for each stopped session
                socket.emit('disconnect-progress', {
                    step: 1,
                    message: `Fermato ${stoppedCount}/${totalTrackers} monitoraggi...`,
                    total: totalTrackers,
                    completed: stoppedCount
                });
            }
        }

        trackers.clear();
        sessionIds.clear();
        console.log('[ADMIN] All trackers stopped and sessions saved');

        // Step 2: Verify database state - count stopped sessions
        const stoppedSessions = db.getStoppedSessions();
        console.log(`[ADMIN] Verification: ${stoppedSessions.length} sessions now marked as stopped in database`);

        socket.emit('disconnect-progress', {
            step: 2,
            message: `Verificato: ${stoppedSessions.length} sessioni salvate nel database`,
            total: totalTrackers,
            completed: stoppedCount
        });

        // Step 3: Notify clients before disconnecting
        console.log('[ADMIN] Step 2: Notifying clients...');
        socket.emit('disconnect-progress', {
            step: 3,
            message: 'Disconnessione da WhatsApp...',
            total: totalTrackers,
            completed: stoppedCount
        });

        // Step 4: Close WhatsApp socket connection
        console.log('[ADMIN] Step 3: Logging out from WhatsApp...');
        try {
            if (sock) {
                await sock.logout();
                console.log('[ADMIN] WhatsApp session logged out');
            }
        } catch (err) {
            console.log('[ADMIN] Logout failed, proceeding with folder deletion');
        }

        // Step 5: Delete auth_info_baileys folder
        socket.emit('disconnect-progress', {
            step: 4,
            message: 'Eliminazione dati di autenticazione...',
            total: totalTrackers,
            completed: stoppedCount
        });

        console.log('[ADMIN] Step 4: Deleting auth folder...');
        const authDir = path.join(process.cwd(), 'auth_info_baileys');
        if (fs.existsSync(authDir)) {
            try {
                fs.rmSync(authDir, { recursive: true, force: true });
                console.log('[ADMIN] auth_info_baileys folder deleted');
            } catch (err) {
                console.error('[ADMIN] Failed to delete auth folder:', err);
            }
        }

        console.log('[ADMIN] WhatsApp disconnected successfully');

        // Step 6: Final notification and restart
        socket.emit('disconnect-progress', {
            step: 5,
            message: 'Riavvio server in corso...',
            total: totalTrackers,
            completed: stoppedCount,
            done: true
        });

        // Notify all clients to show QR code page
        io.emit('whatsapp-disconnected');

        // Exit process to trigger restart
        console.log('[ADMIN] Step 5: Restarting server now...');
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    });
});





// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SERVER] Shutting down...');
    db.closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[SERVER] Shutting down...');
    db.closeDatabase();
    process.exit(0);
});

httpServer.listen(config.serverPort, () => {
    console.log(`Server running on port ${config.serverPort}`);
});
