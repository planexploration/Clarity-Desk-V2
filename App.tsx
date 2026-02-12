
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppStatus, AppView, ClarityInput, SavedReport, JudgmentInput, SavedJudgment } from './types';
import { APP_MESSAGES } from './constants';
import { generateClarityReport, generateMobilityJudgmentBrief } from './services/geminiService';
import VehicleInputForm from './components/VehicleInputForm';
import ReportView from './components/ReportView';
import JudgmentInputForm from './components/JudgmentInputForm';
import JudgmentView from './components/JudgmentView';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [judgmentHistory, setJudgmentHistory] = useState<SavedJudgment[]>([]);
  const [currentReport, setCurrentReport] = useState<SavedReport | null>(null);
  const [currentJudgment, setCurrentJudgment] = useState<SavedJudgment | null>(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [error, setError] = useState<{ title: string; detail: string; trace?: string } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showTrace, setShowTrace] = useState(false);
  const [lastRequest, setLastRequest] = useState<{ type: 'Technical' | 'Strategic', input: any } | null>(null);
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('clarity_theme');
    if (saved === 'light') return false;
    return true; 
  });

  const registryItems = useMemo(() => {
    const technical = history.map(h => ({
      id: h.id,
      name: h.input.client.name,
      date: new Date(h.timestamp).toLocaleDateString('en-GB'),
      year: h.input.vehicle.year,
      type: 'Technical' as const,
      status: h.status,
      original: h
    }));
    const strategic = judgmentHistory.map(j => ({
      id: j.id,
      name: j.input.client.name,
      date: new Date(j.timestamp).toLocaleDateString('en-GB'),
      year: j.input.vehicle.year,
      type: 'Strategic' as const,
      status: j.status,
      original: j
    }));
    return [...technical, ...strategic].sort((a, b) => b.original.timestamp.localeCompare(a.original.timestamp));
  }, [history, judgmentHistory]);

  const hasPending = useMemo(() => 
    history.some(h => h.status === 'pending') || judgmentHistory.some(j => j.status === 'pending'),
  [history, judgmentHistory]);

  useEffect(() => {
    const saved = localStorage.getItem('clarity_history');
    const savedJ = localStorage.getItem('judgment_history');
    if (saved) try { setHistory(JSON.parse(saved)); } catch (e) {}
    if (savedJ) try { setJudgmentHistory(JSON.parse(savedJ)); } catch (e) {}

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setIsDarkMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const meta = document.getElementById('theme-meta');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('clarity_theme', 'dark');
      if (meta) meta.setAttribute('content', '#000000');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('clarity_theme', 'light');
      if (meta) meta.setAttribute('content', '#FF3B30');
    }
  }, [isDarkMode]);

  useEffect(() => {
    let interval: any;
    if (status === AppStatus.LOADING) {
      interval = setInterval(() => setLoadingMsgIdx(prev => (prev + 1) % APP_MESSAGES.length), 1200);
    }
    return () => clearInterval(interval);
  }, [status]);

  const syncQueue = useCallback(async () => {
    if (!isOnline || status === AppStatus.LOADING) return;
    setStatus(AppStatus.LOADING);
    
    let updatedHistory = [...history];
    let updatedJudgmentHistory = [...judgmentHistory];

    try {
      for (let i = 0; i < updatedHistory.length; i++) {
        if (updatedHistory[i].status === 'pending') {
          try {
            const report = await generateClarityReport(updatedHistory[i].input);
            updatedHistory[i] = { ...updatedHistory[i], report, status: 'completed' };
          } catch (e) {
            updatedHistory[i] = { ...updatedHistory[i], status: 'failed' };
          }
        }
      }

      for (let i = 0; i < updatedJudgmentHistory.length; i++) {
        if (updatedJudgmentHistory[i].status === 'pending') {
          try {
            const report = await generateMobilityJudgmentBrief(updatedJudgmentHistory[i].input);
            updatedJudgmentHistory[i] = { ...updatedJudgmentHistory[i], report, status: 'completed' };
          } catch (e) {
            updatedJudgmentHistory[i] = { ...updatedJudgmentHistory[i], status: 'failed' };
          }
        }
      }

      setHistory(updatedHistory);
      setJudgmentHistory(updatedJudgmentHistory);
      localStorage.setItem('clarity_history', JSON.stringify(updatedHistory));
      localStorage.setItem('judgment_history', JSON.stringify(updatedJudgmentHistory));
      setStatus(AppStatus.IDLE);
    } catch (err) {
      setStatus(AppStatus.ERROR);
      setError({ title: "Sync Interrupted", detail: "Network error during batch sync." });
    }
  }, [isOnline, history, judgmentHistory, status]);

  const parseError = (err: any, context: 'Technical' | 'Strategic') => {
    const msg = err?.message?.toLowerCase() || "";
    const rawTrace = err?.message || "No technical trace available.";
    if (msg.includes("429") || msg.includes("quota") || msg.includes("limit")) {
      return { title: `${context} Capacity Limit`, detail: "Authority Tier node handling maximum volume. Resolves shortly.", trace: rawTrace };
    }
    return { title: `${context} Node Interruption`, detail: "Encountered an internal exception during protocol generation.", trace: rawTrace };
  };

  const handleRequestClarity = async (input: ClarityInput) => {
    setLastRequest({ type: 'Technical', input });
    const requestId = `TR-${Date.now()}`;
    const timestamp = new Date().toISOString();

    if (!isOnline) {
      const newSavedReport: SavedReport = { id: requestId, input, timestamp, status: 'pending' };
      const updatedHistory = [newSavedReport, ...history];
      setHistory(updatedHistory);
      localStorage.setItem('clarity_history', JSON.stringify(updatedHistory));
      setCurrentReport(newSavedReport);
      setView(AppView.REPORT_VIEW);
      return;
    }

    setStatus(AppStatus.LOADING);
    try {
      const generatedReport = await generateClarityReport(input);
      const newSavedReport: SavedReport = { id: requestId, input, report: generatedReport, timestamp, status: 'completed' };
      const updatedHistory = [newSavedReport, ...history];
      setHistory(updatedHistory);
      localStorage.setItem('clarity_history', JSON.stringify(updatedHistory));
      setCurrentReport(newSavedReport);
      setView(AppView.REPORT_VIEW);
      setStatus(AppStatus.IDLE);
      setLastRequest(null);
    } catch (err: any) { 
      console.error(err);
      const failedReport: SavedReport = { id: requestId, input, timestamp, status: 'failed' };
      setHistory([failedReport, ...history]);
      setError(parseError(err, 'Technical')); 
      setStatus(AppStatus.ERROR); 
    }
  };

  const handleRequestJudgment = async (input: JudgmentInput) => {
    setLastRequest({ type: 'Strategic', input });
    const requestId = `SJ-${Date.now()}`;
    const timestamp = new Date().toISOString();

    if (!isOnline) {
      const saved: SavedJudgment = { id: requestId, input, timestamp, status: 'pending' };
      const updated = [saved, ...judgmentHistory];
      setJudgmentHistory(updated);
      localStorage.setItem('judgment_history', JSON.stringify(updated));
      setCurrentJudgment(saved);
      setView(AppView.JUDGMENT_VIEW);
      return;
    }

    setStatus(AppStatus.LOADING);
    try {
      const report = await generateMobilityJudgmentBrief(input);
      const saved: SavedJudgment = { id: requestId, input, report, timestamp, status: 'completed' };
      const updated = [saved, ...judgmentHistory];
      setJudgmentHistory(updated);
      localStorage.setItem('judgment_history', JSON.stringify(updated));
      setCurrentJudgment(saved);
      setView(AppView.JUDGMENT_VIEW);
      setStatus(AppStatus.IDLE);
      setLastRequest(null);
    } catch (err: any) { 
      console.error(err);
      const failed: SavedJudgment = { id: requestId, input, timestamp, status: 'failed' };
      setJudgmentHistory([failed, ...judgmentHistory]);
      setError(parseError(err, 'Strategic')); 
      setStatus(AppStatus.ERROR); 
    }
  };

  const handleRetry = () => {
    if (!lastRequest) return;
    setStatus(AppStatus.IDLE);
    setError(null);
    setShowTrace(false);
    if (lastRequest.type === 'Technical') {
      handleRequestClarity(lastRequest.input);
    } else {
      handleRequestJudgment(lastRequest.input);
    }
  };

  const handleDeleteTechnical = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm("Delete record?")) return;
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    localStorage.setItem('clarity_history', JSON.stringify(updated));
  };

  const handleDeleteStrategic = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm("Delete record?")) return;
    const updated = judgmentHistory.filter(j => j.id !== id);
    setJudgmentHistory(updated);
    localStorage.setItem('judgment_history', JSON.stringify(updated));
  };

  const NavItem = ({ id, label, icon, activeColor = 'bg-ios-red' }: { id: AppView, label: string, icon: React.ReactNode, activeColor?: string }) => (
    <button
      onClick={() => { setView(id); setStatus(AppStatus.IDLE); }}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl font-medium text-[14px] apple-transition tap-feedback ${
        view === id ? `${activeColor} text-white shadow-lg` : 'text-ios-label hover:bg-black/5 dark:hover:bg-white/5'
      }`}
    >
      <div className="flex items-center gap-3 truncate">
        <span className={`shrink-0 ${view === id ? 'text-white' : 'text-ios-secondary'}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
    </button>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ios-bg transition-colors duration-300">
      
      <aside className="w-72 h-full sidebar-glass border-r border-black/5 dark:border-white/5 flex flex-col no-print shrink-0 z-10">
        <div className="p-6 flex flex-col h-full gap-8">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 bg-ios-red rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-500/10 shrink-0">
               <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5"/></svg>
            </div>
            <div className="overflow-hidden">
              <h1 className="font-black text-[17px] tracking-tight truncate text-ios-label">Clarity Desk</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-ios-green' : 'bg-orange-500 animate-pulse'}`}></div>
                <span className="text-[10px] font-black text-ios-secondary uppercase tracking-widest truncate max-w-[120px]">
                   {isOnline ? 'Active Uplink' : 'Offline Mode'}
                </span>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto no-scrollbar">
            <div className="space-y-1">
              <h2 className="px-3 mb-1 text-[10px] font-black text-ios-secondary uppercase tracking-widest opacity-60">Workspace</h2>
              <NavItem id={AppView.DASHBOARD} label="Hub" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>} />
              <NavItem id={AppView.REGISTRY} label="Registry" activeColor="bg-black dark:bg-white dark:!text-black" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>} />
            </div>

            <div className="space-y-1">
              <h2 className="px-3 mb-1 text-[10px] font-black text-ios-secondary uppercase tracking-widest opacity-60">Operations</h2>
              <NavItem id={AppView.NEW_ANALYSIS} label="Signal Decoder" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} />
              <NavItem id={AppView.JUDGMENT_INTAKE} label="Decision Roadmap" activeColor="bg-ios-indigo" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>} />
            </div>

            <div className="space-y-1">
              <h2 className="px-3 mb-1 text-[10px] font-black text-ios-secondary uppercase tracking-widest opacity-60">Archives</h2>
              <NavItem id={AppView.HISTORY} label="Secure Vault" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>} />
            </div>
          </nav>

          <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-2">
             <button 
               onClick={() => setIsDarkMode(!isDarkMode)} 
               className="w-full flex items-center gap-3 px-3 py-3 rounded-xl font-bold text-[13px] text-ios-label hover:bg-black/5 dark:hover:bg-white/5 apple-transition tap-feedback group"
             >
               <span className="text-ios-secondary group-hover:text-ios-red dark:group-hover:text-ios-indigo transition-colors">
                 {isDarkMode ? (
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                 ) : (
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                 )}
               </span>
               <span className="flex-1 text-left">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
               <div className={`w-8 h-4 rounded-full p-0.5 relative transition-colors ${isDarkMode ? 'bg-ios-indigo' : 'bg-ios-secondary/30'}`}>
                 <div className={`w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`} />
               </div>
             </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 h-full flex flex-col relative overflow-hidden bg-ios-bg">
        <header className="h-16 px-8 flex items-center justify-between no-print glass border-b border-black/5 dark:border-white/5 shrink-0 z-10">
           <h2 className="text-[14px] font-black uppercase tracking-widest text-ios-secondary">
             {view === AppView.DASHBOARD ? '' : view === AppView.REGISTRY ? 'Registry' : view === AppView.NEW_ANALYSIS ? 'Technical Signal Decoder' : view === AppView.JUDGMENT_INTAKE ? 'Strategic Decision Roadmap' : view.replace('_', ' ')}
           </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-6 sm:px-10 pb-16 no-scrollbar">
          <div className="max-w-4xl mx-auto py-8 animate-ios-entry">
            {view === AppView.DASHBOARD && (
              <div className="space-y-8">
                 {hasPending && isOnline && status !== AppStatus.LOADING && (
                   <div className="bg-ios-indigo p-6 rounded-[32px] text-white flex flex-col sm:flex-row items-center justify-between gap-4 animate-bounce">
                     <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12V7H5a2 2 0 0 1 0-4h14V2"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                       </div>
                       <p className="font-bold">Uplink active. Sync drafts?</p>
                     </div>
                     <button onClick={syncQueue} className="px-6 py-2 bg-white text-ios-indigo font-black rounded-xl hover:scale-105 active:scale-95 transition-all text-sm">Sync</button>
                   </div>
                 )}

                 <div className="w-full h-64 rounded-[40px] overflow-hidden relative shadow-2xl group bg-gray-900">
                    <img src="https://images.unsplash.com/photo-1590362891991-f776e747a588?q=80&w=2069&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-[2000ms] ease-out opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
                    <div className="relative h-full p-12 flex flex-col justify-end">
                      <h2 className="text-4xl font-black text-white tracking-tighter leading-none">Decision Clarity.</h2>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-ios-canvas p-8 rounded-[32px] border border-black/5 dark:border-white/5 shadow-sm">
                       <p className="text-[11px] font-black text-ios-secondary uppercase tracking-widest mb-1">Vault Contents</p>
                       <p className="text-5xl font-black text-ios-red tracking-tighter leading-none">{registryItems.length}</p>
                    </div>
                    <div className="bg-ios-canvas p-8 rounded-[32px] border border-black/5 dark:border-white/5 shadow-sm">
                       <p className="text-[11px] font-black text-ios-secondary uppercase tracking-widest mb-1">Status</p>
                       <p className="text-2xl font-black tracking-tight leading-none mt-2 text-ios-label">{isOnline ? 'Active Uplink' : 'Local Protocol'}</p>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <button onClick={() => setView(AppView.NEW_ANALYSIS)} className="group p-10 rounded-[40px] text-left shadow-sm apple-transition tap-feedback border border-black/5 dark:border-white/5 bg-ios-canvas hover:shadow-2xl">
                       <div className="w-14 h-14 bg-ios-red text-white rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-red-500/10"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5"/></svg></div>
                       <h3 className="text-3xl font-black tracking-tight text-ios-label">Signal Decoder</h3>
                       <p className="text-[12px] font-bold text-ios-secondary uppercase tracking-widest mt-2">Technical Analysis</p>
                    </button>
                    <button onClick={() => setView(AppView.JUDGMENT_INTAKE)} className="group p-10 rounded-[40px] text-left shadow-sm apple-transition tap-feedback bg-ios-indigo hover:shadow-2xl text-white">
                       <div className="w-14 h-14 bg-white text-ios-indigo rounded-2xl flex items-center justify-center mb-6 shadow-xl"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div>
                       <h3 className="text-3xl font-black tracking-tight">Decision Roadmap</h3>
                       <p className="text-[12px] font-bold text-white/50 uppercase tracking-widest mt-2">Strategic Advisory</p>
                    </button>
                 </div>
              </div>
            )}
            {view === AppView.REGISTRY && (
              <div className="space-y-8 max-w-2xl mx-auto">
                 <div className="text-center mb-8"><h2 className="text-4xl font-black tracking-tighter text-ios-label">Registry</h2></div>
                 <div className="ios-inset-group border border-black/5 dark:border-white/5 divide-y divide-black/5 dark:divide-white/5">
                   {registryItems.length === 0 ? <div className="p-16 text-center text-ios-secondary">Vault is empty.</div> :
                     registryItems.map((item, idx) => (
                       <button 
                        key={item.id} 
                        onClick={() => { 
                          if (item.type === 'Technical') { setCurrentReport(item.original as SavedReport); setView(AppView.REPORT_VIEW); } 
                          else { setCurrentJudgment(item.original as SavedJudgment); setView(AppView.JUDGMENT_VIEW); } 
                        }} 
                        className={`w-full text-left p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors tap-feedback ${item.status === 'pending' ? 'opacity-70 bg-black/[0.02] dark:bg-white/[0.02]' : ''}`}
                       >
                         <div className="flex items-center gap-5">
                            <span className="w-8 text-[12px] font-black text-ios-secondary opacity-30 group-hover:opacity-100">{(registryItems.length - idx).toString().padStart(2, '0')}</span>
                            <div className="space-y-0.5">
                              <p className="text-[17px] font-black tracking-tight text-ios-label">{item.name}</p>
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${item.type === 'Technical' ? 'bg-ios-red/10 text-ios-red' : 'bg-ios-indigo/10 text-ios-indigo'}`}>
                                  {item.type === 'Technical' ? 'Signal Decoder' : 'Decision Roadmap'}
                                </span>
                                {item.status === 'pending' && <span className="text-[8px] font-black uppercase text-orange-500 animate-pulse tracking-widest">Pending Sync</span>}
                              </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-6">
                            <p className="text-[15px] font-black text-ios-label opacity-60">{item.date}</p>
                            <button onClick={(e) => { e.stopPropagation(); item.type === 'Technical' ? handleDeleteTechnical(item.id) : handleDeleteStrategic(item.id); }} className="p-3 text-ios-red/40 hover:text-ios-red hover:bg-ios-red/10 rounded-xl transition-all"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                         </div>
                       </button>
                     ))}
                 </div>
              </div>
            )}
            {view === AppView.NEW_ANALYSIS && <VehicleInputForm onSubmit={handleRequestClarity} isLoading={status === AppStatus.LOADING} />}
            {view === AppView.JUDGMENT_INTAKE && <JudgmentInputForm onSubmit={handleRequestJudgment} isLoading={status === AppStatus.LOADING} />}
            {view === AppView.REPORT_VIEW && currentReport && <ReportView report={currentReport.report} status={currentReport.status} vehicle={currentReport.input.vehicle} client={currentReport.input.client} images={currentReport.input.images} onReset={() => setView(AppView.DASHBOARD)} />}
            {view === AppView.JUDGMENT_VIEW && currentJudgment && <JudgmentView report={currentJudgment.report} status={currentJudgment.status} vehicle={currentJudgment.input.vehicle} client={currentJudgment.input.client} images={currentJudgment.input.images} onReset={() => setView(AppView.DASHBOARD)} />}
            {view === AppView.HISTORY && (
              <div className="space-y-12">
                 <div className="flex justify-between items-end"><h2 className="text-4xl font-black tracking-tighter text-ios-label">Archives</h2><p className="text-[14px] font-bold text-ios-red">{history.length + judgmentHistory.length} Entities</p></div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-black text-ios-secondary uppercase tracking-widest opacity-60">Signal Decoder Archives</h3>
                      <div className="ios-inset-group border border-black/5 dark:border-white/5 divide-y divide-black/5 dark:divide-white/5">
                        {history.length === 0 ? <div className="p-10 text-center text-ios-secondary font-medium">No archived protocols.</div> :
                        history.map(item => (
                          <div key={item.id} className={`w-full flex items-center hover:bg-black/[0.02] dark:hover:bg-white/[0.02] group ${item.status === 'pending' ? 'opacity-60' : ''}`}>
                            <button onClick={() => { setCurrentReport(item); setView(AppView.REPORT_VIEW); }} className="flex-1 p-6 text-left flex justify-between items-center tap-feedback">
                              <div className="flex items-center gap-5"><div className="w-10 h-10 bg-ios-red/10 text-ios-red rounded-xl flex items-center justify-center font-black text-[10px]">DEC</div><div className="space-y-0.5"><span className="font-black text-[17px] tracking-tight block text-ios-label">{item.input.vehicle.make} {item.input.vehicle.model}</span><span className="text-[11px] font-bold text-ios-secondary">{item.input.client.name}</span></div></div>
                            </button>
                            <button onClick={() => handleDeleteTechnical(item.id)} className="p-6 text-ios-secondary hover:text-ios-red opacity-0 group-hover:opacity-100 transition-all"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-black text-ios-secondary uppercase tracking-widest opacity-60">Strategic Roadmap Archives</h3>
                      <div className="ios-inset-group border border-black/5 dark:border-white/5 divide-y divide-black/5 dark:divide-white/5">
                        {judgmentHistory.length === 0 ? <div className="p-10 text-center text-ios-secondary font-medium">No archived protocols.</div> :
                        judgmentHistory.map(item => (
                          <div key={item.id} className={`w-full flex items-center hover:bg-black/[0.02] dark:hover:bg-white/[0.02] group ${item.status === 'pending' ? 'opacity-60' : ''}`}>
                            <button onClick={() => { setCurrentJudgment(item); setView(AppView.JUDGMENT_VIEW); }} className="flex-1 p-6 text-left flex justify-between items-center tap-feedback">
                              <div className="flex items-center gap-5"><div className="w-10 h-10 bg-ios-indigo/10 text-ios-indigo rounded-xl flex items-center justify-center font-black text-[10px]">STR</div><div className="space-y-0.5"><span className="font-black text-[17px] tracking-tight block truncate max-w-[160px] text-ios-label">{item.input.vehicle.make} {item.input.vehicle.model}</span><span className="text-[11px] font-bold text-ios-secondary">{item.input.client.name}</span></div></div>
                            </button>
                            <button onClick={() => handleDeleteStrategic(item.id)} className="p-6 text-ios-secondary hover:text-ios-red opacity-0 group-hover:opacity-100 transition-all"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                          </div>
                        ))}
                      </div>
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>

        {status === AppStatus.LOADING && (
          <div className="absolute inset-0 glass z-50 flex flex-col items-center justify-center p-12 text-center pointer-events-none">
             <div className="relative w-16 h-16 mb-8"><div className="absolute inset-0 border-[6px] border-black/5 dark:border-white/5 rounded-full"></div><div className="absolute inset-0 border-[6px] border-t-ios-red rounded-full animate-spin"></div></div>
             <h3 className="text-2xl font-black tracking-tight text-ios-label">{APP_MESSAGES[loadingMsgIdx]}</h3>
          </div>
        )}

        {status === AppStatus.ERROR && error && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md">
             <div className="bg-ios-canvas rounded-[40px] shadow-2xl p-10 max-w-md w-full border border-black/5 dark:border-white/5 animate-ios-entry overflow-hidden">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 bg-ios-red/10 text-ios-red rounded-xl flex items-center justify-center text-xl font-black">!</div>
                    <button 
                      onClick={() => { setStatus(AppStatus.IDLE); setError(null); setShowTrace(false); }}
                      className="text-ios-secondary hover:text-ios-label transition-colors"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black tracking-tight text-ios-label">{error.title}</h2>
                    <p className="text-ios-secondary font-medium leading-relaxed">{error.detail}</p>
                  </div>

                  {error.trace && (
                    <div className="space-y-2">
                      <button 
                        onClick={() => setShowTrace(!showTrace)}
                        className="text-[10px] font-black uppercase tracking-[0.2em] text-ios-secondary flex items-center gap-2"
                      >
                        Technical Trace 
                        <svg className={`transform transition-transform ${showTrace ? 'rotate-180' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m6 9 6 6 6-6"/></svg>
                      </button>
                      {showTrace && (
                        <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl text-left overflow-x-auto">
                          <code className="text-[10px] font-mono text-ios-secondary break-all">{error.trace}</code>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 pt-2">
                    {lastRequest && (
                      <button 
                        onClick={handleRetry} 
                        className="w-full py-4 bg-ios-red text-white font-black rounded-2xl shadow-xl shadow-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                        Attempt Recovery
                      </button>
                    )}
                    
                    <a 
                      href="mailto:support@claritydesk.com?subject=Technical Node Exception&body=Please describe the context..."
                      className="w-full py-4 bg-black/5 dark:bg-white/10 text-ios-label font-black rounded-2xl active:scale-95 transition-all text-center"
                    >
                      Signal Support
                    </a>

                    <button 
                      onClick={() => { setStatus(AppStatus.IDLE); setError(null); setShowTrace(false); }}
                      className="w-full py-4 text-ios-secondary font-bold text-sm active:scale-95 transition-all"
                    >
                      Dismiss Protocol
                    </button>
                  </div>
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
