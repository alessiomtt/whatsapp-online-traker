import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowLeft, GitCompareArrows, Calendar, Clock, Users, TrendingUp, FileSpreadsheet, FileText, ChevronDown, Check, Search, X, ZoomIn, ZoomOut, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { socket } from '../App';
import { exportComparisonToExcel, exportComparisonToPDF } from '../utils/exportUtils';

interface ContactForComparison {
    jid: string;
    phoneNumber: string;
    customName: string | null;
    profilePic: string | null;
    isActive: boolean;
    isArchived: boolean;
    startedAt: string;
    stoppedAt: string | null;
    archivedAt: string | null;
}

interface ActivityEvent {
    id: number;
    session_id: number;
    jid: string;
    event_type: string;
    timestamp: string;
}

interface OnlinePeriod {
    start: string;
    end: string;
    durationMs: number;
}

interface OverlapPeriod {
    start: string;
    end: string;
    durationMs: number;
}

interface ComparisonStatistics {
    totalOnline1Ms: number;
    totalOnline2Ms: number;
    totalOverlapMs: number;
    overlapPercentage: number;
    overlapCount: number;
    mostCommonOverlapHour: number;
}

interface ComparisonData {
    jid1: string;
    jid2: string;
    events1: ActivityEvent[];
    events2: ActivityEvent[];
    periods1: OnlinePeriod[];
    periods2: OnlinePeriod[];
    overlaps: OverlapPeriod[];
    statistics: ComparisonStatistics;
}

interface ComparePageProps {
    onBack: () => void;
    privacyMode: boolean;
}

type HeatmapView = 'daily' | 'weekly' | 'monthly';

// Format duration in human readable format
function formatDuration(ms: number): string {
    if (ms < 1000) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}g ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// Format hour to HH:00
function formatHour(hour: number): string {
    return `${hour.toString().padStart(2, '0')}:00`;
}

