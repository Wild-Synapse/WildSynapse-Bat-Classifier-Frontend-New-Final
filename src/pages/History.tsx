import React, { useState, useEffect, useRef } from 'react';
import { Database, Filter, RefreshCw, Clock, Activity, Trash2, ChevronDown, Play, Pause, FileText, Target, LayoutGrid, List, Bot, Table, Package, Loader2, AlertCircle, X, Waves, Zap, ChevronUp } from 'lucide-react';
import { AnalysisResult } from '../types';

interface HistoryProps {
  darkMode: boolean;
  results: AnalysisResult[];
  loading: boolean;
  API_BASE: string;
  fetchResults: () => void;
  fetchStatistics: () => void;
}

interface BatchMetadata {
  batch_id: string;
  total_files: number;
  completed: number;
  failed: number;
  file_ids: string[];
  created_at: number;
  theme: string;
  input_type: string;
}

export const History: React.FC<HistoryProps> = ({ darkMode, results, loading, API_BASE, fetchResults, fetchStatistics }) => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'individual' | 'batches'>('individual');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  
  // Expansion State
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [expandedBatchResults, setExpandedBatchResults] = useState<Set<string>>(new Set()); 
  
  const [filterSpecies, setFilterSpecies] = useState<string>('all');
  
  // Batch Data State
  const [batches, setBatches] = useState<BatchMetadata[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<Record<string, AnalysisResult[]>>({});
  
  // Audio State
  const [playingFileId, setPlayingFileId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Interaction State
  const [selectedSpeciesPreview, setSelectedSpeciesPreview] = useState<Record<string, string>>({}); 
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [isExplaining, setIsExplaining] = useState<string | null>(null);

  // Styling Helpers
  const cardClass = darkMode ? 'bg-slate-900/60 backdrop-blur-md border-slate-800' : 'bg-white/90 backdrop-blur-md border-slate-200';
  const uniqueSpecies = [...new Set(results.flatMap(r => r.species_detected?.map(s => s.species)).filter(Boolean))];

  // --- FETCHING ---
  const fetchBatches = async () => {
    setBatchesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/batches?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
      }
    } catch (error) {
      console.error('Failed to fetch batches:', error);
    } finally {
      setBatchesLoading(false);
    }
  };

  const fetchBatchResults = async (batchId: string) => {
    if (batchResults[batchId]) return;
    try {
      const res = await fetch(`${API_BASE}/api/batches/${batchId}`);
      if (res.ok) {
        const data = await res.json();
        setBatchResults(prev => ({ ...prev, [batchId]: data.results || [] }));
      }
    } catch (error) {
      console.error('Failed to fetch batch results:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'batches') fetchBatches();
  }, [activeTab]);

  // --- AUDIO LOGIC ---
  useEffect(() => {
    audioRef.current = new Audio();
    const handleTimeUpdate = () => {
      if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
        setAudioProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
      }
    };
    const handleEnded = () => { setPlayingFileId(null); setAudioProgress(0); };
    
    audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
    audioRef.current.addEventListener('ended', handleEnded);

    return () => {
      audioRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
      audioRef.current?.removeEventListener('ended', handleEnded);
    };
  }, []);

  const toggleAudio = (url: string, fileId: string) => {
    if (!audioRef.current) return;
    if (playingFileId === fileId) {
      audioRef.current.pause();
      setPlayingFileId(null);
    } else {
      audioRef.current.src = `${API_BASE}${url}`;
      audioRef.current.play().catch(console.error);
      setPlayingFileId(fileId);
    }
  };

  // --- HELPERS ---
  const formatConfidence = (val: number) => `${((val > 1 ? val : val * 100) || 0).toFixed(1)}%`;
  
  const getSpeciesImageUrl = (speciesName: string) => {
    if (!speciesName) return `${API_BASE}/api/static/bat_species/placeholder.jpg`;
    const formatted = speciesName.replace(/\s+/g, '_').replace(/\//g, '_'); 
    return `${API_BASE}/api/static/bat_species/${formatted}`;
  };

  // --- ACTIONS ---
  const handleSpeciesClick = (speciesName: string, fileId: string) => {
    setSelectedSpeciesPreview(prev => ({ ...prev, [fileId]: speciesName }));
  };

  const fetchAIExplanation = async (result: AnalysisResult) => {
    if (aiExplanations[result.file_id]) return;
    setIsExplaining(result.file_id);
    try {
      const res = await fetch(`${API_BASE}/api/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: result.original_filename,
          species_detected: result.species_detected,
          call_parameters: result.call_parameters
        })
      });
      const data = await res.json();
      setAiExplanations(prev => ({ ...prev, [result.file_id]: data.explanation }));
    } catch (error) {
      console.error("AI Error", error);
    } finally {
      setIsExplaining(null);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (confirm('Delete this analysis result?')) {
      await fetch(`${API_BASE}/api/results/${fileId}`, { method: 'DELETE' });
      fetchResults();
      fetchStatistics();
    }
  };

  const downloadFile = (url: string) => { window.location.href = url; };

  // --- EXPANDED MODAL COMPONENT ---
  const ExpandedResultModal = ({ result, onClose }: { result: AnalysisResult; onClose: () => void }) => {
    const topSpecies = result.species_detected?.[0];
    const activeSpeciesName = selectedSpeciesPreview[result.file_id] || topSpecies?.species || 'Unknown';
    const activeImageUrl = getSpeciesImageUrl(activeSpeciesName);
    const explanation = aiExplanations[result.file_id];
    const isLoadingAI = isExplaining === result.file_id;

    return (
      <div 
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 md:pl-24"
        onClick={onClose}
      >
        <div 
          className={`${cardClass} w-full max-w-6xl max-h-[90vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-slate-700/50`} 
          onClick={e => e.stopPropagation()}
        >
          {/* Sticky Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2.5 bg-cyan-950/50 rounded-xl border border-cyan-900/50 text-cyan-400">
                <Waves className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-white truncate">{result.original_filename}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-0.5">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(result.timestamp * 1000).toLocaleDateString()}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                  <span>ID: {result.file_id.slice(0, 8)}...</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all hover:rotate-90">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-slate-950/40">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
              
              {/* LEFT COLUMN: Visuals (Spectrogram & Species) */}
              <div className="space-y-6 flex flex-col">
                
                {/* 1. Spectrogram Player */}
                <div className="relative rounded-2xl overflow-hidden border border-slate-700/50 bg-black shadow-lg group">
                  <div className="aspect-[3/2] relative bg-black/50">
                    <img 
                      src={`${API_BASE}${result.spectrogram_url}`} 
                      className="w-full h-full object-contain" 
                      alt="Full Spectrogram" 
                      onError={(e) => (e.target as HTMLImageElement).src = 'about:blank'}
                    />
                  </div>
                  {/* Audio Controls Overlay */}
                  {result.audio_url && (
                    <div className="bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 p-4 flex items-center gap-4">
                      <button 
                        onClick={(e) => { e.stopPropagation(); result.audio_url && toggleAudio(result.audio_url, result.file_id); }} 
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${playingFileId === result.file_id ? 'bg-cyan-500 text-white shadow-cyan-500/40 scale-105' : 'bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600'}`}
                      >
                        {playingFileId === result.file_id ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                      </button>
                      <div className="flex-1">
                        <div className="h-2 bg-slate-800 rounded-full relative overflow-hidden cursor-pointer">
                          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-100 ease-linear" style={{ width: `${playingFileId === result.file_id ? audioProgress : 0}%` }} />
                        </div>
                        <div className="flex justify-between mt-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                          <span>Original Audio</span>
                          <span>{(result.duration || 0).toFixed(1)}s</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Species Reference Image */}
                <div className="flex-1 bg-black rounded-2xl border border-slate-700/50 overflow-hidden relative shadow-lg min-h-[240px] group/img">
                  <img 
                    src={activeImageUrl} 
                    alt={activeSpeciesName} 
                    className="w-full h-full object-cover opacity-70 group-hover/img:opacity-100 transition-opacity duration-700" 
                    onError={(e) => { (e.target as HTMLImageElement).src = `${API_BASE}/api/static/bat_species/placeholder.jpg`; }} 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-90" />
                  <div className="absolute bottom-0 left-0 p-5">
                    <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-widest mb-1 block flex items-center gap-1">
                      <Target className="w-3 h-3" /> Species Reference
                    </span>
                    <h4 className="text-3xl font-bold text-white italic tracking-tight">{activeSpeciesName}</h4>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Data Analysis */}
              <div className="flex flex-col h-full space-y-6">
                
                {/* 1. AI Analysis Card */}
                <div className={`rounded-2xl border p-5 transition-all relative overflow-hidden flex-shrink-0 ${isLoadingAI || explanation ? 'bg-indigo-950/20 border-indigo-500/30' : 'bg-slate-900/40 border-slate-800'}`}>
                  {explanation || isLoadingAI ? (
                    <div className="flex gap-4">
                      <div className="p-2.5 bg-indigo-500/10 rounded-xl h-fit border border-indigo-500/20">
                        <Bot className={`w-6 h-6 ${isLoadingAI ? 'text-indigo-400 animate-pulse' : 'text-indigo-400'}`} />
                      </div>
                      <div className="space-y-2 flex-1">
                        <h5 className="text-sm font-bold text-indigo-300 uppercase tracking-wide flex items-center gap-2">
                          AI Ecological Insight
                          {isLoadingAI && <Loader2 className="w-3 h-3 animate-spin" />}
                        </h5>
                        <div className="prose prose-invert prose-sm text-slate-300 leading-relaxed max-h-[150px] overflow-y-auto custom-scrollbar pr-2">
                          {isLoadingAI ? (
                            <span className="text-indigo-400/70 italic">Analyzing acoustic signature and environmental context...</span>
                          ) : (
                            explanation?.split('\n').filter(Boolean).map((l, i) => <p key={i} className="mb-2 last:mb-0">{l}</p>)
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Bot className="w-6 h-6 text-slate-500" />
                      </div>
                      <p className="text-slate-400 text-sm mb-4 max-w-xs mx-auto">Generate an AI-powered analysis of the bat's behavior based on pulse parameters.</p>
                      <button onClick={() => fetchAIExplanation(result)} className="px-5 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-xl border border-indigo-500/30 text-xs font-bold transition-all flex items-center gap-2 mx-auto">
                        <Zap className="w-4 h-4" /> Generate Analysis
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Acoustic Parameters Grid */}
                <div className="flex-shrink-0">
                  <h5 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider flex items-center gap-2">
                    <Activity className="w-3 h-3" /> Acoustic Parameters
                  </h5>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { l: 'Peak Frequency', v: `${result.call_parameters?.peak_frequency ?? 0} kHz` },
                      { l: 'Start Frequency', v: `${result.call_parameters?.start_frequency ?? 0} kHz` },
                      { l: 'End Frequency', v: `${result.call_parameters?.end_frequency ?? 0} kHz` },
                      { l: 'Bandwidth', v: `${result.call_parameters?.bandwidth ?? 0} kHz` },
                      { l: 'Intensity', v: result.call_parameters?.intensity ? `${result.call_parameters.intensity.toFixed(1)} dB` : 'N/A' },
                      { l: 'Pulse Duration', v: `${result.call_parameters?.pulse_duration ?? 0} ms` },
                      { l: 'Call Shape', v: result.call_parameters?.shape ?? 'Unknown' },
                      { l: 'Confidence', v: formatConfidence(topSpecies?.confidence || 0) }
                    ].map((p, i) => (
                      <div key={i} className="p-3 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors group/param">
                        <span className="text-[10px] uppercase text-slate-500 font-bold block mb-0.5 group-hover/param:text-slate-400 transition-colors">{p.l}</span>
                        <span className="font-mono font-bold text-cyan-400 text-sm">{p.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Candidates List (Scrollable) */}
                <div className="flex-1 min-h-[150px] bg-slate-900/30 rounded-2xl border border-slate-800/50 p-4 overflow-hidden flex flex-col">
                  <h5 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider flex items-center gap-2">
                    <List className="w-3 h-3" /> Species Matches
                  </h5>
                  <div className="overflow-y-auto pr-2 custom-scrollbar space-y-1 flex-1">
                    {result.species_detected?.map((s, i) => (
                      <div 
                        key={i} 
                        onClick={(e) => { e.stopPropagation(); handleSpeciesClick(s.species, result.file_id); }} 
                        className={`flex justify-between items-center p-2.5 rounded-lg cursor-pointer border transition-all ${
                          (selectedSpeciesPreview[result.file_id] || topSpecies?.species) === s.species 
                            ? 'bg-cyan-950/30 border-cyan-500/30 shadow-sm' 
                            : 'bg-transparent border-transparent hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${i===0 ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-500'}`}>{i+1}</span>
                          <span className={`text-sm font-medium ${i===0 ? 'text-white' : 'text-slate-400'}`}>{s.species}</span>
                        </div>
                        <span className="font-mono text-xs text-cyan-500">{formatConfidence(s.confidence)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Footer Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2 shrink-0">
                  <button onClick={() => downloadFile(`${API_BASE}/api/download/pdf/${result.file_id}`)} className="flex items-center justify-center gap-2 p-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all border border-slate-700 hover:border-slate-600 hover:shadow-lg">
                    <FileText className="w-4 h-4" /> Download PDF
                  </button>
                  <button onClick={() => handleDelete(result.file_id)} className="flex items-center justify-center gap-2 p-3 bg-red-950/20 hover:bg-red-900/30 text-red-400 rounded-xl font-bold text-sm transition-all border border-red-900/20 hover:border-red-900/40">
                    <Trash2 className="w-4 h-4" /> Delete Record
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const MiniVisualizer = ({ isActive }: { isActive: boolean }) => (
    <div className="flex items-end gap-[3px] h-6 w-12">
      {[...Array(4)].map((_, i) => (
        <div key={i} className={`w-1.5 bg-cyan-400 rounded-t-sm transition-all duration-75 shadow-[0_0_8px_rgba(34,211,238,0.5)] ${isActive ? 'animate-music-bar' : 'h-1 opacity-30'}`} style={{ animationDelay: `${i*0.05}s`, height: isActive ? undefined : '3px' }} />
      ))}
    </div>
  );

  // --- RENDERERS ---
  const renderIndividualResults = () => (
    <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5" : "space-y-4"}>
      {results.filter(r => filterSpecies === 'all' || r.species_detected?.some(s => s.species === filterSpecies)).map(result => {
        const topSpecies = result.species_detected?.[0];
        
        return (
          <React.Fragment key={result.file_id}>
            {viewMode === 'grid' ? (
              <div 
                className={`${cardClass} border rounded-2xl overflow-hidden hover:border-cyan-500/50 transition-all group cursor-pointer hover:shadow-xl hover:shadow-cyan-900/10`}
                onClick={() => setExpandedResults(prev => new Set(prev).add(result.file_id))}
              >
                <div className="aspect-[3/2] bg-black relative border-b border-slate-700/50">
                  <img src={`${API_BASE}${result.spectrogram_url}`} alt={result.original_filename} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300" onError={(e) => (e.target as HTMLImageElement).src = 'about:blank'} />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-90" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <h4 className="text-sm font-bold text-white truncate drop-shadow-md">{result.original_filename}</h4>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-cyan-400 font-bold truncate">{topSpecies?.species || 'Unknown'}</span>
                      <span className="text-[10px] text-slate-400 bg-slate-900/50 px-1.5 py-0.5 rounded backdrop-blur-sm border border-slate-700">{formatConfidence(topSpecies?.confidence || 0)}</span>
                    </div>
                  </div>
                  {playingFileId === result.file_id && <div className="absolute top-3 right-3 p-1.5 bg-black/40 backdrop-blur-md rounded-lg border border-white/10"><MiniVisualizer isActive={true} /></div>}
                </div>
                <div className="p-3 bg-slate-900/20">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(result.timestamp * 1000).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {result.call_parameters?.peak_frequency} kHz</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`${cardClass} border rounded-2xl p-4 flex items-center gap-6 cursor-pointer hover:border-cyan-500/30 transition-all`} onClick={() => setExpandedResults(prev => new Set(prev).add(result.file_id))}>
                <div className="w-32 h-20 bg-black rounded-lg overflow-hidden border border-slate-700/50 shrink-0 relative">
                  <img src={`${API_BASE}${result.spectrogram_url}`} className="w-full h-full object-cover opacity-80" alt="Spec" />
                  {playingFileId === result.file_id && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><MiniVisualizer isActive={true} /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-white truncate text-base">{result.original_filename}</h4>
                  <div className="flex items-center gap-4 mt-1 text-sm">
                    <span className="text-cyan-400 font-bold">{topSpecies?.species}</span>
                    <span className="text-slate-500 text-xs bg-slate-800 px-2 py-0.5 rounded-full">{formatConfidence(topSpecies?.confidence || 0)}</span>
                    <span className="text-slate-500 text-xs hidden sm:inline-block">{new Date(result.timestamp * 1000).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); downloadFile(`${API_BASE}/api/download/pdf/${result.file_id}`); }} className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"><FileText className="w-4 h-4" /></button>
                </div>
              </div>
            )}
            {expandedResults.has(result.file_id) && <ExpandedResultModal result={result} onClose={() => setExpandedResults(prev => { const n = new Set(prev); n.delete(result.file_id); return n; })} />}
          </React.Fragment>
        );
      })}
    </div>
  );

  const renderBatchHistory = () => (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={fetchBatches} className="flex items-center gap-2 text-xs font-bold text-cyan-500 hover:text-cyan-400 transition-colors">
          <RefreshCw className={`w-4 h-4 ${batchesLoading ? 'animate-spin' : ''}`} /> Refresh Batches
        </button>
      </div>

      {batchesLoading && batches.length === 0 ? (
        <div className="flex flex-col items-center py-32"><Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" /><p className="text-slate-500 font-mono">Loading batch history...</p></div>
      ) : batches.length === 0 ? (
        <div className="text-center py-32 border-2 border-dashed border-slate-800 rounded-3xl">
          <Package className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 text-lg font-bold">No batches found</p>
          <p className="text-slate-600 text-sm mt-2">Upload multiple files in the "Batch Analysis" tab to see them here.</p>
        </div>
      ) : (
        batches.map(batch => {
          const isBatchExpanded = expandedBatches.has(batch.batch_id);
          
          return (
            <div key={batch.batch_id} className={`${cardClass} border rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:border-cyan-500/30`}>
              <div 
                className="p-6 cursor-pointer hover:bg-slate-800/20 transition-colors" 
                onClick={() => {
                  const newSet = new Set(expandedBatches);
                  if (isBatchExpanded) newSet.delete(batch.batch_id);
                  else { newSet.add(batch.batch_id); fetchBatchResults(batch.batch_id); }
                  setExpandedBatches(newSet);
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-cyan-900/30 rounded-xl border border-cyan-500/30 text-cyan-400"><Package className="w-6 h-6" /></div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Batch Analysis</h3>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">{batch.batch_id}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50"><span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Total Files</span><span className="text-2xl font-bold text-white">{batch.total_files}</span></div>
                      <div className="bg-green-900/10 rounded-xl p-3 border border-green-500/20"><span className="text-[10px] uppercase text-green-500/70 font-bold block mb-1">Completed</span><span className="text-2xl font-bold text-green-400">{batch.completed}</span></div>
                      <div className="bg-red-900/10 rounded-xl p-3 border border-red-500/20"><span className="text-[10px] uppercase text-red-500/70 font-bold block mb-1">Failed</span><span className="text-2xl font-bold text-red-400">{batch.failed}</span></div>
                      <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50"><span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Date</span><span className="text-sm font-bold text-white leading-tight block mt-1">{batch.created_at ? new Date(batch.created_at * 1000).toLocaleDateString() : 'Unknown'}</span></div>
                    </div>
                  </div>
                  <ChevronDown className={`w-6 h-6 text-slate-600 transition-transform duration-300 ml-4 ${isBatchExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {isBatchExpanded && (
                <div className="p-6 bg-slate-950/30 border-t border-slate-800/50 animate-in slide-in-from-top-4 fade-in">
                  
                  {/* === BATCH ACTIONS HEADER === */}
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/50">
                    <div className="flex items-center gap-3">
                      <List className="w-5 h-5 text-slate-400" />
                      <h4 className="text-lg font-bold text-slate-200">Batch Results ({batchResults[batch.batch_id]?.length || 0})</h4>
                    </div>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setExpandedBatches(prev => { const n = new Set(prev); n.delete(batch.batch_id); return n; });
                      }} 
                      className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center gap-2 text-xs font-bold border border-slate-700/50"
                    >
                      <X className="w-4 h-4" /> Close Batch
                    </button>
                  </div>

                  <div className="mb-8 flex gap-4">
                    <button onClick={(e) => { e.stopPropagation(); downloadFile(`${API_BASE}/api/download/batch/${batch.batch_id}/excel`); }} className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-green-600/10 hover:bg-green-600/20 border border-green-500/20 rounded-xl transition-all text-green-400 font-bold">
                      <Table className="w-5 h-5" /> Export Excel
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); downloadFile(`${API_BASE}/api/download/batch/${batch.batch_id}/pdf`); }} className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 rounded-xl transition-all text-red-400 font-bold">
                      <FileText className="w-5 h-5" /> Export Report
                    </button>
                  </div>

                  {batchResults[batch.batch_id] ? (
                    batchResults[batch.batch_id].length === 0 ? (
                      <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" /> No successful results recorded for this batch.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {batchResults[batch.batch_id].map(result => (
                          <React.Fragment key={result.file_id}>
                            <div 
                              className={`${cardClass} border rounded-2xl p-3 hover:border-cyan-500/50 transition-all group cursor-pointer hover:shadow-lg hover:-translate-y-1 duration-300`}
                              onClick={() => setExpandedBatchResults(prev => new Set(prev).add(result.file_id))}
                            >
                              <div className="aspect-video rounded-xl overflow-hidden mb-3 bg-black border border-slate-700/50 relative">
                                <img src={`${API_BASE}${result.spectrogram_url}`} alt={result.original_filename} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" onError={(e) => (e.target as HTMLImageElement).src = 'about:blank'} />
                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black to-transparent"><p className="text-[10px] text-white truncate font-bold">{result.original_filename}</p></div>
                              </div>
                              <div className="flex justify-between items-center">
                                <p className="text-xs text-cyan-400 font-bold truncate pr-2">{result.species_detected?.[0]?.species || 'Unknown'}</p>
                                <p className="text-[10px] text-slate-500 font-mono bg-slate-800 px-1.5 rounded">{formatConfidence(result.species_detected?.[0]?.confidence || 0)}</p>
                              </div>
                            </div>
                            {expandedBatchResults.has(result.file_id) && <ExpandedResultModal result={result} onClose={() => setExpandedBatchResults(prev => { const n = new Set(prev); n.delete(result.file_id); return n; })} />}
                          </React.Fragment>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-cyan-500 animate-spin" /></div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className={`flex flex-col md:flex-row justify-between items-center gap-4 p-4 rounded-3xl border backdrop-blur-sm ${darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white/80 border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${darkMode ? 'bg-slate-800 text-cyan-400' : 'bg-slate-100 text-cyan-600'}`}><Database className="w-5 h-5" /></div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent leading-none">Data Archive</h2>
            <p className="text-slate-500 text-xs mt-1 font-medium">{activeTab === 'individual' ? `${results.length} individual analyses` : `${batches.length} batch operations`}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex p-1 rounded-xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <button onClick={() => setActiveTab('individual')} className={`px-4 py-2 rounded-lg transition-all text-sm font-bold ${activeTab === 'individual' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-400'}`}>Individual</button>
            <button onClick={() => setActiveTab('batches')} className={`px-4 py-2 rounded-lg transition-all text-sm font-bold ${activeTab === 'batches' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-400'}`}>Batches</button>
          </div>
          {activeTab === 'individual' && (
            <>
              <div className={`flex p-1 rounded-xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-400'}`}><List className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-400'}`}><LayoutGrid className="w-4 h-4" /></button>
              </div>
              <div className={`relative flex items-center group`}>
                <div className={`absolute inset-y-0 left-3 flex items-center pointer-events-none ${darkMode ? 'text-cyan-500' : 'text-cyan-600'}`}><Filter className="w-4 h-4" /></div>
                <select value={filterSpecies} onChange={e => setFilterSpecies(e.target.value)} className={`pl-10 pr-8 py-2.5 rounded-xl border appearance-none text-sm font-medium transition-all cursor-pointer outline-none ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-cyan-500' : 'bg-white border-slate-200 text-slate-700 focus:border-cyan-500'}`}>
                  <option value="all">All Species</option>
                  {uniqueSpecies.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500"><ChevronDown className="w-3 h-3" /></div>
              </div>
            </>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex flex-col items-center py-32"><Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" /><p className="text-slate-500 font-mono">Loading archive...</p></div>
      ) : activeTab === 'individual' ? renderIndividualResults() : renderBatchHistory()}
    </div>
  );
};