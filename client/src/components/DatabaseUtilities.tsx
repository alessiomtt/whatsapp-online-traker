import React, { useState, useEffect } from 'react';
import { socket } from '../App';
import {
    Database, Download, Upload, Trash2, Search, Table,
    Calendar, ChevronLeft, ChevronRight, AlertCircle,
    HardDrive, Users, Activity, Clock, RefreshCw, Play,
    X, Check
} from 'lucide-react';

// Interfaces
interface DbStats {
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

interface Session {
    id: number;
    jid: string;
    phone_number: string;
    custom_name: string | null;
    is_active: number;
    is_archived: number;
    started_at: string;
    stopped_at: string | null;
}

interface TableSchema {
    tableName: string;
    columns: { name: string; type: string; notnull: number; pk: number }[];
}

interface ActivityEvent {
    id: number;
    jid: string;
    event_type: string;
    timestamp: string;
    rtt_value: number | null;
    state: string | null;
}

export function DatabaseUtilities() {
    // Tab state
    const [activeTab, setActiveTab] = useState<'stats' | 'sessions' | 'backup' | 'maintenance' | 'query' | 'schema' | 'events'>('stats');

    // Data states
    const [dbStats, setDbStats] = useState<DbStats | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [tableSchema, setTableSchema] = useState<TableSchema[]>([]);
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [eventTypes, setEventTypes] = useState<string[]>([]);
    const [eventsTotal, setEventsTotal] = useState(0);
    const [eventsPage, setEventsPage] = useState(1);
    const [eventsTotalPages, setEventsTotalPages] = useState(1);

    // Form states
    const [purgeDays, setPurgeDays] = useState(30);
    const [rawQuery, setRawQuery] = useState('SELECT * FROM sessions LIMIT 10');
    const [queryResult, setQueryResult] = useState<any>(null);
    const [eventFilters, setEventFilters] = useState({ jid: '', eventType: '', startDate: '', endDate: '' });

    // UI states
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ type: string; data?: any } | null>(null);

    // Load data on mount and tab change
    useEffect(() => {
        if (activeTab === 'stats') loadStats();
        if (activeTab === 'sessions') loadSessions();
        if (activeTab === 'schema') loadSchema();
        if (activeTab === 'events') loadEvents();
    }, [activeTab]);

