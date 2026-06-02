import React from 'react';
import Card from '../components/ui/Card';
import { APP_NAME } from '../constants';

const TermsPage: React.FC = () => {
  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-16 max-w-4xl mx-auto text-center">
        <div className="inline-block bg-neo-secondary text-neo-black px-4 py-1 mb-4 neo-border-sm -rotate-2">
          <span className="text-xs font-black uppercase tracking-[0.3em]">USER_AGREEMENT_PROTOCOL</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-neo-black leading-none mb-6">
          Terms & <span className="text-neo-accent outline-text">Conditions</span>
        </h1>
        <p className="text-neo-black font-black uppercase tracking-widest text-[10px] opacity-40">
          LAST_UPDATE: {new Date().toLocaleDateString()} // CORE_REGISTRY: 882-ALPHA
        </p>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto space-y-12 pb-20">
        <Card title="ACKNOWLEDGMENT" className="!p-8 neo-shadow-lg bg-white rotate-1">
          <div className="prose prose-sm max-w-none font-bold text-neo-black uppercase tracking-tight leading-relaxed">
            <p>PLEASE READ THESE TERMS AND CONDITIONS CAREFULLY BEFORE ACCESSING THE CORE SERVICE. BY ENGAGING WITH THE SYSTEM, YOU AGREE TO BE BOUND BY THE PROTOCOLS OUTLINED BELOW.</p>
          </div>
        </Card>

        <Card title="DEFINITIONS" className="!p-8 neo-shadow-md bg-neo-muted -rotate-1">
          <div className="grid md:grid-cols-2 gap-8">
            <ul className="space-y-6">
              {[
                { t: "APPLICATION", d: "THE SOFTWARE PROGRAM PROVIDED BY STEADY_SOCIAL ARCHITECTURE." },
                { t: "COMPANY", d: "REFERS TO THE OPERATING ENTITY OF THE SERVICE." }
              ].map((item, i) => (
                <li key={i} className="space-y-1">
                  <p className="font-black text-xs text-neo-accent uppercase tracking-widest">{item.t}</p>
                  <p className="font-bold text-[10px] opacity-60 leading-tight">{item.d}</p>
                </li>
              ))}
            </ul>
            <ul className="space-y-6">
              {[
                { t: "SERVICE", d: "THE CORE APPLICATION ENVIRONMENT AND ALL SUB-NODES." },
                { t: "YOU", d: "THE INDIVIDUAL OR ENTITY ACCESSING THE SYSTEM." }
              ].map((item, i) => (
                <li key={i} className="space-y-1">
                  <p className="font-black text-xs text-neo-black uppercase tracking-widest">{item.t}</p>
                  <p className="font-bold text-[10px] opacity-60 leading-tight">{item.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="USER_ACCOUNTS" className="!p-8 neo-shadow-lg bg-white -rotate-1">
          <div className="flex items-start gap-8">
            <div className="w-20 h-20 neo-border bg-neo-secondary flex-shrink-0 flex items-center justify-center rotate-6">
              <i className="fas fa-user-shield text-4xl"></i>
            </div>
            <div className="space-y-4">
              <p className="font-black text-xs uppercase tracking-widest">CLEARANCE_REQUIREMENTS:</p>
              <p className="text-[10px] font-bold opacity-60 uppercase leading-relaxed">
                YOU MUST PROVIDE ACCURATE IDENTIFICATION DATA AT ALL TIMES. FAILURE TO COMPLY CONSTITUTES A BREACH OF SYSTEM INTEGRITY. YOU ARE SOLELY RESPONSIBLE FOR SAFEGUARDING YOUR ACCESS KEYS.
              </p>
            </div>
          </div>
        </Card>

        <Card title="INTELLECTUAL_PROPERTY" className="!p-8 neo-shadow-lg bg-neo-black text-white rotate-1">
           <div className="space-y-6">
             <p className="font-bold text-sm leading-relaxed uppercase tracking-tight opacity-80">
               THE SERVICE AND ITS ORIGINAL CONTENT, FEATURES, AND FUNCTIONALITY ARE THE EXCLUSIVE PROPERTY OF STEADY_SOCIAL. UNAUTHORIZED REPLICATION OF SYSTEM ARCHITECTURE OR DESIGN LANGUAGE IS STRICTLY PROHIBITED.
             </p>
           </div>
        </Card>

        <Card title="LIABILITY_LIMITS" className="!p-8 neo-shadow-md bg-neo-muted -rotate-1">
          <p className="font-black text-[10px] uppercase tracking-widest mb-4 opacity-40 text-center">--- SYSTEM_DISCLAIMER ---</p>
          <p className="font-bold text-[10px] leading-relaxed uppercase text-center max-w-2xl mx-auto">
            THE COMPANY SHALL NOT BE LIABLE FOR ANY SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING FROM THE USE OR INABILITY TO USE THE SERVICE. TOTAL LIABILITY IS LIMITED TO THE AMOUNT PAID VIA THE SYSTEM.
          </p>
        </Card>

        <div className="text-center pt-12">
           <div className="inline-block px-12 py-6 bg-neo-accent text-white neo-border neo-shadow-sm rotate-2">
              <p className="text-2xl font-black uppercase tracking-tighter">AGREEMENT_LOCKED</p>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] mt-2">TERMINATION_PROTOCOL_ENABLED</p>
           </div>
        </div>
      </main>
    </div>
  );
};

export default TermsPage;
