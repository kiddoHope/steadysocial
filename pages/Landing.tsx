import React, { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SignupModal from '../components/auth/SignupModal';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const LiquidGlassWrapper: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void; }> = ({ children, className = '', onClick }) => {
    return (
        <div className={`liquidGlass-wrapper ${className}`} onClick={onClick}>
            <div className="liquidGlass-effect"></div>
            <div className="liquidGlass-tint"></div>
            <div className="liquidGlass-shine"></div>
            <div className="liquidGlass-text">
                {children}
            </div>
        </div>
    );
};
const LandingPage: React.FC = () => {
    const { currentUser, initialAuthCheckComplete } = useAuth();
    const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);

    if (!initialAuthCheckComplete) {
        return (
            <div className="landing-page-background flex items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (currentUser) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="landing-page-background">
            <div className="landing-container">
                <header className="landing-header">
                    <nav className="nav-links">
                        <Link to="/">Home</Link>
                        <Link to="/about">About</Link>
                        <a href="#">Services</a>
                        <a href="#">Clients</a>
                    </nav>
                    <button className="menu-button">
                        Menu
                        <span className="dots"></span>
                    </button>
                </header>

                <main className="hero-section">
                    <div className="hero-text">
                        {/* Using NEONIX for visual consistency with the provided image */}
                        <h1>NEONIX</h1>
                        <p>We Innovate. We Secure. We Transform. Step into the future with our cutting-edge solutions.</p>
                        <div className="hero-buttons">
                            <LiquidGlassWrapper className='button'>
                                Discover
                                <span className="dots"></span>
                            </LiquidGlassWrapper>
                            <button className="btn btn-connect">
                                <i className="fab fa-discord"></i>
                                Connect with us
                            </button>
                        </div>
                    </div>
                    <div className="hero-image">
                        <img src="https://images.pexels.com/photos/8991633/pexels-photo-8991633.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2" alt="Woman with futuristic glasses" />
                    </div>
                </main>

                <footer className="landing-footer">
                    <div className="play-trailer">
                        <i className="fas fa-play-circle"></i>
                        <span>PLAY TRAILER</span>
                    </div>
                    <div className="info-cards">
                        <div className="card">
                            <span className="number">1</span>
                            <p>To deliver innovative and secure digital solutions, empowering businesses to excel and adapt in a rapidly evolving technological world.</p>
                        </div>
                        <div className="card">
                            <span className="number">2</span>
                            <p>To be a global leader in digital innovation, transforming technology into seamless, secure experiences that enhance human potential worldwide.</p>
                        </div>
                        <button className="arrow-button">
                            <i className="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <div className="social-links">
                        <a href="#" aria-label="Facebook"><i className="fab fa-facebook-f"></i></a>
                        <a href="#" aria-label="LinkedIn"><i className="fab fa-linkedin-in"></i></a>
                        <a href="#" aria-label="Instagram"><i className="fab fa-instagram"></i></a>
                        <a href="#" aria-label="X"><i className="fab fa-twitter"></i></a>
                    </div>
                </footer>
            </div>
            <SignupModal isOpen={isSignupModalOpen} onClose={() => setIsSignupModalOpen(false)} />
        </div>
    );
};

export default LandingPage;