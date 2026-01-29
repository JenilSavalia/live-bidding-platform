import React, { useState } from 'react';
import axios from 'axios';
import { Loader2, Lock, Mail, ArrowRight } from 'lucide-react';
import { cn } from '../utils/cn';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const host = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
            const res = await axios.post(`${host}/api/auth/login`, {
                email,
                password
            });

            const { token, user } = res.data.data;

            // Store auth data
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));

            // Force reload to init socket with new token
            window.location.href = '/';

        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
                <div className="flex justify-center mb-8">
                    <div className="bg-indigo-100 p-4 rounded-full">
                        <Lock className="text-indigo-600" size={32} />
                    </div>
                </div>

                <h1 className="text-3xl font-bold text-center text-slate-900 mb-2">Welcome Back</h1>
                <p className="text-center text-slate-500 mb-8">Sign in to start bidding</p>

                {error && (
                    <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Email</label>
                        <div className="relative group">
                            <Mail className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium"
                                placeholder="name@example.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Password</label>
                        <div className="relative group">
                            <Lock className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <>Sign In <ArrowRight size={20} /></>}
                    </button>

                    <div className="text-center text-sm text-slate-500">
                        Don't have an account? <a href="/register" className="text-indigo-600 font-bold hover:underline">Register</a>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
