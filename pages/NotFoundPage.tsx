import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-neo-bg flex flex-col items-center justify-center text-center p-8 font-space relative overflow-hidden">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      {/* Background decorations */}
      <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-neo-accent neo-border -rotate-12 opacity-10"></div>
      <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-neo-secondary neo-border rotate-12 opacity-10"></div>

      <div className="relative z-10">
        <div className="inline-block p-8 bg-white neo-border neo-shadow-lg mb-12 -rotate-2">
          <i className="fas fa-ghost text-8xl text-neo-black animate-bounce"></i>
        </div>
        
        <h1 className="text-6xl md:text-9xl font-black uppercase tracking-tighter text-neo-black leading-none mb-6">
          404_<span className="text-neo-accent outline-text">ERROR</span>
        </h1>
        
        <p className="text-xl md:text-2xl font-bold text-neo-black uppercase tracking-widest mb-12 opacity-60">
          NODE_NOT_FOUND // ACCESS_DENIED
        </p>

        <Link to="/dashboard">
          <Button variant="primary" size="lg" className="!px-12 !py-6 !text-2xl">
            <i className="fas fa-home mr-4"></i>
            RETURN_TO_BASE
          </Button>
        </Link>
      </div>

      <footer className="absolute bottom-8 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-20 text-neo-black">
          STEADY_SOCIAL_OS // SYSTEM_FAILURE_RECOVERY
        </p>
      </footer>
    </div>
  );
};

export default NotFoundPage;