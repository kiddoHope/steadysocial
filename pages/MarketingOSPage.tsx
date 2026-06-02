import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { dbGetFacebookSettings } from '../services/settingsService';
import { dbGetCampaigns } from '../services/campaignService';

const MarketingOSPage: React.FC = () => {
  const [isFbConnected, setIsFbConnected] = useState(false);
  const [activeCampaignsCount, setActiveCampaignsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [settings, campaigns] = await Promise.all([
          dbGetFacebookSettings(),
          dbGetCampaigns()
        ]);
        setIsFbConnected(!!settings.appId && !!settings.pageId);
        setActiveCampaignsCount(campaigns.filter(c => c.status === 'ACTIVE').length);
      } catch (err) {
        console.error("Failed to load OS data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-12 max-w-[1600px] w-full mx-auto">
        <div className="inline-block bg-neo-black text-white px-3 py-1 mb-4 neo-border-sm -rotate-1">
          <span className="text-xs font-black uppercase tracking-[0.3em]">OPERATING_SYSTEM_v4.0</span>
        </div>
        <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter text-neo-black leading-none mb-4">
          MARKETING_<span className="text-neo-accent secondary-text">OS</span>
        </h1>
        <p className="max-w-2xl text-xl font-bold uppercase tracking-tight opacity-60">
          CENTRALIZED_COMMAND_UNIT FOR CROSS-PLATFORM GROWTH & CAMPAIGN ORCHESTRATION.
        </p>
      </header>

      <main className="relative z-10 max-w-[1600px] w-full mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
        {/* Core Modules */}
        <Card title="CAMPAIGN_PLANNER" className="neo-shadow-lg hover:translate-x-1 hover:translate-y-1 transition-all group bg-white">
          <div className="p-4">
            <div className="w-16 h-16 neo-border bg-neo-secondary mb-6 flex items-center justify-center group-hover:rotate-12 transition-transform">
              <i className="fas fa-bullhorn text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black uppercase mb-4">Strategic Planning</h3>
            <p className="text-sm font-bold opacity-70 mb-8">ORCHESTRATE_MULTI_CHANNEL_CAMPAIGNS WITH AI-DRIVEN INSIGHTS AND CALENDAR SYNC.</p>
            <NavLink to="/campaign-planner">
              <Button variant="primary" className="w-full">ACCESS_MODULE</Button>
            </NavLink>
          </div>
        </Card>

        <Card title="SOCIAL_ORCHESTRATOR" className="neo-shadow-lg hover:translate-x-1 hover:translate-y-1 transition-all group bg-white border-neo-accent">
          <div className="p-4">
            <div className="w-16 h-16 neo-border bg-neo-accent text-white mb-6 flex items-center justify-center group-hover:-rotate-12 transition-transform">
              <i className="fas fa-share-nodes text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black uppercase mb-4">Social Scheduler</h3>
            <p className="text-sm font-bold opacity-70 mb-8">AUTOMATED_POSTING_FLOW FOR FACEBOOK, INSTAGRAM, AND TELEGRAM PROTOCOLS.</p>
            <NavLink to="/facebook-scheduler">
              <Button variant="primary" className="w-full bg-neo-accent">LAUNCH_SCHEDULER</Button>
            </NavLink>
          </div>
        </Card>

        <Card title="ANALYTICS_TERMINAL" className="neo-shadow-lg hover:translate-x-1 hover:translate-y-1 transition-all group bg-white">
          <div className="p-4">
            <div className="w-16 h-16 neo-border bg-neo-black text-white mb-6 flex items-center justify-center group-hover:scale-110 transition-transform">
              <i className="fas fa-chart-pie text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black uppercase mb-4">Growth Metrics</h3>
            <p className="text-sm font-bold opacity-70 mb-8">REAL_TIME_DATA_STREAMS AND ROI_TRACKING ACROSS ALL CONNECTED NODES.</p>
            <NavLink to="/analytics">
              <Button variant="primary" className="w-full">VIEW_REPORTS</Button>
            </NavLink>
          </div>
        </Card>

        {/* Support Modules */}
        <Card title="CONTENT_GEN_LAB" className="neo-shadow-md bg-neo-muted">
           <div className="p-4">
            <h4 className="text-xl font-black uppercase mb-2">AI Generation</h4>
            <p className="text-xs font-bold opacity-60 mb-6">SYNTHESIZE_HIGH_CONVERSION_ASSETS USING LOCAL_LLM_ENGINES.</p>
            <NavLink to="/generate">
               <Button variant="secondary" className="w-full">START_SYNTHESIS</Button>
            </NavLink>
          </div>
        </Card>

        <Card title="LEAD_CORE" className="neo-shadow-md bg-neo-muted">
           <div className="p-4">
            <h4 className="text-xl font-black uppercase mb-2">CRM Integration</h4>
            <p className="text-xs font-bold opacity-60 mb-6">MANAGE_INCOMING_LEADS AND CUSTOMER_RELATIONSHIP_PROTOCOLS.</p>
            <NavLink to="/crm">
              <Button variant="secondary" className="w-full">ACCESS_CRM</Button>
            </NavLink>
          </div>
        </Card>

        <Card title="AUTOMATION_MATRIX" className="neo-shadow-md bg-neo-muted">
           <div className="p-4">
            <h4 className="text-xl font-black uppercase mb-2">Workflow Builder</h4>
            <p className="text-xs font-bold opacity-60 mb-6">CONFIGURE_TRIGGER_BASED_ACTIONS AND AUTONOMOUS_RESPONSE_CYCLES.</p>
            <NavLink to="/automation">
              <Button variant="secondary" className="w-full">OPEN_MATRIX</Button>
            </NavLink>
          </div>
        </Card>
      </main>

      {/* System Status Section */}
      <section className="relative z-10 max-w-[1600px] w-full mx-auto">
        <div className="bg-neo-black text-white p-8 neo-border flex flex-col md:flex-row justify-between items-center gap-8">
            <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">NETWORK_STATUS_OVERVIEW</h2>
                <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 ${isFbConnected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'} rounded-full neo-border-sm`}></div>
                        <span className="text-[10px] font-black uppercase opacity-60">FACEBOOK_NODE: {isFbConnected ? 'ACTIVE' : 'OFFLINE'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full neo-border-sm"></div>
                        <span className="text-[10px] font-black uppercase opacity-60">INSTAGRAM_NODE: SYNCING</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-neo-accent rounded-full neo-border-sm"></div>
                        <span className="text-[10px] font-black uppercase opacity-60">AI_ENGINE: OPTIMIZED</span>
                    </div>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="text-right">
                    <p className="text-[10px] font-black opacity-40 uppercase">ACTIVE_CAMPAIGNS</p>
                    <p className="text-2xl font-black uppercase">{activeCampaignsCount}_UNITS</p>
                </div>
                <div className="text-right border-l border-white/20 pl-4">
                    <p className="text-[10px] font-black opacity-40 uppercase">TOTAL_REACH</p>
                    <p className="text-2xl font-black uppercase">SYNCING...</p>
                </div>
            </div>
        </div>
      </section>

      <footer className="mt-auto py-8 text-center">
         <p className="text-[10px] font-black uppercase tracking-[0.5em] opacity-30">
            MARKETING_OS // SECURITY_PROTOCOL_ALPHA // STEADYSOCIAL_CORE
         </p>
      </footer>
    </div>
  );
};

export default MarketingOSPage;
