
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import { APP_NAME, APP_TAGLINE } from '../constants';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const success = await login(username, password);
    setIsLoading(false);
    if (success) {
      navigate(from, { replace: true });
    } else {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center dark:from-primary-800 dark:to-secondary-800 p-4">
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
          />
          <Input
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />
          <Button type="submit" className="w-full" isLoading={isLoading} size="lg">
            {isLoading ? 'Signing In...' : 'Sign In'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          Demo users: admin/password or creative/password
        </p>
      </Card>
    </div>
  );
};

export default LoginPage;