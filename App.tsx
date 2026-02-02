
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Play, Square, Map as MapIcon, Database, LayoutDashboard, Cpu, HelpCircle, FileText, AlertTriangle, Save, Trash2, FolderOpen, Plus, Wifi, WifiOff, Globe, Gauge, Search, ShieldAlert, Edit3, X, CheckCircle2, MapPinned, Sparkles, ToggleRight, ToggleLeft, CloudUpload, Undo2, Redo2, Ruler, Eye, EyeOff, Mic, MicOff, MessageSquare, MapPin } from 'lucide-react';
import TelemetryOverlay from './components/TelemetryOverlay';
import FieldCanvas from './components/FieldCanvas';
import { FieldBoundary, SavedFieldBoundary, ABLine, SavedABLine, MachineTelemetry, Point, PathOptimizationResult } from './types';
import { optimizePrecisionPath, findNearbyAgroServices, connectLiveAssistant } from './services/geminiService';

const STORAGE_KEY = 'agrovision_saved_lines';
const SAVED_FIELDS_KEY = 'agrovision_saved_fields';
const BOUNDARY_STORAGE_KEY = 'agrovision_active_boundary';
const SESSION_CONFIG_KEY = 'agrovision_active_session_config';
const TAB_STORAGE_KEY = 'agrovision_active_tab';
const SPEED_STORAGE_KEY = 'agrovision_sim_speed';
const AUTO_APPLY_AI_KEY = 'agrovision_auto_apply_ai';
const AUTO_APPLY_SPACING_KEY = 'agrovision_auto_apply_spacing_ai';

