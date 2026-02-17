
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TargetLead, OutreachOutputs, GenerationStatus } from './types';
import { generateOutreach, transcribeAudio } from './services/geminiService';
import { Card } from './components/Card';
import { Button } from './components/Button';
import { marked } from 'marked';

const App: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [savedLeads, setSavedLeads] = useState<TargetLead[]>([]);
  const [outputs, setOutputs] = useState<OutreachOutputs | null>(null);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'brief' | 'email' | 'social' | 'pitch'>('brief');
  
  // Audio Input State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Copy Feedback State
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('sahayak_leads_v2');
    if (stored) setSavedLeads(JSON.parse(stored));
    
    // Cleanup
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (!query.trim()) {
      setError("Please provide a target name, organization, or topic to research.");
      return;
    }
    
    setError(null);
    setStatus(GenerationStatus.LOADING);
    try {
      const result = await generateOutreach(query);
      setOutputs(result);
      setStatus(GenerationStatus.SUCCESS);
      setActiveTab('brief');
      
      const newLead: TargetLead = { 
        id: Date.now().toString(), 
        query: query,
        lastGenerated: new Date().toISOString() 
      };
      const updated = [newLead, ...savedLeads.filter(l => l.query !== query)].slice(0, 10);
      setSavedLeads(updated);
      localStorage.setItem('sahayak_leads_v2', JSON.stringify(updated));
    } catch (err: any) {
      setError(err.message || "Intelligence orchestration failed. The agents encountered an error.");
      setStatus(GenerationStatus.ERROR);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    if (!text) return;
    
    const handleSuccess = () => {
      setCopyFeedback(id);
      setTimeout(() => setCopyFeedback(null), 2000);
    };

    try {
      await navigator.clipboard.writeText(text);
      handleSuccess();
    } catch (err) {
      console.warn('Clipboard API failed, trying fallback execCommand', err);
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // Ensure textarea is not visible but part of DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          handleSuccess();
        } else {
          throw new Error('execCommand returned false');
        }
      } catch (fallbackErr) {
        console.error('Fallback copy failed', fallbackErr);
        setError("Failed to copy content. Please manually copy the text.");
      }
    }
  };

  const loadPastQuery = (saved: TargetLead) => {
    setQuery(saved.query);
    setOutputs(null);
    setStatus(GenerationStatus.IDLE);
  };

  // --- Audio Recording Logic ---

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioProcessing(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error("Microphone access failed", err);
      setError("Microphone access denied or not available. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleMic = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleAudioProcessing = async (blob: Blob) => {
    setIsProcessingAudio(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        // Remove data:audio/webm;base64, prefix
        const base64Content = base64data.split(',')[1];
        const mimeType = base64data.split(',')[0].match(/:(.*?);/)?.[1] || 'audio/webm';
        
        const text = await transcribeAudio(base64Content, mimeType);
        if (text) {
          // Append to existing query or set as new
          setQuery(prev => (prev ? prev + ' ' + text.trim() : text.trim()));
        }
        setIsProcessingAudio(false);
      };
    } catch (err) {
      console.error("Transcription failed", err);
      setError("Failed to process audio. Please try again.");
      setIsProcessingAudio(false);
    }
  };

  // --- End Audio Logic ---

  // Helper to render Markdown safely
  const renderedBriefing = useMemo(() => {
    if (!outputs?.researchSummary) return '';
    try {
      return marked.parse(outputs.researchSummary, { breaks: true });
    } catch (e) {
      return outputs.researchSummary;
    }
  }, [outputs?.researchSummary]);

  // Handlers for editing outputs
  const updateEmail = (field: 'subject' | 'body', value: string) => {
    if (!outputs) return;
    setOutputs({
      ...outputs,
      formalEmail: { ...outputs.formalEmail, [field]: value }
    });
  };

  const updateOutput = (field: 'socialMessage' | 'elevatorPitch', value: string) => {
    if (!outputs) return;
    setOutputs({
      ...outputs,
      [field]: value
    });
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      <nav className="glass-effect border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center group cursor-pointer" onClick={() => window.location.reload()}>
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-900/20 transform transition-transform group-hover:scale-105">
              <i className="fa-solid fa-tower-broadcast"></i>
            </div>
            <div className="ml-4">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-none">Sahayak-Connect</h1>
              <div className="flex items-center mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Agentic Intelligence • Active</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="hidden md:flex flex-col items-end border-r border-slate-200 pr-6">
              <span className="text-sm font-bold text-slate-900">Abhishek Gupta</span>
              <span className="text-xs font-semibold text-indigo-600">Founder & CEO</span>
            </div>
            <div className="relative">
              <img 
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Abhishek&backgroundColor=b6e3f4`} 
                className="w-11 h-11 rounded-full bg-indigo-50 border-2 border-white shadow-md" 
                alt="Founder" 
              />
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">
        {/* Central Intelligence Input */}
        <div className="mb-12">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-[2.5rem] blur opacity-20 group-focus-within:opacity-40 transition-opacity"></div>
            <div className="relative bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 p-8">
              <div className="flex items-center mb-6 justify-between">
                 <div className="flex items-center">
                   <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mr-4">
                      <i className="fa-solid fa-brain text-indigo-600"></i>
                   </div>
                   <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Command Center</h2>
                 </div>
                 {isRecording && (
                   <div className="flex items-center text-rose-500 animate-pulse">
                     <i className="fa-solid fa-circle text-[10px] mr-2"></i>
                     <span className="text-xs font-bold uppercase tracking-widest">Recording Audio...</span>
                   </div>
                 )}
                 {isProcessingAudio && (
                   <div className="flex items-center text-indigo-500 animate-pulse">
                     <i className="fa-solid fa-circle-notch fa-spin text-xs mr-2"></i>
                     <span className="text-xs font-bold uppercase tracking-widest">Transcribing...</span>
                   </div>
                 )}
              </div>
              
              <div className="relative flex items-start gap-4">
                <textarea 
                  rows={2}
                  className="w-full text-2xl font-bold text-slate-900 bg-transparent border-none focus:ring-0 placeholder:text-slate-300 resize-none px-0 leading-snug"
                  placeholder="Target Name, Organization, or LinkedIn URL..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                />
                <button 
                  onClick={toggleMic}
                  disabled={isProcessingAudio}
                  className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    isRecording 
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-200 animate-pulse scale-110' 
                      : isProcessingAudio 
                        ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                        : 'bg-slate-100 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                  title={isRecording ? "Stop Recording" : "Start Voice Input"}
                >
                  {isProcessingAudio ? (
                    <i className="fa-solid fa-spinner fa-spin"></i>
                  ) : (
                    <i className={`fa-solid ${isRecording ? 'fa-stop' : 'fa-microphone'}`}></i>
                  )}
                </button>
              </div>

              <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-slate-100 pt-6">
                <div className="flex items-center gap-6">
                   <div className="flex items-center text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      <i className="fa-solid fa-magnifying-glass mr-2 text-indigo-400"></i> Google Grounding
                   </div>
                   <div className="flex items-center text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      <i className="fa-solid fa-microchip mr-2 text-emerald-400"></i> Agentic Logic
                   </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Button 
                    variant="dark" 
                    size="lg" 
                    className="rounded-2xl shadow-xl shadow-slate-900/10 min-w-[220px]"
                    onClick={handleGenerate}
                    isLoading={status === GenerationStatus.LOADING}
                    disabled={isRecording || isProcessingAudio}
                  >
                    Initiate Research
                  </Button>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center animate-in fade-in slide-in-from-top-2">
                  <i className="fa-solid fa-circle-exclamation mr-3 text-rose-500"></i>
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Results / History Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8">
            {status === GenerationStatus.LOADING && (
              <div className="bg-white rounded-[2.5rem] border border-slate-200 p-12 text-center h-[550px] flex flex-col items-center justify-center shadow-sm">
                <div className="relative mb-8">
                   <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                   <div className="absolute inset-0 flex items-center justify-center">
                      <i className="fa-solid fa-globe text-indigo-500 animate-pulse text-xl"></i>
                   </div>
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2 italic">Deploying Research Agents</h3>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest max-w-xs leading-relaxed">
                  Scanning Web, Policy Papers, and IndiaAI Summit Records...
                </p>
              </div>
            )}

            {status === GenerationStatus.SUCCESS && outputs && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden flex flex-col min-h-[600px]">
                  <div className="flex p-3 bg-slate-50/50 border-b border-slate-100 gap-2">
                    {[
                      { id: 'brief', label: 'Briefing', icon: 'fa-brain' },
                      { id: 'email', label: 'Strategic Email', icon: 'fa-envelope-open-text' },
                      { id: 'social', label: 'Hook', icon: 'fa-hashtag' },
                      { id: 'pitch', label: 'Pitch', icon: 'fa-bolt' }
                    ].map(tab => (
                      <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === tab.id ? 'bg-white text-indigo-700 shadow-md border border-slate-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                      >
                        <i className={`fa-solid ${tab.icon}`}></i>
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="p-8 flex-1 overflow-y-auto custom-scrollbar bg-white">
                    {activeTab === 'brief' && (
                      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                         <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                            <h3 className="text-xl font-black text-slate-900 tracking-tight italic">Intelligence Briefing</h3>
                            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                               <span className="text-[9px] font-black uppercase tracking-widest">Live Signals</span>
                            </div>
                         </div>
                         {/* Render Markdown here */}
                         <div 
                           className="prose prose-slate max-w-none text-slate-700 bg-slate-50/30 p-8 rounded-3xl border border-slate-100"
                           dangerouslySetInnerHTML={{ __html: renderedBriefing as string }}
                         />
                         
                         {outputs.sources && outputs.sources.length > 0 && (
                           <div className="mt-8 pt-8 border-t border-slate-100">
                             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Discovery Sources</h4>
                             <div className="flex flex-wrap gap-2">
                                {outputs.sources.map((s, idx) => s.web && (
                                  <a key={idx} href={s.web.uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 hover:shadow-sm transition-all">
                                    <i className="fa-solid fa-link mr-2 text-indigo-400"></i>
                                    {s.web.title?.substring(0, 35) || 'Source'}...
                                  </a>
                                ))}
                             </div>
                           </div>
                         )}
                      </div>
                    )}

                    {activeTab === 'email' && (
                      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 group relative focus-within:ring-2 focus-within:ring-indigo-200 transition-shadow">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Refined Subject</label>
                          <input
                            type="text"
                            value={outputs.formalEmail.subject}
                            onChange={(e) => updateEmail('subject', e.target.value)}
                            className="w-full text-lg font-extrabold text-slate-900 leading-tight bg-transparent border-none focus:ring-0 p-0 pr-10"
                          />
                          <button 
                            onClick={() => copyToClipboard(outputs.formalEmail.subject, 'email-subj')}
                            className="absolute top-6 right-6 text-slate-300 hover:text-indigo-600 transition-colors"
                          >
                             {copyFeedback === 'email-subj' ? (
                               <i className="fa-solid fa-check text-emerald-500"></i>
                             ) : (
                               <i className="fa-solid fa-copy"></i>
                             )}
                          </button>
                        </div>
                        <div className="bg-white p-6 border border-slate-100 rounded-[2rem] shadow-inner min-h-[400px] relative group overflow-hidden focus-within:border-indigo-300 transition-colors">
                          <textarea 
                            value={outputs.formalEmail.body}
                            onChange={(e) => updateEmail('body', e.target.value)}
                            className="w-full h-full min-h-[350px] resize-none text-[15px] text-slate-800 leading-relaxed font-sans font-medium selection:bg-indigo-600 selection:text-white bg-transparent border-none focus:ring-0 p-2"
                            spellCheck={false}
                          />
                          <div className="absolute bottom-4 right-4 md:top-4 md:bottom-auto md:right-4">
                            <Button 
                              variant="dark" 
                              size="sm" 
                              onClick={() => copyToClipboard(outputs.formalEmail.body, 'email-body')}
                              className={`rounded-xl shadow-lg transition-all ${copyFeedback === 'email-body' ? '!bg-emerald-600 !shadow-emerald-200' : ''}`}
                            >
                               {copyFeedback === 'email-body' ? (
                                  <><i className="fa-solid fa-check mr-2"></i> Copied!</>
                               ) : (
                                  <><i className="fa-solid fa-pen-to-square mr-2"></i> Edit & Copy</>
                               )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'social' && (
                      <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in-95 duration-500">
                         <div className="bg-emerald-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group max-w-lg w-full">
                           <div className="absolute top-0 right-0 p-8 opacity-10">
                              <i className="fa-brands fa-whatsapp text-7xl"></i>
                           </div>
                           <div className="relative z-10">
                             <div className="flex items-center space-x-3 mb-6">
                               <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                                 <i className="fa-solid fa-comment text-xs"></i>
                               </div>
                               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Low-Friction Hook</span>
                             </div>
                             
                             <textarea 
                                value={outputs.socialMessage}
                                onChange={(e) => updateOutput('socialMessage', e.target.value)}
                                className="w-full bg-transparent border-none focus:ring-0 text-xl font-bold leading-relaxed mb-6 selection:bg-emerald-500 text-white placeholder-emerald-700/50 resize-none overflow-hidden"
                                rows={6}
                                spellCheck={false}
                             />

                             <div className="flex justify-end">
                               <Button 
                                  variant="outline" 
                                  className={`text-white border-emerald-500 hover:bg-emerald-800 rounded-xl ${copyFeedback === 'social' ? 'bg-emerald-800 border-emerald-400' : ''}`} 
                                  onClick={() => copyToClipboard(outputs.socialMessage, 'social')}
                                >
                                 {copyFeedback === 'social' ? (
                                    <><i className="fa-solid fa-check mr-2"></i> Copied!</>
                                 ) : (
                                    <><i className="fa-solid fa-copy mr-2"></i> Copy Hook</>
                                 )}
                               </Button>
                             </div>
                           </div>
                         </div>
                      </div>
                    )}

                    {activeTab === 'pitch' && (
                      <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in-95 duration-500 text-center max-w-xl mx-auto">
                        <div className="w-16 h-1.5 bg-indigo-600 rounded-full mb-10"></div>
                        <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-6">Summit Intro Script</h3>
                        
                        <div className="w-full relative group">
                          <textarea
                             value={outputs.elevatorPitch}
                             onChange={(e) => updateOutput('elevatorPitch', e.target.value)}
                             className="w-full bg-transparent border-none focus:ring-2 focus:ring-indigo-100 rounded-2xl text-3xl font-black text-slate-900 leading-tight mb-8 italic text-center resize-none p-4"
                             rows={6}
                          />
                          <div className="hidden group-focus-within:block absolute top-0 right-0">
                             <span className="text-[9px] font-bold text-slate-300 uppercase">Editing Mode</span>
                          </div>
                        </div>

                        <Button 
                          variant="dark" 
                          size="lg" 
                          className={`rounded-2xl px-10 ${copyFeedback === 'pitch' ? 'bg-emerald-600' : ''}`}
                          onClick={() => copyToClipboard(outputs.elevatorPitch, 'pitch')}
                        >
                           {copyFeedback === 'pitch' ? (
                              <><i className="fa-solid fa-check mr-3"></i> Copied!</>
                           ) : (
                              <><i className="fa-solid fa-microphone-lines mr-3"></i> Copy Script</>
                           )}
                        </Button>
                        <p className="mt-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Optimized for high-pressure delivery</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {status === GenerationStatus.IDLE && (
               <div className="h-[550px] border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-12 bg-slate-50/30">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 mb-6">
                    <i className="fa-solid fa-satellite-dish text-slate-300 text-2xl"></i>
                  </div>
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Intelligence Feed Inactive</h3>
                  <p className="text-xs text-slate-400 font-bold max-w-xs mt-3 leading-relaxed">Enter a target or topic in the Command Center to initiate agentic research and outreach orchestration.</p>
               </div>
            )}
          </div>

          {/* Past Signals Sidebar */}
          <div className="lg:col-span-4 space-y-8">
            <Card title="Signal History" subtitle="Recent orchestrations" icon="fa-rss">
               <div className="divide-y divide-slate-100 -mx-6 -mb-6 max-h-[450px] overflow-y-auto custom-scrollbar">
                {savedLeads.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Past Signals</p>
                  </div>
                ) : (
                  savedLeads.map((s) => (
                    <button 
                      key={s.id} 
                      onClick={() => loadPastQuery(s)}
                      className="w-full text-left px-6 py-4 hover:bg-slate-50 transition-colors flex items-center group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center mr-4 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">
                        <i className="fa-solid fa-bolt text-[10px]"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors pr-2 italic">"{s.query}"</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">{new Date(s.lastGenerated!).toLocaleDateString()}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </Card>

            <div className="p-8 bg-slate-900 rounded-[2rem] text-white relative overflow-hidden group shadow-xl">
               <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Protocol Node</h4>
                  </div>
                  <div className="space-y-5">
                     <div>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Principal Investigator</p>
                        <p className="text-sm font-bold text-slate-200">Abhishek Gupta</p>
                     </div>
                     <div>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Operational Context</p>
                        <p className="text-xs font-bold leading-relaxed text-slate-300">
                          IndiaAI Mission • Feb 2026<br/>
                          Society of Agents v2.6
                        </p>
                     </div>
                  </div>
               </div>
               <div className="absolute -bottom-6 -right-6 text-indigo-500/5 group-hover:scale-125 transition-transform duration-1000">
                  <i className="fa-solid fa-dna text-9xl transform -rotate-12"></i>
               </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-slate-400">
          <div className="flex items-center space-x-3 mb-6 md:mb-0">
             <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white text-[10px] font-bold">S</div>
             <p className="text-xs font-bold text-slate-900 uppercase tracking-[0.2em] italic">Orchestration Protocol • 2026</p>
          </div>
          <div className="flex flex-wrap justify-center gap-10 text-[9px] font-black uppercase tracking-[0.3em]">
             <span className="flex items-center text-indigo-600"><i className="fa-solid fa-circle-check mr-2"></i> MeitY Verified</span>
             <span className="flex items-center"><i className="fa-solid fa-server mr-2"></i> Sovereign AI</span>
             <span className="flex items-center"><i className="fa-solid fa-user-astronaut mr-2"></i> NASA Heritage</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
