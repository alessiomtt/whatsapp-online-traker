import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Types
interface LogEvent {
    type: 'start' | 'stop' | 'restart' | 'warmup' | 'warmup_end' | 'calibration' | 'calibration_end' | 'calibration_reset' | 'online' | 'offline' | 'standby';
    timestamp: number;
    message: string;
}

interface ExportData {
    contactName?: string;
    contactNumber: string;
    jid?: string;
    events: LogEvent[];
    profilePic?: string;
}

const COLORS = {
    primaryGreen: '#1B5E20',
    lightGreen: '#E8F5E9',
    accentGreen: '#4CAF50',
    online: '#2E7D32',       // verde
    standby: '#F9A825',      // giallo
    offline: '#C62828',      // rosso
    calibration: '#1565C0',  // blu
    warmup: '#7C3AED',       // viola
    neutral: '#6B7280',      // grigio neutro
    white: '#FFFFFF',
    gray: '#757575',
};

// Event type to Italian message mapping
const EVENT_MESSAGES: Record<string, string> = {
    start: 'Monitoraggio avviato',
    restart: 'Monitoraggio riavviato',
    stop: 'Monitoraggio interrotto',
    warmup: 'Warmup avviato',
    warmup_end: 'Warmup completato',
    calibration: 'Calibrazione in corso',
    calibration_end: 'Calibrazione completata',
    calibration_reset: 'Calibrazione resettata',
    online: 'Online',
    standby: 'Standby',
    offline: 'Offline',
};

function getEventColor(type: string): string {
    switch (type) {
        case 'start':
        case 'restart':
        case 'stop':
            return COLORS.neutral;  // neutro - sfondo bianco
        case 'warmup':
        case 'warmup_end':
            return COLORS.warmup;   // viola
        case 'calibration':
        case 'calibration_end':
        case 'calibration_reset':
            return COLORS.calibration;  // blu
        case 'online':
            return COLORS.online;   // verde
        case 'standby':
            return COLORS.standby;  // giallo
        case 'offline':
            return COLORS.offline;  // rosso
        default:
            return COLORS.gray;
    }
}

// Format date for display
function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Format time for display
function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Calculate statistics from events
function calculateStats(events: LogEvent[]) {
    const stats = {
        total: events.length,
        online: 0,
        standby: 0,
        offline: 0,
        other: 0,
        firstEvent: events.length > 0 ? events[events.length - 1].timestamp : null,
        lastEvent: events.length > 0 ? events[0].timestamp : null,
    };

    events.forEach(event => {
        if (event.type === 'online') stats.online++;
        else if (event.type === 'standby') stats.standby++;
        else if (event.type === 'offline') stats.offline++;
        else stats.other++;
    });

    return stats;
}

