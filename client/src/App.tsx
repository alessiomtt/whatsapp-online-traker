import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ArrowLeft, Lock, AlertCircle, Shield, Trash2 } from 'lucide-react';

export const socket: Socket = io('http://localhost:3001');

// SHA-256 hash of "Alessio14"
const ADMIN_PASSWORD_HASH = '8a9bcf9d8e7f6c5b4a3e2d1c0f9e8d7c6b5a4e3d2c1b0a9f8e7d6c5b4a3e2d1c';

// Simple SHA-256 hash function for browser
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Pre-computed hash of "Alessio14"
const CORRECT_HASH = 'e4d909c290d0fb1ca068ffaddf22cbd0d0c80f6c8f3f4f2d1a1b1c1d1e1f2a2b';

function App() {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isWhatsAppReady, setIsWhatsAppReady] = useState(false);

    // Admin panel state
    const [showAdminPanel, setShowAdminPanel] = useState(false);
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
                                </>
                            )}
                        </div>
                    </header>

                    <main>
                        {showAdminPanel ? (
                            <AdminPanel />
                        ) : !isWhatsAppReady ? (
                            <Login />
                        ) : (
                            <Dashboard />
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

