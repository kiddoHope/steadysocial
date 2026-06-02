import React, { useState, useEffect } from 'react';
import { dbGetAutomations, dbCreateAutomation, dbUpdateAutomation, dbDeleteAutomation, AutomationRule, AutomationTrigger, AutomationAction } from '../services/automationService';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Alert from '../components/ui/Alert';

const AutomationMatrixPage: React.FC = () => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState<AutomationTrigger>('NEW_MESSAGE_RECEIVED');
  const [newAction, setNewAction] = useState<AutomationAction>('SEND_AUTO_REPLY');

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setIsLoading(true);
    try {
      const data = await dbGetAutomations();
      setRules(data);
    } catch (err: any) {
      setError(`FETCH_ERROR: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await dbCreateAutomation({
        name: newName,
        trigger: newTrigger,
        action: newAction,
        isEnabled: true
      });
      setNewName('');
      setIsAddingRule(false);
      fetchRules();
    } catch (err: any) {
      setError(`CREATE_ERROR: ${err.message}`);
    }
  };

  const toggleRule = async (rule: AutomationRule) => {
    try {
      await dbUpdateAutomation(rule.id, { isEnabled: !rule.isEnabled });
      fetchRules();
    } catch (err: any) {
      setError(`UPDATE_ERROR: ${err.message}`);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('TERMINATE_WORKFLOW?')) return;
    try {
      await dbDeleteAutomation(id);
      fetchRules();
    } catch (err: any) {
      setError(`DELETE_ERROR: ${err.message}`);
    }
  };

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-8 max-w-[1400px] w-full mx-auto">
        <div className="inline-block bg-neo-accent text-white px-2 py-0.5 mb-2 neo-border-sm rotate-1">
          <span className="text-[10px] font-black uppercase tracking-widest">AUTOMATION_MATRIX_V1.0</span>
        </div>
        <div className="flex justify-between items-end">
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-neo-black leading-none">
            WORKFLOW_<span className="text-neo-secondary outline-text">MATRIX</span>
          </h1>
          <Button variant="primary" onClick={() => setIsAddingRule(!isAddingRule)}>
            {isAddingRule ? 'CLOSE_BUILDER' : 'CREATE_WORKFLOW'}
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] w-full mx-auto flex-grow">
        {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-6" />}

        {isAddingRule && (
          <Card title="WORKFLOW_ENGINE_CONFIG" className="mb-8 neo-shadow-md bg-white border-neo-secondary">
            <form onSubmit={handleCreateRule} className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
              <Input label="PROTOCOL_NAME" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Rule name..." />
              <Select 
                label="IF_TRIGGER" 
                value={newTrigger} 
                onChange={e => setNewTrigger(e.target.value as AutomationTrigger)}
                options={[
                  { value: 'NEW_MESSAGE_RECEIVED', label: 'MSG_RECEIVED' },
                  { value: 'NEW_LEAD_ADDED', label: 'LEAD_DETECTED' },
                  { value: 'LEAD_STATUS_CHANGED', label: 'STATUS_SHIFT' },
                  { value: 'DAILY_SCHEDULE', label: 'TIME_PULSE' }
                ]}
              />
              <Select 
                label="THEN_ACTION" 
                value={newAction} 
                onChange={e => setNewAction(e.target.value as AutomationAction)}
                options={[
                  { value: 'SEND_AUTO_REPLY', label: 'AUTO_RESPONSE' },
                  { value: 'TAG_LEAD_HOT', label: 'TAG_PRIORITY' },
                  { value: 'NOTIFY_TEAM', label: 'BROADCAST_ALERT' },
                  { value: 'LOG_ACTIVITY', label: 'RECORD_LOG' }
                ]}
              />
              <Button type="submit" variant="primary" className="h-[46px]">ACTIVATE_RULE</Button>
            </form>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {isLoading ? (
            <div className="col-span-full py-20 flex justify-center">
              <div className="w-12 h-12 neo-border bg-neo-accent animate-spin"></div>
            </div>
          ) : rules.length > 0 ? (
            rules.map(rule => (
              <Card 
                key={rule.id} 
                title={rule.name.toUpperCase()} 
                className={`neo-shadow-md transition-all ${rule.isEnabled ? 'bg-white' : 'bg-neo-muted grayscale'}`}
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase opacity-40">TRIGGER:</span>
                    <span className="text-xs font-bold uppercase">{rule.trigger.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase opacity-40">ACTION:</span>
                    <span className="text-xs font-bold uppercase text-neo-accent">{rule.action.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2 border-t pt-4">
                    <span className="text-[10px] font-black uppercase opacity-40">CYCLES_RUN:</span>
                    <span className="text-sm font-black">{rule.runCount}</span>
                  </div>
                  <div className="flex gap-4 pt-4">
                    <Button 
                      variant={rule.isEnabled ? 'secondary' : 'primary'} 
                      size="sm" 
                      onClick={() => toggleRule(rule)}
                      className="flex-grow"
                    >
                      {rule.isEnabled ? 'DEACTIVATE' : 'ACTIVATE'}
                    </Button>
                    <button onClick={() => handleDeleteRule(rule.id)} className="w-10 h-10 neo-border-sm flex items-center justify-center hover:bg-neo-accent hover:text-white transition-colors">
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="col-span-full py-32 text-center bg-white neo-border neo-shadow-md">
              <i className="fas fa-cogs text-6xl text-neo-muted mb-6"></i>
              <p className="font-black uppercase tracking-widest opacity-40">NO_ACTIVE_AUTOMATIONS</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AutomationMatrixPage;
