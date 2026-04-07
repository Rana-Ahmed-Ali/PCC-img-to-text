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
  Clipboard,
  Send,
  MessageSquare,
  Copy,
  Check,
  ArrowRight
} from 'lucide-react';

// Recommended way: Set VITE_GEMINI_API_KEY in your .env file
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

interface ExtractedNumber {
  val: string;
  confidence: number;
  box_2d?: number[];
  isVerified?: boolean;
}

interface FileItem {
  id: string;
  data: string;
  name: string;
  numbers: ExtractedNumber[];
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  refinementPrompt?: string;
  processingStep?: string;
}

export default function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [schoolName, setSchoolName] = useState('');
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [expectedLength, setExpectedLength] = useState<number>(0);
  const [progress, setProgress] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

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
              status: 'pending',
              refinementPrompt: ''
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
              status: 'pending',
              refinementPrompt: ''
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
            status: 'pending',
            refinementPrompt: ''
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
          status: 'pending',
          refinementPrompt: ''
        };
        setFiles(prev => [...prev, newFile]);
        setSelectedFileId(newFile.id);
        stopCamera();
      }
    }
  };

  const cleanJson = (txt: string) => {
    const match = txt.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return match ? match[0] : txt.replace(/```json|```/g, "").trim();
  };

  const processFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || file.status === 'processing') return;

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'processing', processingStep: 'Step 1/3: Initial Scan...', error: undefined } : f));

    const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
    let lastError: any = null;

    for (const modelName of models) {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const base64Data = file.data.split(',')[1];

        // --- STEP 1: SCAN + COORDINATES ---
        const response1 = await ai.models.generateContent({
          model: modelName,
          contents: [{
            parts: [
              {
                text: `HANDWRITTEN EXTRACTION TASK: 
                       1. Read all handwritten numbers from the image.
                       2. Return JSON: { "numbers": [{ "val": "digits", "confidence": 0-100, "box_2d": [ymin,xmin,ymax,xmax] }] }
                       3. COORDINATES: Return [0-1000] normalized. Use tight horizontal strips.
                       4. SPECIFIC USER RULES: ${file.refinementPrompt || 'Extract all visible numbers accurately.'}`
              },
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
            ]
          }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                numbers: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      val: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                      box_2d: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                    }
                  }
                }
              }
            }
          }
        });
        const initialResult = JSON.parse(cleanJson(response1.text || "{\"numbers\":[]}")).numbers || [];

        // --- STEP 2: THE "CRITICAL" MICRO-AUDIT ---
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, processingStep: 'Step 2/3: High-Precision Audit...' } : f));
        const response2 = await ai.models.generateContent({
          model: modelName,
          contents: [{
            parts: [
              {
                text: `CRITICAL AUDIT TASK: 
                       I have an initial extraction: ${JSON.stringify(initialResult.map(n => n.val))}. 
                       It might contain ERRORS. 
                       RE-READ the image carefully for each of these items. 
                       Correct any digit errors. Return ONLY the final JSON array of objects with 'val', 'confidence', and 'box_2d'.`
              },
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
            ]
          }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  val: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  box_2d: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                }
              }
            }
          }
        });

        const auditedResult = JSON.parse(cleanJson(response2.text || "[]"));
        const step2Result = Array.isArray(auditedResult) ? auditedResult : (auditedResult.numbers || initialResult);

        // --- STEP 3: LOGIC SHIELD ---
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, processingStep: 'Step 3/3: Error Correction...' } : f));
        const response3 = await ai.models.generateContent({
          model: "gemini-2.5-flash-lite", // Faster for logic/text analysis
          contents: [{
            parts: [
              {
                text: `LOGIC SHIELD TASK: 
                       The AI extracted these digits: ${JSON.stringify(step2Result.map(n => n.val))}. 
                       Scan for OCR patterns: Is a '5' actually an 'S'? Is a '0' actually an 'O'? 
                       Output ONLY the corrected JSON array of strings for 'val'.`
              }
            ]
          }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        });

        const logicStrings = JSON.parse(cleanJson(response3.text || "[]"));
        const finalResult = step2Result.map((orig, i) => ({
          ...orig,
          val: (Array.isArray(logicStrings) && logicStrings[i]) ? logicStrings[i] : orig.val
        }));

        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, numbers: finalResult, status: 'done', processingStep: undefined } : f));
        return;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed, trying fallback...`, err.message);

        const isRetryable = err.message.includes("503") ||
          err.message.toLowerCase().includes("demand") ||
          err.message.toLowerCase().includes("unavailable") ||
          err.message.includes("429") ||
          err.message.toLowerCase().includes("limit");

        if (!isRetryable) break;
      }
    }

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error', processingStep: undefined, error: lastError?.message || "Verification failed after 3 attempts" } : f));
  };


  const processRefinement = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || !file.refinementPrompt?.trim() || file.status === 'processing') return;

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'processing', error: undefined } : f));

    const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
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
                {
                  text: `The user previously extracted these numbers: ${JSON.stringify(file.numbers.map(n => n.val))}. 
                         Now they have this instruction: "${file.refinementPrompt}". 
                         Please modify the list as requested. Keep the confidence scores and coordinates if possible. 
                         Return only the final JSON array of objects with 'val', 'confidence', and 'box_2d'.` },
                { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  val: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  box_2d: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                }
              }
            }
          }
        });

        const finalResult = JSON.parse(cleanJson(response.text || "[]"));
        const result = Array.isArray(finalResult) ? finalResult : (finalResult.numbers || file.numbers);
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, numbers: result, status: 'done' } : f));
        return;
      } catch (err: any) {
        lastError = err;
        const isRetryable = err.message.includes("503") ||
          err.message.toLowerCase().includes("demand") ||
          err.message.toLowerCase().includes("unavailable") ||
          err.message.includes("429") ||
          err.message.toLowerCase().includes("limit");

        if (!isRetryable) break;
      }
    }

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error', error: lastError?.message || "Failed to refine refinement" } : f));
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    setProgress(0);
    const pendingFiles = files.filter(f => f.status !== 'done');
    const total = pendingFiles.length;
    let count = 0;

    for (const file of pendingFiles) {
      await processFile(file.id);
      count++;
      setProgress(Math.round((count / total) * 100));
    }
    setIsProcessingAll(false);
    setTimeout(() => setProgress(0), 2000);
  };

  const downloadExcel = (fileId?: string) => {
    const filesToDownload = fileId ? files.filter(f => f.id === fileId) : files.filter(f => f.status === 'done');
    if (filesToDownload.length === 0) return;

    const wb = XLSX.utils.book_new();
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}`;
    const baseName = schoolName.trim() || 'Extracted_Numbers';

    filesToDownload.forEach(file => {
      const ws = XLSX.utils.json_to_sheet(file.numbers.map(n => ({ "Number": n.val, "Confidence": n.confidence })));
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

  const updateNumber = (fileId: string, index: number, newValue: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        const newNumbers = [...f.numbers];
        newNumbers[index] = { ...newNumbers[index], val: newValue, confidence: 100 }; // Manual edit sets confidence to 100
        return { ...f, numbers: newNumbers };
      }
      return f;
    }));
  };

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const updateRefinementPrompt = (id: string, prompt: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, refinementPrompt: prompt } : f));
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

            <div className="relative w-full sm:w-48">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="number"
                placeholder="Expected Digits..."
                value={expectedLength || ''}
                onChange={(e) => setExpectedLength(parseInt(e.target.value) || 0)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all text-sm"
              />
              {expectedLength > 0 && (
                <div className="absolute -top-2 -right-2 bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold border border-green-200">
                  Fixed
                </div>
              )}
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

        {isProcessingAll && (
          <div className="mb-6 bg-white p-4 rounded-2xl border border-green-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-green-700 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Processing all files...
              </span>
              <span className="text-xs font-bold text-green-600">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-green-600"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

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
                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> {file.processingStep || 'Processing'}
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
                    {/* Left Column: Image Preview */}
                    <div className="w-full md:w-1/2 flex flex-col gap-4">
                      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-100 group">
                        <img
                          src={selectedFile.data}
                          alt="Document Preview"
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {selectedFile.status !== 'done' && selectedFile.status !== 'processing' && (
                        <button
                          onClick={() => processFile(selectedFile.id)}
                          className="w-full py-4 bg-green-600 text-white rounded-2xl font-semibold shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center justify-center gap-2 group"
                        >
                          <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                          {selectedFile.refinementPrompt?.trim() ? "Extract with AI Chat Rules" : "Extract Numbers"}
                        </button>
                      )}
                    </div>

                    {/* Right Column: Numbers List & Tools */}
                    <div className="w-full md:w-1/2 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Hash className="w-5 h-5 text-green-600" />
                          {selectedFile.name}
                        </h3>
                        <button
                          onClick={() => processFile(selectedFile.id)}
                          disabled={selectedFile.status === 'processing'}
                          className="p-2 text-neutral-400 hover:text-green-600 transition-all hover:bg-green-50 rounded-lg flex items-center gap-2 text-xs font-bold"
                          title="Reprocess Image"
                        >
                          <RefreshCw className={`w-4 h-4 ${selectedFile.status === 'processing' ? 'animate-spin' : ''}`} />
                          Reprocess
                        </button>
                      </div>

                      <div className="flex-grow bg-neutral-50 rounded-2xl border border-neutral-100 p-4 min-h-[300px] max-h-[500px] overflow-y-auto">
                        {selectedFile.status === 'processing' ? (
                          <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-3">
                            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                            <p className="text-sm font-medium animate-pulse text-green-600">
                              {selectedFile.processingStep || 'Reading handwriting...'}
                            </p>
                          </div>
                        ) : selectedFile.status === 'done' ? (
                          <div className="grid grid-cols-1 gap-2">
                            {selectedFile.numbers.map((num, i) => (
                              <div
                                key={i}
                                className={`group bg-white p-2 rounded-xl border-2 flex items-center gap-3 shadow-sm transition-all ${focusedIndex === i ? 'border-green-500 ring-4 ring-green-50' : 'border-neutral-50 hover:border-neutral-200'} ${num.confidence < 90 ? 'bg-yellow-50/50' : ''}`}
                              >
                                <span className={`text-[10px] font-mono w-4 pl-1 ${focusedIndex === i ? 'text-green-600 font-bold' : 'text-neutral-300'}`}>{i + 1}</span>
                                <input
                                  type="text"
                                  value={num.val}
                                  onFocus={() => setFocusedIndex(i)}
                                  onBlur={() => setFocusedIndex(null)}
                                  onChange={(e) => updateNumber(selectedFile.id, i, e.target.value)}
                                  className="flex-grow bg-transparent border-none p-1 text-sm font-mono text-neutral-700 focus:ring-0"
                                />
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {num.confidence < 90 && (
                                    <div className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-lg font-bold border border-yellow-200 flex items-center gap-1">
                                      <AlertCircle className="w-2 h-2" />
                                      Review
                                    </div>
                                  )}
                                </div>
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

                      {(selectedFile.status === 'done' || selectedFile.status === 'pending') && (
                        <div className="mt-6 space-y-4">
                          <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100/50 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-2 opacity-5">
                              <MessageSquare className="w-12 h-12 text-green-600" />
                            </div>
                            <label className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-2 block flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              Refine Extraction (AI Chat)
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                placeholder={selectedFile.status === 'pending' ? "Tell AI how to extract e.g. 'only numbers with 10 digits'..." : "e.g. 'remove - from these numbers'..."}
                                value={selectedFile.refinementPrompt || ''}
                                onChange={(e) => updateRefinementPrompt(selectedFile.id, e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (selectedFile.status === 'done' ? processRefinement(selectedFile.id) : processFile(selectedFile.id))}
                                className="w-full pl-4 pr-12 py-3 bg-white border border-green-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all text-sm"
                              />
                              <button
                                onClick={() => selectedFile.status === 'done' ? processRefinement(selectedFile.id) : processFile(selectedFile.id)}
                                disabled={!selectedFile.refinementPrompt?.trim() || selectedFile.status === 'processing'}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all"
                              >
                                {selectedFile.status === 'pending' ? <ArrowRight className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {selectedFile.status === 'done' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => copyToClipboard(selectedFile.numbers.map(n => n.val).join('\n'))}
                                className="flex-1 py-4 bg-white border-2 border-green-600 text-green-700 rounded-2xl font-bold hover:bg-green-50 transition-all flex items-center justify-center gap-2"
                              >
                                {isCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                {isCopied ? 'Copied!' : 'Copy All'}
                              </button>
                              <button
                                onClick={() => downloadExcel(selectedFile.id)}
                                className="flex-[2] py-4 bg-green-600 text-white rounded-2xl font-semibold shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                              >
                                <Download className="w-5 h-5" />
                                Download (Excel)
                              </button>
                            </div>
                          )}
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
          <p className="font-medium text-neutral-500">Developed with by <span className="text-green-600 font-extrabold uppercase tracking-wider">Ahmed Ali Rana</span></p>
          <div className="text-[10px] opacity-50">© {new Date().getFullYear()} All Rights Reserved</div>
        </footer>
      </div>
    </div>
  );
}
