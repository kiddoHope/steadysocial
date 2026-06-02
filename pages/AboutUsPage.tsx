
import React from 'react';
import Card from '../components/ui/Card';
import { APP_NAME, APP_TAGLINE } from '../constants';

const AboutUsPage: React.FC = () => {
  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-16 max-w-4xl mx-auto text-center">
        <div className="inline-block bg-neo-secondary text-neo-black px-4 py-1 mb-4 neo-border-sm -rotate-2">
          <span className="text-xs font-black uppercase tracking-[0.3em]">MISSION_INTEL</span>
        </div>
        <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter text-neo-black leading-none mb-6">
          About <span className="text-neo-accent outline-text">The Project</span>
        </h1>
        <p className="text-xl font-bold text-neo-black italic max-w-2xl mx-auto leading-tight">
          "{APP_TAGLINE}"
        </p>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto space-y-12 pb-20">
        <Card title="THE_MANIFESTO" className="!p-8 neo-shadow-lg bg-white rotate-1">
          <div className="prose prose-xl max-w-none font-bold text-neo-black leading-relaxed">
            <p>
              {APP_NAME} IS A HIGH-PERFORMANCE DEMONSTRATION ARCHITECTURE. IT PROVES THAT CLIENT-SIDE AI (LLM) CAN BE SEAMLESSLY INTEGRATED INTO MODERN WORKFLOWS WITHOUT RELYING ON CENTRALIZED CLOUD COMPUTING. 
            </p>
            <p className="mt-6">
              THIS PLATFORM IS BUILT FOR CREATIVE ENTITIES WHO DEMAND SPEED, PRIVACY, AND RAW COMPUTATIONAL POWER DIRECTLY IN THE BROWSER.
            </p>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-8">
          <Card title="CAPABILITIES" className="!p-8 neo-shadow-md bg-neo-muted -rotate-1">
            <ul className="space-y-4">
              {[
                "AI-POWERED GENERATION",
                "CONTENT CANVAS WORKSPACE",
                "ROLE-BASED PROTOCOLS",
                "REAL-TIME TELEMETRY",
                "LOCAL LLM INTEGRATION",
                "SECURE DATA STORAGE"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 font-black text-xs uppercase tracking-widest">
                  <div className="w-4 h-4 bg-neo-accent neo-border-sm"></div>
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="TECH_STACK" className="!p-8 neo-shadow-md bg-neo-secondary rotate-1">
            <ul className="space-y-4">
              {[
                "REACT CORE ARCHITECTURE",
                "TYPESCRIPT TYPE-SAFETY",
                "TAILWIND UTILITY SYSTEM",
                "WEBLLM ON-DEVICE AI",
                "LOCAL_STORAGE PERSISTENCE",
                "NEO-BRUTALIST DESIGN"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 font-black text-xs uppercase tracking-widest">
                  <div className="w-4 h-4 bg-neo-black neo-border-sm"></div>
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="DISCLAIMER_PROTOCOL" className="!p-8 neo-shadow-lg bg-neo-black text-white -rotate-1">
          <p className="font-bold text-sm leading-relaxed opacity-80 uppercase tracking-tight">
            THIS APPLICATION IS FOR DEMONSTRATION AND EDUCATIONAL PURPOSES. AI MODELS RUN LOCALLY AND DO NOT EXFILTRATE DATA TO EXTERNAL SERVERS IN DEFAULT CONFIGURATIONS. ALL USER DATA IS CONFINED TO THE LOCAL BROWSER STORAGE. NO BACKEND DATABASE DETECTED.
          </p>
        </Card>

        <div className="text-center pt-12">
           <div className="inline-block px-12 py-6 bg-white neo-border neo-shadow-sm rotate-2">
              <p className="text-2xl font-black uppercase tracking-tighter">THANK_YOU_FOR_EXPLORING</p>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] mt-2 text-neo-accent">STEADY_SOCIAL_SYSTEM // v1.0.0</p>
           </div>
        </div>
      </main>
    </div>
  );
};

export default AboutUsPage;
