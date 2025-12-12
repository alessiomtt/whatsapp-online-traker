import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Square, Activity, Wifi, Smartphone, Monitor, ChevronDown, ChevronUp, Edit2, Zap, Check, X, History, ArrowLeft, Play, AlertCircle, Archive, RotateCcw, CheckCircle, FileSpreadsheet, FileText } from 'lucide-react';
import clsx from 'clsx';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { socket } from '../App';

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
    probeMethod?: 'reaction' | 'delete';
    calibrationProgress?: {
        current: number;
        total: number;
        warmupRemaining?: number;
    };
}

// Interface for DB activity events
interface DBActivityEvent {
    id: number;
    session_id: number;
    jid: string;
    event_type: string;
    state: string | null;
    timestamp: string;
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
    onRename,
    probeMethod = 'reaction',
    calibrationProgress
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

    // Activity log from database
    interface LogEvent {
        type: 'start' | 'stop' | 'restart' | 'calibration' | 'calibration_end' | 'online' | 'offline' | 'standby';
        timestamp: number;
        message: string;
    }

    const [dbActivityEvents, setDbActivityEvents] = useState<DBActivityEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [hasMoreEvents, setHasMoreEvents] = useState(false);
    const [totalEvents, setTotalEvents] = useState(0);
    const EVENTS_PER_PAGE = 100;

    // Load activity events from database when log is opened
    const loadActivityEvents = useCallback((offset: number = 0) => {
        setIsLoadingEvents(true);
        socket.emit('get-activity-events', { jid, limit: EVENTS_PER_PAGE, offset });
    }, [jid]);

    // Load more events (pagination)
    const loadMoreEvents = useCallback(() => {
        if (!isLoadingEvents && hasMoreEvents) {
            loadActivityEvents(dbActivityEvents.length);
        }
    }, [isLoadingEvents, hasMoreEvents, dbActivityEvents.length, loadActivityEvents]);

    // Reset and reload events when log is opened
    useEffect(() => {
        if (showLog) {
            // Always reload from beginning when opening log
            setDbActivityEvents([]);
            setHasMoreEvents(false);
            setTotalEvents(0);
            loadActivityEvents(0);
        }
    }, [showLog, loadActivityEvents]);

    useEffect(() => {
        const handleActivityEvents = (data: {
            jid: string;
            events: DBActivityEvent[];
            total: number;
            offset: number;
            hasMore: boolean;
        }) => {
            if (data.jid === jid) {
                if (data.offset === 0) {
                    // First page - replace all events
                    setDbActivityEvents(data.events);
                } else {
                    // Subsequent pages - append events
                    setDbActivityEvents(prev => [...prev, ...data.events]);
                }
                setHasMoreEvents(data.hasMore);
                setTotalEvents(data.total);
                setIsLoadingEvents(false);
            }
        };

        socket.on('activity-events', handleActivityEvents);
        return () => {
            socket.off('activity-events', handleActivityEvents);
        };
    }, [jid]);

