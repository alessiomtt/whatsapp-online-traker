import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from '../App';

export function Login() {
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        function onQrCode(qr: string) {
            console.log('New QR code received');
            
            // Show refresh animation
            setIsRefreshing(true);
            
            // Update QR code after brief animation
            setTimeout(() => {
                setQrCode(qr);
                setLastUpdate(new Date());
                setIsLoading(false);
                setIsRefreshing(false);
            }, 300);
        }

        // Listen to the correct event name 'qr-code' (not 'qr')
        socket.on('qr-code', onQrCode);

        return () => {
            socket.off('qr-code', onQrCode);
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center bg-white p-8 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-2xl font-semibold mb-6">Connect WhatsApp</h2>
            
            {/* QR Code Display */}
            <div className={`bg-gray-50 p-4 rounded-lg mb-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
                {qrCode && !isLoading ? (
                    <QRCodeSVG value={qrCode} size={256} />
                ) : (
                    <div className="w-64 h-64 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-gray-500 text-sm">Generating QR Code...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Status Indicators */}
            {lastUpdate && (
                <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
                    {isRefreshing ? (
                        <>
                            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                            <span>Refreshing QR code...</span>
                        </>
                    ) : (
                        <>
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
                        </>
                    )}
                </div>
            )}

            {/* Instructions */}
            <p className="text-gray-600 text-center max-w-md">
                Open WhatsApp on your phone, go to Settings {'>'} Linked Devices, and scan the QR code to connect.
            </p>
            
            {qrCode && (
                <p className="text-gray-500 text-sm text-center mt-3 max-w-md">
                    The QR code will automatically refresh if it expires.
                </p>
            )}
        </div>
    );
}