    // Socket listeners
    useEffect(() => {
        const onDbStats = (data: DbStats) => {
            setDbStats(data);
            setLoading(false);
        };

        const onSessionsOverview = (data: Session[]) => {
            setSessions(data);
            setLoading(false);
        };

        const onTableSchema = (data: TableSchema[]) => {
            setTableSchema(data);
            setLoading(false);
        };

        const onEventsBrowser = (data: any) => {
            setEvents(data.events);
            setEventsTotal(data.totalCount);
            setEventsPage(data.page);
            setEventsTotalPages(data.totalPages);
            setEventTypes(data.eventTypes || []);
            setLoading(false);
        };

        const onRawQueryResult = (data: any) => {
            setQueryResult(data);
            setLoading(false);
        };

        const onPurgeResult = (data: any) => {
            showMessage('success', `Eliminati ${data.deleted} log`);
            loadStats();
        };

        const onClearLogsResult = (data: any) => {
            showMessage('success', `Eliminati ${data.deleted} log`);
            loadStats();
        };

        const onDeleteSessionResult = (data: any) => {
            showMessage('success', `Sessione ${data.jid} eliminata`);
            loadSessions();
        };

        const onExportResult = (data: any) => {
            if (data.success) {
                // Download the file
                const byteString = atob(data.data);
                const bytes = new Uint8Array(byteString.length);
                for (let i = 0; i < byteString.length; i++) {
                    bytes[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                a.click();
                URL.revokeObjectURL(url);
                showMessage('success', 'Database esportato con successo');
            } else {
                showMessage('error', data.error);
            }
            setLoading(false);
        };

        const onImportResult = (data: any) => {
            if (data.success) {
                showMessage('success', 'Database importato con successo');
                loadStats();
                loadSessions();
            } else {
                showMessage('error', data.error);
            }
            setLoading(false);
        };

        socket.on('db-stats', onDbStats);
        socket.on('sessions-overview', onSessionsOverview);
        socket.on('table-schema', onTableSchema);
        socket.on('events-browser-result', onEventsBrowser);
        socket.on('raw-query-result', onRawQueryResult);
        socket.on('purge-logs-result', onPurgeResult);
        socket.on('clear-logs-result', onClearLogsResult);
        socket.on('delete-session-result', onDeleteSessionResult);
        socket.on('export-db-result', onExportResult);
        socket.on('import-db-result', onImportResult);

        return () => {
            socket.off('db-stats', onDbStats);
            socket.off('sessions-overview', onSessionsOverview);
            socket.off('table-schema', onTableSchema);
            socket.off('events-browser-result', onEventsBrowser);
            socket.off('raw-query-result', onRawQueryResult);
            socket.off('purge-logs-result', onPurgeResult);
            socket.off('clear-logs-result', onClearLogsResult);
            socket.off('delete-session-result', onDeleteSessionResult);
            socket.off('export-db-result', onExportResult);
            socket.off('import-db-result', onImportResult);
        };
    }, []);

    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    const loadStats = () => {
        setLoading(true);
        socket.emit('admin-db-stats');
    };

    const loadSessions = () => {
        setLoading(true);
        socket.emit('admin-sessions-overview');
    };

    const loadSchema = () => {
        setLoading(true);
        socket.emit('admin-table-schema');
    };

    const loadEvents = (page = 1) => {
        setLoading(true);
        socket.emit('admin-events-browser', {
            ...eventFilters,
            limit: 20,
            offset: (page - 1) * 20
        });
    };

    const handleExport = () => {
        setLoading(true);
        socket.emit('admin-export-db');
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const arrayBuffer = reader.result as ArrayBuffer;
            const uint8Array = new Uint8Array(arrayBuffer);
            let binaryString = '';
            for (let i = 0; i < uint8Array.length; i++) {
                binaryString += String.fromCharCode(uint8Array[i]);
            }
            const base64 = btoa(binaryString);
            setConfirmAction({ type: 'import', data: base64 });
        };
        reader.readAsArrayBuffer(file);
    };

    const handlePurge = () => {
        setConfirmAction({ type: 'purge', data: purgeDays });
    };

    const handleClearLogs = () => {
        setConfirmAction({ type: 'clearLogs' });
    };

    const handleDeleteSession = (jid: string) => {
        setConfirmAction({ type: 'deleteSession', data: jid });
    };

    const executeConfirmAction = () => {
        if (!confirmAction) return;

        switch (confirmAction.type) {
            case 'purge':
                socket.emit('admin-purge-logs', { days: confirmAction.data });
                break;
            case 'clearLogs':
                socket.emit('admin-clear-logs');
                break;
            case 'deleteSession':
                socket.emit('admin-delete-session', { jid: confirmAction.data });
                break;
            case 'import':
                setLoading(true);
                socket.emit('admin-import-db', { base64Data: confirmAction.data });
                break;
        }
        setConfirmAction(null);
    };

    const executeQuery = () => {
        setLoading(true);
        setQueryResult(null);
        socket.emit('admin-raw-query', { sql: rawQuery });
    };

    const tabs = [
        { id: 'stats', label: 'Statistiche', icon: HardDrive },
        { id: 'sessions', label: 'Sessioni', icon: Users },
        { id: 'backup', label: 'Backup', icon: Download },
        { id: 'maintenance', label: 'Manutenzione', icon: Trash2 },
        { id: 'query', label: 'Query SQL', icon: Search },
        { id: 'schema', label: 'Schema', icon: Table },
        { id: 'events', label: 'Eventi', icon: Activity },
    ];

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                    <Database size={20} className="text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-800">Database Utilities</h3>
                </div>
            </div>

            {/* Message */}
            {message && (
                <div className={`mx-6 mt-4 p-3 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                    {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                    <span className="font-medium">{message.text}</span>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-gray-200 px-6">
                <div className="flex gap-1 overflow-x-auto py-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.id
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                {/* Stats Tab */}
                {activeTab === 'stats' && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <button onClick={loadStats} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Aggiorna
                            </button>
                        </div>
                        {dbStats ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-500">Dimensione DB</div>
                                    <div className="text-xl font-bold text-gray-900">{dbStats.fileSizeMB} MB</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-lg">
                                    <div className="text-sm text-blue-600">Sessioni Totali</div>
                                    <div className="text-xl font-bold text-blue-700">{dbStats.totalSessions}</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-lg">
                                    <div className="text-sm text-green-600">Attive</div>
                                    <div className="text-xl font-bold text-green-700">{dbStats.activeSessions}</div>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-lg">
                                    <div className="text-sm text-purple-600">Eventi Totali</div>
                                    <div className="text-xl font-bold text-purple-700">{dbStats.totalEvents.toLocaleString()}</div>
                                </div>
                                <div className="bg-yellow-50 p-4 rounded-lg">
                                    <div className="text-sm text-yellow-600">Stoppate</div>
                                    <div className="text-xl font-bold text-yellow-700">{dbStats.stoppedSessions}</div>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <div className="text-sm text-gray-500">Archiviate</div>
                                    <div className="text-xl font-bold text-gray-700">{dbStats.archivedSessions}</div>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg col-span-2">
                                    <div className="text-sm text-gray-500 flex items-center gap-1"><Clock size={14} /> Range Eventi</div>
                                    <div className="text-sm font-medium text-gray-700 mt-1">
                                        {formatDate(dbStats.oldestEvent)} → {formatDate(dbStats.newestEvent)}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">Caricamento...</div>
                        )}
                    </div>
                )}

                {/* Sessions Tab */}
                {activeTab === 'sessions' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">{sessions.length} sessioni</span>
                            <button onClick={loadSessions} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Aggiorna
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 px-3 font-medium text-gray-600">Nome/Numero</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-600">JID</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-600">Stato</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-600">Avviato</th>
                                        <th className="text-right py-2 px-3 font-medium text-gray-600">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map(s => (
                                        <tr key={s.jid} className="border-b hover:bg-gray-50">
                                            <td className="py-2 px-3 font-medium">{s.custom_name || s.phone_number}</td>
                                            <td className="py-2 px-3 text-gray-500 font-mono text-xs">{s.jid}</td>
                                            <td className="py-2 px-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' :
                                                    s.is_archived ? 'bg-gray-100 text-gray-600' :
                                                        'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                    {s.is_active ? 'Attiva' : s.is_archived ? 'Archiviata' : 'Stoppata'}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-gray-500">{formatDate(s.started_at)}</td>
                                            <td className="py-2 px-3 text-right">
                                                <button
                                                    onClick={() => handleDeleteSession(s.jid)}
                                                    className="text-red-600 hover:text-red-700 p-1"
                                                    title="Elimina"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Backup Tab */}
                {activeTab === 'backup' && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1 bg-blue-50 p-5 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                    <Download size={20} className="text-blue-600" />
                                    <h4 className="font-semibold text-blue-800">Esporta Database</h4>
                                </div>
                                <p className="text-sm text-blue-600 mb-4">Scarica una copia completa del database SQLite.</p>
                                <button
                                    onClick={handleExport}
                                    disabled={loading}
                                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                    {loading ? 'Esportazione...' : 'Esporta Backup'}
                                </button>
                            </div>

                            <div className="flex-1 bg-orange-50 p-5 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                    <Upload size={20} className="text-orange-600" />
                                    <h4 className="font-semibold text-orange-800">Importa Database</h4>
                                </div>
                                <p className="text-sm text-orange-600 mb-4">⚠️ Sovrascrive il database attuale. Tutti i tracker verranno fermati.</p>
                                <label className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium cursor-pointer flex items-center justify-center gap-2 transition-colors">
                                    <Upload size={16} />
                                    Importa File .db
                                    <input type="file" accept=".db" onChange={handleImport} className="hidden" />
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Maintenance Tab */}
                {activeTab === 'maintenance' && (
                    <div className="space-y-6">
                        <div className="bg-amber-50 p-5 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                                <Calendar size={20} className="text-amber-600" />
                                <h4 className="font-semibold text-amber-800">Elimina Log Vecchi</h4>
                            </div>
                            <p className="text-sm text-amber-600 mb-4">Elimina i log di attività più vecchi del periodo specificato.</p>
                            <div className="flex gap-3 items-center">
                                <input
                                    type="number"
                                    value={purgeDays}
                                    onChange={e => setPurgeDays(parseInt(e.target.value) || 1)}
                                    min={1}
                                    className="w-24 px-3 py-2 border rounded-lg"
                                />
                                <span className="text-amber-700">giorni</span>
                                <button
                                    onClick={handlePurge}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
                                >
                                    Elimina
                                </button>
                            </div>
                        </div>

                        <div className="bg-red-50 p-5 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                                <Trash2 size={20} className="text-red-600" />
                                <h4 className="font-semibold text-red-800">Svuota Tutti i Log</h4>
                            </div>
                            <p className="text-sm text-red-600 mb-4">Elimina tutti i log di attività. Le sessioni vengono mantenute.</p>
                            <button
                                onClick={handleClearLogs}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                            >
                                Svuota Log
                            </button>
                        </div>
                    </div>
                )}

                {/* Query Tab */}
                {activeTab === 'query' && (
                    <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <p className="text-sm text-gray-600 mb-3">⚠️ Solo query SELECT sono permesse per sicurezza.</p>
                            <textarea
                                value={rawQuery}
                                onChange={e => setRawQuery(e.target.value)}
                                className="w-full h-24 px-3 py-2 border rounded-lg font-mono text-sm resize-none"
                                placeholder="SELECT * FROM sessions LIMIT 10"
                            />
                            <button
                                onClick={executeQuery}
                                disabled={loading}
                                className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                            >
                                <Play size={16} /> Esegui Query
                            </button>
                        </div>

                        {queryResult && (
                            <div className="bg-gray-50 p-4 rounded-lg">
                                {queryResult.success ? (
                                    <>
                                        <div className="text-sm text-gray-600 mb-2">{queryResult.rowCount} risultati</div>
                                        <div className="overflow-x-auto">
                                            {queryResult.data && queryResult.data.length > 0 ? (
                                                <table className="w-full text-xs font-mono">
                                                    <thead>
                                                        <tr className="border-b">
                                                            {Object.keys(queryResult.data[0]).map(key => (
                                                                <th key={key} className="text-left py-1 px-2 font-medium">{key}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {queryResult.data.map((row: any, i: number) => (
                                                            <tr key={i} className="border-b">
                                                                {Object.values(row).map((val: any, j: number) => (
                                                                    <td key={j} className="py-1 px-2 max-w-xs truncate">{String(val ?? 'null')}</td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="text-gray-500">Nessun risultato</div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-red-600 flex items-center gap-2">
                                        <AlertCircle size={16} /> {queryResult.error}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Schema Tab */}
                {activeTab === 'schema' && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <button onClick={loadSchema} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Aggiorna
                            </button>
                        </div>
                        {tableSchema.map(table => (
                            <div key={table.tableName} className="bg-gray-50 p-4 rounded-lg">
                                <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                    <Table size={16} /> {table.tableName}
                                </h4>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left py-1 px-2 font-medium text-gray-600">Colonna</th>
                                            <th className="text-left py-1 px-2 font-medium text-gray-600">Tipo</th>
                                            <th className="text-left py-1 px-2 font-medium text-gray-600">Not Null</th>
                                            <th className="text-left py-1 px-2 font-medium text-gray-600">PK</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {table.columns.map(col => (
                                            <tr key={col.name} className="border-b">
                                                <td className="py-1 px-2 font-mono text-xs">{col.name}</td>
                                                <td className="py-1 px-2 text-gray-600">{col.type}</td>
                                                <td className="py-1 px-2">{col.notnull ? '✓' : ''}</td>
                                                <td className="py-1 px-2">{col.pk ? '🔑' : ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                )}

                {/* Events Tab */}
                {activeTab === 'events' && (
                    <div className="space-y-4">
                        {/* Filters */}
                        <div className="flex flex-wrap gap-3 items-center bg-gray-50 p-3 rounded-lg">
                            <select
                                value={eventFilters.jid}
                                onChange={e => setEventFilters({ ...eventFilters, jid: e.target.value })}
                                className="px-3 py-1.5 border rounded-lg text-sm"
                            >
                                <option value="">Tutti i contatti</option>
                                {sessions.map(s => (
                                    <option key={s.jid} value={s.jid}>{s.custom_name || s.phone_number}</option>
                                ))}
                            </select>
                            <select
                                value={eventFilters.eventType}
                                onChange={e => setEventFilters({ ...eventFilters, eventType: e.target.value })}
                                className="px-3 py-1.5 border rounded-lg text-sm"
                            >
                                <option value="">Tutti i tipi</option>
                                {eventTypes.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => loadEvents(1)}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                            >
                                Filtra
                            </button>
                        </div>

                        {/* Results */}
                        <div className="text-sm text-gray-500">{eventsTotal} eventi totali</div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 px-3 font-medium text-gray-600">Timestamp</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-600">JID</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-600">Tipo</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-600">RTT</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-600">Stato</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map(e => (
                                        <tr key={e.id} className="border-b hover:bg-gray-50">
                                            <td className="py-2 px-3 font-mono text-xs">{formatDate(e.timestamp)}</td>
                                            <td className="py-2 px-3 font-mono text-xs text-gray-500">{e.jid.split('@')[0]}</td>
                                            <td className="py-2 px-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${e.event_type === 'online' ? 'bg-green-100 text-green-700' :
                                                    e.event_type === 'offline' ? 'bg-red-100 text-red-700' :
                                                        e.event_type === 'standby' ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-gray-100 text-gray-700'
                                                    }`}>{e.event_type}</span>
                                            </td>
                                            <td className="py-2 px-3 text-gray-600">{e.rtt_value ? `${e.rtt_value}ms` : '-'}</td>
                                            <td className="py-2 px-3 text-gray-600">{e.state || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {eventsTotalPages > 1 && (
                            <div className="flex items-center justify-center gap-4">
                                <button
                                    onClick={() => loadEvents(eventsPage - 1)}
                                    disabled={eventsPage <= 1}
                                    className="p-2 rounded hover:bg-gray-100 disabled:opacity-30"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span className="text-sm text-gray-600">Pagina {eventsPage} di {eventsTotalPages}</span>
                                <button
                                    onClick={() => loadEvents(eventsPage + 1)}
                                    disabled={eventsPage >= eventsTotalPages}
                                    className="p-2 rounded hover:bg-gray-100 disabled:opacity-30"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            {confirmAction && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6">
                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                            <AlertCircle size={24} className="text-red-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Conferma Azione</h3>
                        <p className="text-gray-500 text-center text-sm mb-6">
                            {confirmAction.type === 'purge' && `Eliminare tutti i log più vecchi di ${confirmAction.data} giorni?`}
                            {confirmAction.type === 'clearLogs' && 'Eliminare TUTTI i log di attività?'}
                            {confirmAction.type === 'deleteSession' && `Eliminare definitivamente la sessione e tutti i suoi log?`}
                            {confirmAction.type === 'import' && 'Importare il database? Il database attuale verrà sovrascritto.'}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmAction(null)}
                                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={executeConfirmAction}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
                            >
                                Conferma
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
