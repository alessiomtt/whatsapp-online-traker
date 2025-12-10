import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CountrySelectorProps {
    selectedPrefix: string;
    onSelect: (prefix: string) => void;
}

const FLAGS: Record<string, React.ReactNode> = {
    '+39': (
        <svg viewBox="0 0 640 480" className="w-6 h-4 border border-gray-100 shadow-sm">
            <g fillRule="evenodd" strokeWidth="1pt">
                <path fill="#fff" d="M0 0h640v480H0z" />
                <path fill="#009246" d="M0 0h213.3v480H0z" />
                <path fill="#ce2b37" d="M426.7 0h213.3v480H426.7z" />
            </g>
        </svg>
    ),
    '+1': (
        <svg viewBox="0 0 640 480" className="w-6 h-4 border border-gray-100 shadow-sm">
            <path fill="#bd3d44" d="M0 0h640v480H0" />
            <path stroke="#fff" strokeWidth="37" d="M0 55.3h640M0 129h640M0 202.8h640M0 276.5h640M0 350.2h640M0 424h640" />
            <path fill="#192f5d" d="M0 0h364.8v258.5H0" />
            <marker id="us_a" markerHeight="30" markerWidth="30">
                <path fill="#fff" d="m14 0 9 27L0 10h28L5 27z" />
            </marker>
            <path fill="#fff" d="M0 0h640v480H0z" style={{ fillOpacity: 0 }} />
            {/* Simplified US flag for icon size */}
            <g fill="#fff" transform="scale(0.04)">
                <path d="M100 100l30 90-75-55h90l-75 55z" />
                <path d="M250 100l30 90-75-55h90l-75 55z" transform="translate(150, 0)" />
                {/* ... keeping it simple for small view port */}
            </g>
            <text x="10" y="150" fontSize="200" fill="white">★</text>
        </svg>
    ),
    '+44': (
        <svg viewBox="0 0 640 480" className="w-6 h-4 border border-gray-100 shadow-sm">
            <path fill="#012169" d="M0 0h640v480H0z" />
            <path fill="#FFF" d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-179L0 62V0h75z" />
            <path fill="#C8102E" d="m424 281 216 162v37H545L353 306h71zM640 0v37L423 200h71l146-110V0zM0 0v37l217 163h71L101 0H0zm0 480v-37l217-162h71L101 480H0zM280 0v480h80V0h-80zM0 200v80h640v-80H0z" />
        </svg>
    ),
    '+49': (
        <svg viewBox="0 0 640 480" className="w-6 h-4 border border-gray-100 shadow-sm">
            <path fill="#ffce00" d="M0 320h640v160H0z" />
            <path d="M0 0h640v160H0z" />
            <path fill="#d00" d="M0 160h640v160H0z" />
        </svg>
    ),
    '+33': (
        <svg viewBox="0 0 640 480" className="w-6 h-4 border border-gray-100 shadow-sm">
            <g fillRule="evenodd" strokeWidth="1pt">
                <path fill="#fff" d="M0 0h640v480H0z" />
                <path fill="#002395" d="M0 0h213.3v480H0z" />
                <path fill="#ed2939" d="M426.7 0h213.3v480H426.7z" />
            </g>
        </svg>
    ),
    '+34': (
        <svg viewBox="0 0 640 480" className="w-6 h-4 border border-gray-100 shadow-sm">
            <path fill="#AA151B" d="M0 0h640v480H0z" />
            <path fill="#F1BF00" d="M0 120h640v240H0z" />
        </svg>
    ),
    '+7': (
        <svg viewBox="0 0 640 480" className="w-6 h-4 border border-gray-100 shadow-sm">
            <path fill="#fff" d="M0 0h640v480H0z" />
            <path fill="#0039a6" d="M0 160h640v320H0z" />
            <path fill="#d52b1e" d="M0 320h640v160H0z" />
        </svg>
    ),
};

const PREFIXES = [
    { code: '+39', country: 'IT', label: 'Italy' },
    { code: '+33', country: 'FR', label: 'France' },
    { code: '+49', country: 'DE', label: 'Germany' },
    { code: '+44', country: 'GB', label: 'UK' },
    { code: '+7', country: 'RU', label: 'Russia' },
    { code: '+1', country: 'US', label: 'USA' },
];

export function CountrySelector({ selectedPrefix, onSelect }: CountrySelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedFlag = FLAGS[selectedPrefix] || FLAGS['+39'];

    return (
        <div className="relative border-r border-gray-300" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors h-full outline-none rounded-l-lg"
            >
                {selectedFlag}
                <span className="text-gray-700 font-medium text-sm">{selectedPrefix}</span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
                    {PREFIXES.map((p) => (
                        <button
                            key={p.code}
                            type="button"
                            onClick={() => {
                                onSelect(p.code);
                                setIsOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors ${selectedPrefix === p.code ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                }`}
                        >
                            {FLAGS[p.code]}
                            <span className="font-medium text-sm w-8">{p.code}</span>
                            <span className="text-sm text-gray-500">{p.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
