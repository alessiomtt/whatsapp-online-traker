import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Types
interface LogEvent {
    type: 'start' | 'stop' | 'restart' | 'calibration' | 'calibration_end' | 'online' | 'offline' | 'standby';
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

// Color scheme
const COLORS = {
    primaryGreen: '#1B5E20',
    lightGreen: '#E8F5E9',
    accentGreen: '#4CAF50',
    online: '#2E7D32',
    standby: '#F9A825',
    offline: '#C62828',
    calibration: '#1565C0',
    white: '#FFFFFF',
    gray: '#757575',
};

// Event type to Italian message mapping
const EVENT_MESSAGES: Record<string, string> = {
    start: 'Monitoraggio avviato',
    restart: 'Monitoraggio riavviato',
    stop: 'Monitoraggio interrotto',
    calibration: 'Calibrazione in corso',
    calibration_end: 'Calibrazione completata',
    online: 'Online',
    standby: 'Standby',
    offline: 'Offline',
};

// Get color for event type
function getEventColor(type: string): string {
    switch (type) {
        case 'start':
        case 'restart':
        case 'calibration':
            return COLORS.calibration;
        case 'calibration_end':
        case 'online':
            return COLORS.online;
        case 'standby':
            return COLORS.standby;
        case 'offline':
        case 'stop':
            return COLORS.offline;
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
export function exportToPDF(data: ExportData): void {
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

    doc.setTextColor(27, 94, 32);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Informazioni Contatto', 15, yPos + 10);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const displayName = contactName || contactNumber;
    if (contactName) {
        doc.text(`Nome: ${contactName}`, 15, yPos + 20);
        doc.text(`Numero: ${contactNumber}`, 15, yPos + 28);
    } else {
        doc.text(`Numero: ${contactNumber}`, 15, yPos + 20);
        if (jid) {
            doc.text(`JID: ${jid}`, 15, yPos + 28);
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

                if (eventText.includes('Online')) {
                    data.cell.styles.textColor = [46, 125, 50];
                    data.cell.styles.fontStyle = 'bold';
                } else if (eventText.includes('Standby')) {
                    data.cell.styles.textColor = [249, 168, 37];
                    data.cell.styles.fontStyle = 'bold';
                } else if (eventText.includes('Offline') || eventText.includes('interrotto')) {
                    data.cell.styles.textColor = [198, 40, 40];
                    data.cell.styles.fontStyle = 'bold';
                } else if (eventText.includes('avviato') || eventText.includes('riavviato') || eventText.includes('Calibrazione in corso')) {
                    data.cell.styles.textColor = [21, 101, 192];
                    data.cell.styles.fontStyle = 'bold';
                } else if (eventText.includes('completata')) {
                    data.cell.styles.textColor = [46, 125, 50];
                    data.cell.styles.fontStyle = 'bold';
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
