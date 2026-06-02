import React from 'react';
import Card from '../components/ui/Card';
import { APP_NAME } from '../constants';

const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-16 max-w-4xl mx-auto text-center">
        <div className="inline-block bg-neo-accent text-white px-4 py-1 mb-4 neo-border-sm rotate-2">
          <span className="text-xs font-black uppercase tracking-[0.3em]">DATA_SECURITY_PROTOCOL</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-neo-black leading-none mb-6">
          Privacy <span className="text-neo-secondary outline-text">Policy</span>
        </h1>
        <p className="text-neo-black font-black uppercase tracking-widest text-[10px] opacity-40">
          LAST_SYNC: {new Date().toLocaleDateString()} // VERSION: 1.4.2
        </p>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto space-y-12 pb-20">
        <Card title="CORE_MANDATE" className="!p-8 neo-shadow-lg bg-white -rotate-1">
          <div className="prose prose-sm max-w-none font-bold text-neo-black uppercase tracking-tight leading-relaxed">
            <p>THIS PRIVACY POLICY DESCRIBES OUR POLICIES AND PROCEDURES ON THE COLLECTION, USE AND DISCLOSURE OF YOUR INFORMATION WHEN YOU USE THE SERVICE. BY USING THE SERVICE, YOU AGREE TO THE COLLECTION AND USE OF INFORMATION IN ACCORDANCE WITH THIS PRIVACY POLICY.</p>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-8">
           <Card title="DEFINITIONS_A" className="!p-8 neo-shadow-md bg-neo-muted rotate-1">
             <ul className="space-y-6">
               {[
                 { t: "ACCOUNT", d: "A UNIQUE IDENTIFIER CREATED FOR YOU TO ACCESS OUR SERVICE." },
                 { t: "COMPANY", d: "REFERS TO THE STEADY_SOCIAL ARCHITECTURE." },
                 { t: "DEVICE", d: "ANY HARDWARE CAPABLE OF ACCESSING THE SERVICE NODE." }
               ].map((item, i) => (
                 <li key={i} className="space-y-1">
                   <p className="font-black text-xs text-neo-accent uppercase tracking-widest">{item.t}</p>
                   <p className="font-bold text-[10px] opacity-60 leading-tight">{item.d}</p>
                 </li>
               ))}
             </ul>
           </Card>

           <Card title="DEFINITIONS_B" className="!p-8 neo-shadow-md bg-neo-secondary -rotate-1">
             <ul className="space-y-6">
               {[
                 { t: "PERSONAL_DATA", d: "ANY INFORMATION RELATING TO AN IDENTIFIED INDIVIDUAL." },
                 { t: "SERVICE", d: "REFERS TO THE APPLICATION ENVIRONMENT." },
                 { t: "USAGE_DATA", d: "DATA COLLECTED AUTOMATICALLY VIA CLIENT-SIDE INTERACTION." }
               ].map((item, i) => (
                 <li key={i} className="space-y-1">
                   <p className="font-black text-xs text-neo-black uppercase tracking-widest">{item.t}</p>
                   <p className="font-bold text-[10px] opacity-60 leading-tight">{item.d}</p>
                 </li>
               ))}
             </ul>
           </Card>
        </div>

        <Card title="COLLECTION_PARAMETERS" className="!p-8 neo-shadow-lg bg-white rotate-1">
          <div className="space-y-8">
            <section>
              <h3 className="font-black text-sm uppercase tracking-widest mb-4">TYPES_OF_DATA</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 bg-neo-bg neo-border-sm">
                  <p className="font-black text-[10px] mb-2 uppercase">USER_INPUTS</p>
                  <p className="text-[10px] font-bold opacity-60">USERNAMES, PROFILE_PICS, AND GENERATED_ASSETS ARE STORED LOCALLY.</p>
                </div>
                <div className="p-4 bg-neo-bg neo-border-sm">
                  <p className="font-black text-[10px] mb-2 uppercase">NODE_METRICS</p>
                  <p className="text-[10px] font-bold opacity-60">IP_ADDRESSES AND BROWSER_METADATA PROCESSED WITHIN THE CLIENT ENV.</p>
                </div>
              </div>
            </section>
          </div>
        </Card>

        <Card title="SECURITY_PROTOCOL" className="!p-8 neo-shadow-lg bg-neo-black text-white -rotate-1">
           <div className="flex items-start gap-6">
             <div className="w-16 h-16 neo-border bg-neo-accent flex-shrink-0 flex items-center justify-center -rotate-6">
               <i className="fas fa-shield-alt text-3xl"></i>
             </div>
             <p className="font-bold text-xs leading-relaxed uppercase tracking-tight opacity-80">
               THE SECURITY OF YOUR PERSONAL DATA IS CRITICAL. ALL USER DATA IS CONFINED TO THE LOCAL STORAGE OF YOUR BROWSER. THIS ARCHITECTURE OFFERS PRIVACY BY DESIGN, ELIMINATING CENTRALIZED SERVER TRANSMISSION BY DEFAULT. 
             </p>
           </div>
        </Card>

        <Card title="CONTACT_PORTAL" className="!p-8 neo-shadow-md bg-neo-muted">
           <div className="flex flex-col md:flex-row justify-between items-center gap-6">
             <p className="font-black text-xs uppercase tracking-widest">QUERY_TRANSMISSION:</p>
             <div className="flex gap-4">
               <div className="px-4 py-2 bg-white neo-border-sm font-bold text-[10px]">SUPPORT@STEADYSOCIAL.IO</div>
               <div className="px-4 py-2 bg-white neo-border-sm font-bold text-[10px]">CORE_SECURE_LINK</div>
             </div>
           </div>
        </Card>
      </main>
    </div>
  );
};

export default PrivacyPolicyPage;
