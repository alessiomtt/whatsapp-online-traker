import React, { useEffect, useState } from 'react';
import { Disc, Archive, ArrowLeft, ArrowUp, RotateCcw, Trash2, History, FileSpreadsheet, FileText } from 'lucide-react';
import { socket } from '../App';
import { ContactCard } from './ContactCard';
import { CountrySelector } from './CountrySelector';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import clsx from 'clsx';

interface TrackerData {
    rtt: number;
    avg: number;
    median: number;
    threshold: number;
    state: string;
    timestamp: number;
}

interface DeviceInfo {
    jid: string;
    state: string;
    rtt: number;
    avg: number;
}

interface ContactInfo {
    jid: string;
    displayNumber: string;
    contactName: string;
    data: TrackerData[];
    devices: DeviceInfo[];
    deviceCount: number;
    presence: string | null;
    profilePic: string | null;
    isStopped?: boolean;
    archivedAt?: string | number;
    sessionId?: number;
}

interface DashboardProps {
    privacyMode: boolean;
}

export function Dashboard({ privacyMode }: DashboardProps) {
    const [inputNumber, setInputNumber] = useState('');
    const [contacts, setContacts] = useState<Map<string, ContactInfo>>(new Map());
    const [archivedContacts, setArchivedContacts] = useState<ContactInfo[]>([]);
    const [archiveLogs, setArchiveLogs] = useState<Map<string, TrackerData[]>>(new Map());
    const [archiveLogsMeta, setArchiveLogsMeta] = useState<Map<string, { total: number; hasMore: boolean; loading: boolean }>>(new Map());
    const [showArchive, setShowArchive] = useState(false);
    const [expandedArchiveLogs, setExpandedArchiveLogs] = useState<Set<string>>(new Set());
    const [confirmDeleteJid, setConfirmDeleteJid] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedPrefix, setSelectedPrefix] = useState('+39');


    // Contact status confirmation dialog state
    const [pendingContact, setPendingContact] = useState<{
        number: string;
        jid: string;
        status: 'active' | 'stopped' | 'archived';
        contactName?: string;
        profilePic?: string;
        archivedAt?: string;
    } | null>(null);


    // Request archived and stopped contacts from server on mount
    useEffect(() => {
        socket.emit('get-archived');
        socket.emit('get-stopped');
    }, []);


    useEffect(() => {
        function onTrackerUpdate(update: any) {
            const { jid, ...data } = update;
            if (!jid) return;

            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(jid);

                if (contact && !contact.isStopped) {
                    // Update existing contact (only if not stopped)
                    const updatedContact = { ...contact };

                    if (data.presence !== undefined) {
                        updatedContact.presence = data.presence;
                    }
                    if (data.deviceCount !== undefined) {
                        updatedContact.deviceCount = data.deviceCount;
                    }
                    if (data.devices !== undefined) {
                        updatedContact.devices = data.devices;
                    }

                    // Add to chart data
                    if (data.median !== undefined && data.devices && data.devices.length > 0) {
                        const newDataPoint: TrackerData = {
                            rtt: data.devices[0].rtt,
                            avg: data.devices[0].avg,
                            median: data.median,
                            threshold: data.threshold,
                            state: data.devices.find((d: DeviceInfo) => d.state.includes('Online'))?.state || data.devices[0].state,
                            timestamp: Date.now(),
                        };
                        // Add new point and limit to 1000 points to prevent memory issues
                        const MAX_DATA_POINTS = 1000;
                        const newData = [...updatedContact.data, newDataPoint];
                        updatedContact.data = newData.length > MAX_DATA_POINTS
                            ? newData.slice(-MAX_DATA_POINTS)
                            : newData;
                    }

                    next.set(jid, updatedContact);
                }

                return next;
            });
        }

        function onProfilePic(data: { jid: string, url: string | null }) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(data.jid);
                if (contact) {
                    next.set(data.jid, { ...contact, profilePic: data.url });
                }
                return next;
            });
        }

        function onContactName(data: { jid: string, name: string }) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(data.jid);
                if (contact) {
                    next.set(data.jid, { ...contact, contactName: data.name });
                }
                return next;
            });
        }

        function onContactAdded(data: { jid: string, number: string }) {
            setContacts(prev => {
                const next = new Map<string, ContactInfo>();
                const existing = prev.get(data.jid);

                // Create the contact entry (new or updated)
                const contactEntry: ContactInfo = existing ? {
                    ...existing,
                    isStopped: false,
                    // IMPORTANT: Keep existing data to preserve log history across restarts
                    // Only clear devices since they'll be re-detected
                    devices: []
                } : {
                    // Completely new contact (archived info will come from server events)
                    jid: data.jid,
                    displayNumber: data.number,
                    contactName: data.number,
                    data: [],
                    devices: [],
                    deviceCount: 0,
                    presence: null,
                    profilePic: null,
                    isStopped: false
                };

                // ADD THE NEW/RESTARTED CONTACT FIRST (to put it at the top)
                next.set(data.jid, contactEntry);

                // Then add all other existing contacts
                prev.forEach((contact, jid) => {
                    if (jid !== data.jid) {
                        next.set(jid, contact);
                    }
                });

                return next;
            });

            // Remove from archived list
            setArchivedContacts(prev => prev.filter(c => c.jid !== data.jid));
            setInputNumber('');
        }


        function onContactRemoved(jid: string) {
            // Mark as stopped instead of removing
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(jid);
                if (contact) {
                    next.set(jid, { ...contact, isStopped: true });
                }
                return next;
            });
        }

        function onError(data: { jid?: string, message: string }) {
            setError(data.message);
            setTimeout(() => setError(null), 3000);
        }

        // Archive events from server
        function onArchivedContacts(data: any[]) {
            setArchivedContacts(data.map(s => ({
                jid: s.jid,
                displayNumber: s.phoneNumber,
                contactName: s.customName || s.phoneNumber,
                data: [],
                devices: [],
                deviceCount: 0,
                presence: null,
                profilePic: s.profilePic,
                archivedAt: s.archivedAt,
                sessionId: s.sessionId
            })));
        }

        function onContactArchived(data: { jid: string, session: any }) {
            // Remove from active contacts
            setContacts(prev => {
                const next = new Map(prev);
                next.delete(data.jid);
                return next;
            });
            // Request updated archive list
            socket.emit('get-archived');
        }

        function onContactRestored(data: { jid: string, phoneNumber: string }) {
            // Remove from archived
            setArchivedContacts(prev => prev.filter(c => c.jid !== data.jid));
        }

        function onContactDeleted(jid: string) {
            setArchivedContacts(prev => prev.filter(c => c.jid !== jid));
            setConfirmDeleteJid(null);
        }

        function onSessionLogs(data: {
            jid: string;
            logs: any[];
            total: number;
            offset: number;
            hasMore: boolean;
        }) {
            // Convert database logs to TrackerData format
            // Include ALL event types: rtt, online, offline, standby, stop, start, restart
            const newTrackerData: TrackerData[] = data.logs
                .filter(log => {
                    const validTypes = ['rtt', 'online', 'offline', 'standby', 'stop', 'start'];
                    return validTypes.includes(log.event_type);
                })
                .map(log => {
                    // Fix timezone: SQLite stores UTC without indicator
                    let timestamp = log.timestamp;
                    if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('T')) {
                        timestamp = timestamp.replace(' ', 'T') + 'Z';
                    }
                    return {
                        rtt: log.rtt_value || 0,
                        avg: log.avg_rtt || 0,
                        median: log.median_rtt || 0,
                        threshold: log.threshold || 0,
                        state: log.state || log.event_type,
                        timestamp: new Date(timestamp).getTime()
                    };
                })
                .reverse(); // Oldest first for display

            setArchiveLogs(prev => {
                const next = new Map(prev);
                if (data.offset === 0) {
                    // First page - replace all
                    next.set(data.jid, newTrackerData);
                } else {
                    // Subsequent pages - prepend (since we reversed and they're older)
                    const existing = prev.get(data.jid) || [];
                    next.set(data.jid, [...newTrackerData, ...existing]);
                }
                return next;
            });

            // Update metadata
            setArchiveLogsMeta(prev => {
                const next = new Map(prev);
                next.set(data.jid, {
                    total: data.total,
                    hasMore: data.hasMore,
                    loading: false
                });
                return next;
            });
        }

        // Handle activity events (state changes only) - used for archive logs
        function onActivityEvents(data: {
            jid: string;
            events: any[];
            total: number;
            offset: number;
            hasMore: boolean;
        }) {
            // Convert database events to TrackerData format for LogView
            const newTrackerData: TrackerData[] = data.events
                .map(event => {
                    // Fix timezone: SQLite stores UTC without indicator
                    let timestamp = event.timestamp;
                    if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('T')) {
                        timestamp = timestamp.replace(' ', 'T') + 'Z';
                    }
                    return {
                        rtt: 0,
                        avg: 0,
                        median: 0,
                        threshold: 0,
                        state: event.event_type, // online, offline, standby, start, stop
                        timestamp: new Date(timestamp).getTime()
                    };
                })
                .reverse(); // Oldest first for display

            setArchiveLogs(prev => {
                const next = new Map(prev);
                if (data.offset === 0) {
                    // First page - replace all
                    next.set(data.jid, newTrackerData);
                } else {
                    // Subsequent pages - prepend (since we reversed and they're older)
                    const existing = prev.get(data.jid) || [];
                    next.set(data.jid, [...newTrackerData, ...existing]);
                }
                return next;
            });

            // Update metadata
            setArchiveLogsMeta(prev => {
                const next = new Map(prev);
                next.set(data.jid, {
                    total: data.total,
                    hasMore: data.hasMore,
                    loading: false
                });
                return next;
            });
        }

        // Handle contact status check response
        function onContactStatus(data: {
            number: string;
            jid?: string;
            status: 'active' | 'stopped' | 'archived' | 'not_found' | 'invalid';
            contactName?: string;
            profilePic?: string;
            archivedAt?: string;
            error?: string;
        }) {
            if (data.status === 'invalid') {
                setError(data.error || 'Numero non valido');
                setTimeout(() => setError(null), 3000);
                return;
            }

            if (data.status === 'not_found') {
                // New contact, proceed directly
                socket.emit('add-contact', data.number);
                return;
            }

            // Contact exists, show confirmation dialog
            setPendingContact({
                number: data.number,
                jid: data.jid!,
                status: data.status as 'active' | 'stopped' | 'archived',
                contactName: data.contactName,
                profilePic: data.profilePic,
                archivedAt: data.archivedAt
            });
        }

        // Handle stopped contacts sent on connection (from server restart or previous stopped sessions)
        function onStoppedContacts(data: any[]) {
            setContacts(prev => {
                const next = new Map(prev);
                data.forEach(s => {
                    // Only add if not already in the map (active ones take priority)
                    if (!next.has(s.jid)) {
                        next.set(s.jid, {
                            jid: s.jid,
                            displayNumber: s.phoneNumber,
                            contactName: s.customName || s.phoneNumber,
                            data: [],
                            devices: [],
                            deviceCount: 0,
                            presence: null,
                            profilePic: s.profilePic,
                            isStopped: true,
                            sessionId: s.sessionId
                        });
                    }
                });
                return next;
            });
        }

        // Handle database cleared event from admin panel
        function onDatabaseCleared() {
            setContacts(new Map());
            setArchivedContacts([]);
            setArchiveLogs(new Map());
        }

        socket.on('tracker-update', onTrackerUpdate);
        socket.on('profile-pic', onProfilePic);
        socket.on('contact-name', onContactName);
        socket.on('contact-added', onContactAdded);
        socket.on('contact-removed', onContactRemoved);
        socket.on('error', onError);
        socket.on('archived-contacts', onArchivedContacts);
        socket.on('contact-archived', onContactArchived);
        socket.on('contact-restored', onContactRestored);
        socket.on('contact-deleted', onContactDeleted);
        socket.on('session-logs', onSessionLogs);
        socket.on('activity-events', onActivityEvents);
        socket.on('contact-status', onContactStatus);
        socket.on('stopped-contacts', onStoppedContacts);
        socket.on('database-cleared', onDatabaseCleared);

        return () => {
            socket.off('tracker-update', onTrackerUpdate);
            socket.off('profile-pic', onProfilePic);
            socket.off('contact-name', onContactName);
            socket.off('contact-added', onContactAdded);
            socket.off('contact-removed', onContactRemoved);
            socket.off('error', onError);
            socket.off('archived-contacts', onArchivedContacts);
            socket.off('contact-archived', onContactArchived);
            socket.off('contact-restored', onContactRestored);
            socket.off('contact-deleted', onContactDeleted);
            socket.off('session-logs', onSessionLogs);
            socket.off('activity-events', onActivityEvents);
            socket.off('contact-status', onContactStatus);
            socket.off('stopped-contacts', onStoppedContacts);
            socket.off('database-cleared', onDatabaseCleared);

        };
    }, []);


    // Check contact status before adding
    const handleAdd = () => {
        if (!inputNumber) return;
        const fullNumber = (selectedPrefix + inputNumber).replace('+', '');
        // First check if contact already exists
        socket.emit('check-contact-status', fullNumber);
    };

    // Confirm adding an existing contact
    const handleConfirmAdd = () => {
        if (pendingContact) {
            if (pendingContact.status === 'active') {
                // Just move to top of list locally, don't restart tracking
                setContacts(prev => {
                    const next = new Map<string, ContactInfo>();
                    const existing = prev.get(pendingContact.jid);

                    if (existing) {
                        // Add this contact first (top of list)
                        next.set(pendingContact.jid, existing);

                        // Then add all other contacts
                        prev.forEach((contact, jid) => {
                            if (jid !== pendingContact.jid) {
                                next.set(jid, contact);
                            }
                        });
                    } else {
                        // Shouldn't happen, but return unchanged
                        return prev;
                    }

                    return next;
                });
            } else {
                // For stopped/archived, actually restart tracking
                socket.emit('add-contact', pendingContact.number);
            }
            setPendingContact(null);
            setInputNumber('');

        }
    };

    // Cancel adding an existing contact
    const handleCancelAdd = () => {
        setPendingContact(null);
    };


    const handleStop = (jid: string) => {
        // Stop tracking on server
        socket.emit('remove-contact', jid);
        // Mark as stopped locally immediately (server will also confirm)
        setContacts(prev => {
            const next = new Map(prev);
            const contact = next.get(jid);
            if (contact) {
                next.set(jid, { ...contact, isStopped: true });
            }
            return next;
        });
    };

    const handleRestart = (jid: string) => {
        const contact = contacts.get(jid);
        if (contact) {
            // Re-add to tracking (server will handle it)
            const number = contact.jid.split('@')[0];
            socket.emit('add-contact', number);
            // onContactAdded handler will reset the isStopped flag
        }
    };

    const handleArchive = (jid: string) => {
        // Tell server to archive
        socket.emit('archive-contact', jid);
        // Remove from local contacts (server will confirm via socket event)
        setContacts(prev => {
            const next = new Map(prev);
            next.delete(jid);
            return next;
        });
    };

    const handleRestoreFromArchive = (jid: string) => {
        const archived = archivedContacts.find(c => c.jid === jid);
        if (archived) {
            // Tell server to restore from archive (without auto-starting)
            socket.emit('restore-contact', jid);
            // Remove from archived list
            setArchivedContacts(prev => prev.filter(c => c.jid !== jid));
            // Add to active contacts as stopped
            setContacts(prev => {
                const next = new Map(prev);
                next.set(jid, {
                    ...archived,
                    isStopped: true,
                    data: [],
                    devices: []
                });
                return next;
            });
            // Switch to main view
            setShowArchive(false);
        }
    };

    const handleDeleteFromArchive = (jid: string) => {
        setConfirmDeleteJid(jid);
    };

    const confirmDelete = () => {
        if (confirmDeleteJid) {
            // Tell server to delete permanently
            socket.emit('delete-contact', confirmDeleteJid);
            setConfirmDeleteJid(null);
        }
    };

    const cancelDelete = () => {
        setConfirmDeleteJid(null);
    };

    const handleRename = (jid: string, newName: string) => {
        socket.emit('update-name', { jid, name: newName });
    };

    const ARCHIVE_LOGS_PER_PAGE = 100;

    const toggleArchiveLog = (jid: string) => {
        setExpandedArchiveLogs(prev => {
            const next = new Set(prev);
            if (next.has(jid)) {
                next.delete(jid);
            } else {
                next.add(jid);
                // Reset and fetch fresh logs from server when expanding
                setArchiveLogs(prev => {
                    const next = new Map(prev);
                    next.delete(jid);
                    return next;
                });
                setArchiveLogsMeta(prev => {
                    const next = new Map(prev);
                    next.set(jid, { total: 0, hasMore: false, loading: true });
                    return next;
                });
                socket.emit('get-activity-events', { jid, limit: ARCHIVE_LOGS_PER_PAGE, offset: 0 });
            }
            return next;
        });
    };

    const loadMoreArchiveLogs = (jid: string) => {
        const meta = archiveLogsMeta.get(jid);
        const currentLogs = archiveLogs.get(jid) || [];
        if (meta && meta.hasMore && !meta.loading) {
            // Set loading state
            setArchiveLogsMeta(prev => {
                const next = new Map(prev);
                next.set(jid, { ...meta, loading: true });
                return next;
            });
            // Request next page - offset is based on total loaded so far
            socket.emit('get-activity-events', {
                jid,
                limit: ARCHIVE_LOGS_PER_PAGE,
                offset: currentLogs.length
            });
        }
    };

    // Archive View
    if (showArchive) {
        return (
            <div className="space-y-6">
                {/* Archive Header */}
                <div className="bg-amber-50 p-6 rounded-xl shadow-sm border border-amber-200">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <Archive size={24} className="text-amber-600" />
                            <h2 className="text-xl font-semibold text-amber-900">Archivio Contatti</h2>
                            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-sm font-medium">
                                {archivedContacts.length} contatti
                            </span>
                        </div>
                        <button
                            onClick={() => setShowArchive(false)}
                            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 font-medium transition-colors"
                        >
                            <ArrowLeft size={18} /> Torna al Monitoraggio
                        </button>
                    </div>
                </div>

                {/* Archived Contacts */}
                {archivedContacts.length === 0 ? (
                    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                        <Archive size={48} className="mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-500 text-lg">Nessun contatto archiviato</p>
                        <p className="text-gray-400 text-sm mt-2">I contatti archiviati appariranno qui</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {archivedContacts.map(contact => (
                            <div key={contact.jid} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                {/* Collapsed Header */}
                                <div className="px-4 py-3 flex items-center justify-between gap-4 bg-gray-50">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
                                            {contact.profilePic ? (
                                                <img
                                                    src={contact.profilePic}
                                                    alt="Profile"
                                                    className={clsx("w-full h-full object-cover", privacyMode && "blur-sm")}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">?</div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-900 truncate">
                                                {privacyMode ? contact.contactName.replace(/\d/g, '•') : contact.contactName}
                                            </h3>
                                            <p className="text-xs text-gray-500">
                                                Archiviato: {new Date(contact.archivedAt || 0).toLocaleDateString('it-IT', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => toggleArchiveLog(contact.jid)}
                                            className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors border border-blue-100"
                                        >
                                            <History size={14} /> Log
                                        </button>
                                        <button
                                            onClick={() => handleRestoreFromArchive(contact.jid)}
                                            className="px-3 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors border border-green-100"
                                        >
                                            <RotateCcw size={14} /> Ripristina
                                        </button>
                                        <button
                                            onClick={() => handleDeleteFromArchive(contact.jid)}
                                            className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors border border-red-100"
                                        >
                                            <Trash2 size={14} /> Elimina
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Log View */}
                                {expandedArchiveLogs.has(contact.jid) && (
                                    <div className="p-4 border-t border-gray-100 bg-white">
                                        {archiveLogs.has(contact.jid) ? (
                                            <>
                                                {/* Header with count */}
                                                {archiveLogsMeta.get(contact.jid) && (
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                                            {(archiveLogs.get(contact.jid) || []).length}/{archiveLogsMeta.get(contact.jid)?.total || 0} eventi
                                                        </span>
                                                    </div>
                                                )}

                                                <LogView
                                                    data={archiveLogs.get(contact.jid) || []}
                                                    contactName={contact.displayNumber !== contact.jid.split('@')[0] ? contact.displayNumber : undefined}
                                                    contactNumber={contact.jid.split('@')[0]}
                                                    jid={contact.jid}
                                                    profilePic={contact.profilePic || undefined}
                                                />

                                                {/* Load More Button */}
                                                {archiveLogsMeta.get(contact.jid)?.hasMore && (
                                                    <div className="mt-4 text-center">
                                                        <button
                                                            onClick={() => loadMoreArchiveLogs(contact.jid)}
                                                            disabled={archiveLogsMeta.get(contact.jid)?.loading}
                                                            className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                        >
                                                            {archiveLogsMeta.get(contact.jid)?.loading
                                                                ? 'Caricamento...'
                                                                : `Carica altri eventi (${(archiveLogs.get(contact.jid) || []).length}/${archiveLogsMeta.get(contact.jid)?.total})`
                                                            }
                                                        </button>
                                                    </div>
                                                )}

                                                {/* All loaded indicator */}
                                                {!archiveLogsMeta.get(contact.jid)?.hasMore && (archiveLogs.get(contact.jid) || []).length > 0 && (
                                                    <div className="mt-4 mb-2 text-center text-xs text-gray-400">
                                                        Tutti gli eventi caricati ({(archiveLogs.get(contact.jid) || []).length})
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-center py-4 text-gray-500">
                                                <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                                                Caricamento log...
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {confirmDeleteJid && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in-95">
                            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-600 mx-auto mb-4">
                                <Trash2 size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Eliminare definitivamente?</h3>
                            <p className="text-gray-500 text-center mb-6">
                                Tutti i dati del monitoraggio, inclusi i log e lo storico, verranno eliminati permanentemente dal database.
                                <br /><br />
                                <span className="text-red-600 font-semibold">Questa azione non può essere annullata.</span>
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={cancelDelete}
                                    className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                                >
                                    Annulla
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
                                >
                                    Elimina
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Main Dashboard View
    return (
        <div className="space-y-6">
            {/* Add Contact Form */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Contatto da monitorare</h2>
                    {/* Archive Button - positioned on the right */}
                    <button
                        onClick={() => setShowArchive(true)}
                        className="px-3 py-1.5 bg-white text-amber-600 rounded-lg flex items-center gap-2 font-medium text-xs transition-all duration-200 hover:bg-amber-50 border border-amber-200"
                    >
                        <Archive size={16} />
                        <span>Archivio</span>
                        {archivedContacts.length > 0 && (
                            <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-xs font-bold">
                                {archivedContacts.length}
                            </span>
                        )}
                    </button>
                </div>
                <div className="flex gap-4">
                    <div className="flex flex-1 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white items-center">
                        <CountrySelector selectedPrefix={selectedPrefix} onSelect={setSelectedPrefix} />
                        <input
                            type="text"
                            placeholder="Numero di telefono (es. 3331234567)"
                            className="flex-1 px-4 py-2 outline-none h-full"
                            value={inputNumber}
                            onChange={(e) => setInputNumber(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                        />
                    </div>
                    <button
                        onClick={handleAdd}
                        className="px-4 py-1.5 bg-white text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-2 font-medium text-xs transition-colors border border-blue-200"
                    >
                        <Disc size={16} /> Avvia
                    </button>
                </div>
                {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
            </div>

            {/* Contact Cards */}
            {contacts.size === 0 ? (
                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                    <p className="text-gray-500 text-lg">Nessun monitoraggio attivo</p>
                    <p className="text-gray-400 text-sm mt-2">Aggiungi un contatto per iniziare il monitoraggio</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {Array.from(contacts.values()).map(contact => (
                        <ContactCard
                            key={contact.jid}
                            jid={contact.jid}
                            displayNumber={contact.contactName}
                            data={contact.data}
                            devices={contact.devices}
                            deviceCount={contact.deviceCount}
                            presence={contact.presence}
                            profilePic={contact.profilePic}
                            isStopped={contact.isStopped || false}
                            onStop={() => handleStop(contact.jid)}
                            onRestart={() => handleRestart(contact.jid)}
                            onArchive={() => handleArchive(contact.jid)}
                            privacyMode={privacyMode}
                            onRename={handleRename}
                        />
                    ))}
                </div>
            )}

            {/* Pending Contact Confirmation Modal */}
            {pendingContact && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in-95">
                        <div className="flex items-center gap-4 mb-4">
                            {pendingContact.profilePic ? (
                                <img
                                    src={pendingContact.profilePic}
                                    alt="Profile"
                                    className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                                />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-2xl border-2 border-gray-200">
                                    ?
                                </div>
                            )}
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    {pendingContact.contactName || pendingContact.number}
                                </h3>
                                <p className="text-sm text-gray-500">+{pendingContact.number}</p>
                            </div>
                        </div>

                        <div className={clsx(
                            "p-4 rounded-lg mb-4",
                            pendingContact.status === 'active' && "bg-green-50 border border-green-200",
                            pendingContact.status === 'stopped' && "bg-yellow-50 border border-yellow-200",
                            pendingContact.status === 'archived' && "bg-amber-50 border border-amber-200"
                        )}>
                            {pendingContact.status === 'active' && (
                                <>
                                    <p className="font-medium text-green-800 mb-1">
                                        ⚡ Contatto già in monitoraggio attivo
                                    </p>
                                    <p className="text-sm text-green-700">
                                        Questo numero è attualmente monitorato.
                                        Vuoi portarlo in cima alla lista?
                                    </p>
                                </>
                            )}
                            {pendingContact.status === 'stopped' && (
                                <>
                                    <p className="font-medium text-yellow-800 mb-1">
                                        ⏸️ Contatto con tracciamento interrotto
                                    </p>
                                    <p className="text-sm text-yellow-700">
                                        Il monitoraggio di questo numero è stato interrotto.
                                        Vuoi riavviare il tracciamento e portarlo in cima alla lista?
                                    </p>
                                </>
                            )}
                            {pendingContact.status === 'archived' && (
                                <>
                                    <p className="font-medium text-amber-800 mb-1">
                                        📦 Contatto in archivio
                                    </p>
                                    <p className="text-sm text-amber-700">
                                        Questo numero è nell'archivio
                                        {pendingContact.archivedAt && (
                                            <span> dal {new Date(pendingContact.archivedAt).toLocaleDateString('it-IT', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric'
                                            })}</span>
                                        )}.
                                        Vuoi estrarlo dall'archivio e riavviare il tracciamento?
                                        Lo storico dei log verrà mantenuto.
                                    </p>
                                </>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleCancelAdd}
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={handleConfirmAdd}
                                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2"
                            >
                                {pendingContact.status === 'active' ? <ArrowUp size={18} /> : <Disc size={18} />}
                                {pendingContact.status === 'active' ? 'Porta in cima' : pendingContact.status === 'archived' ? 'Estrai e Avvia' : 'Riavvia'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

    );
}

// Simple Log View component for archived contacts
function LogView({ data, contactName, contactNumber, jid, profilePic }: {
    data: TrackerData[];
    contactName?: string;
    contactNumber?: string;
    jid?: string;
    profilePic?: string;
}) {
    if (data.length === 0) {
        return (
            <div className="text-center text-gray-500 py-8">
                <History size={32} className="mx-auto mb-2 text-gray-400" />
                <p>Nessun log disponibile</p>
            </div>
        );
    }

    // Generate events from data
    const events: { type: string; timestamp: number; message: string }[] = [];

    if (data.length > 0) {
        events.push({ type: 'start', timestamp: data[0].timestamp, message: 'Monitoraggio avviato' });
    }

    let prevState = '';
    for (const entry of data) {
        const state = entry.state.toLowerCase();
        if (state !== prevState) {
            // Calibration events
            if (state.includes('calibrat')) {
                if (prevState && !prevState.includes('calibrat')) {
                    events.push({ type: 'calibration', timestamp: entry.timestamp, message: 'Calibrazione in corso' });
                }
            } else if (prevState.includes('calibrat')) {
                events.push({ type: 'calibration_end', timestamp: entry.timestamp, message: 'Calibrazione completata' });
            }

            // State transitions
            if (state.includes('online')) {
                events.push({ type: 'online', timestamp: entry.timestamp, message: 'Online' });
            } else if (state === 'standby') {
                events.push({ type: 'standby', timestamp: entry.timestamp, message: 'Standby' });
            } else if (state === 'offline') {
                events.push({ type: 'offline', timestamp: entry.timestamp, message: 'Offline' });
            } else if (state === 'stop') {
                events.push({ type: 'stop', timestamp: entry.timestamp, message: 'Monitoraggio interrotto' });
            } else if (state === 'start') {
                events.push({ type: 'restart', timestamp: entry.timestamp, message: 'Monitoraggio riavviato' });
            }
            prevState = state;
        }
    }

    const getEventStyle = (type: string) => {
        switch (type) {
            case 'start':
            case 'restart':
            case 'calibration':
                return 'bg-blue-50 border-l-blue-500 text-blue-800';
            case 'calibration_end':
                return 'bg-green-50 border-l-green-500 text-green-800';
            case 'online':
                return 'bg-green-50 border-l-green-500 text-green-800';
            case 'standby':
                return 'bg-yellow-50 border-l-yellow-500 text-yellow-800';
            case 'offline':
            case 'stop':
                return 'bg-red-50 border-l-red-500 text-red-800';
            default:
                return 'bg-gray-50 border-l-gray-400 text-gray-800';
        }
    };

    // Prepare events for export (reversed to show oldest first)
    const exportEvents = events.slice().reverse().map(e => ({
        type: e.type as 'start' | 'stop' | 'restart' | 'calibration' | 'calibration_end' | 'online' | 'offline' | 'standby',
        timestamp: e.timestamp,
        message: e.message
    }));

    return (
        <div>
            {/* Export buttons */}
            {contactNumber && events.length > 0 && (
                <div className="flex justify-end gap-2 mb-3">
                    <button
                        onClick={() => exportToExcel({
                            contactName,
                            contactNumber,
                            jid,
                            events: exportEvents
                        })}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                        title="Esporta in Excel"
                    >
                        <FileSpreadsheet size={14} />
                        Excel
                    </button>
                    <button
                        onClick={() => exportToPDF({
                            contactName,
                            contactNumber,
                            jid,
                            events: exportEvents,
                            profilePic
                        })}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                        title="Esporta in PDF"
                    >
                        <FileText size={14} />
                        PDF
                    </button>
                </div>
            )}
            <div className="max-h-60 overflow-y-auto space-y-1">
                {events.slice().reverse().map((event, idx) => (
                    <div key={idx} className={clsx("px-3 py-2 border-l-4 rounded-r text-sm", getEventStyle(event.type))}>
                        <span className="font-medium">{event.message}</span>
                        <span className="text-xs ml-2 opacity-70">
                            {new Date(event.timestamp).toLocaleDateString('it-IT', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
