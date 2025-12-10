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

    socket.on('add-contact', async (number: string) => {
        console.log(`Request to track: ${number}`);

        // Validate phone number
        const validation = validatePhoneNumber(number);
        if (!validation.isValid) {
            socket.emit('error', { jid: null, message: validation.error || 'Invalid phone number' });
            return;
        }

        const targetJid = createWhatsAppJid(validation.cleaned);

        if (trackers.has(targetJid)) {
            socket.emit('error', { jid: targetJid, message: 'Already tracking this contact' });
            return;
        }

        try {
            const results = await sock.onWhatsApp(targetJid);
            const result = results?.[0];

            if (result?.exists) {
                // Create session in database
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

    socket.on('get-session-logs', (data: { jid: string, limit?: number }) => {
        const logs = db.getSessionLogs(data.jid, data.limit || 100);
        socket.emit('session-logs', { jid: data.jid, logs });
    });

    socket.on('update-name', (data: { jid: string, name: string }) => {
        console.log(`Request to rename ${data.jid} to ${data.name}`);
        db.updateSessionName(data.jid, data.name);
        io.emit('contact-name', data);
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
