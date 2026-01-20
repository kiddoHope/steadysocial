import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import { APP_NAME, APP_TAGLINE } from '../constants';
import SignupModal from '../components/auth/SignupModal';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { login, loading } = useAuth(); // Use loading state from context
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Loading state is now managed by AuthContext, triggered by calling login()
    try {
      const success = await login(username, password);
      if (success) {
        navigate(from, { replace: true });
      } else {
        setError('Invalid username or password.');
      }
    } catch (err: any) {
       setError(err.message || 'An unexpected error occurred during login.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-primary-800 dark:to-secondary-800 p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <i className="fas fa-feather-alt text-5xl text-primary-500 dark:text-primary-400 mb-2"></i>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{APP_NAME}</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">{APP_TAGLINE}</p>
          <p className="text-slate-600 dark:text-slate-400 mt-4">Sign in to continue</p>
        </div>
        
        {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-4" />}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            id="username"
            label="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            required
            autoFocus
            disabled={loading}
          />
          <Input
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            disabled={loading}
          />
          <div className="flex justify-between items-center text-sm -mt-4">
            <Link to="/verify-email" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Verify your account
            </Link>
            <Link to="/forgot-password" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Forgot Password?
            </Link>
          </div>
          <Button type="submit" className="w-full !mt-6" isLoading={loading} size="lg" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400 space-y-2">
            <p>
                Don't have an account?{' '}
                <button
                onClick={() => setIsSignupModalOpen(true)}
                className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                Sign Up
                </button>
            </p>
            <p className="text-xs">
                (Or use demo users: admin/password or creative/password)
            </p>
        </div>
      </Card>
      <SignupModal isOpen={isSignupModalOpen} onClose={() => setIsSignupModalOpen(false)} />
    </div>
  );
};

export default LoginPage;