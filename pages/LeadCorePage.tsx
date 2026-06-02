import React, { useState, useEffect } from 'react';
import { 
  dbGetLeads, 
  dbCreateLead, 
  dbUpdateLead, 
  dbDeleteLead, 
  Lead, 
  LeadStatus, 
  LeadSource,
  dbGetLeadForms,
  dbBulkImportLeads,
  FbLeadForm
} from '../services/crmService';
import { dbGetFacebookSettings } from '../services/settingsService';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Alert from '../components/ui/Alert';

const LeadCorePage: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // New Lead Form State: fullname, age, gender, email, contact number (phone), address
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newGender, setNewGender] = useState('');
  const [newSource, setNewSource] = useState<LeadSource>('MANUAL');
  const [newStatus, setNewStatus] = useState<LeadStatus>('NEW');

  // Import tabs state
  const [importTab, setImportTab] = useState<'manual' | 'bulk'>('manual');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Facebook Integration State
  const [fbSettings, setFbSettings] = useState<any>(null);
  const [fbForms, setFbForms] = useState<FbLeadForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>('');
  const [isSyncingFb, setIsSyncingFb] = useState(false);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [inspectingLead, setInspectingLead] = useState<Lead | null>(null);

  useEffect(() => {
    fetchLeads();
    // loadFacebookSettings();
  }, []);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const data = await dbGetLeads();
      setLeads(data);
    } catch (err: any) {
      setError(`FETCH_ERROR: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFacebookSettings = async () => {
    try {
      const settings = await dbGetFacebookSettings();
      setFbSettings(settings);
      if (settings.pageId && (settings.accessToken || settings.pageId)) {
        loadFbForms(settings.pageId, settings.accessToken || '');
      }
    } catch (err: any) {
      console.warn('Failed to load Facebook settings:', err.message);
    }
  };

  const loadFbForms = async (pageId: string, token: string) => {
    if (!pageId || !token) return;
    setIsLoadingForms(true);
    try {
      const res = await dbGetLeadForms(pageId, token);
      setFbForms(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedFormId(res.data[0].id);
      }
    } catch (err: any) {
      console.warn('Failed to fetch Facebook forms:', err.message);
    } finally {
      setIsLoadingForms(false);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewAddress('');
    setNewAge('');
    setNewGender('');
    setNewSource('MANUAL');
    setNewStatus('NEW');
    setBulkFile(null);
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    try {
      await dbCreateLead({
        name: newName,
        email: newEmail,
        phone: newPhone,
        address: newAddress,
        age: newAge ? parseInt(newAge) || newAge : undefined,
        gender: newGender || undefined,
        source: newSource,
        status: newStatus
      });
      resetForm();
      setIsAddingLead(false);
      fetchLeads();
      setSuccessMsg('Lead committed successfully!');
    } catch (err: any) {
      setError(`CREATE_ERROR: ${err.message}`);
    }
  };

  // Bulk Import Parser (CSV/Excel)
  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) return;

    setBulkLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const { default: XLSX } = await import('xlsx');
      const data = await bulkFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet);

      const getValue = (obj: any, targetKeys: string[]): any => {
        for (const targetKey of targetKeys) {
          const foundKey = Object.keys(obj).find(key => key.trim().toLowerCase() === targetKey.toLowerCase());
          if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null) {
            return obj[foundKey];
          }
        }
        return undefined;
      };

      let importedCount = 0;
      for (const row of jsonRows) {
        const fullname = getValue(row, ['fullname', 'full name', 'name', 'identifier']);
        if (!fullname) continue;

        const email = getValue(row, ['email', 'email address', 'email_address']);
        const phone = getValue(row, ['phone', 'phone number', 'phone_number', 'contact', 'contact number', 'contact_number']);
        const address = getValue(row, ['address', 'home address', 'home_address', 'shipping address', 'shipping_address']);
        const ageVal = getValue(row, ['age']);
        const gender = getValue(row, ['gender', 'sex']);
        const sourceVal = getValue(row, ['source']) || 'MANUAL';
        const statusVal = getValue(row, ['status']) || 'NEW';

        const age = ageVal ? parseInt(ageVal) || ageVal : undefined;

        await dbCreateLead({
          name: fullname,
          email: email || undefined,
          phone: phone ? String(phone) : undefined,
          address: address || undefined,
          age,
          gender: gender || undefined,
          source: sourceVal as LeadSource,
          status: statusVal as LeadStatus
        });
        importedCount++;
      }

      setSuccessMsg(`Bulk import committed! Successfully resolved and imported ${importedCount} CRM leads.`);
      resetForm();
      setIsAddingLead(false);
      fetchLeads();
    } catch (err: any) {
      setError(`BULK_IMPORT_ERROR: ${err.message}`);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleStatusChange = async (id: string, status: LeadStatus) => {
    try {
      await dbUpdateLead(id, { status });
      fetchLeads();
    } catch (err: any) {
      setError(`UPDATE_ERROR: ${err.message}`);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!window.confirm('TERMINATE_LEAD_DATA?')) return;
    try {
      await dbDeleteLead(id);
      fetchLeads();
      if (inspectingLead?.id === id) {
        setInspectingLead(null);
      }
    } catch (err: any) {
      setError(`DELETE_ERROR: ${err.message}`);
    }
  };

  const handleFbBulkImport = async () => {
    if (!selectedFormId || !fbSettings?.accessToken) {
      setError('Please select a form and ensure your Facebook Page Access Token is loaded.');
      return;
    }
    setIsSyncingFb(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await dbBulkImportLeads(selectedFormId, fbSettings.accessToken);
      if (res.success) {
        setSuccessMsg(`Bulk pull successful! Imported ${res.imported} new leads, skipped ${res.skipped} duplicates.`);
        fetchLeads();
      } else {
        throw new Error('Unsuccessful import status received.');
      }
    } catch (err: any) {
      setError(`FB_IMPORT_ERROR: ${err.message}`);
    } finally {
      setIsSyncingFb(false);
    }
  };

  const getStatusColor = (status: LeadStatus) => {
    switch (status) {
      case 'NEW': return 'bg-neo-secondary text-neo-black';
      case 'CONTACTED': return 'bg-blue-400 text-neo-black';
      case 'QUALIFIED': return 'bg-neo-accent text-white';
      case 'WON': return 'bg-green-500 text-white';
      case 'LOST': return 'bg-neo-black text-white';
      default: return 'bg-neo-muted';
    }
  };

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-8 max-w-[1400px] w-full mx-auto">
        <div className="inline-block bg-neo-black text-white px-2 py-0.5 mb-2 neo-border-sm rotate-1">
          <span className="text-[10px] font-black uppercase tracking-widest">CRM_CORE_V1.2</span>
        </div>
        <div className="flex justify-between items-end flex-wrap gap-4">
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-neo-black leading-none">
            LEAD_<span className="text-neo-secondary outline-text">CORE</span>
          </h1>
          <div className="flex gap-4">
            <Button variant="secondary" onClick={() => { fetchLeads(); }}>
              REFRESH_ALL
            </Button>
            <Button variant="primary" onClick={() => { setIsAddingLead(true); resetForm(); setImportTab('manual'); }}>
              ADD_NEW_LEAD
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] w-full mx-auto flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-3 space-y-6">
          {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-4" />}
          {successMsg && <Alert type="success" message={successMsg} onClose={() => setSuccessMsg(null)} className="mb-4" />}

          {isAddingLead && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white border-4 border-neo-black p-6 w-full max-w-2xl neo-shadow-lg relative overflow-y-auto max-h-[90vh]">
                <button 
                  onClick={() => setIsAddingLead(false)} 
                  className="absolute top-4 right-4 text-2xl font-black hover:text-neo-accent"
                >
                  ✕
                </button>
                
                <h3 className="text-3xl font-black uppercase mb-6 tracking-tight">ADD_NEW_LEAD</h3>

                <div className="flex gap-2 border-4 border-neo-black bg-neo-black p-0.5 mb-6 rotate-1">
                  <button
                    type="button"
                    onClick={() => setImportTab('manual')}
                    className={`flex-1 text-center py-2 text-xs font-black uppercase tracking-wider transition-all ${
                      importTab === 'manual'
                        ? 'bg-neo-accent text-white'
                        : 'bg-white text-neo-black hover:bg-neo-secondary'
                    }`}
                  >
                    MANUAL_ENTRY
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportTab('bulk')}
                    className={`flex-1 text-center py-2 text-xs font-black uppercase tracking-wider transition-all ${
                      importTab === 'bulk'
                        ? 'bg-neo-accent text-white'
                        : 'bg-white text-neo-black hover:bg-neo-secondary'
                    }`}
                  >
                    BULK_CSV_EXCEL_IMPORT
                  </button>
                </div>

                {importTab === 'manual' ? (
                  <form onSubmit={handleCreateLead} className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <Input label="FULL_NAME" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full Name" required />
                      <Input label="EMAIL_ADDRESS" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email Address" />
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      <Input label="CONTACT_NUMBER" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Contact / Phone" />
                      <Input label="AGE" type="number" value={newAge} onChange={e => setNewAge(e.target.value)} placeholder="Age" />
                      <Select 
                        label="GENDER" 
                        value={newGender} 
                        onChange={e => setNewGender(e.target.value)}
                        options={[
                          { value: '', label: 'SELECT GENDER' },
                          { value: 'Male', label: 'Male' },
                          { value: 'Female', label: 'Female' },
                          { value: 'Non-binary', label: 'Non-binary' },
                          { value: 'Prefer not to say', label: 'Prefer not to say' }
                        ]}
                      />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Select 
                        label="SOURCE" 
                        value={newSource} 
                        onChange={e => setNewSource(e.target.value as LeadSource)}
                        options={[
                          { value: 'MANUAL', label: 'MANUAL' },
                          { value: 'MESSENGER', label: 'MESSENGER' },
                          { value: 'FACEBOOK_ADS', label: 'FACEBOOK_ADS' },
                          { value: 'INSTAGRAM', label: 'INSTAGRAM' },
                          { value: 'WEBSITE', label: 'WEBSITE' },
                          { value: 'REFERRAL', label: 'REFERRAL' },
                          { value: 'OTHER', label: 'OTHER' }
                        ]}
                      />
                      <Select 
                        label="STATUS" 
                        value={newStatus} 
                        onChange={e => setNewStatus(e.target.value as LeadStatus)}
                        options={[
                          { value: 'NEW', label: 'NEW' },
                          { value: 'CONTACTED', label: 'CONTACTED' },
                          { value: 'QUALIFIED', label: 'QUALIFIED' },
                          { value: 'WON', label: 'WON' },
                          { value: 'LOST', label: 'LOST' }
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black tracking-wider text-neo-black mb-1.5">ADDRESS</label>
                      <textarea
                        value={newAddress}
                        onChange={e => setNewAddress(e.target.value)}
                        placeholder="Complete Mailing Address"
                        className="w-full text-xs font-bold p-3 neo-border-sm bg-neo-bg focus:bg-white focus:outline-none min-h-[80px]"
                      />
                    </div>
                    <div className="flex gap-4 pt-4">
                      <Button type="button" variant="secondary" onClick={() => setIsAddingLead(false)} className="w-1/3">CANCEL</Button>
                      <Button type="submit" variant="primary" className="w-2/3">COMMIT_NEW_LEAD</Button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleBulkImport} className="space-y-6">
                    <div className="border-4 border-dashed border-neo-black p-8 bg-neo-muted text-center cursor-pointer hover:bg-neo-secondary/10 transition-colors relative">
                      <input 
                        type="file" 
                        accept=".csv,.xlsx,.xls" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onChange={e => setBulkFile(e.target.files?.[0] || null)}
                      />
                      <i className="fas fa-file-excel text-5xl text-neo-black mb-4"></i>
                      <p className="font-black text-sm uppercase">
                        {bulkFile ? bulkFile.name : 'DRAG_FILE_HERE_OR_CLICK_TO_UPLOAD'}
                      </p>
                      <p className="text-[10px] font-bold opacity-60 mt-2">
                        SUPPORTED_FORMATS: .xlsx, .xls, .csv
                      </p>
                    </div>

                    <div className="bg-neo-bg/50 p-4 border border-neo-black text-[10px] font-bold space-y-2">
                      <p className="font-black uppercase text-neo-accent">Column Mapping Protocol Details:</p>
                      <p>The parser dynamically checks and maps headers containing:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li><strong>Full Name:</strong> name, fullname, full name, identifier</li>
                        <li><strong>Email:</strong> email, email address, email_address</li>
                        <li><strong>Contact:</strong> phone, phone number, contact, contact number, contact_number</li>
                        <li><strong>Address:</strong> address, home address, shipping address</li>
                        <li><strong>Age / Gender:</strong> age, gender, sex</li>
                        <li><strong>Source / Status:</strong> source, status (defaults to MANUAL / NEW)</li>
                      </ul>
                    </div>

                    <div className="flex gap-4">
                      <Button type="button" variant="secondary" onClick={() => setIsAddingLead(false)} className="w-1/3">CANCEL</Button>
                      <Button type="submit" variant="primary" disabled={!bulkFile || bulkLoading} className="w-2/3">
                        {bulkLoading ? 'PROCESSING...' : 'RUN_BULK_IMPORT'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          <Card title="LEAD PROTOCOL STATUS BOARD" className="w-full neo-shadow-lg bg-white border-2 border-neo-black overflow-hidden">
            {isLoading ? (
              <div className="py-20 flex justify-center">
                <div className="w-12 h-12 neo-border bg-neo-accent animate-spin"></div>
              </div>
            ) : leads.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neo-black text-white font-black uppercase text-xs tracking-widest border-b-4 border-neo-black">
                      <th className="p-4">IDENTIFIER</th>
                      <th className="p-4">STATUS</th>
                      <th className="p-4">DEMOGRAPHICS</th>
                      <th className="p-4">CONTACT DATA</th>
                      <th className="p-4">ADDRESS</th>
                      <th className="p-4 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(lead => (
                      <tr key={lead.id} className="border-b border-neo-black hover:bg-neo-muted transition-colors">
                        <td className="p-4 font-black uppercase text-sm flex flex-col">
                          <span>{lead.name}</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 mt-1 neo-border-sm border border-neo-black uppercase w-max ${
                            lead.source === 'FACEBOOK_ADS' ? 'bg-neo-accent text-white' : 'bg-neo-muted text-neo-black'
                          }`}>
                            {lead.source}
                          </span>
                        </td>
                        <td className="p-4">
                          <select 
                            className={`${getStatusColor(lead.status)} neo-border-sm px-2.5 py-1 font-black text-[9px] uppercase cursor-pointer outline-none border border-neo-black`}
                            value={lead.status}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                          >
                            <option value="NEW">NEW</option>
                            <option value="CONTACTED">CONTACTED</option>
                            <option value="QUALIFIED">QUALIFIED</option>
                            <option value="WON">WON</option>
                            <option value="LOST">LOST</option>
                          </select>
                        </td>
                        <td className="p-4 font-bold text-xs">
                          <div className="flex flex-col gap-0.5">
                            {lead.age && <span>AGE: {lead.age}</span>}
                            {lead.gender && <span>GENDER: {lead.gender}</span>}
                            {!lead.age && !lead.gender && <span className="opacity-40 italic">UNSPECIFIED</span>}
                          </div>
                        </td>
                        <td className="p-4 font-bold text-xs">
                          <div className="flex flex-col gap-0.5">
                            {lead.email && <span className="opacity-90">{lead.email}</span>}
                            {lead.phone && <span className="opacity-70 text-[10px]">{lead.phone}</span>}
                            {!lead.email && !lead.phone && <span className="opacity-40 italic">NO_CONTACT</span>}
                          </div>
                        </td>
                        <td className="p-4 font-bold text-xs max-w-[200px] truncate" title={lead.address}>
                          {lead.address || <span className="opacity-40 italic">NO_ADDRESS</span>}
                        </td>
                        <td className="p-4 text-right space-x-3">
                          <button 
                            onClick={() => setInspectingLead(lead)} 
                            className="text-xs font-black uppercase border border-neo-black bg-neo-muted px-2 py-1 neo-shadow-sm hover:-translate-y-0.5 transition-transform"
                          >
                            INSPECT
                          </button>
                          <button onClick={() => handleDeleteLead(lead.id)} className="text-neo-accent hover:text-neo-black transition-colors font-black text-sm">
                            ✖
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-32 text-center">
                <i className="fas fa-users-slash text-6xl text-neo-muted mb-6"></i>
                <p className="font-black uppercase tracking-widest opacity-40">ZERO_LEADS_DETECTED</p>
              </div>
            )}
          </Card>
        </div>

        {/* Facebook Lead Ads Panel
        <div className="space-y-6">
          <Card title="FB WEBHOOK PROTOCOL" className="neo-shadow-md bg-white border-2 border-neo-black">
            <div className="space-y-4 text-xs font-bold">
              <div className="p-3 bg-neo-muted border border-neo-black neo-shadow-sm">
                <p className="text-[10px] uppercase font-black tracking-wider text-neo-black mb-1">Webhook Endpoint URL</p>
                <code className="block select-all text-neo-accent font-black break-all">http://localhost:3001/facebook/webhook</code>
              </div>

              <div className="p-3 bg-neo-muted border border-neo-black neo-shadow-sm">
                <p className="text-[10px] uppercase font-black tracking-wider text-neo-black mb-1">Verify Token</p>
                <code className="block select-all text-neo-black font-black">
                  {fbSettings?.webhookVerifyToken || 'steadysocial_verify'}
                </code>
              </div>

              <div className="flex items-center gap-2 text-[10px] uppercase text-green-600 font-black">
                <div className="w-2.5 h-2.5 bg-green-500 border border-neo-black rounded-full animate-pulse"></div>
                Webhook Active & Awaiting Submissions
              </div>
            </div>
          </Card>

          <Card title="BULK GRAPH API IMPORT" className="neo-shadow-md bg-white border-2 border-neo-black">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-black tracking-wider text-neo-black mb-1.5">
                  Select Lead Form
                </label>
                {isLoadingForms ? (
                  <div className="py-2.5 text-center text-xs font-black uppercase text-neo-accent">
                    Querying Form Schemas...
                  </div>
                ) : fbForms.length > 0 ? (
                  <select 
                    value={selectedFormId} 
                    onChange={e => setSelectedFormId(e.target.value)}
                    className="w-full bg-neo-muted border-2 border-neo-black p-2 font-black text-xs uppercase cursor-pointer outline-none neo-shadow-sm"
                  >
                    {fbForms.map(form => (
                      <option key={form.id} value={form.id}>
                        {form.name} ({form.leads_count || 0} leads)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-neo-muted border border-dashed border-neo-black text-center text-xs font-black uppercase opacity-60">
                    No forms active or no FB connection
                  </div>
                )}
              </div>

              <Button 
                variant="primary" 
                className="w-full h-11 uppercase font-black flex items-center justify-center gap-2"
                onClick={handleFbBulkImport}
                disabled={isSyncingFb || fbForms.length === 0}
              >
                {isSyncingFb ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full"></span>
                    SYNCING_GRAPH...
                  </>
                ) : (
                  'SYNC GRAPH API LEADS'
                )}
              </Button>
            </div>
          </Card>

          {inspectingLead && (
            <Card title={`LEAD FIELD DATA INSPECTION`} className="neo-shadow-md bg-white border-2 border-neo-accent relative">
              <button 
                onClick={() => setInspectingLead(null)} 
                className="absolute top-3 right-3 text-neo-black hover:text-neo-accent font-black text-sm"
              >
                ✕
              </button>
              <div className="space-y-3 font-bold text-xs mt-2">
                <div className="flex justify-between items-center border-b border-neo-black pb-1 mb-2">
                  <span className="text-[10px] uppercase text-neo-accent font-black">Field Payload</span>
                  <span className="text-[10px] uppercase font-black text-neo-black">ID: {inspectingLead.fbLeadId}</span>
                </div>
                {inspectingLead.fbRawFields && Object.entries(inspectingLead.fbRawFields).map(([key, val]) => (
                  <div key={key} className="flex justify-between gap-4 border-b border-neo-muted py-1 flex-wrap">
                    <span className="text-neo-black uppercase tracking-wider text-[10px] font-black">{key.replace(/_/g, ' ')}</span>
                    <span className="text-neo-accent font-bold text-right">{String(val)}</span>
                  </div>
                ))}
                {inspectingLead.fbAdId && (
                  <div className="flex justify-between gap-4 border-b border-neo-muted py-1 mt-2 font-black text-[9px] uppercase opacity-75">
                    <span>Ad Identifier</span>
                    <span>{inspectingLead.fbAdId}</span>
                  </div>
                )}
                {inspectingLead.fbSubmittedAt && (
                  <div className="flex justify-between gap-4 py-1 font-black text-[9px] uppercase opacity-75">
                    <span>Time Submitted</span>
                    <span>{new Date(inspectingLead.fbSubmittedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div> */}
      </main>
    </div>
  );
};

export default LeadCorePage;
