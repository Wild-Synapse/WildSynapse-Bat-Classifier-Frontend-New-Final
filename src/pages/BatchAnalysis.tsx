import React, { useState, useRef, useEffect } from 'react';
import { Package, RefreshCw, Zap, CheckCircle, Download, FileText, Table, AlertCircle, X, Loader2, Activity } from 'lucide-react';
import { AnalysisResult } from '../types';

interface BatchAnalysisProps {
  darkMode: boolean;
  API_BASE: string;
  defaultThreshold: number;
  defaultMaxFreq: number;
  fetchResults: () => void;
  fetchStatistics: () => void;
}

export const BatchAnalysis: React.FC<BatchAnalysisProps> = ({
  darkMode,
  API_BASE,
  defaultThreshold,
  defaultMaxFreq,
  fetchResults,
  fetchStatistics
}) => {
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<AnalysisResult[]>([]);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchTheme, setBatchTheme] = useState('dark_viridis');
  const [batchThreshold, setBatchThreshold] = useState(defaultThreshold);
  const [batchMaxFreq, setBatchMaxFreq] = useState(defaultMaxFreq);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const cardClass = darkMode ? 'bg-slate-900/50 backdrop-blur-xl border-slate-800/50' : 'bg-white/80 backdrop-blur-xl border-slate-200';
  const mutedClass = darkMode ? 'text-slate-400' : 'text-slate-600';

  // Scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleBatchAnalyze = async () => {
    if (batchFiles.length === 0) return;
    
    setBatchAnalyzing(true);
    setBatchResults([]);
    setLogs([]);
    setBatchProgress({ completed: 0, total: batchFiles.length, failed: 0 });
    setCurrentBatchId(null);
    
    try {
      const formData = new FormData();
      batchFiles.forEach(file => formData.append('files', file));
      formData.append('input_type', 'audio');
      formData.append('theme', batchTheme);
      formData.append('threshold', batchThreshold.toString());
      formData.append('max_freq', batchMaxFreq.toString());
      
      addLog("Initiating batch upload & analysis stream...");

      const response = await fetch(`${API_BASE}/api/analyze/batch/stream`, { 
        method: 'POST', 
        body: formData 
      });
      
      if (!response.ok) throw new Error(`Batch analysis handshake failed: ${response.statusText}`);
      if (!response.body) throw new Error("Stream reader not available");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last partial line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const data = JSON.parse(line);
            
            if (data.type === 'batch_start') {
              setCurrentBatchId(data.batch_id);
              setBatchProgress(prev => ({ ...prev, total: data.total_files }));
              addLog(`Batch started: ${data.batch_id} (${data.total_files} files)`);
            } 
            else if (data.type === 'result') {
              // FIX: Access 'data.data' not 'data.result'
              const resultData = data.data;
              if (resultData) {
                setBatchResults(prev => [resultData, ...prev]);
                setBatchProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
                addLog(`Analyzed: ${resultData.original_filename}`);
              }
            } 
            else if (data.type === 'error') {
              setBatchProgress(prev => ({ ...prev, failed: prev.failed + 1, completed: prev.completed + 1 }));
              addLog(`Failed: ${data.filename} - ${data.error}`);
            } 
            else if (data.type === 'batch_complete') {
              addLog(`Batch complete. Success: ${data.completed}, Failed: ${data.failed}`);
              fetchStatistics();
              fetchResults(); // Refresh global history
            }
          } catch (e) {
            console.error('JSON Parse error:', e, line);
          }
        }
      }
    } catch (error) {
      console.error('Batch error:', error);
      addLog(`Critical Error: ${error}`);
      alert('Batch analysis interrupted. Check console/logs.');
    } finally {
      setBatchAnalyzing(false);
    }
  };

  const downloadBatchExcel = () => {
    if (!currentBatchId) return;
    window.location.href = `${API_BASE}/api/download/batch/${currentBatchId}/excel`;
  };

  const downloadBatchPDF = () => {
    if (!currentBatchId) return;
    window.location.href = `${API_BASE}/api/download/batch/${currentBatchId}/pdf`;
  };

  const formatConfidence = (val: number) => {
    const percentage = val > 1 ? val : val * 100;
    return `${percentage.toFixed(1)}%`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* Header */}
      <div>
        <h2 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent mb-2">
          High-Throughput Processing
        </h2>
        <p className={`${mutedClass}`}>Analyze large datasets with real-time streaming results.</p>
      </div>

      {/* Configuration & Upload Card */}
      <div className={`${cardClass} border rounded-3xl p-8 shadow-2xl`}>
        
        {/* Settings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Detection Sensitivity</label>
            <input 
              type="number" 
              value={batchThreshold} 
              onChange={e => setBatchThreshold(parseFloat(e.target.value))} 
              step="0.01"
              min="0.01"
              max="1.0"
              className={`w-full px-4 py-3 rounded-xl ${darkMode ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'} border focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none font-mono text-sm`}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Max Frequency (kHz)</label>
            <input 
              type="number" 
              value={batchMaxFreq} 
              onChange={e => setBatchMaxFreq(parseInt(e.target.value))}
              className={`w-full px-4 py-3 rounded-xl ${darkMode ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'} border focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none font-mono text-sm`}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Visualization Theme</label>
            <select 
              value={batchTheme} 
              onChange={e => setBatchTheme(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl ${darkMode ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'} border focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none text-sm`}
            >
              <option value="dark_viridis">Dark Viridis (Default)</option>
              <option value="bright_plasma">Bright Plasma</option>
              <option value="classic_grayscale">Classic Grayscale</option>
              <option value="inferno">Inferno (High Contrast)</option>
              <option value="magma">Magma</option>
              <option value="jet">Jet (Scientific)</option>
            </select>
          </div>
        </div>

        {/* Dropzone */}
        <div className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
          batchFiles.length > 0 ? 'border-cyan-500 bg-cyan-500/5' : `${darkMode ? 'border-slate-700 hover:border-slate-500' : 'border-slate-300 hover:border-slate-400'}`
        }`}>
           {batchAnalyzing && (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
                <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
                <h3 className="text-xl font-bold text-white">Analyzing Batch...</h3>
                <p className="text-slate-300 mt-2">Please wait while we process your files</p>
            </div>
           )}

          <input 
            type="file" 
            multiple 
            onChange={(e) => setBatchFiles(Array.from(e.target.files || []))} 
            className="hidden" 
            id="batchInput" 
            accept=".wav,.mp3"
          />
          <label htmlFor="batchInput" className="cursor-pointer block relative z-0">
            <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 hover:scale-110 transition-transform shadow-lg shadow-cyan-500/30">
              <Package className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-2">Drag & Drop Audio Files</h3>
            <p className="text-slate-500 mb-6">Support for WAV, MP3. Bulk upload enabled.</p>
            <span className="inline-block px-8 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-white font-bold transition-all shadow-lg">
              Select Files
            </span>
          </label>

          {batchFiles.length > 0 && (
            <div className="mt-8 animate-in slide-in-from-bottom-2">
              <div className="flex items-center justify-center gap-2 mb-6">
                <CheckCircle className="w-5 h-5 text-cyan-400" />
                <span className="text-cyan-400 font-bold text-lg">{batchFiles.length} files selected</span>
                <button 
                  onClick={() => setBatchFiles([])}
                  className="ml-2 p-1 hover:bg-red-500/20 text-red-400 rounded-full transition-colors" 
                  title="Clear Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <button 
                onClick={handleBatchAnalyze} 
                disabled={batchAnalyzing} 
                className={`px-12 py-4 rounded-xl font-bold text-lg shadow-xl shadow-cyan-500/20 transition-all ${
                  batchAnalyzing 
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white transform hover:-translate-y-1'
                }`}
              >
                {batchAnalyzing ? 'Processing...' : 'Start Batch Analysis'}
              </button>
            </div>
          )}
        </div>

        {/* Live Progress Section */}
        {batchAnalyzing && (
            <div className="mt-8 space-y-2">
                <div className="flex justify-between text-sm font-bold">
                    <span className="text-cyan-400">Progress</span>
                    <span className="text-slate-400">{Math.round((batchProgress.completed / Math.max(batchProgress.total, 1)) * 100)}%</span>
                </div>
                <div className="h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                    <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 ease-out relative"
                        style={{ width: `${(batchProgress.completed / Math.max(batchProgress.total, 1)) * 100}%` }}
                    >
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                    </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1 font-mono">
                    <span>Processed: {batchProgress.completed}/{batchProgress.total}</span>
                    <span>Failed: {batchProgress.failed}</span>
                </div>
            </div>
        )}

        {/* Logs Console */}
        {(batchAnalyzing || logs.length > 0) && (
            <div className="mt-8 bg-black rounded-xl border border-slate-800 p-4 h-48 overflow-y-auto font-mono text-xs text-slate-400 custom-scrollbar shadow-inner">
                {logs.map((log, i) => (
                    <div key={i} className="mb-1 border-b border-slate-900/50 pb-1 last:border-0">{log}</div>
                ))}
                <div ref={logsEndRef} />
            </div>
        )}
      </div>

      {/* Batch Results & Export Actions */}
      {batchResults.length > 0 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 p-6 rounded-2xl border border-cyan-500/20">
                <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <CheckCircle className="w-6 h-6 text-green-400" /> Analysis Complete
                    </h3>
                    <p className="text-slate-400 text-sm mt-1">
                        Batch ID: <span className="font-mono text-cyan-400">{currentBatchId}</span> • {batchResults.length} results generated
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={downloadBatchExcel} className="flex items-center gap-2 px-5 py-3 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 rounded-xl font-bold transition-all">
                        <Table className="w-5 h-5" /> Export Excel
                    </button>
                    <button onClick={downloadBatchPDF} className="flex items-center gap-2 px-5 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-xl font-bold transition-all">
                        <FileText className="w-5 h-5" /> Export PDF
                    </button>
                </div>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {batchResults.map((result, idx) => (
                    <div 
                        key={result.file_id || idx}
                        className={`${cardClass} border rounded-2xl overflow-hidden hover:border-cyan-500/50 transition-all group`}
                    >
                        {/* Preview Image - With Safe Access */}
                        <div className="aspect-[3/2] bg-black relative border-b border-slate-800">
                             {result.spectrogram_url ? (
                                <img 
                                    src={`${API_BASE}${result.spectrogram_url}`} 
                                    alt="Spectrogram" 
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-600">
                                    <Activity className="w-8 h-8" />
                                </div>
                             )}
                             <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                                 <h4 className="font-bold text-white truncate text-sm">{result.original_filename || "Unknown File"}</h4>
                             </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="p-4 space-y-3">
                             <div className="flex justify-between items-center">
                                 <span className="text-xs font-bold text-slate-500 uppercase">Top Match</span>
                                 <span className="text-xs font-bold text-cyan-400">
                                    {formatConfidence(result.species_detected?.[0]?.confidence || 0)}
                                 </span>
                             </div>
                             <div className="text-lg font-bold text-white truncate">
                                 {result.species_detected?.[0]?.species || "Unknown"}
                             </div>
                             
                             <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                                 <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                                     <span className="block text-[10px] text-slate-500 uppercase">Peak Freq</span>
                                     <span className="font-mono text-slate-200">{result.call_parameters?.peak_frequency || 0} kHz</span>
                                 </div>
                                 <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                                     <span className="block text-[10px] text-slate-500 uppercase">Duration</span>
                                     <span className="font-mono text-slate-200">{(result.duration || 0).toFixed(2)}s</span>
                                 </div>
                             </div>

                             <div className="flex gap-2 pt-2">
                                <a href={`${API_BASE}/api/download/pdf/${result.file_id}`} target="_blank" rel="noreferrer" className="flex-1 py-2 text-center text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
                                    Report
                                </a>
                                <a href={`${API_BASE}/api/download/excel/${result.file_id}`} target="_blank" rel="noreferrer" className="flex-1 py-2 text-center text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
                                    Excel
                                </a>
                             </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      )}
    </div>
  );
};