    // Convert DB events to display format
    const activityLog = useMemo((): LogEvent[] => {
        if (dbActivityEvents.length === 0) return [];

        const getEventMessage = (eventType: string): string => {
            switch (eventType) {
                case 'start': return 'Monitoraggio avviato';
                case 'stop': return 'Monitoraggio interrotto';
                case 'online': return 'Online';
                case 'offline': return 'Offline';
                case 'standby': return 'Standby';
                case 'calibrating': return 'Calibrazione in corso';
                default: return eventType;
            }
        };

        const getEventType = (eventType: string): LogEvent['type'] => {
            switch (eventType) {
                case 'start': return 'start';
                case 'stop': return 'stop';
                case 'online': return 'online';
                case 'offline': return 'offline';
                case 'standby': return 'standby';
                case 'calibrating': return 'calibration';
                default: return 'online';
            }
        };

        return dbActivityEvents.map(event => {
            // SQLite stores CURRENT_TIMESTAMP in UTC as "YYYY-MM-DD HH:MM:SS" (no timezone indicator)
            // We need to parse it correctly as UTC
            let timestamp = event.timestamp;
            // If it doesn't have timezone indicator (Z or +/-), it's SQLite UTC format
            if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('T')) {
                // Convert "YYYY-MM-DD HH:MM:SS" to ISO format with UTC indicator
                timestamp = timestamp.replace(' ', 'T') + 'Z';
            }
            return {
                type: getEventType(event.event_type),
                timestamp: new Date(timestamp).getTime(),
                message: getEventMessage(event.event_type)
            };
        });
    }, [dbActivityEvents]);

    // Filter data to show only last 5 minutes for smooth scrolling effect
    const CHART_TIME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    const chartData = useMemo(() => {
        if (data.length === 0) return [];
        const now = Date.now();
        const cutoff = now - CHART_TIME_WINDOW_MS;
        return data.filter(d => d.timestamp >= cutoff);
    }, [data]);

    // Calculate state areas for colored background in chart (using filtered data)
    const stateAreas = useMemo(() => {
        if (chartData.length < 2) return [];

        const areas: { x1: number; x2: number; state: string; color: string }[] = [];
        let currentState = chartData[0].state;
        let startIndex = 0;

        const getStateColor = (state: string) => {
            if (state.includes('Online')) return 'rgba(34, 197, 94, 0.15)'; // green
            if (state === 'Standby') return 'rgba(234, 179, 8, 0.15)'; // yellow
            if (state === 'OFFLINE') return 'rgba(239, 68, 68, 0.15)'; // red
            return 'rgba(156, 163, 175, 0.1)'; // gray for calibrating
        };

        for (let i = 1; i < chartData.length; i++) {
            if (chartData[i].state !== currentState) {
                areas.push({
                    x1: chartData[startIndex].timestamp,
                    x2: chartData[i - 1].timestamp,
                    state: currentState,
                    color: getStateColor(currentState)
                });
                currentState = chartData[i].state;
                startIndex = i;
            }
        }

        // Add final area
        areas.push({
            x1: chartData[startIndex].timestamp,
            x2: chartData[chartData.length - 1].timestamp,
            state: currentState,
            color: getStateColor(currentState)
        });

        return areas;
    }, [chartData]);

    // Calculate dynamic Y-axis domain to keep threshold line roughly centered
    // This is purely visual - does NOT affect actual tracking data
    const yAxisDomain = useMemo(() => {
        if (chartData.length === 0) return [0, 1000];

        // Get the current threshold from the most recent data point
        const lastThreshold = chartData[chartData.length - 1]?.threshold || 500;

        // To keep threshold at ~45% of chart height:
        // yMax = threshold / 0.45 ≈ threshold * 2.2
        // This gives the threshold line a stable visual position
        const targetMax = Math.round(lastThreshold * 2.2);

        // Ensure minimum of 500ms and round to nice number
        const roundedMax = Math.max(
            Math.ceil(targetMax / 100) * 100,
            500
        );

        return [0, roundedMax];
    }, [chartData]);

    // Create display data with capped values for cleaner visualization
    // Spikes are visually clipped to yMax but original data is preserved for calculations
    // Also creates a separate spikeAvg for red spike line visualization
    const { displayChartData, maxSpikeValue, hasSpikes } = useMemo(() => {
        const yMax = yAxisDomain[1];
        let maxSpike = 0;
        let spikesExist = false;

        const data = chartData.map(d => {
            const isClipped = d.avg > yMax;
            if (isClipped) {
                spikesExist = true;
                maxSpike = Math.max(maxSpike, d.avg);
            }
            return {
                ...d,
                avg: Math.min(d.avg, yMax),
                rtt: Math.min(d.rtt, yMax),
                // spikeAvg: only set when clipped, used for red spike line
                spikeAvg: isClipped ? yMax : undefined,
            };
        });

        return {
            displayChartData: data,
            maxSpikeValue: maxSpike > 0 ? Math.round(maxSpike) : null,
            hasSpikes: spikesExist
        };
    }, [chartData, yAxisDomain]);

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
                                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    {/* Probe Method Toggle - only show when not stopped */}
                                    {!isStopped && (
                                        <button
                                            onClick={() => {
                                                const newMethod = probeMethod === 'reaction' ? 'delete' : 'reaction';
                                                socket.emit('set-probe-method', { jid, method: newMethod });
                                            }}
                                            className="flex items-center gap-1.5 ml-1"
                                            title={probeMethod === 'delete' ? 'Modalità Delete (silenzioso) - clicca per passare a Reaction' : 'Modalità Reaction - clicca per passare a Delete (silenzioso)'}
                                        >
                                            <span className={clsx(
                                                "text-xs font-medium transition-colors",
                                                probeMethod === 'reaction' ? "text-amber-600" : "text-gray-400"
                                            )}>R</span>
                                            <div className={clsx(
                                                "relative w-8 h-4 rounded-full transition-colors cursor-pointer",
                                                probeMethod === 'delete' ? "bg-purple-500" : "bg-amber-500"
                                            )}>
                                                <div className={clsx(
                                                    "absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform",
                                                    probeMethod === 'delete' ? "translate-x-4" : "translate-x-0.5"
                                                )} />
                                            </div>
                                            <span className={clsx(
                                                "text-xs font-medium transition-colors",
                                                probeMethod === 'delete' ? "text-purple-600" : "text-gray-400"
                                            )}>D</span>
                                        </button>
                                    )}
                                    {/* Status badge - only show when collapsed AND not stopped */}
                                    {isCollapsed && !isStopped && (
                                        calibrationProgress ? (
                                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                {calibrationProgress.current}/{calibrationProgress.total}
                                            </span>
                                        ) : (
                                            <span className={clsx(
                                                "px-2.5 py-1 rounded-full text-xs font-medium",
                                                getStatusColor(currentStatus)
                                            )}>
                                                {currentStatus}
                                            </span>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {isStopped ? (
                            /* Stopped State - Log, Terminato, Archivia, Riavvia */
                            <>
                                <button
                                    onClick={() => {
                                        setShowLog(true);
                                        setIsCollapsed(false);
                                    }}
                                    className="px-2.5 py-1.5 bg-white text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-blue-200"
                                >
                                    <History size={14} /> Log
                                </button>
                                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200">
                                    <Square size={12} className="text-red-600" />
                                    <span className="text-xs font-semibold text-red-700">Terminato</span>
                                </div>
                                <button
                                    onClick={handleArchiveClick}
                                    className="px-3 py-1.5 bg-white text-orange-600 hover:bg-orange-50 rounded-lg flex items-center gap-1.5 font-medium transition-colors text-xs border border-orange-200"
                                >
                                    <Archive size={14} /> Archivia
                                </button>
                                <button
                                    onClick={handleRestartClick}
                                    className="px-3 py-1.5 bg-white text-green-600 hover:bg-green-50 rounded-lg flex items-center gap-1.5 font-medium transition-colors text-xs border border-green-200"
                                >
                                    <RotateCcw size={14} /> Riavvia
                                </button>
                            </>
                        ) : (
                            /* Running State - Log, Running indicator, Probe Method Toggle, Stop (far right) */
                            <>
                                <button
                                    onClick={() => {
                                        setShowLog(true);
                                        setIsCollapsed(false);
                                    }}
                                    className="px-2.5 py-1.5 bg-white text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border border-blue-200"
                                >
                                    <History size={14} /> Log
                                </button>
                                <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1.5 rounded-lg border border-green-200">
                                    <Zap size={12} className="text-green-600 animate-pulse fill-green-600" />
                                    <span className="text-xs font-semibold text-green-700 animate-pulse">Running</span>
                                </div>
                                <button
                                    onClick={handleStopClick}
                                    className="px-3 py-1.5 bg-white text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5 font-medium transition-colors text-xs border border-red-200"
                                >
                                    <Square size={14} fill="currentColor" /> Stop
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
                isCollapsed ? "max-h-0 opacity-0" : "max-h-[650px] opacity-100"
            )}>
                <div className="p-6">
                    {showLog ? (
                        /* Activity Log View */
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <History size={20} className="text-blue-600" />
                                        Storico Attività
                                    </h4>
                                    {totalEvents > 0 && (
                                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                            {activityLog.length}/{totalEvents} eventi
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <>
                                        <button
                                            onClick={() => exportToExcel({
                                                contactName: displayNumber !== jid.split('@')[0] ? displayNumber : undefined,
                                                contactNumber: jid.split('@')[0],
                                                jid: jid,
                                                events: activityLog
                                            })}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-white text-green-600 hover:bg-green-50 rounded-lg text-xs font-medium transition-colors border border-green-200"
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
                                                events: activityLog,
                                                profilePic: profilePic || undefined
                                            })}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-white text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors border border-red-200"
                                            title="Esporta in PDF"
                                        >
                                            <FileText size={14} />
                                            PDF
                                        </button>
                                    </>
                                    <button
                                        onClick={() => setShowLog(false)}
                                        className="px-3 py-1.5 bg-white text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors border border-gray-200"
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

                                {/* Load More Button */}
                                {hasMoreEvents && (
                                    <div className="mt-4 text-center">
                                        <button
                                            onClick={loadMoreEvents}
                                            disabled={isLoadingEvents}
                                            className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                        >
                                            {isLoadingEvents ? 'Caricamento...' : `Carica altri eventi (${activityLog.length}/${totalEvents})`}
                                        </button>
                                    </div>
                                )}

                                {/* All events loaded indicator */}
                                {!hasMoreEvents && activityLog.length > 0 && (
                                    <div className="mt-4 mb-2 text-center text-xs text-gray-400">
                                        Tutti gli eventi caricati ({activityLog.length})
                                    </div>
                                )}

                                {/* Spacer for bottom padding */}
                                {hasMoreEvents && <div className="h-2" />}
                            </div>
                        </div>
                    ) : (
                        /* Real-time Monitoring View */
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
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
                                    {calibrationProgress ? (
                                        <div className="flex flex-col gap-2 w-full">
                                            {/* Phase indicator badge */}
                                            <div className="flex items-center gap-2">
                                                {calibrationProgress.warmupRemaining && calibrationProgress.warmupRemaining > 0 ? (
                                                    <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800 animate-pulse flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping"></span>
                                                        🔥 Warmup {calibrationProgress.warmupRemaining} restanti
                                                    </span>
                                                ) : (
                                                    <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 flex items-center gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                                        📊 Calibrazione {calibrationProgress.current}/{calibrationProgress.total}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Progress bar */}
                                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className={clsx(
                                                        "h-full rounded-full transition-all duration-300",
                                                        calibrationProgress.warmupRemaining && calibrationProgress.warmupRemaining > 0
                                                            ? "bg-purple-500"
                                                            : "bg-blue-500"
                                                    )}
                                                    style={{
                                                        width: calibrationProgress.warmupRemaining && calibrationProgress.warmupRemaining > 0
                                                            ? '10%'  // Show minimal progress during warmup
                                                            : `${(calibrationProgress.current / calibrationProgress.total) * 100}%`
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <span className={clsx(
                                            "px-3 py-1 rounded-full text-sm font-medium",
                                            getStatusColor(currentStatus)
                                        )}>
                                            {currentStatus}
                                        </span>
                                    )}
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
                                    {/* Multi-device warning */}
                                    {deviceCount > 1 && (
                                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                            <div className="flex items-start gap-2">
                                                <AlertCircle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                                                <p className="text-xs text-amber-700">
                                                    <strong>Multi-device rilevato:</strong> WhatsApp Web/Desktop attivo può influenzare l'accuratezza del tracking. I dati sono più precisi quando il contatto usa solo il cellulare.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Device List */}
                                {devices.length > 0 && (
                                    <div className="w-full pt-4 border-t border-gray-100 mt-4">
                                        <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Device States</h5>
                                        <div className="space-y-1">
                                            {devices.map((device, idx) => (
                                                <div key={device.jid} className="flex items-center justify-between text-sm py-1">
                                                    <div className="flex items-center gap-2">
                                                        <Smartphone size={14} className="text-gray-400" />
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
                            <div className="md:col-span-2 flex flex-col gap-6 h-full">
                                {/* Compact Metrics Row */}
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200">
                                        <div className="text-xs text-gray-500">Avg RTT</div>
                                        <div className="text-lg font-bold text-gray-900">{lastData?.avg.toFixed(0) || '-'}<span className="text-xs font-normal text-gray-400 ml-0.5">ms</span></div>
                                    </div>
                                    <div className="bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200">
                                        <div className="text-xs text-gray-500">Median</div>
                                        <div className="text-lg font-bold text-gray-900">{lastData?.median.toFixed(0) || '-'}<span className="text-xs font-normal text-gray-400 ml-0.5">ms</span></div>
                                    </div>
                                    <div className="bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200">
                                        <div className="text-xs text-gray-500">Soglia</div>
                                        <div className="text-lg font-bold text-red-500">{lastData?.threshold.toFixed(0) || '-'}<span className="text-xs font-normal text-red-400 ml-0.5">ms</span></div>
                                    </div>
                                </div>

                                {/* Chart - flex-1 to fill remaining height */}
                                <div className={clsx(
                                    "p-6 rounded-xl shadow-sm border flex-1 min-h-[250px] flex flex-col transition-all duration-500",
                                    calibrationProgress
                                        ? calibrationProgress.warmupRemaining && calibrationProgress.warmupRemaining > 0
                                            ? "bg-purple-50 border-purple-200"
                                            : "bg-blue-50 border-blue-200"
                                        : "bg-white border-gray-200"
                                )}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <h5 className="text-sm font-medium text-gray-500">RTT History & Threshold</h5>
                                            {hasSpikes && maxSpikeValue && (
                                                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                                                    Max spike: {maxSpikeValue}ms
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-gray-400">Ultimi 5 minuti</span>
                                    </div>
                                    <div className="flex-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={displayChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />

                                                {/* Colored areas for state visualization */}
                                                {stateAreas.map((area, idx) => (
                                                    <ReferenceArea
                                                        key={idx}
                                                        x1={area.x1}
                                                        x2={area.x2}
                                                        y1={yAxisDomain[0]}
                                                        y2={yAxisDomain[1]}
                                                        fill={area.color}
                                                        fillOpacity={1}
                                                        ifOverflow="extendDomain"
                                                    />
                                                ))}

                                                {/* X Axis with formatted time */}
                                                <XAxis
                                                    dataKey="timestamp"
                                                    tickFormatter={(t: number) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                                    axisLine={{ stroke: '#e5e7eb' }}
                                                    tickLine={{ stroke: '#e5e7eb' }}
                                                    interval="preserveStartEnd"
                                                    minTickGap={50}
                                                />

                                                <YAxis
                                                    domain={yAxisDomain}
                                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                                    axisLine={{ stroke: '#e5e7eb' }}
                                                    tickLine={{ stroke: '#e5e7eb' }}
                                                    tickFormatter={(v: number) => `${v}`}
                                                    width={45}
                                                />

                                                {/* Enhanced Tooltip */}
                                                <Tooltip
                                                    content={({ active, payload, label }) => {
                                                        if (active && payload && payload.length) {
                                                            const dataPoint = payload[0].payload as TrackerData;
                                                            const stateColor = dataPoint.state.includes('Online') ? 'text-green-600' :
                                                                dataPoint.state === 'Standby' ? 'text-yellow-600' :
                                                                    dataPoint.state === 'OFFLINE' ? 'text-red-600' : 'text-gray-500';
                                                            const labelTime = typeof label === 'number' ? new Date(label).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                                                            return (
                                                                <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-100">
                                                                    <p className="text-xs text-gray-500 mb-1">
                                                                        {labelTime}
                                                                    </p>
                                                                    <p className={`text-sm font-semibold ${stateColor}`}>
                                                                        {dataPoint.state}
                                                                    </p>
                                                                    <div className="mt-1 space-y-0.5">
                                                                        <p className="text-xs"><span className="text-gray-500">RTT:</span> <span className="font-medium text-blue-600">{dataPoint.avg.toFixed(0)} ms</span></p>
                                                                        <p className="text-xs"><span className="text-gray-500">Soglia:</span> <span className="font-medium text-red-500">{dataPoint.threshold.toFixed(0)} ms</span></p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />

                                                {/* Lines */}
                                                <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} name="Avg RTT" isAnimationActive={false} />
                                                {/* Red spike line - only shows for clipped portions */}
                                                {hasSpikes && (
                                                    <Line
                                                        type="monotone"
                                                        dataKey="spikeAvg"
                                                        stroke="#ef4444"
                                                        strokeWidth={3}
                                                        dot={false}
                                                        name="Spike"
                                                        isAnimationActive={false}
                                                        connectNulls={false}
                                                    />
                                                )}
                                                <Line type="step" dataKey="threshold" stroke="#ef4444" strokeDasharray="5 5" dot={false} name="Threshold" isAnimationActive={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
