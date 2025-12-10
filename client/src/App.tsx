import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';

export const socket: Socket = io('http://localhost:3001');

function App() {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isWhatsAppReady, setIsWhatsAppReady] = useState(false);

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

    return (
        <ErrorBoundary>
            <div className="min-h-screen bg-gray-100 p-8">
                <div className="max-w-6xl mx-auto">
                    <header className="mb-8 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <img src="/logo.png" alt="Stealth WP Traker Logo" className="w-10 h-10 object-contain" />
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
                        {!isWhatsAppReady ? (
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
        </ErrorBoundary>
    );
}

export default App;
