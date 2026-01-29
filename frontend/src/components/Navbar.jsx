import React from 'react';
import { LogOut, Gavel, User } from 'lucide-react';

const Navbar = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const handleSignOut = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    };

    return (
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                {/* Logo */}
                <div className="flex items-center gap-2 cursor-pointer group" onClick={() => window.location.href = '/'}>
                    <div className="bg-indigo-600 p-2 rounded-lg group-hover:bg-indigo-700 transition-colors">
                        <Gavel className="text-white" size={20} />
                    </div>
                    <span className="text-xl font-black text-slate-900 tracking-tight">BID<span className="text-indigo-600">LIVE</span></span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-3 px-4 py-1.5 rounded-full bg-slate-100 border border-slate-200">
                        <User size={16} className="text-slate-500" />
                        <span className="text-sm font-bold text-slate-700">{user.username || 'User'}</span>
                    </div>

                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-red-600 transition-colors px-3 py-2 rounded-lg hover:bg-red-50"
                    >
                        <LogOut size={18} />
                        <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
