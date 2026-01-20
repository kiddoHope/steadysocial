
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dbVerifyCode } from '../services/userService';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';

const VerifyEmailPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);
    setLoading(true);

    try {
      const response = await dbVerifyCode({ email, verificationCode });
      setNotification({ type: 'success', message: response.message });
      setIsVerified(true);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'An error occurred during verification.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-primary-800 dark:to-secondary-800 p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <i className="fas fa-envelope-check text-5xl text-primary-500 dark:text-primary-400 mb-2"></i>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Verify Your Account</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {isVerified ? 'You can now log in to your account.' : 'Enter your email and the code you received.'}
          </p>
        </div>

        {notification && <Alert type={notification.type} message={notification.message} onClose={() => setNotification(null)} className="mb-4" />}
        
        {!isVerified ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="email"
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              disabled={loading}
            />
            <Input
              id="verificationCode"
              label="Verification Code"
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Enter 6-digit code"
              required
              disabled={loading}
              maxLength={6}
              inputMode="numeric"
              pattern="\d{6}"
            />
            <Button type="submit" className="w-full !mt-6" isLoading={loading} size="lg" disabled={loading || !email || !verificationCode}>
              {loading ? 'Verifying...' : 'Verify Account'}
            </Button>
          </form>
        ) : (
             <Button onClick={() => navigate('/login')} className="w-full" size="lg">
                Proceed to Login
                <i className="fas fa-arrow-right ml-2"></i>
            </Button>
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

export default VerifyEmailPage;