interface HistoryState {
  boundary: FieldBoundary;
  abLine: ABLine | null;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dash' | 'map' | 'data'>(() => (localStorage.getItem(TAB_STORAGE_KEY) as any) || 'map');
  const [isWorking, setIsWorking] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isEditingField, setIsEditingField] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [autoApplyAI, setAutoApplyAI] = useState(() => localStorage.getItem(AUTO_APPLY_AI_KEY) !== 'false');
  const [autoApplySpacingAI, setAutoApplySpacingAI] = useState(() => localStorage.getItem(AUTO_APPLY_SPACING_KEY) !== 'false');
  
  // Save Field State
  const [isSavingField, setIsSavingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFarmName, setNewFarmName] = useState('');
  
  // Search Maps State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ text: string, sources: any[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Live API State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);

  const [saveName, setSaveName] = useState('');
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');
  const [lineSearchQuery, setLineSearchQuery] = useState('');
  const [savedLines, setSavedLines] = useState<SavedABLine[]>([]);
  const [savedFields, setSavedFields] = useState<SavedFieldBoundary[]>([]);
  const [visibleFieldIds, setVisibleFieldIds] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fieldModalError, setFieldModalError] = useState<string | null>(null);
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  
  const telemetryRef = useRef<MachineTelemetry>({
    speed: 0, targetSpeed: 8.5, rpm: 800, fuelLevel: 85, engineTemp: 45, gpsAccuracy: 2.4, oilPressure: 3.2, batteryVoltage: 12.6, workRate: 0, areaCovered: 0,
  });
  const [telemetry, setTelemetry] = useState<MachineTelemetry>(telemetryRef.current);

  const [boundary, setBoundary] = useState<FieldBoundary>(() => {
    const saved = localStorage.getItem(BOUNDARY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {
      id: 'field-001', name: 'Talhão 04', farmName: 'Fazenda Boa Esperança', areaHectares: 124.5,
      points: [{ x: -200, y: -150 }, { x: 250, y: -120 }, { x: 280, y: 180 }, { x: -180, y: 160 }]
    };
  });

  const [editFarmName, setEditFarmName] = useState(boundary.farmName || '');
  const [editFieldName, setEditFieldName] = useState(boundary.name);

  const [abLine, setAbLine] = useState<ABLine | null>(() => {
    const saved = localStorage.getItem(SESSION_CONFIG_KEY);
    try { if (saved) return JSON.parse(saved).abLine; } catch(e) {}
    return { id: 'ab-primary', p1: { x: -200, y: -150 }, p2: { x: 250, y: -120 }, heading: 15, spacing: 12 };
  });

  const [machineWidth] = useState(12);
  const [tractorPos, setTractorPos] = useState<Point>({ x: 0, y: 0 });
  const [optimization, setOptimization] = useState<PathOptimizationResult | null>(null);
  const [hasAppliedOptimization, setHasAppliedOptimization] = useState(false);

  const pushToHistory = useCallback(() => {
    setPast(prev => [...prev.slice(-49), { boundary: { ...boundary }, abLine: abLine ? { ...abLine } : null }]);
    setFuture([]);
  }, [boundary, abLine]);

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setFuture(prev => [{ boundary: { ...boundary }, abLine: abLine ? { ...abLine } : null }, ...prev]);
    setBoundary(previous.boundary);
    setAbLine(previous.abLine);
    setPast(prev => prev.slice(0, -1));
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setPast(prev => [...prev, { boundary: { ...boundary }, abLine: abLine ? { ...abLine } : null }]);
    setBoundary(next.boundary);
    setAbLine(next.abLine);
    setFuture(prev => prev.slice(1));
  };

  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    const lines = localStorage.getItem(STORAGE_KEY);
    const fields = localStorage.getItem(SAVED_FIELDS_KEY);
    if (lines) setSavedLines(JSON.parse(lines));
    if (fields) setSavedFields(JSON.parse(fields));
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    localStorage.setItem(AUTO_APPLY_AI_KEY, autoApplyAI.toString());
    localStorage.setItem(AUTO_APPLY_SPACING_KEY, autoApplySpacingAI.toString());
  }, [activeTab, autoApplyAI, autoApplySpacingAI]);

  useEffect(() => {
    const interval = setInterval(() => {
      const current = { ...telemetryRef.current };
      const targetSpeed = isWorking ? current.targetSpeed : 0;
      current.speed += (targetSpeed - current.speed) * 0.08 + (Math.random() - 0.5) * 0.05;
      if (current.speed < 0.1 && targetSpeed === 0) current.speed = 0;
      if (isWorking || current.speed > 0.1) {
        current.rpm += ( (isWorking ? 1850 : 800) - current.rpm) * 0.1 + (Math.random() - 0.5) * 15;
        current.fuelLevel = Math.max(0, current.fuelLevel - 0.0001 * current.speed);
        current.workRate = (current.speed * machineWidth) / 10;
        current.areaCovered += (current.workRate / 36000);
        const rad = (abLine?.heading || 0) * Math.PI / 180;
        setTractorPos(p => ({ x: p.x + Math.sin(rad) * current.speed * 0.01, y: p.y - Math.cos(rad) * current.speed * 0.01 }));
      }
      telemetryRef.current = current;
      setTelemetry({ ...current });
    }, 100);
    return () => clearInterval(interval);
  }, [isWorking, abLine, machineWidth]);

  const toggleFieldVisibility = (id: string) => {
    const next = new Set(visibleFieldIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setVisibleFieldIds(next);
  };

  const handleSaveFieldAction = () => {
    if (!newFieldName.trim() || !newFarmName.trim()) {
      setValidationError("Nome e Fazenda são obrigatórios.");
      return;
    }
    const newField: SavedFieldBoundary = {
      ...boundary,
      id: `field-${Date.now()}`,
      name: newFieldName,
      farmName: newFarmName,
      createdAt: Date.now()
    };
    const updated = [newField, ...savedFields];
    setSavedFields(updated);
    localStorage.setItem(SAVED_FIELDS_KEY, JSON.stringify(updated));
    setIsSavingField(false);
    setNewFieldName('');
    setNewFarmName('');
  };

  const handleSearchMaps = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await findNearbyAgroServices(-23.5505, -46.6333, searchQuery); // Mocked center coordinate
      setSearchResults(res);
    } catch (e) {
      console.error(e);
    }
    setIsSearching(false);
  };

  const toggleLiveAssistant = async () => {
    if (isLiveActive) {
      liveSessionRef.current?.close();
      setIsLiveActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const callbacks = {
        onopen: () => setIsLiveActive(true),
        onmessage: async (msg: any) => {
          if (msg.serverContent?.outputTranscription) {
            setLiveTranscript(prev => [...prev, `AI: ${msg.serverContent.outputTranscription.text}`]);
          }
          const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioData && audioContextRef.current) {
            // Decoding logic would go here
          }
        },
        onclose: () => setIsLiveActive(false),
        onerror: (e: any) => console.error(e),
      };

      liveSessionRef.current = await connectLiveAssistant(callbacks);
    } catch (e) {
      console.error("Failed to start Live API", e);
    }
  };

  const handleOptimize = async () => {
    if (!isOnline) return;
    setLoadingAI(true);
    setValidationError(null);
    try {
      const res = await optimizePrecisionPath(boundary, machineWidth);
      setOptimization(res);
      if (autoApplyAI && abLine) {
        pushToHistory();
        setAbLine({ ...abLine, heading: res.suggestedHeading, spacing: (autoApplySpacingAI && res.suggestedSpacing) ? res.suggestedSpacing : abLine.spacing });
        setHasAppliedOptimization(true);
      }
    } catch (e) { setValidationError("Falha na análise de IA."); }
    setLoadingAI(false);
  };

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      <nav className="w-20 bg-black border-r border-zinc-800 flex flex-col items-center py-6 gap-8 z-20">
        <div className="p-3 bg-green-600 rounded-xl shadow-lg shadow-green-900/20 mb-4 cursor-pointer hover:scale-105 transition-transform"><Cpu size={28} className="text-white" /></div>
        <div className="flex flex-col gap-6 flex-1">
          <button onClick={() => setActiveTab('dash')} className={`p-3 rounded-xl transition-all ${activeTab === 'dash' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}><LayoutDashboard size={24} /></button>
          <button onClick={() => setActiveTab('map')} className={`p-3 rounded-xl transition-all ${activeTab === 'map' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}><MapIcon size={24} /></button>
          <button onClick={() => setActiveTab('data')} className={`p-3 rounded-xl transition-all ${activeTab === 'data' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}><Database size={24} /></button>
        </div>
        <button onClick={toggleLiveAssistant} className={`p-3 rounded-xl transition-all ${isLiveActive ? 'bg-blue-600 text-white animate-pulse' : 'text-zinc-500 hover:text-zinc-300'}`}>
          {isLiveActive ? <Mic size={24} /> : <MicOff size={24} />}
        </button>
      </nav>

      <main className="flex-1 flex flex-col p-6 overflow-hidden relative">
        <header className="flex justify-between items-start mb-6 z-10">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black tracking-tighter text-white">{boundary.farmName ? `${boundary.farmName} - ` : ''}{boundary.name}</h1>
              <button onClick={() => setIsEditingField(true)} className="p-2 bg-zinc-800 hover:bg-blue-600 text-zinc-400 hover:text-white rounded-lg transition-all"><Edit3 size={16} /></button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${isWorking ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{isWorking ? 'Em Operação' : 'Standby'}</span>
              <span className="text-zinc-500 text-[10px] font-mono">ID: {boundary.id}</span>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setIsSavingField(true)} className="flex items-center gap-2 px-6 py-4 bg-zinc-900 border border-zinc-800 rounded-xl font-black text-sm hover:bg-zinc-800 transition-all">
              <Save size={18} /> SALVAR TALHÃO
            </button>
            <button onClick={() => setIsWorking(!isWorking)} className={`flex items-center gap-3 px-10 py-4 rounded-xl font-black transition-all shadow-2xl active:scale-95 border-b-4 ${isWorking ? 'bg-red-600 hover:bg-red-700 border-red-800' : 'bg-green-600 hover:bg-green-700 border-green-800'} text-white`}>
              {isWorking ? <Square size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
              <span className="tracking-tighter text-lg uppercase">{isWorking ? 'Parar' : 'Iniciar'}</span>
            </button>
          </div>
        </header>

        {isSavingField && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-8 shadow-2xl">
              <h2 className="text-xl font-black uppercase mb-6">Salvar Novo Talhão</h2>
              <div className="space-y-4">
                <input type="text" placeholder="Nome do Talhão" value={newFieldName} onChange={e => setNewFieldName(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-lg p-3 outline-none focus:border-blue-600" />
                <input type="text" placeholder="Nome da Fazenda" value={newFarmName} onChange={e => setNewFarmName(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-lg p-3 outline-none focus:border-blue-600" />
                {validationError && <p className="text-xs text-red-500 font-bold">{validationError}</p>}
                <div className="flex gap-4 pt-4">
                  <button onClick={() => setIsSavingField(false)} className="flex-1 py-3 text-zinc-500 font-bold uppercase">Cancelar</button>
                  <button onClick={handleSaveFieldAction} className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-black uppercase">Confirmar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex gap-6 min-h-0">
          <div className="flex-[3] flex flex-col gap-4">
            <div className="flex-1 relative">
              <FieldCanvas 
                boundaries={[boundary, ...savedFields]} 
                activeBoundaryId={boundary.id} 
                visibleBoundaryIds={visibleFieldIds} 
                abLine={abLine} 
                tractorPos={tractorPos} 
                machineWidth={machineWidth} 
                onHeadingChange={(h) => setAbLine(p => p ? { ...p, heading: h } : null)} 
              />
              {isLiveActive && (
                <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md p-4 rounded-xl border border-zinc-800 flex items-start gap-4">
                  <div className="p-2 bg-blue-600 rounded-lg"><MessageSquare size={20} /></div>
                  <div className="flex-1 max-h-24 overflow-y-auto text-xs font-medium text-zinc-300">
                    {liveTranscript.slice(-3).map((t, i) => <p key={i}>{t}</p>)}
                    {liveTranscript.length === 0 && <p className="italic text-zinc-500">AgroVision Assistant ouvindo...</p>}
                  </div>
                </div>
              )}
            </div>
            <TelemetryOverlay data={telemetry} />
          </div>

          <div className="flex-[1] flex flex-col gap-4 min-w-[340px] overflow-y-auto pr-2 custom-scrollbar">
            {/* Maps Grounding Section */}
            <section className="bg-zinc-900/40 rounded-2xl p-6 border border-zinc-800/50 backdrop-blur-md">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2 mb-4"><MapPin size={14} className="text-red-500" /> Serviços Próximos</h3>
              <div className="flex gap-2 mb-4">
                <input type="text" placeholder="Ex: Silos, Peças..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-red-600" />
                <button onClick={handleSearchMaps} disabled={isSearching} className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700">
                  {isSearching ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <Search size={16} />}
                </button>
              </div>
              {searchResults && (
                <div className="text-[10px] text-zinc-400 space-y-2">
                  <p className="font-medium whitespace-pre-wrap">{searchResults.text}</p>
                  {searchResults.sources.map((s: any, i: number) => (
                    s.maps && <a key={i} href={s.maps.uri} target="_blank" className="text-blue-500 hover:underline block truncate">🔗 {s.maps.title}</a>
                  ))}
                </div>
              )}
            </section>

            <div className="flex gap-2 bg-zinc-900/60 p-2 rounded-xl border border-zinc-800/50">
              <button onClick={undo} disabled={past.length === 0} className="flex-1 py-2 bg-black/40 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 transition-all rounded-lg flex items-center justify-center gap-2"><Undo2 size={16} /><span className="text-[10px] font-black uppercase">Undo</span></button>
              <button onClick={redo} disabled={future.length === 0} className="flex-1 py-2 bg-black/40 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-20 transition-all rounded-lg flex items-center justify-center gap-2"><span className="text-[10px] font-black uppercase">Redo</span><Redo2 size={16} /></button>
            </div>

            <section className="bg-zinc-900/40 rounded-2xl p-6 border border-zinc-800/50 backdrop-blur-md flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2"><MapPinned size={14} className="text-orange-500" /> Talhões</h3>
              </div>
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                {savedFields.map(f => (
                  <div key={f.id} className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${boundary.id === f.id ? 'bg-orange-500/10 border-orange-500/50' : 'bg-black/30 border-zinc-800/50'}`}>
                    <div className="flex-1 cursor-pointer" onClick={() => { pushToHistory(); setBoundary(f); }}>
                      <span className="text-[10px] font-black uppercase tracking-wider block truncate">{f.name}</span>
                      <span className="text-[9px] font-bold text-zinc-600 uppercase">{f.areaHectares} HA</span>
                    </div>
                    <button onClick={() => toggleFieldVisibility(f.id)} className="p-1.5 text-zinc-600 hover:text-white transition-colors">{visibleFieldIds.has(f.id) ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-zinc-900/40 rounded-2xl p-6 border border-zinc-800/50 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2"><Cpu size={14} className="text-green-500" /> IA Precision</h3>
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => setAutoApplyAI(!autoApplyAI)}>
                    <span className="text-[8px] font-black uppercase text-zinc-600">Auto Rumo</span>
                    {autoApplyAI ? <ToggleRight className="text-blue-500" size={18} /> : <ToggleLeft className="text-zinc-600" size={18} />}
                  </div>
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => setAutoApplySpacingAI(!autoApplySpacingAI)}>
                    <span className="text-[8px] font-black uppercase text-zinc-600">Auto Espaç.</span>
                    {autoApplySpacingAI ? <ToggleRight className="text-blue-500" size={18} /> : <ToggleLeft className="text-zinc-600" size={18} />}
                  </div>
                </div>
              </div>
              {!optimization ? (
                <button disabled={loadingAI} onClick={handleOptimize} className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-xl font-black border border-zinc-700 transition-all flex items-center justify-center gap-2">
                  {loadingAI ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <Globe size={16} />}
                  <span>ANALISAR TALHÃO</span>
                </button>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-500">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-black/40 p-2 rounded-xl border border-zinc-800/50"><p className="text-[9px] text-zinc-500 font-black">EFICIÊNCIA</p><p className="text-xl font-bold text-green-500">{(optimization.efficiency * 100).toFixed(0)}%</p></div>
                    <div className="bg-black/40 p-2 rounded-xl border border-zinc-800/50"><p className="text-[9px] text-zinc-500 font-black">SUGERIDO</p><p className="text-xs font-bold text-blue-500">{optimization.suggestedHeading.toFixed(1)}° | {optimization.suggestedSpacing}m</p></div>
                  </div>
                  <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-xl"><p className="text-[10px] text-zinc-400 font-medium italic">"{optimization.recommendations}"</p></div>
                  <button onClick={() => setOptimization(null)} className="w-full text-[10px] font-black text-zinc-600 uppercase hover:text-zinc-400 transition-colors">Nova Análise</button>
                </div>
              )}
            </section>

            <section className="bg-zinc-900/40 rounded-2xl p-6 border border-zinc-800/50 backdrop-blur-md flex flex-col gap-6">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2"><Gauge size={14} className="text-blue-500" /> Parâmetros</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase mb-2"><span>Rumo AB</span><span className="text-blue-400">{abLine?.heading.toFixed(1)}°</span></div>
                  <input type="range" min="0" max="360" step="0.5" value={abLine?.heading || 0} onMouseDown={pushToHistory} onChange={(e) => setAbLine(p => p ? { ...p, heading: Number(e.target.value) } : null)} className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase mb-2"><span>Espaçamento</span><span className="text-blue-400">{abLine?.spacing} m</span></div>
                  <input type="range" min="1" max="50" step="0.5" value={abLine?.spacing || 12} onMouseDown={pushToHistory} onChange={(e) => setAbLine(p => p ? { ...p, spacing: Number(e.target.value) } : null)} className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="absolute bottom-0 left-20 right-0 h-10 bg-black/90 border-t border-zinc-800/50 flex items-center px-6 justify-between text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] z-20">
        <div className="flex gap-8">
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]"></div> ISOBUS: ONLINE</span>
          <span className={`flex items-center gap-2 transition-all duration-700 ${isAutoSaving ? 'text-blue-400 opacity-100' : 'text-zinc-800 opacity-50'}`}><CloudUpload size={12} className={isAutoSaving ? 'animate-bounce' : ''} /> {isAutoSaving ? 'SINCRONIZANDO...' : 'SESSÃO SALVA'}</span>
        </div>
        <div className="flex items-center gap-4"><span className="text-zinc-400">AGROVISION OS v2.4.0-PRO</span></div>
      </footer>
    </div>
  );
};

export default App;