// Format date for display
function formatDateShort(date: Date): string {
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function formatDateTime(date: Date): string {
    return date.toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function ComparePage({ onBack, privacyMode }: ComparePageProps) {
    const [contacts, setContacts] = useState<ContactForComparison[]>([]);
    const [selectedContact1, setSelectedContact1] = useState<ContactForComparison | null>(null);
    const [selectedContact2, setSelectedContact2] = useState<ContactForComparison | null>(null);
    const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showSelector1, setShowSelector1] = useState(false);
    const [showSelector2, setShowSelector2] = useState(false);
    const [searchQuery1, setSearchQuery1] = useState('');
    const [searchQuery2, setSearchQuery2] = useState('');
    const [heatmapView, setHeatmapView] = useState<HeatmapView>('weekly');

    // Timeline zoom/scroll state
    const [timelineZoom, setTimelineZoom] = useState(1); // 1 = full view
    const [timelineOffset, setTimelineOffset] = useState(0); // 0-100 percentage offset
    const timelineRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartOffset, setDragStartOffset] = useState(0);

    // Date range filter
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // Fetch contacts on mount
    useEffect(() => {
        socket.emit('get-contacts-for-comparison');

        const onContacts = (data: ContactForComparison[]) => {
            setContacts(data);
        };

        const onComparisonData = (data: ComparisonData) => {
            setComparisonData(data);
            setIsLoading(false);
            // Reset zoom when new data arrives
            setTimelineZoom(1);
            setTimelineOffset(0);
        };

        socket.on('contacts-for-comparison', onContacts);
        socket.on('comparison-data', onComparisonData);

        return () => {
            socket.off('contacts-for-comparison', onContacts);
            socket.off('comparison-data', onComparisonData);
        };
    }, []);

    // Request comparison when both contacts selected
    const handleCompare = () => {
        if (!selectedContact1 || !selectedContact2) return;

        setIsLoading(true);
        socket.emit('get-comparison-data', {
            jid1: selectedContact1.jid,
            jid2: selectedContact2.jid,
            startDate: startDate || undefined,
            endDate: endDate || undefined
        });
    };

    // Filter contacts based on search
    const filteredContacts1 = useMemo(() => {
        return contacts.filter(c => {
            if (c.jid === selectedContact2?.jid) return false;
            const name = (c.customName || c.phoneNumber).toLowerCase();
            return name.includes(searchQuery1.toLowerCase());
        });
    }, [contacts, searchQuery1, selectedContact2]);

    const filteredContacts2 = useMemo(() => {
        return contacts.filter(c => {
            if (c.jid === selectedContact1?.jid) return false;
            const name = (c.customName || c.phoneNumber).toLowerCase();
            return name.includes(searchQuery2.toLowerCase());
        });
    }, [contacts, searchQuery2, selectedContact1]);

    // Get display name for a contact
    const getDisplayName = (contact: ContactForComparison | null) => {
        if (!contact) return 'Seleziona contatto';
        if (privacyMode) return '••••••••';
        return contact.customName || contact.phoneNumber;
    };

    // Calculate unified timeline range (handles different tracking start times)
    const timelineRange = useMemo(() => {
        if (!comparisonData) return null;

        const allEvents = [...comparisonData.events1, ...comparisonData.events2];
        if (allEvents.length === 0) return null;

        const times = allEvents.map(e => new Date(e.timestamp).getTime());
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);

        return { start: minTime, end: maxTime, duration: maxTime - minTime };
    }, [comparisonData]);

    // Build heatmap data - completely rewritten for accuracy
    const heatmapData = useMemo(() => {
        if (!comparisonData) return null;

        const { overlaps } = comparisonData;

        if (heatmapView === 'daily') {
            // Aggregate all overlaps by hour across all days
            const hourTotals: { hour: number; totalMs: number; count: number }[] = [];

            for (let h = 0; h < 24; h++) {
                let totalMs = 0;
                let count = 0;

                for (const o of overlaps) {
                    const start = new Date(o.start);
                    const end = new Date(o.end);

                    // Calculate how much of this overlap falls in hour h
                    for (let d = new Date(start); d < end; d.setHours(d.getHours() + 1)) {
                        if (d.getHours() === h) {
                            const hourStart = new Date(d);
                            hourStart.setMinutes(0, 0, 0);
                            const hourEnd = new Date(hourStart);
                            hourEnd.setHours(hourEnd.getHours() + 1);

                            const overlapStart = Math.max(start.getTime(), hourStart.getTime());
                            const overlapEnd = Math.min(end.getTime(), hourEnd.getTime());

                            if (overlapEnd > overlapStart) {
                                totalMs += overlapEnd - overlapStart;
                                count++;
                            }
                        }
                    }
                }

                hourTotals.push({ hour: h, totalMs, count });
            }

            const maxMs = Math.max(...hourTotals.map(h => h.totalMs), 1);

            return {
                type: 'daily' as const,
                hourTotals,
                maxMs
            };
        }

        if (heatmapView === 'weekly') {
            // 7 days x 24 hours grid
            const days = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
            const grid: { day: number; hour: number; count: number; totalMs: number }[][] = [];

            for (let d = 0; d < 7; d++) {
                grid[d] = [];
                for (let h = 0; h < 24; h++) {
                    grid[d].push({ day: d, hour: h, count: 0, totalMs: 0 });
                }
            }

            for (const o of overlaps) {
                const start = new Date(o.start);
                const dayOfWeek = (start.getDay() + 6) % 7; // Monday = 0
                const hour = start.getHours();

                if (grid[dayOfWeek] && grid[dayOfWeek][hour]) {
                    grid[dayOfWeek][hour].count++;
                    grid[dayOfWeek][hour].totalMs += o.durationMs;
                }
            }

            const maxCount = Math.max(...grid.flat().map(c => c.count), 1);

            return { type: 'weekly' as const, grid, days, maxCount };
        }

        // Monthly view - last 31 days
        const today = new Date();
        const daysData: { date: Date; count: number; totalMs: number }[] = [];

        for (let d = 30; d >= 0; d--) {
            const date = new Date(today);
            date.setDate(date.getDate() - d);
            date.setHours(0, 0, 0, 0);

            let count = 0;
            let totalMs = 0;

            for (const o of overlaps) {
                const oDate = new Date(o.start);
                oDate.setHours(0, 0, 0, 0);

                if (oDate.getTime() === date.getTime()) {
                    count++;
                    totalMs += o.durationMs;
                }
            }

            daysData.push({ date, count, totalMs });
        }

        const maxCount = Math.max(...daysData.map(d => d.count), 1);

        return { type: 'monthly' as const, daysData, maxCount };
    }, [comparisonData, heatmapView]);

    // Timeline zoom handlers
    const handleZoomIn = () => {
        setTimelineZoom(prev => Math.min(prev * 2, 64)); // Increased max zoom to 64x
    };

    const handleZoomOut = () => {
        setTimelineZoom(prev => {
            const newZoom = Math.max(prev / 2, 1);
            if (newZoom === 1) setTimelineOffset(0);
            return newZoom;
        });
    };

    const handleScrollLeft = () => {
        setTimelineOffset(prev => Math.max(prev - 10, 0));
    };

    const handleScrollRight = () => {
        const maxOffset = 100 - (100 / timelineZoom);
        setTimelineOffset(prev => Math.min(prev + 10, maxOffset));
    };

    // Calculate visible timeline window
    const visibleTimelineWindow = useMemo(() => {
        if (!timelineRange) return null;

        const windowSize = timelineRange.duration / timelineZoom;
        const offsetMs = (timelineOffset / 100) * timelineRange.duration;

        return {
            start: timelineRange.start + offsetMs,
            end: timelineRange.start + offsetMs + windowSize,
            duration: windowSize
        };
    }, [timelineRange, timelineZoom, timelineOffset]);

    // Mouse drag handlers for timeline scroll
    const handleMouseDown = (e: React.MouseEvent) => {
        if (timelineZoom === 1) return;
        setIsDragging(true);
        setDragStartX(e.clientX);
        setDragStartOffset(timelineOffset);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !timelineRef.current) return;

        const containerWidth = timelineRef.current.offsetWidth;
        const deltaX = e.clientX - dragStartX;
        const deltaPercent = (deltaX / containerWidth) * (100 / timelineZoom) * -1;

        const maxOffset = 100 - (100 / timelineZoom);
        const newOffset = Math.max(0, Math.min(maxOffset, dragStartOffset + deltaPercent));
        setTimelineOffset(newOffset);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    };

    // Wheel zoom on timeline
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            // Scroll up = zoom in
            setTimelineZoom(prev => Math.min(prev * 1.5, 64)); // Increased max zoom
        } else {
            // Scroll down = zoom out
            setTimelineZoom(prev => {
                const newZoom = Math.max(prev / 1.5, 1);
                if (newZoom === 1) setTimelineOffset(0);
                return newZoom;
            });
        }
    };

    // Contact selector dropdown component
    const ContactSelector = ({
        isOpen,
        onClose,
        onSelect,
        contacts: selectorContacts,
        searchQuery,
        setSearchQuery,
        selectedJid
    }: {
        isOpen: boolean;
        onClose: () => void;
        onSelect: (contact: ContactForComparison) => void;
        contacts: ContactForComparison[];
        searchQuery: string;
        setSearchQuery: (q: string) => void;
        selectedJid?: string;
    }) => {
        if (!isOpen) return null;

        return (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-80 overflow-hidden">
                <div className="p-3 border-b border-gray-100">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cerca contatto..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            autoFocus
                        />
                    </div>
                </div>
                <div className="overflow-y-auto max-h-60">
                    {selectorContacts.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">
                            Nessun contatto trovato
                        </div>
                    ) : (
                        selectorContacts.map(contact => (
                            <button
                                key={contact.jid}
                                onClick={() => {
                                    onSelect(contact);
                                    onClose();
                                    setSearchQuery('');
                                }}
                                className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors ${contact.jid === selectedJid ? 'bg-emerald-50' : ''}`}
                            >
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {contact.profilePic ? (
                                        <img src={contact.profilePic} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-white font-medium text-sm">
                                            {(contact.customName || contact.phoneNumber).charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 text-left">
                                    <div className="font-medium text-gray-900 text-sm">
                                        {privacyMode ? '••••••••' : (contact.customName || contact.phoneNumber)}
                                    </div>
                                    <div className="text-xs text-gray-500 flex items-center gap-2">
                                        {contact.isActive && <span className="text-green-600">● Attivo</span>}
                                        {!contact.isActive && !contact.isArchived && <span className="text-yellow-600">● Fermato</span>}
                                        {contact.isArchived && <span className="text-gray-400">● Archiviato</span>}
                                    </div>
                                </div>
                                {contact.jid === selectedJid && (
                                    <Check size={18} className="text-emerald-600" />
                                )}
                            </button>
                        ))
                    )}
                </div>
            </div>
        );
    };

    // Generate time axis markers for timeline
    const timeAxisMarkers = useMemo(() => {
        if (!visibleTimelineWindow) return [];

        const markers: { position: number; label: string }[] = [];
        const windowDuration = visibleTimelineWindow.duration;

        // Determine appropriate interval based on zoom level (window duration)
        let intervalMs: number;
        if (windowDuration > 7 * 24 * 60 * 60 * 1000) {
            intervalMs = 24 * 60 * 60 * 1000; // 1 day
        } else if (windowDuration > 2 * 24 * 60 * 60 * 1000) {
            intervalMs = 6 * 60 * 60 * 1000; // 6 hours
        } else if (windowDuration > 12 * 60 * 60 * 1000) {
            intervalMs = 2 * 60 * 60 * 1000; // 2 hours
        } else if (windowDuration > 4 * 60 * 60 * 1000) {
            intervalMs = 60 * 60 * 1000; // 1 hour
        } else if (windowDuration > 2 * 60 * 60 * 1000) {
            intervalMs = 30 * 60 * 1000; // 30 minutes
        } else if (windowDuration > 60 * 60 * 1000) {
            intervalMs = 15 * 60 * 1000; // 15 minutes
        } else {
            intervalMs = 5 * 60 * 1000; // 5 minutes
        }

        const startTime = visibleTimelineWindow.start;
        const endTime = visibleTimelineWindow.end;

        // Find first marker time (round to interval)
        let markerTime = Math.ceil(startTime / intervalMs) * intervalMs;

        while (markerTime < endTime) {
            const position = ((markerTime - startTime) / windowDuration) * 100;
            const date = new Date(markerTime);

            // Only show time for intermediate markers (date shown at left/right)
            let label: string;
            if (intervalMs >= 24 * 60 * 60 * 1000) {
                // Show date for day intervals
                label = date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            } else {
                // Show only time (HH:MM) for smaller intervals
                label = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            }

            markers.push({ position, label });
            markerTime += intervalMs;
        }

        return markers;
    }, [visibleTimelineWindow]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <GitCompareArrows size={28} className="text-white" />
                        <h2 className="text-2xl font-bold text-white">Confronta Contatti</h2>
                    </div>
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center gap-2 font-medium transition-colors backdrop-blur-sm"
                    >
                        <ArrowLeft size={18} />
                        Torna alla Dashboard
                    </button>
                </div>
            </div>

            {/* Contact Selection */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    {/* Contact 1 */}
                    <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Contatto 1</label>
                        <button
                            onClick={() => { setShowSelector1(!showSelector1); setShowSelector2(false); }}
                            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:border-emerald-400 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                {selectedContact1 ? (
                                    <>
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center overflow-hidden">
                                            {selectedContact1.profilePic ? (
                                                <img src={selectedContact1.profilePic} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-white font-medium text-xs">
                                                    {(selectedContact1.customName || selectedContact1.phoneNumber).charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <span className="font-medium text-gray-900">{getDisplayName(selectedContact1)}</span>
                                    </>
                                ) : (
                                    <span className="text-gray-500">Seleziona contatto...</span>
                                )}
                            </div>
                            <ChevronDown size={18} className={`text-gray-400 transition-transform ${showSelector1 ? 'rotate-180' : ''}`} />
                        </button>
                        <ContactSelector
                            isOpen={showSelector1}
                            onClose={() => setShowSelector1(false)}
                            onSelect={setSelectedContact1}
                            contacts={filteredContacts1}
                            searchQuery={searchQuery1}
                            setSearchQuery={setSearchQuery1}
                            selectedJid={selectedContact1?.jid}
                        />
                    </div>

                    {/* VS */}
                    <div className="hidden md:flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                            <span className="text-gray-600 font-bold">VS</span>
                        </div>
                    </div>

                    {/* Contact 2 */}
                    <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Contatto 2</label>
                        <button
                            onClick={() => { setShowSelector2(!showSelector2); setShowSelector1(false); }}
                            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:border-emerald-400 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                {selectedContact2 ? (
                                    <>
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center overflow-hidden">
                                            {selectedContact2.profilePic ? (
                                                <img src={selectedContact2.profilePic} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-white font-medium text-xs">
                                                    {(selectedContact2.customName || selectedContact2.phoneNumber).charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <span className="font-medium text-gray-900">{getDisplayName(selectedContact2)}</span>
                                    </>
                                ) : (
                                    <span className="text-gray-500">Seleziona contatto...</span>
                                )}
                            </div>
                            <ChevronDown size={18} className={`text-gray-400 transition-transform ${showSelector2 ? 'rotate-180' : ''}`} />
                        </button>
                        <ContactSelector
                            isOpen={showSelector2}
                            onClose={() => setShowSelector2(false)}
                            onSelect={setSelectedContact2}
                            contacts={filteredContacts2}
                            searchQuery={searchQuery2}
                            setSearchQuery={setSearchQuery2}
                            selectedJid={selectedContact2?.jid}
                        />
                    </div>
                </div>

                {/* Date Range Filter */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Calendar size={18} className="text-gray-400" />
                            <span className="text-sm text-gray-600">Range temporale:</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="datetime-local"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <span className="text-gray-400">→</span>
                            <input
                                type="datetime-local"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            {(startDate || endDate) && (
                                <button
                                    onClick={() => { setStartDate(''); setEndDate(''); }}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                    title="Rimuovi filtro date"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={handleCompare}
                            disabled={!selectedContact1 || !selectedContact2 || isLoading}
                            className="ml-auto px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Analisi...
                                </>
                            ) : (
                                <>
                                    <GitCompareArrows size={18} />
                                    Confronta
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Results */}
            {comparisonData && (
                <>
                    {/* Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                                    <Clock size={20} className="text-emerald-600" />
                                </div>
                                <div className="text-sm text-gray-500">Tempo Overlap</div>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">
                                {formatDuration(comparisonData.statistics.totalOverlapMs)}
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                    <TrendingUp size={20} className="text-purple-600" />
                                </div>
                                <div className="text-sm text-gray-500">Sovrapposizione</div>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">
                                {comparisonData.statistics.overlapPercentage}%
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                    <Users size={20} className="text-blue-600" />
                                </div>
                                <div className="text-sm text-gray-500">Coincidenze</div>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">
                                {comparisonData.statistics.overlapCount}
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                                    <Calendar size={20} className="text-orange-600" />
                                </div>
                                <div className="text-sm text-gray-500">Fascia comune</div>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">
                                {formatHour(comparisonData.statistics.mostCommonOverlapHour)}
                            </div>
                        </div>
                    </div>

                    {/* Timeline View - Enhanced */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                📈 Timeline Parallela
                            </h3>
                            {/* Zoom Controls */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleScrollLeft}
                                    disabled={timelineZoom === 1}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Scorri a sinistra"
                                >
                                    <ChevronLeft size={18} className="text-gray-600" />
                                </button>
                                <button
                                    onClick={handleZoomOut}
                                    disabled={timelineZoom === 1}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Zoom out"
                                >
                                    <ZoomOut size={18} className="text-gray-600" />
                                </button>
                                <span className="text-xs text-gray-500 min-w-[40px] text-center">
                                    {timelineZoom}x
                                </span>
                                <button
                                    onClick={handleZoomIn}
                                    disabled={timelineZoom >= 64}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Zoom in"
                                >
                                    <ZoomIn size={18} className="text-gray-600" />
                                </button>
                                <button
                                    onClick={handleScrollRight}
                                    disabled={timelineZoom === 1}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Scorri a destra"
                                >
                                    <ChevronRight size={18} className="text-gray-600" />
                                </button>
                            </div>
                        </div>
                        <div
                            className={`p-6 ${timelineZoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            ref={timelineRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseLeave}
                            onWheel={handleWheel}
                        >
                            {/* Time axis - improved */}
                            {visibleTimelineWindow && (
                                <div className="relative h-8 mb-3 border-b border-gray-200 select-none">
                                    {/* Start time label */}
                                    <div className="absolute left-0 bottom-1 text-xs text-gray-600 font-medium bg-white px-1">
                                        {new Date(visibleTimelineWindow.start).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                                        {' '}
                                        <span className="text-gray-400">
                                            {new Date(visibleTimelineWindow.start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {/* End time label */}
                                    <div className="absolute right-0 bottom-1 text-xs text-gray-600 font-medium bg-white px-1 text-right">
                                        {new Date(visibleTimelineWindow.end).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                                        {' '}
                                        <span className="text-gray-400">
                                            {new Date(visibleTimelineWindow.end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {/* Intermediate markers */}
                                    {timeAxisMarkers.filter((_, i) => i > 0 && i < timeAxisMarkers.length - 1).map((marker, idx) => (
                                        <div
                                            key={idx}
                                            className="absolute bottom-0 -translate-x-1/2"
                                            style={{ left: `${marker.position}%` }}
                                        >
                                            <div className="w-px h-4 bg-gray-300" />
                                            <div className="text-[10px] text-gray-500 whitespace-nowrap mt-0.5">
                                                {marker.label}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="space-y-4">
                                {/* Contact 1 Timeline */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                        <span className="text-sm font-medium text-gray-700">
                                            {getDisplayName(selectedContact1)}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            (Online: {formatDuration(comparisonData.statistics.totalOnline1Ms)})
                                        </span>
                                    </div>
                                    <div className="h-10 bg-gray-100 rounded-lg relative overflow-hidden">
                                        {visibleTimelineWindow && comparisonData.periods1.map((period, idx) => {
                                            const periodStart = new Date(period.start).getTime();
                                            const periodEnd = new Date(period.end).getTime();

                                            // Check if period is visible in current window
                                            if (periodEnd < visibleTimelineWindow.start || periodStart > visibleTimelineWindow.end) {
                                                return null;
                                            }

                                            // Clamp to visible window
                                            const clampedStart = Math.max(periodStart, visibleTimelineWindow.start);
                                            const clampedEnd = Math.min(periodEnd, visibleTimelineWindow.end);

                                            const startOffset = ((clampedStart - visibleTimelineWindow.start) / visibleTimelineWindow.duration) * 100;
                                            const width = ((clampedEnd - clampedStart) / visibleTimelineWindow.duration) * 100;

                                            return (
                                                <div
                                                    key={idx}
                                                    className="absolute top-1 bottom-1 bg-emerald-500 rounded cursor-pointer hover:bg-emerald-600 transition-colors"
                                                    style={{ left: `${startOffset}%`, width: `${Math.max(width, 0.5)}%` }}
                                                    title={`${new Date(period.start).toLocaleString('it-IT')} → ${new Date(period.end).toLocaleString('it-IT')}\nDurata: ${formatDuration(period.durationMs)}`}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Overlap layer */}
                                <div className="relative h-10">
                                    <div className="absolute inset-x-0 h-full bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200 overflow-hidden">
                                        {visibleTimelineWindow && comparisonData.overlaps.map((overlap, idx) => {
                                            const overlapStart = new Date(overlap.start).getTime();
                                            const overlapEnd = new Date(overlap.end).getTime();

                                            if (overlapEnd < visibleTimelineWindow.start || overlapStart > visibleTimelineWindow.end) {
                                                return null;
                                            }

                                            const clampedStart = Math.max(overlapStart, visibleTimelineWindow.start);
                                            const clampedEnd = Math.min(overlapEnd, visibleTimelineWindow.end);

                                            const startOffset = ((clampedStart - visibleTimelineWindow.start) / visibleTimelineWindow.duration) * 100;
                                            const width = ((clampedEnd - clampedStart) / visibleTimelineWindow.duration) * 100;

                                            // Create tooltip text (no emojis)
                                            const startDate = new Date(overlap.start);
                                            const endDate = new Date(overlap.end);
                                            const tooltipText = `SOVRAPPOSIZIONE\nData: ${startDate.toLocaleDateString('it-IT')}\nOrario: ${startDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}\nDurata: ${formatDuration(overlap.durationMs)}`;

                                            return (
                                                <div
                                                    key={idx}
                                                    className="absolute top-1 bottom-1 bg-gradient-to-r from-yellow-400 to-orange-400 rounded shadow-sm hover:from-yellow-500 hover:to-orange-500 transition-colors z-10"
                                                    style={{ left: `${startOffset}%`, width: `${Math.max(width, 2)}%`, minWidth: '8px' }}
                                                    title={tooltipText}
                                                />
                                            );
                                        })}
                                    </div>
                                    {/* Label moved outside overlap elements */}
                                    <div className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full">
                                        <span className="text-xs text-yellow-600 font-medium bg-yellow-50 px-2 py-1 rounded border border-yellow-200 whitespace-nowrap">
                                            {comparisonData.overlaps.filter(o => {
                                                if (!visibleTimelineWindow) return false;
                                                const start = new Date(o.start).getTime();
                                                const end = new Date(o.end).getTime();
                                                return !(end < visibleTimelineWindow.start || start > visibleTimelineWindow.end);
                                            }).length} overlap visibili
                                        </span>
                                    </div>
                                </div>

                                {/* Contact 2 Timeline */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                                        <span className="text-sm font-medium text-gray-700">
                                            {getDisplayName(selectedContact2)}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            (Online: {formatDuration(comparisonData.statistics.totalOnline2Ms)})
                                        </span>
                                    </div>
                                    <div className="h-10 bg-gray-100 rounded-lg relative overflow-hidden">
                                        {visibleTimelineWindow && comparisonData.periods2.map((period, idx) => {
                                            const periodStart = new Date(period.start).getTime();
                                            const periodEnd = new Date(period.end).getTime();

                                            if (periodEnd < visibleTimelineWindow.start || periodStart > visibleTimelineWindow.end) {
                                                return null;
                                            }

                                            const clampedStart = Math.max(periodStart, visibleTimelineWindow.start);
                                            const clampedEnd = Math.min(periodEnd, visibleTimelineWindow.end);

                                            const startOffset = ((clampedStart - visibleTimelineWindow.start) / visibleTimelineWindow.duration) * 100;
                                            const width = ((clampedEnd - clampedStart) / visibleTimelineWindow.duration) * 100;

                                            return (
                                                <div
                                                    key={idx}
                                                    className="absolute top-1 bottom-1 bg-purple-500 rounded cursor-pointer hover:bg-purple-600 transition-colors"
                                                    style={{ left: `${startOffset}%`, width: `${Math.max(width, 0.5)}%` }}
                                                    title={`${new Date(period.start).toLocaleString('it-IT')} → ${new Date(period.end).toLocaleString('it-IT')}\nDurata: ${formatDuration(period.durationMs)}`}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Legend */}
                            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-4 h-3 bg-emerald-500 rounded" />
                                    <span>Online {getDisplayName(selectedContact1)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-4 h-3 bg-purple-500 rounded" />
                                    <span>Online {getDisplayName(selectedContact2)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-4 h-3 bg-gradient-to-r from-yellow-400 to-orange-400 rounded" />
                                    <span>Sovrapposizione (entrambi online)</span>
                                </div>
                                <div className="ml-auto text-gray-400 flex items-center gap-1">
                                    <Info size={12} />
                                    <span>Passa il mouse sui blocchi per dettagli</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Heatmap View - Fixed */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                🗓️ Heatmap Sovrapposizioni
                            </h3>
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                                {(['daily', 'weekly', 'monthly'] as HeatmapView[]).map(view => (
                                    <button
                                        key={view}
                                        onClick={() => setHeatmapView(view)}
                                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${heatmapView === view
                                            ? 'bg-white text-emerald-600 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                    >
                                        {view === 'daily' && 'Per Ora'}
                                        {view === 'weekly' && 'Settimanale'}
                                        {view === 'monthly' && 'Ultimi 30gg'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="p-6">
                            {/* How to read info box */}
                            <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2">
                                <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                                <div className="text-xs text-blue-700">
                                    {heatmapView === 'daily' && (
                                        <span>
                                            Questa vista mostra <strong>in quali ore del giorno</strong> si verificano più sovrapposizioni.
                                            Colori più scuri = più tempo trascorso online contemporaneamente in quella fascia oraria.
                                        </span>
                                    )}
                                    {heatmapView === 'weekly' && (
                                        <span>
                                            La griglia mostra <strong>giorno della settimana</strong> (colonne) e <strong>ora del giorno</strong> (righe).
                                            Celle colorate indicano sovrapposizioni in quella fascia oraria. Colore più intenso = più sovrapposizioni.
                                        </span>
                                    )}
                                    {heatmapView === 'monthly' && (
                                        <span>
                                            Ogni cella rappresenta <strong>un giorno negli ultimi 30 giorni</strong>.
                                            Colore più scuro = più sovrapposizioni in quel giorno.
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Daily Heatmap - Bar chart by hour */}
                            {heatmapView === 'daily' && heatmapData?.type === 'daily' && (
                                <div className="space-y-2">
                                    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>
                                        {heatmapData.hourTotals.map((cell, idx) => {
                                            const intensity = cell.totalMs / heatmapData.maxMs;
                                            const height = Math.max(intensity * 80, cell.count > 0 ? 20 : 4);

                                            return (
                                                <div key={idx} className="flex flex-col items-center">
                                                    <div
                                                        className="w-full rounded-t transition-all"
                                                        style={{
                                                            height: `${height}px`,
                                                            backgroundColor: intensity > 0
                                                                ? `rgba(16, 185, 129, ${0.3 + intensity * 0.7})`
                                                                : '#e5e7eb'
                                                        }}
                                                        title={`${formatHour(cell.hour)}: ${cell.count} sovrapposizioni, ${formatDuration(cell.totalMs)} totali`}
                                                    />
                                                    <span className="text-[9px] text-gray-400 mt-1">{cell.hour}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="text-center text-xs text-gray-400 mt-2">
                                        Ore del giorno (0-23)
                                    </div>
                                </div>
                            )}

                            {/* Weekly Heatmap - Grid */}
                            {heatmapView === 'weekly' && heatmapData?.type === 'weekly' && (
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="w-12 text-left text-xs text-gray-400 pb-2">Ora</th>
                                                {heatmapData.days.map(day => (
                                                    <th key={day} className="text-xs text-gray-500 font-medium pb-2 px-1">{day}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from({ length: 24 }, (_, hour) => (
                                                <tr key={hour}>
                                                    <td className="text-[10px] text-gray-400 pr-2 py-0.5">{formatHour(hour)}</td>
                                                    {heatmapData.grid.map((dayData, dayIdx) => {
                                                        const cell = dayData[hour];
                                                        const intensity = cell.count / heatmapData.maxCount;

                                                        return (
                                                            <td key={dayIdx} className="p-0.5">
                                                                <div
                                                                    className="w-full h-4 rounded-sm cursor-pointer hover:ring-1 hover:ring-emerald-400 transition-all"
                                                                    style={{
                                                                        backgroundColor: intensity > 0
                                                                            ? `rgba(16, 185, 129, ${0.2 + intensity * 0.8})`
                                                                            : '#f3f4f6'
                                                                    }}
                                                                    title={`${heatmapData.days[dayIdx]} ${formatHour(hour)}\n${cell.count} sovrapposizioni\nDurata totale: ${formatDuration(cell.totalMs)}`}
                                                                />
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Monthly Heatmap - Calendar style */}
                            {heatmapView === 'monthly' && heatmapData?.type === 'monthly' && (
                                <div>
                                    <div className="grid grid-cols-7 gap-1 mb-1">
                                        {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => (
                                            <div key={i} className="text-center text-xs text-gray-400 py-1">{d}</div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {/* Add empty cells for alignment */}
                                        {Array.from({ length: (heatmapData.daysData[0]?.date.getDay() + 6) % 7 }, (_, i) => (
                                            <div key={`empty-${i}`} className="aspect-square" />
                                        ))}
                                        {heatmapData.daysData.map((day, idx) => {
                                            const intensity = day.count / heatmapData.maxCount;

                                            return (
                                                <div
                                                    key={idx}
                                                    className="aspect-square rounded-md flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-all"
                                                    style={{
                                                        backgroundColor: intensity > 0
                                                            ? `rgba(16, 185, 129, ${0.2 + intensity * 0.8})`
                                                            : '#f3f4f6'
                                                    }}
                                                    title={`${day.date.toLocaleDateString('it-IT')}\n${day.count} sovrapposizioni\nDurata totale: ${formatDuration(day.totalMs)}`}
                                                >
                                                    <span className="text-xs font-medium text-gray-700">{day.date.getDate()}</span>
                                                    {day.count > 0 && (
                                                        <span className="text-[9px] text-emerald-700">{day.count}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Legend */}
                            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
                                <span>Intensità:</span>
                                <div className="flex items-center gap-1">
                                    <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200" />
                                    <span>Nessuno</span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.3)' }} />
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.5)' }} />
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.7)' }} />
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 1)' }} />
                                </div>
                                <span>Maggiore sovrapposizione →</span>
                            </div>
                        </div>
                    </div>

                    {/* Events List */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                📋 Eventi Sincronizzati
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => exportComparisonToExcel(comparisonData, selectedContact1!, selectedContact2!)}
                                    className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                                >
                                    <FileSpreadsheet size={16} />
                                    Excel
                                </button>
                                <button
                                    onClick={() => exportComparisonToPDF(comparisonData, selectedContact1!, selectedContact2!)}
                                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                                >
                                    <FileText size={16} />
                                    PDF
                                </button>
                            </div>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                            {comparisonData.overlaps.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">
                                    <Users size={48} className="mx-auto mb-4 opacity-30" />
                                    <p>Nessuna sovrapposizione trovata nel periodo selezionato</p>
                                </div>
                            ) : (
                                comparisonData.overlaps.map((overlap, idx) => (
                                    <div key={idx} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="flex-shrink-0">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                                                    <span className="text-white">⭐</span>
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900">
                                                        {new Date(overlap.start).toLocaleDateString('it-IT', {
                                                            weekday: 'short',
                                                            day: '2-digit',
                                                            month: '2-digit',
                                                            year: 'numeric'
                                                        })}
                                                    </span>
                                                    <span className="text-gray-400">•</span>
                                                    <span className="text-gray-600">
                                                        {new Date(overlap.start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                                        {' → '}
                                                        {new Date(overlap.end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-gray-500 mt-1">
                                                    Entrambi online per <strong>{formatDuration(overlap.durationMs)}</strong>
                                                </div>
                                            </div>
                                            <div className="flex-shrink-0">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                    OVERLAP
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Empty State */}
            {!comparisonData && !isLoading && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <GitCompareArrows size={64} className="mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Seleziona due contatti per iniziare
                    </h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                        Confronta l'attività di due contatti per vedere quando sono stati online contemporaneamente
                        e analizzare i pattern di utilizzo.
                    </p>
                </div>
            )}
        </div>
    );
}