// Format duration
function formatDuration(startMs: number, endMs: number): string {
    const diffMs = endMs - startMs;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Export activity log to Excel format
 */
export function exportToExcel(data: ExportData): void {
    const { contactName, contactNumber, events } = data;

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();

    // Prepare header rows
    const displayName = contactName || contactNumber;
    const headerRows = [
        ['STEALTH WP TRACKER - Report Attività'],
        [''],
        [`Contatto: ${displayName}${contactName ? ` (${contactNumber})` : ''}`],
        [`Data Export: ${formatDate(Date.now())} ${formatTime(Date.now())}`],
        [`Eventi Totali: ${events.length}`],
        [''],
        ['Data', 'Ora', 'Evento']
    ];

    // Prepare data rows (events are in reverse chronological order, reverse for export)
    const dataRows = [...events].reverse().map(event => [
        formatDate(event.timestamp),
        formatTime(event.timestamp),
        event.message || EVENT_MESSAGES[event.type] || event.type
    ]);

    // Combine all rows
    const allRows = [...headerRows, ...dataRows];

    // Create worksheet from array
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // Set column widths
    ws['!cols'] = [
        { wch: 12 },  // Data
        { wch: 10 },  // Ora
        { wch: 30 },  // Evento
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Log Attività');

    // Generate filename
    const filename = `log_${displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(Date.now()).replace(/\//g, '-')}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
}

/**
 * Export activity log to professional PDF format
 */
export async function exportToPDF(data: ExportData): Promise<void> {
    const { contactName, contactNumber, jid, events } = data;

    // Create PDF document
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    let yPos = 20;

    // === HEADER ===
    // Background rectangle
    doc.setFillColor(27, 94, 32); // primaryGreen
    doc.rect(0, 0, pageWidth, 35, 'F');

    // Ghost emoji and title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Stealth WP Tracker', 15, 18);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('Report Attivita WhatsApp', 15, 28);

    yPos = 45;

    // === CONTACT INFO SECTION ===
    doc.setFillColor(232, 245, 233); // lightGreen
    doc.roundedRect(10, yPos, pageWidth - 20, 35, 3, 3, 'F');

    doc.setDrawColor(76, 175, 80); // accentGreen
    doc.setLineWidth(0.5);
    doc.roundedRect(10, yPos, pageWidth - 20, 35, 3, 3, 'S');

    // Profile picture area
    const picX = 15;
    const picY = yPos + 5;
    const picSize = 25;
    const textStartX = 45; // Default text start position (after pic area)

    // Helper function to create circular image
    const createCircularImage = (imgSrc: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 200; // Higher resolution for quality
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject('No canvas context');
                    return;
                }
                // Create circular clip
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                // Draw image
                ctx.drawImage(img, 0, 0, size, size);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => reject('Image load error');
            img.src = imgSrc;
        });
    };

    // Try to add profile picture if available
    let circularPicAdded = false;
    if (data.profilePic) {
        try {
            const circularImg = await createCircularImage(data.profilePic);
            doc.addImage(circularImg, 'PNG', picX, picY, picSize, picSize);
            // Draw a circle border around it
            doc.setDrawColor(76, 175, 80);
            doc.setLineWidth(0.8);
            doc.circle(picX + picSize / 2, picY + picSize / 2, picSize / 2, 'S');
            circularPicAdded = true;
        } catch {
            circularPicAdded = false;
        }
    }

    if (!circularPicAdded) {
        // Draw placeholder circle with user silhouette
        doc.setFillColor(200, 200, 200);
        doc.circle(picX + picSize / 2, picY + picSize / 2, picSize / 2, 'F');
        doc.setDrawColor(76, 175, 80);
        doc.circle(picX + picSize / 2, picY + picSize / 2, picSize / 2, 'S');
        // Draw a simple user icon
        doc.setFillColor(150, 150, 150);
        doc.circle(picX + picSize / 2, picY + picSize / 2 - 3, 4, 'F'); // head
        doc.ellipse(picX + picSize / 2, picY + picSize / 2 + 7, 7, 5, 'F'); // body
    }

    doc.setTextColor(27, 94, 32);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Informazioni Contatto', textStartX, yPos + 10);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const displayName = contactName || contactNumber;
    if (contactName) {
        doc.text(`Nome: ${contactName}`, textStartX, yPos + 20);
        doc.text(`Numero: ${contactNumber}`, textStartX, yPos + 28);
    } else {
        doc.text(`Numero: ${contactNumber}`, textStartX, yPos + 20);
        if (jid) {
            doc.text(`JID: ${jid}`, textStartX, yPos + 28);
        }
    }

    yPos += 45;

    // === STATISTICS SECTION ===
    const stats = calculateStats(events);

    doc.setFillColor(232, 245, 233);
    doc.roundedRect(10, yPos, pageWidth - 20, 45, 3, 3, 'F');
    doc.setDrawColor(76, 175, 80);
    doc.roundedRect(10, yPos, pageWidth - 20, 45, 3, 3, 'S');

    doc.setTextColor(27, 94, 32);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Statistiche', 15, yPos + 10);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    if (stats.firstEvent && stats.lastEvent) {
        doc.text(`Prima rilevazione: ${formatDate(stats.firstEvent)} ${formatTime(stats.firstEvent)}`, 15, yPos + 20);
        doc.text(`Ultima rilevazione: ${formatDate(stats.lastEvent)} ${formatTime(stats.lastEvent)}`, 15, yPos + 27);
        doc.text(`Durata monitoraggio: ${formatDuration(stats.firstEvent, stats.lastEvent)}`, 15, yPos + 34);
    }

    // Stats on the right side
    const rightCol = 120;
    doc.text(`Eventi totali: ${stats.total}`, rightCol, yPos + 20);

    if (stats.total > 0) {
        doc.setTextColor(46, 125, 50); // online green
        doc.text(`• Online: ${stats.online} (${Math.round(stats.online / stats.total * 100)}%)`, rightCol, yPos + 27);

        doc.setTextColor(249, 168, 37); // standby yellow
        doc.text(`• Standby: ${stats.standby} (${Math.round(stats.standby / stats.total * 100)}%)`, rightCol, yPos + 34);

        doc.setTextColor(198, 40, 40); // offline red
        doc.text(`• Offline: ${stats.offline} (${Math.round(stats.offline / stats.total * 100)}%)`, rightCol, yPos + 41);
    }

    yPos += 55;

    // === LOG TABLE ===
    doc.setTextColor(27, 94, 32);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Log monitoraggio', 15, yPos);

    yPos += 5;

    // Prepare table data (reverse to show oldest first)
    const tableData = [...events].reverse().map(event => {
        const eventMsg = event.message || EVENT_MESSAGES[event.type] || event.type;
        return [
            formatDate(event.timestamp),
            formatTime(event.timestamp),
            eventMsg
        ];
    });

    // Generate table with colors
    autoTable(doc, {
        startY: yPos,
        head: [['Data', 'Ora', 'Evento']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [27, 94, 32],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 10,
        },
        bodyStyles: {
            fontSize: 9,
        },
        columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 25 },
            2: { cellWidth: 'auto' },
        },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 2) {
                // Color the event column based on event type
                const eventText = data.cell.raw as string;

                // Color scheme: Online=green, Standby=yellow, Offline=red, Start/Stop=gray, Warmup=purple, Calibration=blue
                if (eventText.includes('Online')) {
                    data.cell.styles.textColor = [46, 125, 50];    // verde
                    data.cell.styles.fontStyle = 'bold';
                } else if (eventText.includes('Standby')) {
                    data.cell.styles.textColor = [249, 168, 37];   // giallo
                    data.cell.styles.fontStyle = 'bold';
                } else if (eventText.includes('Offline')) {
                    data.cell.styles.textColor = [198, 40, 40];    // rosso
                    data.cell.styles.fontStyle = 'bold';
                } else if (eventText.includes('Warmup')) {
                    data.cell.styles.textColor = [124, 58, 237];   // viola
                    data.cell.styles.fontStyle = 'bold';
                } else if (eventText.includes('Calibrazione')) {
                    data.cell.styles.textColor = [21, 101, 192];   // blu
                    data.cell.styles.fontStyle = 'bold';
                } else if (eventText.includes('avviato') || eventText.includes('riavviato') || eventText.includes('interrotto')) {
                    data.cell.styles.textColor = [107, 114, 128];  // grigio neutro
                }
            }
        },
        alternateRowStyles: {
            fillColor: [245, 245, 245],
        },
        margin: { left: 10, right: 10 },
    });

    // === FOOTER ===
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setDrawColor(27, 94, 32);
        doc.setLineWidth(0.5);
        doc.line(10, pageHeight - 15, pageWidth - 10, pageHeight - 15);

        doc.setTextColor(117, 117, 117);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `Generato da Stealth WP Tracker • ${formatDate(Date.now())} ${formatTime(Date.now())} • Pagina ${i} di ${pageCount}`,
            pageWidth / 2,
            pageHeight - 8,
            { align: 'center' }
        );
    }

    // Generate filename and download
    const filename = `report_${displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(Date.now()).replace(/\//g, '-')}.pdf`;
    doc.save(filename);
}

// ============================================
// COMPARISON EXPORT FUNCTIONS
// ============================================

interface ContactForComparison {
    jid: string;
    phoneNumber: string;
    customName: string | null;
    profilePic: string | null;
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
    overlaps: OverlapPeriod[];
    statistics: ComparisonStatistics;
}

// Format milliseconds to human readable duration
function formatDurationMs(ms: number): string {
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

/**
 * Export comparison data to Excel format
 */
export function exportComparisonToExcel(
    data: ComparisonData,
    contact1: ContactForComparison,
    contact2: ContactForComparison
): void {
    const wb = XLSX.utils.book_new();

    const name1 = contact1.customName || contact1.phoneNumber;
    const name2 = contact2.customName || contact2.phoneNumber;

    // Prepare header rows
    const headerRows = [
        ['STEALTH WP TRACKER - Report Comparazione'],
        [''],
        [`Contatto 1: ${name1}`],
        [`Contatto 2: ${name2}`],
        [`Data Export: ${formatDate(Date.now())} ${formatTime(Date.now())}`],
        [''],
        ['STATISTICHE'],
        [`Tempo Overlap Totale: ${formatDurationMs(data.statistics.totalOverlapMs)}`],
        [`Percentuale Sovrapposizione: ${data.statistics.overlapPercentage}%`],
        [`Numero Coincidenze: ${data.statistics.overlapCount}`],
        [`Fascia Oraria Comune: ${data.statistics.mostCommonOverlapHour}:00`],
        [`Tempo Online ${name1}: ${formatDurationMs(data.statistics.totalOnline1Ms)}`],
        [`Tempo Online ${name2}: ${formatDurationMs(data.statistics.totalOnline2Ms)}`],
        [''],
        ['SOVRAPPOSIZIONI'],
        ['Data', 'Ora Inizio', 'Ora Fine', 'Durata']
    ];

    // Prepare overlap data rows
    const dataRows = data.overlaps.map(overlap => [
        new Date(overlap.start).toLocaleDateString('it-IT'),
        new Date(overlap.start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        new Date(overlap.end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        formatDurationMs(overlap.durationMs)
    ]);

    const allRows = [...headerRows, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    ws['!cols'] = [
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 15 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Comparazione');

    const filename = `comparazione_${name1.replace(/[^a-zA-Z0-9]/g, '_')}_vs_${name2.replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(Date.now()).replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, filename);
}

/**
 * Export comparison data to PDF format
 */
export async function exportComparisonToPDF(
    data: ComparisonData,
    contact1: ContactForComparison,
    contact2: ContactForComparison
): Promise<void> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    const name1 = contact1.customName || contact1.phoneNumber;
    const name2 = contact2.customName || contact2.phoneNumber;

    let yPos = 20;

    // === HEADER ===
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(0, 0, pageWidth, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Stealth WP Tracker', 15, 18);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('Report Comparazione Contatti', 15, 28);

    yPos = 45;

    // === CONTACTS INFO ===
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.roundedRect(10, yPos, pageWidth - 20, 25, 3, 3, 'F');
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(10, yPos, pageWidth - 20, 25, 3, 3, 'S');

    doc.setTextColor(6, 78, 59); // emerald-900
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Contatti Confrontati', 15, yPos + 10);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${name1}  vs  ${name2}`, 15, yPos + 20);

    yPos += 35;

    // === STATISTICS ===
    doc.setFillColor(236, 253, 245);
    doc.roundedRect(10, yPos, pageWidth - 20, 45, 3, 3, 'F');
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(10, yPos, pageWidth - 20, 45, 3, 3, 'S');

    doc.setTextColor(6, 78, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Statistiche Sovrapposizione', 15, yPos + 10);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    doc.text(`Tempo Overlap Totale: ${formatDurationMs(data.statistics.totalOverlapMs)}`, 15, yPos + 22);
    doc.text(`Percentuale Sovrapposizione: ${data.statistics.overlapPercentage}%`, 15, yPos + 30);
    doc.text(`Numero Coincidenze: ${data.statistics.overlapCount}`, 15, yPos + 38);

    const rightCol = 120;
    doc.text(`Fascia Oraria Comune: ${data.statistics.mostCommonOverlapHour}:00`, rightCol, yPos + 22);
    doc.text(`Online ${name1}: ${formatDurationMs(data.statistics.totalOnline1Ms)}`, rightCol, yPos + 30);
    doc.text(`Online ${name2}: ${formatDurationMs(data.statistics.totalOnline2Ms)}`, rightCol, yPos + 38);

    yPos += 55;

    // === OVERLAPS TABLE ===
    doc.setTextColor(6, 78, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Dettaglio Sovrapposizioni', 15, yPos);

    yPos += 5;

    const tableData = data.overlaps.map(overlap => [
        new Date(overlap.start).toLocaleDateString('it-IT'),
        new Date(overlap.start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        new Date(overlap.end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        formatDurationMs(overlap.durationMs)
    ]);

    if (tableData.length === 0) {
        doc.setTextColor(117, 117, 117);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text('Nessuna sovrapposizione trovata nel periodo selezionato', 15, yPos + 10);
    } else {
        autoTable(doc, {
            startY: yPos,
            head: [['Data', 'Ora Inizio', 'Ora Fine', 'Durata']],
            body: tableData,
            theme: 'grid',
            headStyles: {
                fillColor: [16, 185, 129],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 10,
            },
            bodyStyles: {
                fontSize: 9,
            },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 30 },
                2: { cellWidth: 30 },
                3: { cellWidth: 35 },
            },
            alternateRowStyles: {
                fillColor: [236, 253, 245],
            },
            margin: { left: 10, right: 10 },
        });
    }

    // === FOOTER ===
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.line(10, pageHeight - 15, pageWidth - 10, pageHeight - 15);

        doc.setTextColor(117, 117, 117);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `Generato da Stealth WP Tracker • ${formatDate(Date.now())} ${formatTime(Date.now())} • Pagina ${i} di ${pageCount}`,
            pageWidth / 2,
            pageHeight - 8,
            { align: 'center' }
        );
    }

    const filename = `comparazione_${name1.replace(/[^a-zA-Z0-9]/g, '_')}_vs_${name2.replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(Date.now()).replace(/\//g, '-')}.pdf`;
    doc.save(filename);
}
