
import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Alert from '../components/ui/Alert';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { 
  Campaign, 
  dbGetCampaigns, 
  dbCreateCampaign, 
  dbUpdateCampaign, 
  dbDeleteCampaign 
} from '../services/campaignService';

const CampaignPlannerPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewCampaignForm, setShowNewCampaignForm] = useState(false);
  const [newCampaign, setNewCampaign] = useState<Partial<Campaign>>({ name: '', budget: '', status: 'DRAFT' });

  const loadCampaigns = async () => {
    setIsLoading(true);
    try {
      const data = await dbGetCampaigns();
      setCampaigns(data);
    } catch (err: any) {
      setError(`LOAD_FAILURE: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleAddCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.name) return;
    
    try {
      const campaign: Partial<Campaign> = {
        name: newCampaign.name,
        budget: newCampaign.budget || '$0',
        status: 'DRAFT',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
      };

      const saved = await dbCreateCampaign(campaign);
      setCampaigns([...campaigns, saved]);
      setShowNewCampaignForm(false);
      setNewCampaign({ name: '', budget: '', status: 'DRAFT' });
    } catch (err: any) {
      setError(`CREATE_FAILURE: ${err.message}`);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!window.confirm("DELETE_CAMPAIGN_PERMANENTLY?")) return;
    try {
      await dbDeleteCampaign(id);
      setCampaigns(campaigns.filter(c => c.id !== id));
    } catch (err: any) {
      setError(`DELETE_FAILURE: ${err.message}`);
    }
  };

  const handleToggleStatus = async (id: string) => {
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return;

    const nextStatus: Campaign['status'] = campaign.status === 'ACTIVE' ? 'COMPLETED' : campaign.status === 'DRAFT' ? 'ACTIVE' : 'DRAFT';
    
    try {
      const updated = await dbUpdateCampaign(id, { status: nextStatus });
      setCampaigns(campaigns.map(c => c.id === id ? updated : c));
    } catch (err: any) {
      setError(`UPDATE_FAILURE: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-full bg-neo-bg flex items-center justify-center font-space">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-8 max-w-[1200px] w-full mx-auto flex justify-between items-end">
        <div>
          <div className="inline-block bg-neo-black text-white px-2 py-0.5 mb-2 neo-border-sm rotate-1">
            <span className="text-[10px] font-black uppercase tracking-widest">STRATEGIC_PLANNING</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-neo-black leading-none">
            CAMPAIGN_<span className="text-neo-accent outline-text">PLANNER</span>
          </h1>
        </div>
        <Button variant="primary" onClick={() => setShowNewCampaignForm(true)}>
          INITIATE_NEW_CAMPAIGN
        </Button>
      </header>

      <main className="relative z-10 max-w-[1200px] w-full mx-auto">
        {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-8" />}
        
        {showNewCampaignForm && (
          <Card title="CAMPAIGN_INITIALIZATION" className="mb-12 bg-white neo-shadow-lg max-w-2xl mx-auto">
            <form onSubmit={handleAddCampaign} className="space-y-6">
              <Input
                label="CAMPAIGN_NAME"
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                placeholder="E.G. Q3_EXPANSION"
              />
              <Input
                label="BUDGET_ALLOCATION"
                value={newCampaign.budget}
                onChange={(e) => setNewCampaign({ ...newCampaign, budget: e.target.value })}
                placeholder="$0.00"
              />
              <div className="flex gap-4">
                <Button type="submit" variant="primary" className="flex-grow">CREATE_CAMPAIGN</Button>
                <Button variant="secondary" onClick={() => setShowNewCampaignForm(false)}>CANCEL</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6">
          {campaigns.map(campaign => (
            <Card key={campaign.id} className="bg-white neo-shadow-md hover:neo-shadow-lg transition-all group overflow-hidden">
               <div className="flex flex-col md:flex-row justify-between items-center gap-6 p-2">
                  <div className="flex items-center gap-6">
                    <div className={`w-12 h-12 neo-border flex items-center justify-center ${campaign.status === 'ACTIVE' ? 'bg-neo-secondary' : 'bg-neo-muted'}`}>
                       <i className={`fas ${campaign.status === 'ACTIVE' ? 'fa-bolt' : 'fa-pause'} text-xl`}></i>
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight">{campaign.name}</h3>
                      <div className="flex gap-4 text-[10px] font-black uppercase opacity-40">
                         <span>ID: {campaign.id}</span>
                         <span>START: {campaign.startDate}</span>
                         <span>END: {campaign.endDate || 'TBD'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-12">
                    <div className="text-right">
                       <p className="text-[10px] font-black uppercase opacity-40">ALLOCATED_BUDGET</p>
                       <p className="text-xl font-black">{campaign.budget}</p>
                    </div>
                    <div className="flex gap-3">
                       <Button variant="secondary" size="sm" onClick={() => handleToggleStatus(campaign.id)}>
                         {campaign.status === 'ACTIVE' ? 'PAUSE' : 'ACTIVATE'}
                       </Button>
                       <Button variant="primary" size="sm">MANAGE</Button>
                       <Button variant="danger" size="sm" onClick={() => handleDeleteCampaign(campaign.id)}>
                         <i className="fas fa-trash"></i>
                       </Button>
                    </div>
                  </div>
               </div>
               
               {/* Progress Bar Simulation */}
               <div className="absolute bottom-0 left-0 h-1 bg-neo-black w-full opacity-5"></div>
               <div className={`absolute bottom-0 left-0 h-1 ${campaign.status === 'ACTIVE' ? 'bg-neo-secondary' : 'bg-neo-accent'} transition-all duration-1000`} style={{ width: campaign.status === 'ACTIVE' ? '45%' : '0%' }}></div>
            </Card>
          ))}
          {campaigns.length === 0 && !isLoading && (
            <div className="text-center py-20 bg-neo-muted neo-border-sm rotate-1">
                <i className="fas fa-folder-open text-4xl opacity-10 mb-4"></i>
                <p className="font-black uppercase tracking-widest opacity-20">NO_CAMPAIGNS_FOUND</p>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-12 py-8 text-center border-t-2 border-neo-black/5">
         <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-20">
            CAMPAIGN_PLANNER_MODULE // v1.2 // PROTOCOL_SECURE
         </p>
      </footer>
    </div>
  );
};

export default CampaignPlannerPage;
