
import { initDatabase, getActiveSessions, getSessionByJid, getStoppedSessions, getDatabase } from './src/services/database';
import { createWhatsAppJid } from './src/utils/validation';

// Initialize DB (path might need adjustment if run from root)
console.log('Current directory:', process.cwd());
initDatabase();

const number = '393518774637';
const jid = createWhatsAppJid(number);

console.log(`\n--- Checking DB for JID: ${jid} ---`);

// Check active sessions (should be empty if server was restarted)
const active = getActiveSessions();
console.log(`\nActive Sessions Count: ${active.length}`);
active.forEach(s => console.log(`- ${s.jid} (Started: ${s.started_at})`));

const specific = getActiveSessions().find(s => s.jid === jid);
console.log(`\nSpecific active session found? ${!!specific}`);

// Check stopped sessions
const stopped = getStoppedSessions();
const stoppedSpecific = stopped.filter(s => s.jid === jid);
console.log(`\nStopped sessions for JID: ${stoppedSpecific.length}`);
stoppedSpecific.forEach(s => console.log(`- ${s.jid} (Stopped: ${s.stopped_at})`));

// Check ALL sessions raw query
const db = getDatabase();
const allSessions = db.prepare('SELECT * FROM sessions WHERE jid = ? ORDER BY id DESC LIMIT 5').all(jid);
console.log('\nLast 5 sessions for JID (Active/Stopped/Archived):');
console.log(JSON.stringify(allSessions, null, 2));
