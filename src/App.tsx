/**
 * Developed by Ahmed Ali Rana
 */


import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Camera,
  X,
  Download,
  RefreshCw,
  Phone,
  Hash,
  School,
  FileText,
  Trash2,
  ChevronRight,
  Clock,
  Clipboard
} from 'lucide-react';

// Recommended way: Set VITE_GEMINI_API_KEY in your .env file
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

interface FileItem {
  id: string;
  data: string;
  name: string;
  numbers: string[];
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

export default function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [schoolName, setSchoolName] = useState('Punjab Computer College');
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handlePaste = useCallback((e: React.ClipboardEvent | ClipboardEvent) => {
    const items = (e as any).clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const newFile: FileItem = {
              id: Math.random().toString(36).substr(2, 9),
              data: reader.result as string,
              name: `Pasted_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
              numbers: [],
              status: 'pending'
            };
            setFiles(prev => [...prev, newFile]);
            setSelectedFileId(newFile.id);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageTypes = item.types.filter(type => type.startsWith('image/'));
        for (const type of imageTypes) {
          const blob = await item.getType(type);
          const reader = new FileReader();
          reader.onload = () => {
            const newFile: FileItem = {
              id: Math.random().toString(36).substr(2, 9),
              data: reader.result as string,
              name: `Clip_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
              numbers: [],
              status: 'pending'
            };
            setFiles(prev => [...prev, newFile]);
            setSelectedFileId(newFile.id);
          };
          reader.readAsDataURL(blob);
        }
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      alert("Please use Ctrl+V to paste or check clipboard permissions.");
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => {
      return new Promise<FileItem>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            id: Math.random().toString(36).substr(2, 9),
            data: reader.result as string,
            name: file.name.split('.')[0],
            numbers: [],
            status: 'pending'
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(newFiles).then(results => {
      setFiles(prev => [...prev, ...results]);
      if (!selectedFileId && results.length > 0) {
        setSelectedFileId(results[0].id);
      }
    });
  }, [selectedFileId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.webp'] },
    multiple: true
  } as any);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Ensure video is ready
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // High quality JPEG
        const newFile: FileItem = {
          id: Math.random().toString(36).substr(2, 9),
          data: dataUrl,
          name: `Capture_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
          numbers: [],
          status: 'pending'
        };
        setFiles(prev => [...prev, newFile]);
        setSelectedFileId(newFile.id);
        stopCamera();
      }
    }
  };

  const processFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || file.status === 'processing') return;

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'processing', error: undefined } : f));

    // List of models to try in order of preference
    const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash"];
    let lastError: any = null;

    for (const modelName of models) {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const base64Data = file.data.split(',')[1];

        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              parts: [
                { text: "Extract all numbers from this handwritten image. Return them as a JSON array of strings. Each string should be a single number found in the image. If there are multiple columns, extract them row by row. Only return the JSON array, nothing else." },
                { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        });

        const result = JSON.parse(response.text || "[]");
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, numbers: result, status: 'done' } : f));
        return; // Success, exit function
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed, trying fallback...`, err.message);
        
        // If it's a 503 (high demand) or 429 (rate limit), we try the next model
        const isRetryable = err.message.includes("503") || 
                           err.message.toLowerCase().includes("demand") || 
                           err.message.toLowerCase().includes("unavailable") ||
                           err.message.includes("429") ||
                           err.message.toLowerCase().includes("limit");
        
        if (!isRetryable) break; // If it's a different error (like auth), don't bother trying other models
      }
    }

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error', error: lastError?.message || "All models are currently busy" } : f));
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    const pendingFiles = files.filter(f => f.status !== 'done');
    for (const file of pendingFiles) {
      await processFile(file.id);
    }
    setIsProcessingAll(false);
  };

  const downloadExcel = (fileId?: string) => {
    const filesToDownload = fileId ? files.filter(f => f.id === fileId) : files.filter(f => f.status === 'done');
    if (filesToDownload.length === 0) return;

    const wb = XLSX.utils.book_new();
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}`;
    const baseName = schoolName.trim() || 'Extracted_Numbers';

    filesToDownload.forEach(file => {
      const ws = XLSX.utils.json_to_sheet(file.numbers.map(n => ({ "Number": n })));
      XLSX.utils.book_append_sheet(wb, ws, file.name.substring(0, 30));
    });

    const finalFileName = `${baseName}_${timestamp}.xlsx`;
    XLSX.writeFile(wb, finalFileName);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (selectedFileId === id) {
      setSelectedFileId(files.find(f => f.id !== id)?.id || null);
    }
  };

  const updateFileName = (id: string, newName: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const selectedFile = files.find(f => f.id === selectedFileId);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-md border border-neutral-100 overflow-hidden">
              <img 
                src="/pcc_logo.png" 
                alt="PCC Logo" 
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://ui-avatars.com/api/?name=PCC&background=009639&color=fff";
                }}
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-green-700">Punjab Computer College</h1>
              <p className="text-neutral-500 text-sm">Handwritten Number to Excel Converter</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-64">
              <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Enter School Name..."
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={startCamera}
                className="flex-1 sm:flex-none px-4 py-2 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Camera className="w-4 h-4 text-green-600" />
                <span className="hidden sm:inline">Camera</span>
              </button>
              <button
                onClick={pasteFromClipboard}
                className="flex-1 sm:flex-none px-4 py-2 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Clipboard className="w-4 h-4 text-green-600" />
                <span className="hidden sm:inline">Paste</span>
              </button>
              <div {...getRootProps()} className="flex-1 sm:flex-none">
                <input {...getInputProps()} />
                <button className="w-full px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all flex items-center justify-center gap-2 text-sm font-medium shadow-sm">
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar: File List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
                <h2 className="font-bold text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-600" />
                  Files ({files.length})
                </h2>
                {files.length > 0 && (
                  <button
                    onClick={processAll}
                    disabled={isProcessingAll || files.every(f => f.status === 'done')}
                    className="text-xs font-bold text-green-600 hover:text-green-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isProcessingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Process All
                  </button>
                )}
              </div>

              <div className="max-h-[600px] overflow-y-auto">
                {files.length === 0 ? (
                  <div className="p-12 text-center text-neutral-400">
                    <Upload className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-xs">No files uploaded yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-50">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => setSelectedFileId(file.id)}
                        className={`p-3 cursor-pointer transition-all flex items-center gap-3 hover:bg-neutral-50 ${selectedFileId === file.id ? 'bg-green-50/50 border-l-4 border-green-600' : 'border-l-4 border-transparent'}`}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 flex-shrink-0">
                          <img src={file.data} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-grow min-w-0">
                          <input
                            type="text"
                            value={file.name}
                            onChange={(e) => updateFileName(file.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-transparent border-none p-0 text-sm font-medium focus:ring-0 truncate"
                          />
                          <div className="flex items-center gap-2 mt-0.5">
                            {file.status === 'processing' ? (
                              <span className="text-[10px] text-green-600 flex items-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Processing
                              </span>
                            ) : file.status === 'done' ? (
                              <span className="text-[10px] text-green-700 flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> {file.numbers.length} numbers
                              </span>
                            ) : file.status === 'error' ? (
                              <span className="text-[10px] text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5" /> Error
                              </span>
                            ) : (
                              <span className="text-[10px] text-neutral-400">Pending</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                          className="p-1.5 text-neutral-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {files.some(f => f.status === 'done') && (
                <div className="p-4 bg-neutral-50 border-t border-neutral-100">
                  <button
                    onClick={() => downloadExcel()}
                    className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download All (Excel)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Content: Selected File View */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {isCameraOpen ? (
                <motion.div
                  key="camera"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative rounded-3xl overflow-hidden bg-black aspect-video shadow-2xl"
                >
                  <video 
                    ref={(el) => {
                      (videoRef as any).current = el;
                      if (el && streamRef.current) {
                        el.srcObject = streamRef.current;
                      }
                    }} 
                    autoPlay 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover" 
                  />
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center gap-4">
                    <button onClick={stopCamera} className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all">
                      <X className="w-6 h-6" />
                    </button>
                    <button onClick={captureImage} className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all">
                      <div className="w-12 h-12 border-2 border-neutral-900 rounded-full" />
                    </button>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </motion.div>
              ) : selectedFile ? (
                <motion.div
                  key={selectedFile.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-sm"
                >
                  <div className="p-6 flex flex-col md:flex-row gap-8">
                    <div className="w-full md:w-1/2 space-y-4">
                      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-100">
                        <img src={selectedFile.data} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                      </div>

                      {selectedFile.status !== 'done' && selectedFile.status !== 'processing' && (
                        <button
                          onClick={() => processFile(selectedFile.id)}
                          className="w-full py-4 bg-green-600 text-white rounded-2xl font-semibold shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                        >
                          <RefreshCw className="w-5 h-5" />
                          Extract Numbers
                        </button>
                      )}
                    </div>

                    <div className="w-full md:w-1/2 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Hash className="w-5 h-5 text-green-600" />
                          {selectedFile.name}
                        </h3>
                      </div>

                      <div className="flex-grow bg-neutral-50 rounded-2xl border border-neutral-100 p-4 min-h-[300px] max-h-[400px] overflow-y-auto">
                        {selectedFile.status === 'processing' ? (
                          <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-3">
                            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                            <p className="text-sm font-medium animate-pulse">Reading handwriting...</p>
                          </div>
                        ) : selectedFile.status === 'done' ? (
                          <div className="grid grid-cols-1 gap-2">
                            {selectedFile.numbers.map((num, i) => (
                              <div key={i} className="bg-white p-3 rounded-xl border border-neutral-100 flex items-center gap-3 shadow-sm">
                                <span className="text-xs text-neutral-300 font-mono w-4">{i + 1}</span>
                                <span className="font-mono text-neutral-700">{num}</span>
                              </div>
                            ))}
                          </div>
                        ) : selectedFile.status === 'error' ? (
                          <div className="h-full flex flex-col items-center justify-center text-red-500 p-6 text-center space-y-2">
                            <AlertCircle className="w-8 h-8" />
                            <p className="font-medium">Failed</p>
                            <p className="text-xs">{selectedFile.error}</p>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-neutral-300 p-6 text-center space-y-2">
                            <Clock className="w-8 h-8 opacity-20" />
                            <p className="text-sm">Ready to extract</p>
                          </div>
                        )}
                      </div>

                      {selectedFile.status === 'done' && (
                        <div className="mt-6">
                          <button
                            onClick={() => downloadExcel(selectedFile.id)}
                            className="w-full py-4 bg-green-600 text-white rounded-2xl font-semibold shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                          >
                            <Download className="w-5 h-5" />
                            Download This File
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-[500px] flex flex-col items-center justify-center text-neutral-300 border-2 border-dashed border-neutral-200 rounded-3xl bg-white">
                  <FileSpreadsheet className="w-16 h-16 mb-4 opacity-10" />
                  <p className="font-medium">Select a file or upload new ones to begin</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <footer className="mt-12 text-center text-neutral-400 text-xs flex flex-col items-center justify-center gap-2">
          <p className="font-medium text-neutral-500">Developed with ❤️ by <span className="text-green-600 font-extrabold uppercase tracking-wider">Ahmed Ali Rana</span></p>
          <div className="text-[10px] opacity-50">© {new Date().getFullYear()} All Rights Reserved</div>
        </footer>
      </div>
    </div>
  );
}
