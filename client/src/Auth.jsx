import React, { useState } from 'react';
import { Bot, User, Lock, Mail, Activity, LogIn, UserPlus } from 'lucide-react';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/auth` 
  : "https://smartbot-server-3bmu.onrender.com/api/auth";

const Auth = ({ setToken }) => {
    const [mode, setMode] = useState('login'); // 'login', 'register', 'forgot', 'reset'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        setIsLoading(true);

        try {
            if (mode === 'login' || mode === 'register') {
                const endpoint = mode === 'login' ? '/login' : '/register';
                const res = await fetch(`${API_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Authentication failed');

                localStorage.setItem('token', data.token);
                setToken(data.token);
            } else if (mode === 'forgot') {
                const res = await fetch(`${API_URL}/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to send reset link');
                
                setSuccessMsg(`Simulated Email Sent! Your reset token is: ${data.resetToken}. (Copy this and go to Reset view)`);
            } else if (mode === 'reset') {
                const res = await fetch(`${API_URL}/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: resetToken, newPassword: password })
                });
                
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to reset password');
                
                setSuccessMsg('Password reset successfully! You can now log in.');
                setTimeout(() => setMode('login'), 3000);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-glass-panel">
                <div className="auth-header">
                    <Bot size={48} className="auth-logo" />
                    <h2>
                        {mode === 'login' && 'Welcome Back'}
                        {mode === 'register' && 'Create Account'}
                        {mode === 'forgot' && 'Reset Password'}
                        {mode === 'reset' && 'Create New Password'}
                    </h2>
                    <p>
                        {mode === 'login' && 'Sign in to continue your conversations'}
                        {mode === 'register' && 'Sign up to start chatting with AI'}
                        {mode === 'forgot' && 'Enter your email to receive a reset link'}
                        {mode === 'reset' && 'Enter your reset token and new password'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-error">{error}</div>}
                    {successMsg && <div className="auth-error" style={{backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)'}}>{successMsg}</div>}
                    
                    {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
                        <div className="input-group">
                            <Mail size={18} className="input-icon" />
                            <input 
                                type="email" 
                                placeholder="Email Address" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required={(mode === 'login' || mode === 'register' || mode === 'forgot')}
                            />
                        </div>
                    )}

                    {mode === 'reset' && (
                        <div className="input-group">
                            <Lock size={18} className="input-icon" />
                            <input 
                                type="text" 
                                placeholder="Reset Token" 
                                value={resetToken}
                                onChange={(e) => setResetToken(e.target.value)}
                                required={mode === 'reset'}
                            />
                        </div>
                    )}
                    
                    {(mode === 'login' || mode === 'register' || mode === 'reset') && (
                        <div className="input-group">
                            <Lock size={18} className="input-icon" />
                            <input 
                                type="password" 
                                placeholder={mode === 'reset' ? "New Password" : "Password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required={(mode === 'login' || mode === 'register' || mode === 'reset')}
                            />
                        </div>
                    )}

                    {mode === 'login' && (
                        <div style={{ textAlign: 'right', marginTop: '-10px', marginBottom: '15px' }}>
                            <button type="button" onClick={() => { setMode('forgot'); setError(null); setSuccessMsg(null); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem' }}>
                                Forgot Password?
                            </button>
                        </div>
                    )}

                    <button type="submit" className="auth-btn" disabled={isLoading}>
                        {isLoading ? <Activity className="spin" size={20} /> : (
                            mode === 'login' ? <LogIn size={20} /> : 
                            mode === 'register' ? <UserPlus size={20} /> : 
                            <Mail size={20} />
                        )}
                        {isLoading ? 'Processing...' : (
                            mode === 'login' ? 'Sign In' : 
                            mode === 'register' ? 'Sign Up' : 
                            mode === 'forgot' ? 'Send Reset Link' : 'Reset Password'
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        {mode === 'login' && "Don't have an account? "}
                        {(mode === 'register' || mode === 'forgot' || mode === 'reset') && "Back to "}
                        <button type="button" className="auth-toggle-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setSuccessMsg(null); }}>
                            {mode === 'login' ? 'Sign Up' : 'Sign In'}
                        </button>
                    </p>
                    {mode === 'forgot' && (
                        <p style={{ marginTop: '10px' }}>
                            Have a reset token? <button type="button" className="auth-toggle-btn" onClick={() => { setMode('reset'); setError(null); setSuccessMsg(null); }}>Use Token</button>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Auth;
