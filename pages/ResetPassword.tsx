
import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { dbResetPassword, dbVerifyPasswordResetCode } from '../services/userService';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';

type ResetStage = 'verify' | 'reset';

const ResetPasswordPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const email = location.state?.email;
  
  const [stage, setStage] = useState<ResetStage>('verify');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!email) {
      setNotification({ type: 'info', message: 'No email address specified. Please start the password reset process again.' });
      setTimeout(() => navigate('/forgot-password'), 3000);
    }
  }, [email, navigate]);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotification(null);
    try {
      await dbVerifyPasswordResetCode({ email, code });
      setNotification({ type: 'success', message: 'Code verified! You can now set a new password.' });
      setStage('reset');
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Invalid or expired verification code.' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (password !== confirmPassword) {
      setNotification({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    if (password.length < 8) {
      setNotification({ type: 'error', message: 'Password must be at least 8 characters long.' });
      return;
    }
    setLoading(true);
    
    try {
      const response = await dbResetPassword({ email, code, password });
      setNotification({ type: 'success', message: response.message || 'Password has been reset successfully! You will be redirected to the login page.' });
      setTimeout(() => navigate('/login'), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'An error occurred. The code may have been used or expired.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-primary-800 dark:to-secondary-800 p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <i className="fas fa-unlock-alt text-5xl text-primary-500 dark:text-primary-400 mb-2"></i>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Reset Your Password</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {stage === 'verify' 
              ? `Enter the 6-digit code sent to ${email || 'your email'}.` 
              : 'Set your new password.'}
          </p>
        </div>

        {notification && <Alert type={notification.type} message={notification.message} onClose={() => setNotification(null)} className="mb-4" />}
        
        {!email ? (
             <div className="text-center">
                 <Link to="/forgot-password">
                    <Button variant="secondary">Go to Forgot Password</Button>
                 </Link>
             </div>
        ) : stage === 'verify' ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <Input
              id="code"
              label="Verification Code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code"
              required
              autoFocus
              disabled={loading}
              maxLength={6}
              inputMode="numeric"
              pattern="\d{6}"
            />
            <Button type="submit" className="w-full !mt-6" isLoading={loading} size="lg" disabled={loading || code.length !== 6}>
              {loading ? 'Verifying...' : 'Verify Code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
             <Input
              id="code-display"
              label="Verified Code"
              type="text"
              value={code}
              readOnly
              disabled
              className="bg-slate-100 dark:bg-slate-700"
            />
            <Input
              id="password"
              label="New Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password (min 8 chars)"
              required
              autoFocus
              disabled={loading}
            />
            <Input
              id="confirmPassword"
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              disabled={loading}
            />
            <Button type="submit" className="w-full !mt-6" isLoading={loading} size="lg" disabled={loading || !password || !confirmPassword}>
              {loading ? 'Resetting...' : 'Set New Password'}
            </Button>
          </form>
        )}
        
        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
            <i className="fas fa-arrow-left mr-2"></i>
            Back to Login
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
