import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Square, Activity, Wifi, Smartphone, Monitor, ChevronDown, ChevronUp, Edit2, Zap, Check, X, History, ArrowLeft, Play, AlertCircle, Archive, RotateCcw, CheckCircle, FileSpreadsheet, FileText } from 'lucide-react';
import clsx from 'clsx';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

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

interface ContactCardProps {
    jid: string;
    displayNumber: string;
    data: TrackerData[];
    devices: DeviceInfo[];
    deviceCount: number;
    presence: string | null;
    profilePic: string | null;
    isStopped: boolean;
    onStop: () => void;
    onRestart: () => void;
    onArchive: () => void;
    privacyMode?: boolean;
    onRename?: (jid: string, newName: string) => void;
}

export function ContactCard({
    jid,
    displayNumber,
    data,
    devices,
    deviceCount,
    presence,
    profilePic,
    isStopped,
    onStop,
    onRestart,
    onArchive,
    privacyMode = false,
    onRename
}: ContactCardProps) {
    const lastData = data[data.length - 1];
    const currentStatus = devices.length > 0
        ? (devices.find(d => d.state === 'OFFLINE')?.state ||
            devices.find(d => d.state.includes('Online'))?.state ||
            devices[0].state)
        : 'Unknown';

    const [isCollapsed, setIsCollapsed] = useState(isStopped);
    const [isEditing, setIsEditing] = useState(false);
    const [nameInput, setNameInput] = useState(displayNumber);
    const [showStopConfirm, setShowStopConfirm] = useState(false);
    const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);
    const [showLog, setShowLog] = useState(false);

    // Auto-collapse when stopped
    React.useEffect(() => {
        if (isStopped) {
            setIsCollapsed(true);
        }
    }, [isStopped]);

    // Blur phone number in privacy mode
    const blurredNumber = privacyMode ? displayNumber.replace(/\d/g, '•') : displayNumber;
    const isCustomName = displayNumber !== jid.split('@')[0];

    // Generate activity log from data transitions
    interface LogEvent {
        type: 'start' | 'stop' | 'restart' | 'calibration' | 'calibration_end' | 'online' | 'offline' | 'standby';
        timestamp: number;
        message: string;
    }

    const activityLog = useMemo(() => {
        const events: LogEvent[] = [];

        if (data.length > 0) {
            // First entry = start monitoring
            events.push({
                type: 'start',
                timestamp: data[0].timestamp,
                message: 'Monitoraggio avviato'
            });
        }

        let prevState = '';
        for (let i = 0; i < data.length; i++) {
            const entry = data[i];
            const state = entry.state.toLowerCase();

            if (state !== prevState) {
                if (state.includes('calibrat')) {
                    if (prevState && !prevState.includes('calibrat')) {
                        events.push({
                            type: 'calibration',
                            timestamp: entry.timestamp,
                            message: 'Calibrazione in corso'
                        });
                    }
                } else if (prevState.includes('calibrat')) {
                    events.push({
                        type: 'calibration_end',
                        timestamp: entry.timestamp,
                        message: 'Calibrazione completata'
                    });
                }

                // Handle state transitions
                if (state.includes('online')) {
                    events.push({
                        type: 'online',
                        timestamp: entry.timestamp,
                        message: 'Online'
                    });
                } else if (state === 'standby') {
                    events.push({
                        type: 'standby',
                        timestamp: entry.timestamp,
                        message: 'Standby'
                    });
                } else if (state === 'offline') {
                    events.push({
                        type: 'offline',
                        timestamp: entry.timestamp,
                        message: 'Offline'
                    });
                } else if (state === 'stop') {
                    events.push({
                        type: 'stop',
                        timestamp: entry.timestamp,
                        message: 'Monitoraggio interrotto'
                    });
                } else if (state === 'start') {
                    events.push({
                        type: 'restart',
                        timestamp: entry.timestamp,
                        message: 'Monitoraggio riavviato'
                    });
                }
                prevState = state;
            }
        }

        return events.reverse(); // Most recent first
    }, [data]);

    const handleSaveName = () => {
        if (onRename && nameInput.trim()) {
            onRename(jid, nameInput.trim());
            setIsEditing(false);
        }
    };

    const handleStopClick = () => {
        setShowStopConfirm(true);
    };

    const confirmStop = () => {
        onStop();
        setShowStopConfirm(false);
    };

    const cancelStop = () => {
        setShowStopConfirm(false);
    };

    const handleArchiveClick = () => {
        setShowArchiveConfirm(true);
    };

    const confirmArchive = () => {
        onArchive();
        setShowArchiveConfirm(false);
    };

    const cancelArchive = () => {
        setShowArchiveConfirm(false);
    };

    const handleRestartClick = () => {
        setShowRestartConfirm(true);
    };

    const confirmRestart = () => {
        onRestart();
        setShowRestartConfirm(false);
    };

    const cancelRestart = () => {
        setShowRestartConfirm(false);
    };

    // Helper to determine status color
    const getStatusColor = (status: string) => {
        const lower = status.toLowerCase();
        if (lower === 'offline') return "bg-red-100 text-red-700";
        if (lower.includes('online')) return "bg-green-100 text-green-700";
        if (lower === 'standby') return "bg-yellow-100 text-yellow-700";
        return "bg-gray-100 text-gray-700";
    };

    const isOnline = currentStatus.toLowerCase().includes('online');

    // Check if any confirmation is showing
    const showingAnyConfirm = showStopConfirm || showArchiveConfirm || showRestartConfirm;

    return (
        <div className={clsx(
            "rounded-xl shadow-lg border overflow-hidden transition-all duration-300 relative",
            isCollapsed && isOnline && !isStopped
                ? "bg-green-50 border-green-200"
                : isStopped
                    ? "bg-gray-50 border-gray-300"
                    : "bg-gradient-to-br from-white to-gray-50 border-gray-200"
        )}>
            {/* Header */}
            {!showingAnyConfirm || !isCollapsed ? (
                <div className={clsx(
                    "border-b px-4 py-3 flex items-center justify-between gap-4 transition-colors",
                    isCollapsed && isOnline && !isStopped ? "bg-green-50 border-green-100" :
                        isStopped ? "bg-gray-50 border-gray-200" : "bg-white border-gray-200"
                )}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                        >
                            {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                        </button>

                        {/* Collapsed State Info */}
                        {isCollapsed && (
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
                                {profilePic ? (
                                    <img
                                        src={profilePic}
                                        alt="Profile"
                                        className={clsx("w-full h-full object-cover", privacyMode && "blur-sm")}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">?</div>
                                )}
                            </div>
                        )}

                        <div className="flex-1 min-w-0">
                            {isEditing ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={nameInput}
                                        onChange={(e) => setNameInput(e.target.value)}
                                        className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                                        autoFocus
                                    />
                                    <button onClick={handleSaveName} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={16} /></button>
                                    <button onClick={() => setIsEditing(false)} className="p-1 text-red-600 hover:bg-red-50 rounded"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 group">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 truncate flex items-center gap-2">
                                            {blurredNumber}
                                        </h3>
                                        {isCustomName && (
                                            <p className="text-xs text-gray-400 font-mono">
                                                {privacyMode ? jid.split('@')[0].replace(/\d/g, '•') : jid.split('@')[0]}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setNameInput(displayNumber);
                                            setIsEditing(true);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-gray-100 rounded-full text-gray-500"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowLog(true);
                                            setIsCollapsed(false);
                                        }}
                                        className="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors border border-blue-100"
                                    >
                                        <History size={12} /> Log
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Collapsed Status Indicators (Rounded Full) */}
                        {isCollapsed && (
                            <div className="flex items-center gap-3 mr-2">
                                <span className={clsx(
                                    "px-3 py-1 rounded-full text-xs font-medium",
                                    getStatusColor(currentStatus)
                                )}>
                                    {currentStatus}
                                </span>
                            </div>
                        )}

                        {isStopped ? (
                            /* Stopped State - Show Archive and Restart buttons */
                            <>
                                <div className="flex items-center gap-1.5 bg-red-100 px-2.5 py-1 rounded-md border border-red-200">
                                    <Square size={12} className="text-red-600" />
                                    <span className="text-[11px] font-bold text-red-700">Terminato</span>
                                </div>
                                <button
                                    onClick={handleArchiveClick}
                                    className="bg-orange-500 text-white hover:bg-orange-600 px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all text-sm"
                                >
                                    <Archive size={16} /> Archivia
                                </button>
                                <button
                                    onClick={handleRestartClick}
                                    className="bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all text-sm"
                                >
                                    <RotateCcw size={16} /> Riavvia
                                </button>
                            </>
                        ) : (
                            /* Running State - Show Running indicator and Stop button */
                            <>
                                <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-md border border-green-100">
                                    <Zap size={12} className="text-green-600 animate-pulse fill-green-600" />
                                    <span className="text-[11px] font-bold text-green-700 animate-pulse">Running</span>
                                </div>
                                <button
                                    onClick={handleStopClick}
                                    className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all text-sm"
                                >
                                    <Square size={16} fill="currentColor" /> Stop
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ) : showStopConfirm && isCollapsed ? (
                /* Collapsed Stop Confirmation */
                <div className="bg-red-50 border-b border-red-100 px-4 py-3 flex items-center justify-between gap-4 animate-in fade-in duration-200">
                    <div className="flex items-center gap-3 text-red-800">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                            <Square size={14} fill="currentColor" />
                        </div>
                        <span className="font-semibold text-sm">Interrompere il monitoraggio?</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={cancelStop} className="px-3 py-1.5 bg-white border border-gray-200 rounded text-sm font-medium text-gray-600 hover:bg-gray-50">Annulla</button>
                        <button onClick={confirmStop} className="px-3 py-1.5 bg-red-600 rounded text-sm font-medium text-white hover:bg-red-700 shadow-sm">Conferma</button>
                    </div>
                </div>
            ) : showArchiveConfirm && isCollapsed ? (
                /* Collapsed Archive Confirmation */
                <div className="bg-orange-50 border-b border-orange-100 px-4 py-3 flex items-center justify-between gap-4 animate-in fade-in duration-200">
                    <div className="flex items-center gap-3 text-orange-800">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
                            <Archive size={14} />
                        </div>
                        <span className="font-semibold text-sm">Archiviare il contatto?</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={cancelArchive} className="px-3 py-1.5 bg-white border border-gray-200 rounded text-sm font-medium text-gray-600 hover:bg-gray-50">Annulla</button>
                        <button onClick={confirmArchive} className="px-3 py-1.5 bg-orange-500 rounded text-sm font-medium text-white hover:bg-orange-600 shadow-sm">Archivia</button>
                    </div>
                </div>
            ) : showRestartConfirm && isCollapsed ? (
                /* Collapsed Restart Confirmation */
                <div className="bg-green-50 border-b border-green-100 px-4 py-3 flex items-center justify-between gap-4 animate-in fade-in duration-200">
                    <div className="flex items-center gap-3 text-green-800">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-shrink-0">
                            <RotateCcw size={14} />
                        </div>
                        <span className="font-semibold text-sm">Riavviare il monitoraggio?</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={cancelRestart} className="px-3 py-1.5 bg-white border border-gray-200 rounded text-sm font-medium text-gray-600 hover:bg-gray-50">Annulla</button>
                        <button onClick={confirmRestart} className="px-3 py-1.5 bg-green-600 rounded text-sm font-medium text-white hover:bg-green-700 shadow-sm">Riavvia</button>
                    </div>
                </div>
            ) : null}

            {/* Confirmation Overlay for Expanded State - Stop */}
            {showStopConfirm && !isCollapsed && (
                <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-600 mb-4 shadow-sm">
                        <Square size={32} fill="currentColor" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Interrompere il monitoraggio?</h3>
                    <p className="text-gray-500 text-center mb-6 max-w-xs">
                        Sei sicuro di voler fermare il tracciamento di <span className="font-semibold text-gray-900">{blurredNumber}</span>?
                    </p>
                    <div className="flex gap-3 w-full max-w-xs">
                        <button
                            onClick={cancelStop}
                            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                        >
                            Annulla
                        </button>
                        <button
                            onClick={confirmStop}
                            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
                        >
                            Conferma
                        </button>
                    </div>
                </div>
            )}

            {/* Confirmation Overlay for Archive */}
            {showArchiveConfirm && !isCollapsed && (
                <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 mb-4 shadow-sm">
                        <Archive size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Archiviare il contatto?</h3>
                    <p className="text-gray-500 text-center mb-6 max-w-xs">
                        <span className="font-semibold text-gray-900">{blurredNumber}</span> verrà spostato nell'archivio. Potrai ripristinarlo in qualsiasi momento.
                    </p>
                    <div className="flex gap-3 w-full max-w-xs">
                        <button
                            onClick={cancelArchive}
                            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                        >
                            Annulla
                        </button>
                        <button
                            onClick={confirmArchive}
                            className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors shadow-sm"
                        >
                            Archivia
                        </button>
                    </div>
                </div>
            )}

            {/* Confirmation Overlay for Restart */}
            {showRestartConfirm && !isCollapsed && (
                <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center text-green-600 mb-4 shadow-sm">
                        <RotateCcw size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Riavviare il monitoraggio?</h3>
                    <p className="text-gray-500 text-center mb-6 max-w-xs">
                        Il tracciamento di <span className="font-semibold text-gray-900">{blurredNumber}</span> ripartirà da zero.
                    </p>
                    <div className="flex gap-3 w-full max-w-xs">
                        <button
                            onClick={cancelRestart}
                            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                        >
                            Annulla
                        </button>
                        <button
                            onClick={confirmRestart}
                            className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors shadow-sm"
                        >
                            Riavvia
                        </button>
                    </div>
                </div>
            )}

            {/* Content (Collapsible) */}
            <div className={clsx(
                "transition-[max-height,opacity] duration-300 ease-in-out overflow-hidden",
                isCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
            )}>
                <div className="p-6">
                    {showLog ? (
                        /* Activity Log View */
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <History size={20} className="text-blue-600" />
                                    Storico Attività
                                </h4>
                                <div className="flex items-center gap-2">
                                    {activityLog.length > 0 && (
                                        <>
                                            <button
                                                onClick={() => exportToExcel({
                                                    contactName: displayNumber !== jid.split('@')[0] ? displayNumber : undefined,
                                                    contactNumber: jid.split('@')[0],
                                                    jid: jid,
                                                    events: activityLog
                                                })}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                                                title="Esporta in Excel"
                                            >
                                                <FileSpreadsheet size={14} />
                                                Excel
                                            </button>
                                            <button
                                                onClick={() => exportToPDF({
                                                    contactName: displayNumber !== jid.split('@')[0] ? displayNumber : undefined,
                                                    contactNumber: jid.split('@')[0],
                                                    jid: jid,
                                                    events: activityLog
                                                })}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                                                title="Esporta in PDF"
                                            >
                                                <FileText size={14} />
                                                PDF
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => setShowLog(false)}
                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                                    >
                                        <ArrowLeft size={14} /> Monitoraggio
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-h-[400px] overflow-y-auto">
                                {activityLog.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500">
                                        <AlertCircle size={32} className="mx-auto mb-2 text-gray-400" />
                                        <p>Nessun evento registrato</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {activityLog.map((event, idx) => {
                                            const getEventStyle = () => {
                                                switch (event.type) {
                                                    case 'start':
                                                    case 'restart':
                                                    case 'calibration':
                                                        return 'bg-blue-50 border-l-4 border-l-blue-500';
                                                    case 'calibration_end':
                                                        return 'bg-green-50 border-l-4 border-l-green-500';
                                                    case 'online':
                                                        return 'bg-green-50 border-l-4 border-l-green-500';
                                                    case 'standby':
                                                        return 'bg-yellow-50 border-l-4 border-l-yellow-500';
                                                    case 'offline':
                                                        return 'bg-red-50 border-l-4 border-l-red-500';
                                                    case 'stop':
                                                        return 'bg-red-50 border-l-4 border-l-red-500';
                                                    default:
                                                        return 'bg-gray-50 border-l-4 border-l-gray-400';
                                                }
                                            };

                                            const getEventIcon = () => {
                                                switch (event.type) {
                                                    case 'start':
                                                        return <Play size={14} className="text-blue-600" />;
                                                    case 'calibration':
                                                        return <Activity size={14} className="text-blue-600" />;
                                                    case 'calibration_end':
                                                        return <CheckCircle size={14} className="text-green-600" />;
                                                    case 'online':
                                                        return <Zap size={14} className="text-green-600 fill-green-600" />;
                                                    case 'standby':
                                                        return <Monitor size={14} className="text-yellow-600" />;
                                                    case 'offline':
                                                        return <Wifi size={14} className="text-red-600" />;
                                                    default:
                                                        return <AlertCircle size={14} className="text-gray-500" />;
                                                }
                                            };

                                            const getEventTextColor = () => {
                                                switch (event.type) {
                                                    case 'start':
                                                    case 'restart':
                                                    case 'calibration':
                                                        return 'text-blue-800';
                                                    case 'calibration_end':
                                                        return 'text-green-800';
                                                    case 'offline':
                                                    case 'stop':
                                                        return 'text-red-800';
                                                    case 'online':
                                                        return 'text-green-800';
                                                    case 'standby':
                                                        return 'text-yellow-800';
                                                    default:
                                                        return 'text-gray-800';
                                                }
                                            };

                                            return (
                                                <div key={idx} className={clsx("px-4 py-3 flex items-center gap-3", getEventStyle())}>
                                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center">
                                                        {getEventIcon()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={clsx("font-semibold text-sm", getEventTextColor())}>
                                                            {event.message}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(event.timestamp).toLocaleDateString('it-IT', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric'
                                                            })} alle {new Date(event.timestamp).toLocaleTimeString('it-IT', {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                                second: '2-digit'
                                                            })}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Real-time Monitoring View */
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Status Card */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center text-center">
                                <div className="relative mb-4">
                                    <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-100 border-4 border-white shadow-md">
                                        {profilePic ? (
                                            <img
                                                src={profilePic}
                                                alt="Profile"
                                                className={clsx(
                                                    "w-full h-full object-cover transition-all duration-200",
                                                    privacyMode && "blur-xl scale-110"
                                                )}
                                                style={privacyMode ? {
                                                    filter: 'blur(16px) contrast(0.8)',
                                                } : {}}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                No Image
                                            </div>
                                        )}
                                    </div>
                                    <div className={clsx(
                                        "absolute bottom-2 right-2 w-6 h-6 rounded-full border-2 border-white",
                                        currentStatus === 'OFFLINE' ? "bg-red-500" :
                                            currentStatus.includes('Online') ? "bg-green-500" : "bg-gray-400"
                                    )} />
                                </div>

                                <div className="flex items-center gap-2 mb-4">
                                    <span className={clsx(
                                        "px-3 py-1 rounded-full text-sm font-medium",
                                        getStatusColor(currentStatus)
                                    )}>
                                        {currentStatus}
                                    </span>
                                </div>

                                <div className="mb-4">
                                    <h4 className="text-xl font-bold text-gray-900 leading-tight">{blurredNumber}</h4>
                                    {isCustomName && (
                                        <p className="text-xs text-gray-400 font-mono mt-1">
                                            {privacyMode ? jid.split('@')[0].replace(/\d/g, '•') : jid.split('@')[0]}
                                        </p>
                                    )}
                                </div>

                                <div className="w-full pt-4 border-t border-gray-100 space-y-2">
                                    <div className="flex justify-between items-center text-sm text-gray-600">
                                        <span className="flex items-center gap-1"><Wifi size={16} /> Official Status</span>
                                        <span className="font-medium">{presence || 'Unknown'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm text-gray-600">
                                        <span className="flex items-center gap-1"><Smartphone size={16} /> Devices</span>
                                        <span className="font-medium">{deviceCount || 0}</span>
                                    </div>
                                </div>

                                {/* Device List */}
                                {devices.length > 0 && (
                                    <div className="w-full pt-4 border-t border-gray-100 mt-4">
                                        <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Device States</h5>
                                        <div className="space-y-1">
                                            {devices.map((device, idx) => (
                                                <div key={device.jid} className="flex items-center justify-between text-sm py-1">
                                                    <div className="flex items-center gap-2">
                                                        <Monitor size={14} className="text-gray-400" />
                                                        <span className="text-gray-600">Device {idx + 1}</span>
                                                    </div>
                                                    <span className={clsx(
                                                        "px-2 py-0.5 rounded text-xs font-medium",
                                                        getStatusColor(device.state)
                                                    )}>
                                                        {device.state}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Metrics & Chart */}
                            <div className="md:col-span-2 space-y-6">
                                {/* Metrics Grid */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                        <div className="text-sm text-gray-500 mb-1 flex items-center gap-1"><Activity size={16} /> Current Avg RTT</div>
                                        <div className="text-2xl font-bold text-gray-900">{lastData?.avg.toFixed(0) || '-'} ms</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                        <div className="text-sm text-gray-500 mb-1">Median (50)</div>
                                        <div className="text-2xl font-bold text-gray-900">{lastData?.median.toFixed(0) || '-'} ms</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                        <div className="text-sm text-gray-500 mb-1">Threshold</div>
                                        <div className="text-2xl font-bold text-blue-600">{lastData?.threshold.toFixed(0) || '-'} ms</div>
                                    </div>
                                </div>

                                {/* Chart */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-[300px]">
                                    <h5 className="text-sm font-medium text-gray-500 mb-4">RTT History & Threshold</h5>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={data}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                            <XAxis dataKey="timestamp" hide />
                                            <YAxis domain={['auto', 'auto']} />
                                            <Tooltip
                                                labelFormatter={(t: number) => new Date(t).toLocaleTimeString()}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} name="Avg RTT" isAnimationActive={false} />
                                            <Line type="step" dataKey="threshold" stroke="#ef4444" strokeDasharray="5 5" dot={false} name="Threshold" isAnimationActive={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
