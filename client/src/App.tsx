import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { ComparePage } from './components/ComparePage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DatabaseUtilities } from './components/DatabaseUtilities';
import { ArrowLeft, Lock, AlertCircle, Shield, Trash2, LogOut, Eye, EyeOff, Settings, RotateCcw } from 'lucide-react';

export const socket: Socket = io('http://localhost:3001');

// SHA-256 hash
const ADMIN_PASSWORD_HASH = '8a9bcf9d8e7f6c5b4a3e2d1c0f9e8d7c6b5a4e3d2c1b0a9f8e7d6c5b4a3e2d1c';

// Simple SHA-256 hash function for browser
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Pre-computed hash
const CORRECT_HASH = 'e4d909c290d0fb1ca068ffaddf22cbd0d0c80f6c8f3f4f2d1a1b1c1d1e1f2a2b';

function App() {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isWhatsAppReady, setIsWhatsAppReady] = useState(false);

    // Admin panel state
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [showComparePage, setShowComparePage] = useState(false);
    const [privacyMode, setPrivacyMode] = useState(false);
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState(false);
    const [isCheckingPassword, setIsCheckingPassword] = useState(false);

    useEffect(() => {
        function onConnect() {
            setIsConnected(true);
        }

        function onDisconnect() {
            setIsConnected(false);
            setIsWhatsAppReady(false);
        }

        function onConnectionOpen() {
            setIsWhatsAppReady(true);
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connection-open', onConnectionOpen);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connection-open', onConnectionOpen);
        };
    }, []);

    // Handle double click on logo
    const handleLogoDoubleClick = () => {
        setShowPasswordDialog(true);
        setPasswordInput('');
        setPasswordError(false);
    };

    // Handle password submission
    const handlePasswordSubmit = async () => {
        setIsCheckingPassword(true);
        setPasswordError(false);

        try {
            const inputHash = await hashPassword(passwordInput);
            // Check against hardcoded hash (computed from "Alessio14")
            const correctHash = await hashPassword('Alessio14');

            if (inputHash === correctHash) {
                setShowPasswordDialog(false);
                setShowAdminPanel(true);
                setPasswordInput('');
            } else {
                setPasswordError(true);
                setPasswordInput('');
            }
        } catch (err) {
            setPasswordError(true);
        } finally {
            setIsCheckingPassword(false);
        }
    };

    // Handle back from admin panel
    const handleBackFromAdmin = () => {
        setShowAdminPanel(false);
    };

    // Admin: Clear database
    const [showClearDbConfirm, setShowClearDbConfirm] = useState(false);
    const [isClearingDb, setIsClearingDb] = useState(false);
    const [clearDbSuccess, setClearDbSuccess] = useState(false);

    const handleClearDatabase = () => {
        setShowClearDbConfirm(true);
    };

    const confirmClearDatabase = () => {
        setIsClearingDb(true);
        socket.emit('admin-clear-database');

        // Listen for confirmation
        const onDbCleared = () => {
            setIsClearingDb(false);
            setShowClearDbConfirm(false);
            setClearDbSuccess(true);
            setTimeout(() => setClearDbSuccess(false), 3000);
            socket.off('database-cleared', onDbCleared);
        };
        socket.on('database-cleared', onDbCleared);
    };

    // Admin: Disconnect WhatsApp
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [disconnectProgress, setDisconnectProgress] = useState<{
        step: number;
        message: string;
        total: number;
        completed: number;
        done?: boolean;
    } | null>(null);

    const handleDisconnectWhatsApp = () => {
        setShowDisconnectConfirm(true);
        setDisconnectProgress(null);
    };

    const confirmDisconnectWhatsApp = () => {
        setIsDisconnecting(true);
        socket.emit('admin-disconnect-whatsapp');

        // Listen for progress updates
        const onProgress = (data: any) => {
            setDisconnectProgress(data);
        };
        socket.on('disconnect-progress', onProgress);

        // Listen for disconnection - server will restart
        const onDisconnected = () => {
            // Reset all state
            setIsDisconnecting(false);
            setShowDisconnectConfirm(false);
            setShowAdminPanel(false);
            setIsWhatsAppReady(false);
            setDisconnectProgress(null);
            socket.off('whatsapp-disconnected', onDisconnected);
            socket.off('disconnect-progress', onProgress);
        };
        socket.on('whatsapp-disconnected', onDisconnected);
    };

    // Admin: Configuration Management
    interface EditableConfig {
        probeIntervalDefault: number;
        offlineThreshold: number;
        thresholdMultiplier: number;
        calibrationProbeCount: number;
        warmupEnabled: boolean;
        warmupProbeCount: number;
        outlierFilterEnabled: boolean;
        defaultProbeMethod: 'reaction' | 'delete';
        stateConfirmationEnabled: boolean;
        stateConfirmationCount: number;
        standbyThreshold: number;
    }

    const [configData, setConfigData] = useState<{
        current: EditableConfig;
        defaults: EditableConfig;
        isCustom: boolean;
    } | null>(null);
    const [configForm, setConfigForm] = useState<EditableConfig>({
        probeIntervalDefault: 2000,
        offlineThreshold: 10000,
        thresholdMultiplier: 0.9,
        calibrationProbeCount: 5,
        warmupEnabled: false,
        warmupProbeCount: 10,
        outlierFilterEnabled: false,
        defaultProbeMethod: 'delete',
        stateConfirmationEnabled: true,
        stateConfirmationCount: 3,
        standbyThreshold: 1000
    });
    // String versions for text input (prevents focus loss on each keystroke)
    const [configFormStrings, setConfigFormStrings] = useState({
        probeIntervalDefault: '2000',
        offlineThreshold: '10000',
        thresholdMultiplier: '0.9',
        calibrationProbeCount: '5',
        warmupProbeCount: '10',
        stateConfirmationCount: '3',
        standbyThreshold: '1000'
    });
    const [configLoading, setConfigLoading] = useState(false);
    const [configSaving, setConfigSaving] = useState(false);
    const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Load config when admin panel opens
    useEffect(() => {
        if (showAdminPanel) {
            setConfigLoading(true);
            socket.emit('admin-get-config');

            const onConfigData = (data: any) => {
                setConfigData(data);
                setConfigForm(data.current);
                setConfigFormStrings({
                    probeIntervalDefault: String(data.current.probeIntervalDefault),
                    offlineThreshold: String(data.current.offlineThreshold),
                    thresholdMultiplier: String(data.current.thresholdMultiplier),
                    calibrationProbeCount: String(data.current.calibrationProbeCount),
                    warmupProbeCount: String(data.current.warmupProbeCount),
                    stateConfirmationCount: String(data.current.stateConfirmationCount),
                    standbyThreshold: String(data.current.standbyThreshold)
                });
                setConfigLoading(false);
            };

            const onConfigSaved = (data: any) => {
                setConfigMessage({ type: 'success', text: data.message });
                setConfigSaving(false);
                // Reload config data
                socket.emit('admin-get-config');
            };

            const onConfigReset = (data: any) => {
                setConfigMessage({ type: 'success', text: data.message });
                setConfigForm(data.config);
                setConfigSaving(false);
                // Reload config data
                socket.emit('admin-get-config');
            };

            const onConfigError = (data: any) => {
                setConfigMessage({ type: 'error', text: data.errors.join(', ') });
                setConfigSaving(false);
            };

            socket.on('config-data', onConfigData);
            socket.on('config-saved', onConfigSaved);
            socket.on('config-reset', onConfigReset);
            socket.on('config-save-error', onConfigError);

            return () => {
                socket.off('config-data', onConfigData);
                socket.off('config-saved', onConfigSaved);
                socket.off('config-reset', onConfigReset);
                socket.off('config-save-error', onConfigError);
            };
        }
    }, [showAdminPanel]);

    const handleSaveConfig = () => {
        setConfigSaving(true);
        setConfigMessage(null);
        // Parse string values to numbers before saving
        const configToSave = {
            probeIntervalDefault: parseInt(configFormStrings.probeIntervalDefault) || 2000,
            offlineThreshold: parseInt(configFormStrings.offlineThreshold) || 10000,
            thresholdMultiplier: parseFloat(configFormStrings.thresholdMultiplier) || 0.9,
            calibrationProbeCount: parseInt(configFormStrings.calibrationProbeCount) || 5,
            warmupEnabled: configForm.warmupEnabled,
            warmupProbeCount: parseInt(configFormStrings.warmupProbeCount) || 10,
            outlierFilterEnabled: configForm.outlierFilterEnabled,
            defaultProbeMethod: configForm.defaultProbeMethod,
            stateConfirmationEnabled: configForm.stateConfirmationEnabled,
            stateConfirmationCount: parseInt(configFormStrings.stateConfirmationCount) || 3,
            standbyThreshold: parseInt(configFormStrings.standbyThreshold) || 1000
        };
        socket.emit('admin-save-config', configToSave);
    };

    // ... (in JSX) ...

    <p className="text-xs text-gray-500">
        Valore minimo assoluto RTT per considerare un dispositivo in "Standby", indipendentemente dalla mediana.
        Previene falsi positivi su reti veloci.
        <br />
        <span className="font-medium">Consigliato: 1000-5000 ms</span> | Default: 1000
    </p>

    const handleResetConfig = () => {
        setConfigSaving(true);
        setConfigMessage(null);
        socket.emit('admin-reset-config');
    };

    // Admin Panel Component
    const AdminPanel = () => (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Shield size={28} className="text-white" />
                        <h2 className="text-2xl font-bold text-white">Pannello Amministratore</h2>
                    </div>
                    <button
                        onClick={handleBackFromAdmin}
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center gap-2 font-medium transition-colors backdrop-blur-sm"
                    >
                        <ArrowLeft size={18} />
                        Torna alla Dashboard
                    </button>
                </div>
            </div>

            {/* Success message */}
            {clearDbSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Database pulito con successo!</span>
                </div>
            )}

            {/* Database Management Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-800">🗄️ Gestione Database</h3>
                </div>
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex-1">
                            <h4 className="font-medium text-gray-900 mb-1">Pulizia Completa Database</h4>
                            <p className="text-sm text-gray-500">
                                Elimina tutte le sessioni, i contatti e lo storico dei log.
                                Tutti i tracker attivi verranno fermati. Questa azione è irreversibile.
                            </p>
                        </div>
                        <button
                            onClick={handleClearDatabase}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 flex-shrink-0"
                        >
                            <Trash2 size={18} />
                            Pulisci Database
                        </button>
                    </div>
                </div>
            </div>

            {/* WhatsApp Connection Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-800">📱 Connessione WhatsApp</h3>
                </div>
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex-1">
                            <h4 className="font-medium text-gray-900 mb-1">Disconnetti WhatsApp</h4>
                            <p className="text-sm text-gray-500">
                                Effettua il logout dalla sessione WhatsApp corrente ed elimina i dati di autenticazione.
                                Dovrai scansionare nuovamente il QR code per riconnetterti.
                            </p>
                        </div>
                        <button
                            onClick={handleDisconnectWhatsApp}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 flex-shrink-0"
                        >
                            <LogOut size={18} />
                            Disconnetti
                        </button>
                    </div>
                </div>
            </div>

            {/* Configuration Parameters Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Settings size={20} />
                        Configurazione Parametri
                    </h3>
                </div>
                <div className="p-6 space-y-6">
                    {/* Warning Alert */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-amber-800">Attenzione</p>
                                <p className="text-sm text-amber-700">
                                    Le modifiche ai parametri richiedono il riavvio del server per essere applicate.
                                    {configData?.isCustom && (
                                        <span className="block mt-1 font-medium">
                                            ⚡ Stai utilizzando una configurazione personalizzata.
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Success/Error Messages */}
                    {configMessage && (
                        <div className={`p-4 rounded-lg flex items-center gap-2 ${configMessage.type === 'success'
                            ? 'bg-green-50 border border-green-200 text-green-800'
                            : 'bg-red-50 border border-red-200 text-red-800'
                            }`}>
                            {configMessage.type === 'success' ? (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <AlertCircle size={20} />
                            )}
                            <span className="font-medium">{configMessage.text}</span>
                        </div>
                    )}

                    {configLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <>
                            {/* Probe Interval */}
                            <div className="space-y-2">
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Intervallo Probe (ms)</span>
                                    <input
                                        type="text"
                                        value={configFormStrings.probeIntervalDefault}
                                        onChange={(e) => setConfigFormStrings({ ...configFormStrings, probeIntervalDefault: e.target.value })}

                                        className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </label>
                                <p className="text-xs text-gray-500">
                                    Tempo tra ogni rilevamento dello stato. Valori più bassi = rilevamento più veloce ma maggior consumo.
                                    <br />
                                    <span className="font-medium">Consigliato: 50-60000 ms</span> |
                                    <span className="text-blue-600"> Default: {configData?.defaults.probeIntervalDefault || 2000} ms</span>
                                </p>
                            </div>

                            {/* Offline Threshold */}
                            <div className="space-y-2">
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Soglia Offline (ms)</span>
                                    <input
                                        type="text"
                                        value={configFormStrings.offlineThreshold}
                                        onChange={(e) => setConfigFormStrings({ ...configFormStrings, offlineThreshold: e.target.value })}

                                        className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </label>
                                <p className="text-xs text-gray-500">
                                    RTT (Round-Trip Time) sopra questa soglia indica che il dispositivo è offline o irraggiungibile.
                                    <br />
                                    <span className="font-medium">Consigliato: 1000-30000 ms</span> |
                                    <span className="text-blue-600"> Default: {configData?.defaults.offlineThreshold || 10000} ms</span>
                                </p>
                            </div>

                            {/* Threshold Multiplier */}
                            <div className="space-y-2">
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Moltiplicatore Soglia</span>
                                    <input
                                        type="text"
                                        value={configFormStrings.thresholdMultiplier}
                                        onChange={(e) => setConfigFormStrings({ ...configFormStrings, thresholdMultiplier: e.target.value })}

                                        className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </label>
                                <p className="text-xs text-gray-500">
                                    Determina la sensibilità nel rilevare cambiamenti di stato. Valori più bassi = più sensibile.
                                    <br />
                                    <span className="font-medium">Consigliato: 0.5-1.5</span> |
                                    <span className="text-blue-600"> Default: {configData?.defaults.thresholdMultiplier || 0.9}</span>
                                </p>
                            </div>

                            {/* Calibration Settings Section */}
                            <div className="border-t border-gray-200 pt-4 mt-4">
                                <h4 className="text-sm font-semibold text-gray-800 mb-3">Impostazioni Calibrazione</h4>

                                {/* Calibration Probe Count */}
                                <div className="space-y-2 mb-4">
                                    <label className="block">
                                        <span className="text-sm font-medium text-gray-700">Numero Probe Calibrazione</span>
                                        <input
                                            type="text"
                                            value={configFormStrings.calibrationProbeCount}
                                            onChange={(e) => setConfigFormStrings({ ...configFormStrings, calibrationProbeCount: e.target.value })}

                                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </label>
                                    <p className="text-xs text-gray-500">
                                        Numero di misurazioni RTT necessarie per completare la calibrazione.
                                        <br />
                                        <span className="font-medium">Consigliato: 3-20</span> |
                                        <span className="text-blue-600"> Default: 5</span>
                                    </p>
                                </div>

                                {/* Warmup Toggle */}
                                <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Warmup (scarta primi probe)</span>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Ignora i primi N probe per evitare valori instabili al cold start.
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={configForm.warmupEnabled}
                                            onChange={(e) => setConfigForm({ ...configForm, warmupEnabled: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {/* Warmup Probe Count - only show if warmup enabled */}
                                {configForm.warmupEnabled && (
                                    <div className="space-y-2 mb-4 ml-4">
                                        <label className="block">
                                            <span className="text-sm font-medium text-gray-700">Probe da scartare</span>
                                            <input
                                                type="text"
                                                value={configFormStrings.warmupProbeCount}
                                                onChange={(e) => setConfigFormStrings({ ...configFormStrings, warmupProbeCount: e.target.value })}

                                                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </label>
                                        <p className="text-xs text-gray-500">
                                            <span className="font-medium">Consigliato: 5-15</span> | Default: 10
                                        </p>
                                    </div>
                                )}

                                {/* Outlier Filter Toggle */}
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Filtro Outlier</span>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Scarta valori RTT &gt; 3× mediana durante la calibrazione.
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={configForm.outlierFilterEnabled}
                                            onChange={(e) => setConfigForm({ ...configForm, outlierFilterEnabled: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                            </div>

                            {/* Hysteresis Settings Section */}
                            <div className="border-t border-gray-200 pt-4 mt-4">
                                <h4 className="text-sm font-semibold text-gray-800 mb-3">Impostazioni Isteresi (Anti-Flicker)</h4>

                                {/* Standby Threshold (Absolute Floor) */}
                                <div className="space-y-2 mb-4">
                                    <label className="block">
                                        <span className="text-sm font-medium text-gray-700">Soglia Assoluta Standby (ms)</span>
                                        <input
                                            type="text"
                                            value={configFormStrings.standbyThreshold}
                                            onChange={(e) => setConfigFormStrings({ ...configFormStrings, standbyThreshold: e.target.value })}
                                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </label>
                                    <p className="text-xs text-gray-500">
                                        Valore minimo assoluto RTT per considerare un dispositivo in "Standby", indipendentemente dalla mediana.
                                        Previene falsi positivi su reti veloci.
                                        <br />
                                        <span className="font-medium">Consigliato: 1000-5000 ms</span> | Default: 1000
                                    </p>
                                </div>

                                {/* State Confirmation Toggle */}
                                <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Conferma Stato (Anti-Flicker)</span>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Richiede N conferme consecutive prima di cambiare stato (Online/Standby).
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={configForm.stateConfirmationEnabled}
                                            onChange={(e) => setConfigForm({ ...configForm, stateConfirmationEnabled: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {/* State Confirmation Count - only show if enabled */}
                                {configForm.stateConfirmationEnabled && (
                                    <div className="space-y-2 mb-4 ml-4">
                                        <label className="block">
                                            <span className="text-sm font-medium text-gray-700">Numero Conferme</span>
                                            <input
                                                type="text"
                                                value={configFormStrings.stateConfirmationCount}
                                                onChange={(e) => setConfigFormStrings({ ...configFormStrings, stateConfirmationCount: e.target.value })}
                                                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </label>
                                        <p className="text-xs text-gray-500">
                                            <span className="font-medium">Consigliato: 3-5</span> | Default: 3
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Probe Method Settings Section */}
                            <div className="border-t border-gray-200 pt-4 mt-4">
                                <h4 className="text-sm font-semibold text-gray-800 mb-3">Impostazioni Metodo Probe</h4>

                                {/* Default Probe Method Toggle */}
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Metodo Probe Default</span>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {configForm.defaultProbeMethod === 'delete'
                                                ? 'Delete (silenzioso): invia un comando di eliminazione per un messaggio inesistente'
                                                : 'Reaction: invia una reaction a un messaggio inesistente'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-medium ${configForm.defaultProbeMethod === 'reaction' ? 'text-amber-600' : 'text-gray-400'}`}>
                                            R
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setConfigForm({ ...configForm, defaultProbeMethod: configForm.defaultProbeMethod === 'delete' ? 'reaction' : 'delete' })}
                                            className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${configForm.defaultProbeMethod === 'delete' ? 'bg-purple-500' : 'bg-amber-500'}`}
                                        >
                                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${configForm.defaultProbeMethod === 'delete' ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                        </button>
                                        <span className={`text-xs font-medium ${configForm.defaultProbeMethod === 'delete' ? 'text-purple-600' : 'text-gray-400'}`}>
                                            D
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-100">
                                <button
                                    onClick={handleResetConfig}
                                    disabled={configSaving || !configData?.isCustom}
                                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium transition-colors flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <RotateCcw size={18} />
                                    Ripristina Default
                                </button>
                                <button
                                    onClick={handleSaveConfig}
                                    disabled={configSaving}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {configSaving ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Salvataggio...
                                        </>
                                    ) : (
                                        <>
                                            <Settings size={18} />
                                            Salva e Riavvia Server
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Database Utilities Section */}
            <DatabaseUtilities />


            {/* Clear Database Confirmation Modal */}
            {showClearDbConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in-95">
                        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={32} className="text-red-600" />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
                            Conferma Pulizia Database
                        </h3>
                        <p className="text-gray-500 text-center text-sm mb-2">
                            Stai per eliminare permanentemente:
                        </p>
                        <ul className="text-sm text-gray-600 mb-6 space-y-1">
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                Tutti i contatti monitorati
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                Tutto lo storico dei log
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                Tutti i contatti archiviati
                            </li>
                        </ul>
                        <p className="text-red-600 font-semibold text-center text-sm mb-6">
                            ⚠️ Questa azione non può essere annullata!
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowClearDbConfirm(false)}
                                disabled={isClearingDb}
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={confirmClearDatabase}
                                disabled={isClearingDb}
                                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isClearingDb ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Eliminazione...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 size={18} />
                                        Elimina Tutto
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Disconnect WhatsApp Confirmation Modal */}
            {showDisconnectConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in-95">
                        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                            <LogOut size={32} className="text-orange-600" />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
                            {isDisconnecting ? 'Disconnessione in corso...' : 'Conferma Disconnessione'}
                        </h3>

                        {!isDisconnecting ? (
                            <>
                                <p className="text-gray-500 text-center text-sm mb-4">
                                    Stai per disconnettere la sessione WhatsApp corrente.
                                </p>
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                                    <p className="text-sm text-orange-800">
                                        <strong>Nota:</strong> Il server verrà riavviato automaticamente
                                        e dovrai scansionare nuovamente il QR code per riconnetterti.
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4 mb-6">
                                {/* Progress message */}
                                <p className="text-gray-600 text-center text-sm">
                                    {disconnectProgress?.message || 'Preparazione...'}
                                </p>

                                {/* Progress bar */}
                                {disconnectProgress && disconnectProgress.total > 0 && (
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        <div
                                            className="bg-orange-600 h-2.5 rounded-full transition-all duration-300"
                                            style={{ width: `${(disconnectProgress.completed / disconnectProgress.total) * 100}%` }}
                                        ></div>
                                    </div>
                                )}

                                {/* Step indicator */}
                                <div className="flex justify-center gap-2">
                                    {[1, 2, 3, 4, 5].map(step => (
                                        <div
                                            key={step}
                                            className={`w-2 h-2 rounded-full transition-colors ${disconnectProgress && disconnectProgress.step >= step
                                                ? 'bg-orange-600'
                                                : 'bg-gray-300'
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDisconnectConfirm(false)}
                                disabled={isDisconnecting}
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={confirmDisconnectWhatsApp}
                                disabled={isDisconnecting}
                                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isDisconnecting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        In corso...
                                    </>
                                ) : (
                                    <>
                                        <LogOut size={18} />
                                        Disconnetti
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );



    return (
        <ErrorBoundary>
            <div className="min-h-screen bg-gray-100 p-8">
                <div className="max-w-6xl mx-auto">
                    <header className="mb-8 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <img
                                src="/logo.png"
                                alt="Stealth WP Traker Logo"
                                className="w-10 h-10 object-contain cursor-pointer select-none"
                                onDoubleClick={handleLogoDoubleClick}
                                title=""
                            />
                            <h1 className="text-3xl font-bold text-gray-900">Stealth WP Traker</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-sm text-gray-600">{isConnected ? 'Server connesso' : 'Disconnesso'}</span>
                            {isConnected && (
                                <>
                                    <div className="w-px h-4 bg-gray-300 mx-2" />
                                    <div className={`w-3 h-3 rounded-full ${isWhatsAppReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                    <span className="text-sm text-gray-600">{isWhatsAppReady ? 'Whatsapp Pronto' : 'In attesa di WhatsApp'}</span>
                                    {isWhatsAppReady && (
                                        <>
                                            <div className="w-px h-4 bg-gray-300 mx-2" />
                                            <button
                                                onClick={() => setPrivacyMode(!privacyMode)}
                                                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 font-medium text-xs transition-all duration-200 border ${privacyMode
                                                    ? 'bg-white text-green-600 border-green-200 hover:bg-green-50'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                title={privacyMode ? 'Privacy Mode: ON (Click to disable)' : 'Privacy Mode: OFF (Click to enable)'}
                                            >
                                                {privacyMode ? (
                                                    <>
                                                        <EyeOff size={16} />
                                                        <span>Privacy ON</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Eye size={16} />
                                                        <span>Privacy OFF</span>
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </header>

                    <main>
                        {showAdminPanel ? (
                            <AdminPanel />
                        ) : showComparePage ? (
                            <ComparePage onBack={() => setShowComparePage(false)} privacyMode={privacyMode} />
                        ) : !isWhatsAppReady ? (
                            <Login />
                        ) : (
                            <Dashboard privacyMode={privacyMode} onOpenCompare={() => setShowComparePage(true)} />
                        )}
                    </main>

                    <footer className="mt-12 text-center text-gray-500 text-sm">
                        Made by Alessio Mattei - <a href="https://matteialessio.it" target="_blank" rel="noopener noreferrer" className="font-bold hover:text-gray-700 transition-colors">matteialessio.it</a>
                    </footer>
                </div>
            </div>

            {/* Password Dialog */}
            {showPasswordDialog && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 animate-in fade-in zoom-in-95">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                            <Lock size={28} className="text-white" />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
                            Accesso Riservato
                        </h3>
                        <p className="text-gray-500 text-center text-sm mb-6">
                            Inserisci la password per accedere al pannello di amministrazione
                        </p>

                        {passwordError && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                                <AlertCircle size={18} />
                                <span className="text-sm font-medium">Password errata. Riprova.</span>
                            </div>
                        )}

                        <input
                            type="password"
                            placeholder="Password"
                            value={passwordInput}
                            onChange={(e) => {
                                setPasswordInput(e.target.value);
                                setPasswordError(false);
                            }}
                            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                            className={`w-full px-4 py-3 border rounded-lg mb-4 outline-none transition-all ${passwordError
                                ? 'border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500'
                                : 'border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500'
                                }`}
                            autoFocus
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowPasswordDialog(false);
                                    setPasswordInput('');
                                    setPasswordError(false);
                                }}
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={handlePasswordSubmit}
                                disabled={isCheckingPassword || !passwordInput}
                                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isCheckingPassword ? 'Verifica...' : 'Accedi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ErrorBoundary>
    );
}

export default App;

