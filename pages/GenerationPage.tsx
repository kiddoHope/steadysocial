import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SocialPlatform, CaptionTone, CanvasStatus, ContentCanvas, CanvasItem } from '../types';
import { AVAILABLE_PLATFORMS, AVAILABLE_TONES } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useCanvas } from '../contexts/CanvasContext';
import { useGenerationWIP } from '../contexts/GenerationWIPContext';
import { useAI } from '../contexts/AIContext';
import ControlsPanel from '../components/generation/ControlsPanel';
import Alert from '../components/ui/Alert';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, onClose, children, title }) => {
  useEffect(() => {
    if (isOpen) {
      const main = document.getElementById('main-content');
      if (main) main.style.overflow = 'hidden';
    } else {
      const main = document.getElementById('main-content');
      if (main) main.style.overflow = 'auto';
    }
    return () => {
      const main = document.getElementById('main-content');
      if (main) main.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div 
      className="fixed inset-0 bg-neo-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-white neo-border neo-shadow-lg w-full max-w-2xl overflow-hidden relative rotate-1"
        onClick={(e) => e.stopPropagation()} 
      >
        <div className="flex justify-between items-center p-6 bg-neo-black text-white">
          <h3 className="text-xl font-black uppercase tracking-tighter">{title || "SYSTEM PREVIEW"}</h3>
          <button onClick={onClose} className="w-10 h-10 neo-border-sm bg-neo-accent flex items-center justify-center hover:bg-white hover:text-neo-black transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="p-8 max-h-[80vh] overflow-y-auto bg-neo-bg">
          {children}
        </div>
      </div>
    </div>
  );
};

interface SocialPostPreviewProps {
  platform: SocialPlatform;
  text: string;
  imagePreview?: string | null;
  userName?: string;
  userHandle?: string;
  avatar?: string;
}

const SocialPostPreview: React.FC<SocialPostPreviewProps> = ({
  platform,
  text,
  imagePreview,
  userName = "BRAND_ENTITY",
  userHandle = "@PROTOCOL",
  avatar = "https://placehold.co/48x48/000000/ffffff?text=X" 
}) => {
    return (
        <div className="bg-white neo-border p-6 neo-shadow-sm relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <i className={`fab fa-${platform.toLowerCase()} text-6xl`}></i>
            </div>
            <div className="flex items-center mb-6 relative z-10">
                <img src={avatar} alt="Avatar" className="w-14 h-14 neo-border-sm mr-4 object-cover" />
                <div>
                    <p className="font-black text-neo-black uppercase tracking-widest leading-none">{userName}</p>
                    <p className="text-[10px] font-bold text-neo-accent mt-1">{userHandle}</p>
                </div>
            </div>
            <div className="text-neo-black font-bold whitespace-pre-wrap mb-6 prose prose-slate max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm as any]}>{String(text)}</ReactMarkdown>
            </div>
            {imagePreview && (
                <div className="relative mb-6">
                    <div className="absolute inset-0 neo-border translate-x-1 translate-y-1 bg-neo-black opacity-20"></div>
                    <img src={imagePreview} alt="Media" className="relative neo-border w-full object-cover max-h-[400px]" />
                </div>
            )}
            <div className="flex justify-between items-center pt-6 border-t-4 border-neo-black font-black uppercase text-xs">
                <button className="flex items-center gap-2 hover:text-neo-accent transition-colors">
                    <i className="far fa-heart"></i> LIKE
                </button>
                <button className="flex items-center gap-2 hover:text-neo-accent transition-colors">
                    <i className="far fa-comment"></i> DISCUSS
                </button>
                <button className="flex items-center gap-2 hover:text-neo-accent transition-colors">
                    <i className="far fa-share-square"></i> DISTRIBUTE
                </button>
            </div>
        </div>
    );
};

const GenerationPage: React.FC = () => {
  const {
    creativeModelLoaded,
    isLoadingInitialItems,
    isLoadingAdaptation,
    isLoadingPromptSuggestion,
    error: webLLMError,
    rawAIResponse, 
    requestType, 
    generateInitialCanvasItems,
    adaptCanvasItem,
    suggestPromptForCanvasTitle,
    generateComfyUIPrompt,
    generateCaptionsForImages,
    setError: setWebLLMError
  } = useAI();
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { 
    getCanvasById, 
    createCanvas: createCanvasInContext, 
    updateCanvas: updateCanvasInContext, 
    updateCanvasStatus: updateCanvasStatusInContext, 
    addOrUpdateCanvasItemAdaptation: addOrUpdateAdaptationInContext, 
    updateCanvasItemNotes: updateItemNotesInContext,
    isLoadingCanvases,
    activeCanvas,
    setActiveCanvas
  } = useCanvas();

  const { 
    wipState, 
    setWIPState, 
    clearWIPState, 
    initializeWIPFromCanvas,
    setWIPOverallImage,
    setWIPOverallTextFile,
    getWIPScreenshotForSave
  } = useGenerationWIP();

  const [systemNotification, setSystemNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const rawOutputRef = useRef<HTMLDivElement>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<{ platform: SocialPlatform; text: string; imagePreview: string | null } | null>(null);

  const [isPageLoading, setIsPageLoading] = useState(false); 
  const [isSubmittingCanvas, setIsSubmittingCanvas] = useState(false);

  const {
    canvasTitle, customPrompt, platformContext, tone, numberOfIdeas,
    overallImagePreview, overallImageFile, overallTextFileContent, overallTextFile,
    parsedRawItems
  } = wipState;

  const onCanvasTitleChange = (value: string) => setWIPState({ canvasTitle: value });
  const onCustomPromptChange = (value: string) => setWIPState({ customPrompt: value });
  const onPlatformContextChange = (value: SocialPlatform) => setWIPState({ platformContext: value });
  const onToneChange = (value: CaptionTone) => setWIPState({ tone: value });
  const onNumberOfIdeasChange = (value: number) => setWIPState({ numberOfIdeas: value });
  const onNumberOfGenerationsChange = (value: number) => setWIPState({ numberOfGenerations: value });

  const handleSelectFolder = useCallback(async () => {
    try {
        const response = await fetch('http://localhost:3001/folder/select');
        const data = await response.json();
        if (data.folderPath) {
            setWIPState({ folderPath: data.folderPath });
            setSystemNotification({ type: 'info', message: `FOLDER SELECTED: ${data.folderPath}` });
        }
    } catch (err) {
        setSystemNotification({ type: 'error', message: 'FAILED TO OPEN FOLDER DIALOG' });
    }
  }, [setWIPState]);
  
  const handleOverallImageUpload = useCallback((file: File | null) => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setWIPOverallImage(file, reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setWIPOverallImage(null, null);
    }
  }, [setWIPOverallImage]);

  const handleOverallTextFileUpload = useCallback((file: File | null) => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setWIPOverallTextFile(file, reader.result as string);
      reader.readAsText(file);
    } else {
      setWIPOverallTextFile(null, null);
    }
  }, [setWIPOverallTextFile]);

  const handleImageModeChange = useCallback((mode: 'generate' | 'upload') => {
    setWIPState({ imageMode: mode });
  }, [setWIPState]);


  const handleStartOver = useCallback(() => {
    setActiveCanvas(null); 
    clearWIPState(); 
    setSystemNotification(null);
    setWebLLMError(null);
    navigate('/generate', { replace: true });
  }, [navigate, clearWIPState, setWebLLMError]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const canvasIdFromUrl = params.get('canvasId');
    
    const loadData = async () => {
        // If there's an ID in URL, we definitely need to sync it.
        if (canvasIdFromUrl) {
            // Only fetch if it's different from the current active canvas to prevent unnecessary reloads
            if (!activeCanvas || activeCanvas.id !== canvasIdFromUrl) {
                setIsPageLoading(true);
                try {
                    const canvasToLoad = await getCanvasById(canvasIdFromUrl);
                    if (canvasToLoad) {
                        setActiveCanvas(canvasToLoad);
                        initializeWIPFromCanvas(canvasToLoad); 
                        setSystemNotification({ type: 'info', message: `SYSTEM LOADED: "${canvasToLoad.title || 'UNTITLED'}"` });
                    } else {
                        setSystemNotification({ type: 'error', message: `ID NOT FOUND. RESETTING.` });
                        handleStartOver();
                    }
                } catch (error) {
                    setSystemNotification({ type: 'error', message: "LOAD ERROR." });
                    handleStartOver();
                } finally {
                    setIsPageLoading(false);
                }
            }
        } else { 
            // NO ID IN URL.
            // If we HAD an active canvas (saved), and now we are on the base /generate route, 
            // it means the user wants to start a "New Canvas" or we should clear the specific canvas link.
            if (activeCanvas && activeCanvas.id) {
                setActiveCanvas(null);
                initializeWIPFromCanvas(null); 
            }
            // If activeCanvas is already null, we are already in "New Canvas" mode.
            // DO NOT call initializeWIPFromCanvas(null) here because it would clear any 
            // typing/work the user did before navigating away and coming back.
        }
    };
    loadData();
    // We remove activeCanvas from dependencies to avoid infinite loops if loadData updates it,
    // although the internal check should handle it. Using activeCanvas.id is safer if we want to react to changes.
  }, [location.search, getCanvasById, initializeWIPFromCanvas]); // Removed handleStartOver and activeCanvas to avoid unnecessary triggers

  useEffect(() => {
    if (rawAIResponse && rawOutputRef.current) {
      rawOutputRef.current.scrollTop = rawOutputRef.current.scrollHeight;
    }
  }, [rawAIResponse]);
  
  const handleGenerateIdeas = useCallback(async () => {
    if (!currentUser) { setWebLLMError("AUTH ERROR."); return; }
    if ((wipState.imageMode === 'generate' || !wipState.imageMode) && !wipState.folderPath) { 
      setSystemNotification({ type: 'error', message: "FOLDER SELECTION REQUIRED." }); 
      return; 
    }
    if (wipState.imageMode === 'upload' && !wipState.overallImagePreview) { 
      setSystemNotification({ type: 'error', message: "UPLOADED IMAGE REQUIRED." }); 
      return; 
    }
    if (!customPrompt.trim()) { setSystemNotification({ type: 'error', message: "MISSION PROMPT REQUIRED." }); return; }
    
    setSystemNotification(null);
    setWebLLMError(null);
    setWIPState({ parsedRawItems: null });
    setIsPageLoading(true);

    try {
      let generatedImages: string[] = [];

      if (wipState.imageMode === 'generate' || !wipState.imageMode) {
        // 1. Get random images from folder
        setSystemNotification({ type: 'info', message: "RETRIEVING RANDOM IMAGES..." });
        const imgResp = await fetch(`http://localhost:3001/folder/random-images?folderPath=${encodeURIComponent(wipState.folderPath!)}&count=1`);
        const imgData = await imgResp.json();
        
        const referenceImages = imgData.images || [];
        const referenceImageUrls = referenceImages.map((img: any) => img.dataUrl);

        // 2. Generate ComfyUI Prompt
        setSystemNotification({ type: 'info', message: "DESIGNING COMFY_UI PROMPT..." });
        const comfyPrompt = await generateComfyUIPrompt({
          customPrompt,
          textFileContent: overallTextFileContent,
          referenceImages: referenceImageUrls,
          tone
        });
        
        console.log("GENERATED COMFY_UI PROMPT:", comfyPrompt);

        // 3. Simulate/Call ComfyUI (Placeholder for actual generation)
        setSystemNotification({ type: 'info', message: `GENERATING ${wipState.numberOfGenerations} VISUALS VIA COMFY_UI...` });
        
        generatedImages = referenceImageUrls.length > 0 
          ? Array(wipState.numberOfGenerations).fill(referenceImageUrls[0])
          : ["https://placehold.co/1024x1024/000000/ffffff?text=AI_GENERATED_IMAGE"];
      } else {
        // Just use the uploaded image
        generatedImages = [wipState.overallImagePreview!];
      }

      // 4. Generate Captions based on images
      setSystemNotification({ 
        type: 'info', 
        message: (wipState.imageMode === 'generate' || !wipState.imageMode)
          ? "ANALYZING VISUALS & WRITING CAPTIONS..." 
          : "ANALYZING UPLOADED VISUAL & WRITING CAPTIONS..." 
      });
      const finalCaptions = await generateCaptionsForImages({
        images: generatedImages,
        customPrompt,
        platform: platformContext,
        tone,
        count: numberOfIdeas
      });

      setWIPState({ parsedRawItems: finalCaptions });
      setSystemNotification({ type: 'success', message: `${finalCaptions.length} AI_ENTITIES SYNTHESIZED.` });
      
      // Update overall image preview to show the first generated one (for generate mode only, upload mode already has it)
      if (generatedImages[0] && (wipState.imageMode === 'generate' || !wipState.imageMode)) {
        setWIPState({ overallImagePreview: generatedImages[0] });
      }

    } catch (err: unknown) {
      setWebLLMError(err instanceof Error ? err.message : String(err));
      setWIPState({ parsedRawItems: null });
    } finally {
        setIsPageLoading(false);
    }
  }, [
    currentUser, 
    wipState.imageMode, 
    wipState.folderPath, 
    wipState.numberOfGenerations, 
    wipState.overallImagePreview, 
    customPrompt, 
    overallTextFileContent, 
    platformContext, 
    tone, 
    numberOfIdeas,
    generateComfyUIPrompt, 
    generateCaptionsForImages, 
    setWebLLMError, 
    setWIPState, 
    setSystemNotification
  ]);

  const handleGenerateCardFromRaw = useCallback(async (itemText: string) => {
    if (!currentUser) { setSystemNotification({ type: 'error', message: "AUTH ERROR." }); return; }
    setIsPageLoading(true);
    
    const newItem: CanvasItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalText: itemText,
        adaptations: {},
        baseTone: tone, 
        basePlatformContext: platformContext,
    }
    
    const currentWipSnapshot = getWIPScreenshotForSave();
    const currentCanvasTitleResolved = canvasTitle.trim() || (activeCanvas?.title) || `CANVAS_${new Date().getTime()}`;

    try {
        let finalCanvas: ContentCanvas | undefined;
        if (activeCanvas) {
            const updatedCanvasData: ContentCanvas = { 
                ...activeCanvas, 
                title: currentCanvasTitleResolved,
                overallCustomPrompt: customPrompt,
                overallTone: tone,
                overallPlatformContext: platformContext,
                overallImagePreview: overallImagePreview,
                overallTextFileContent: overallTextFileContent,
                items: [...activeCanvas.items, newItem],
                wipStateSnapshot: currentWipSnapshot,
            };
            finalCanvas = await updateCanvasInContext(updatedCanvasData);
        } else {
            const canvasDataForCreation: Omit<ContentCanvas, 'id' | 'items' | 'status' | 'createdAt' | 'wipStateSnapshot'> = {
                title: currentCanvasTitleResolved,
                overallCustomPrompt: customPrompt,
                overallTone: tone,
                overallPlatformContext: platformContext,
                overallImagePreview: overallImagePreview,
                overallTextFileContent: overallTextFileContent,
                createdBy: currentUser.id,
            };
            finalCanvas = await createCanvasInContext(canvasDataForCreation, [newItem], currentWipSnapshot);
        }
        
        if (finalCanvas) {
            setActiveCanvas(finalCanvas);
            setWIPState(prev => ({
                ...prev, 
                parsedRawItems: prev.parsedRawItems ? prev.parsedRawItems.filter(raw => raw !== itemText) : null,
                activeCanvasIdForWIP: finalCanvas?.id || null 
            }));
            setSystemNotification({ type: 'success', message: `ENTITY ADDED.` });
            if(!activeCanvas && finalCanvas) navigate(`/generate?canvasId=${finalCanvas.id}`, {replace: true}); 
        }
    } catch (err: any) {
        console.error("Insert Card Failure:", err);
        setSystemNotification({ type: 'error', message: `SYSTEM_FAILURE: ${err.message || 'UNKNOWN_ERROR'}` });
    } finally {
        setIsPageLoading(false);
    }
  }, [
    activeCanvas, currentUser, canvasTitle, customPrompt, tone, platformContext, 
    overallImagePreview, overallTextFileContent, getWIPScreenshotForSave,
    createCanvasInContext, updateCanvasInContext, setWIPState, setSystemNotification, navigate
  ]);
  
  const handleAdaptItem = useCallback(async (item: CanvasItem, targetPlatform: SocialPlatform) => {
    if (!currentUser || !activeCanvas) { setSystemNotification({ type: 'error', message: 'CONTEXT ERROR.' }); return; }
    try {
      const promptForAdapt = wipState.customPrompt || activeCanvas.overallCustomPrompt;
      const textFileForAdapt = wipState.overallTextFileContent || activeCanvas.overallTextFileContent;

      const adaptedText = await adaptCanvasItem({
        itemId: item.id, originalText: item.originalText, targetPlatform,
        baseTone: item.baseTone, customPrompt: promptForAdapt,
        textFileContent: textFileForAdapt ?? null
      });
      const updatedCanvas = await addOrUpdateAdaptationInContext(activeCanvas.id, item.id, targetPlatform, adaptedText);
      if (updatedCanvas) setActiveCanvas(updatedCanvas);
    } catch (err: unknown) { 
      setSystemNotification({ type: 'error', message: `ADAPT ERROR.` }); 
    }
  }, [currentUser, activeCanvas, adaptCanvasItem, addOrUpdateAdaptationInContext, wipState, setSystemNotification]);

  const handleSubmitCanvasForReview = useCallback(async () => {
    if (!activeCanvas || !currentUser) return;
    setIsSubmittingCanvas(true);

    const currentWipSnapshot = getWIPScreenshotForSave();
    const canvasToSubmit: ContentCanvas = {
        ...activeCanvas,
        title: canvasTitle.trim() || activeCanvas.title || `SUBMISSION_${new Date().getTime()}`,
        overallCustomPrompt: customPrompt,
        overallTone: tone,
        overallPlatformContext: platformContext,
        overallImagePreview: overallImagePreview,
        overallTextFileContent: overallTextFileContent,
        wipStateSnapshot: currentWipSnapshot, 
    };

    try {
        const savedCanvas = await updateCanvasInContext(canvasToSubmit);
        if (!savedCanvas) { 
            setSystemNotification({ type: 'error', message: "SAVE FAILED." }); 
            setIsSubmittingCanvas(false);
            return; 
        }
        const updatedStatusCanvas = await updateCanvasStatusInContext(savedCanvas.id, CanvasStatus.PENDING_REVIEW, currentUser.id);
        if (updatedStatusCanvas) {
          setActiveCanvas(updatedStatusCanvas);
          initializeWIPFromCanvas(updatedStatusCanvas); 
          setSystemNotification({ type: 'success', message: `CANVAS SUBMITTED.` });
        }
    } catch (err: any) {
        setSystemNotification({ type: 'error', message: `SUBMIT ERROR.`});
    } finally {
        setIsSubmittingCanvas(false);
    }
  }, [
      activeCanvas, currentUser, canvasTitle, customPrompt, tone, platformContext, overallImagePreview, overallTextFileContent,
      updateCanvasInContext, updateCanvasStatusInContext, initializeWIPFromCanvas, getWIPScreenshotForSave, setSystemNotification
    ]);

  const handleSuggestPrompt = useCallback(async () => {
    if (!canvasTitle.trim()) { setSystemNotification({ type: 'error', message: "TITLE REQUIRED." }); return; }
    try {
      const suggestedPromptText = await suggestPromptForCanvasTitle(canvasTitle, overallTextFileContent, overallImagePreview);
      setWIPState({ customPrompt: suggestedPromptText });
      setSystemNotification({ type: 'success', message: "PROMPT APPLIED." });
    } catch (errorCaught: unknown) {
        setWebLLMError("SUGGESTION ERROR.");
    }
  }, [canvasTitle, suggestPromptForCanvasTitle, setWIPState, setWebLLMError, setSystemNotification]);

  const handleOpenPreview = (platformValue: SocialPlatform, textValue: string, image: string | null) => {
    setPreviewContent({ platform: platformValue, text: textValue, imagePreview: image });
    setIsPreviewOpen(true);
  };
  const handleClosePreview = () => { setIsPreviewOpen(false); setPreviewContent(null); };

  const handleRemoveItem = useCallback(async (itemIdToRemove: string) => {
    if (!activeCanvas) return;
    setIsPageLoading(true);
    try {
        const updatedItems = activeCanvas.items.filter(item => item.id !== itemIdToRemove);
        const updatedCanvasData = { ...activeCanvas, items: updatedItems };
        const savedCanvas = await updateCanvasInContext(updatedCanvasData);
        if(savedCanvas) {
            setActiveCanvas(savedCanvas);
            setSystemNotification({ type: 'success', message: 'REMOVED.' });
        }
    } catch (err: any) {
         setSystemNotification({ type: 'error', message: `REMOVE ERROR.`});
    } finally {
        setIsPageLoading(false);
    }
  }, [activeCanvas, updateCanvasInContext, setSystemNotification]);
  
  const platformOptionsForAdaptation = AVAILABLE_PLATFORMS.filter(p => p !== SocialPlatform.General);

  const controlsGloballyDisabled =
    isPageLoading || isLoadingCanvases || isSubmittingCanvas ||
    !creativeModelLoaded || 
    (!!activeCanvas &&
      (activeCanvas.status === CanvasStatus.PENDING_REVIEW ||
        activeCanvas.status === CanvasStatus.APPROVED ||
        (activeCanvas.status === CanvasStatus.NEEDS_REVISION && currentUser?.id !== activeCanvas.createdBy)));

  const itemEditingDisabled = 
    controlsGloballyDisabled ||
    isLoadingInitialItems || 
    Object.values(isLoadingAdaptation).some(pL => Object.values(pL).some(s => s)) || 
    (!!activeCanvas && 
      activeCanvas.status !== CanvasStatus.DRAFT &&
      !(activeCanvas.status === CanvasStatus.NEEDS_REVISION && currentUser?.id === activeCanvas.createdBy)
    );

  if (isPageLoading && !activeCanvas) { 
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-neo-bg">
        <div className="w-20 h-20 neo-border bg-neo-secondary animate-spin"></div>
        <p className="mt-8 font-black uppercase tracking-widest animate-pulse">INITIATING WORKSPACE...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 max-w-[1400px] mx-auto">
        <div>
          <div className="inline-block bg-neo-accent text-white px-2 py-0.5 mb-2 neo-border-sm rotate-1">
             <span className="text-[10px] font-black uppercase tracking-widest">CONTENT LAB v1.0</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-neo-black leading-none">
            Canvas <span className="text-neo-secondary outline-text">Workspace</span>
          </h1>
        </div>
        
        {(activeCanvas || wipState.canvasTitle || wipState.customPrompt || wipState.parsedRawItems) && (
          <button 
            onClick={handleStartOver} 
            disabled={isPageLoading || isSubmittingCanvas}
            className="neo-border bg-neo-black text-white px-6 py-3 font-black uppercase tracking-widest hover:bg-neo-accent transition-colors active:translate-x-[2px] active:translate-y-[2px]"
          >
            <i className="fas fa-power-off mr-3 text-neo-accent"></i> TERMINATE & RESET
          </button>
        )}
      </header>

      <main className="relative z-10 grid lg:grid-cols-12 gap-10 max-w-[1400px] mx-auto">
        <div className="lg:col-span-4">
          <ControlsPanel
            onSelectFolder={handleSelectFolder}
            onNumberOfGenerationsChange={onNumberOfGenerationsChange}
            wipState={wipState}
            onTextFileUpload={handleOverallTextFileUpload}
            textFile={overallTextFile}
            onImageModeChange={handleImageModeChange}
            onImageUpload={handleOverallImageUpload}
            imageFile={overallImageFile}
            customPrompt={customPrompt} 
            onCustomPromptChange={onCustomPromptChange}
            platformContext={platformContext}
            onPlatformContextChange={onPlatformContextChange}
            availablePlatforms={Object.values(SocialPlatform).filter(p => p !== SocialPlatform.Twitter)}
            tone={tone}
            onToneChange={onToneChange}
            availableTones={AVAILABLE_TONES}
            numberOfIdeas={numberOfIdeas}
            onNumberOfIdeasChange={onNumberOfIdeasChange}
            onGenerateIdeas={handleGenerateIdeas}
            isGenerating={isLoadingInitialItems} 
            isModelReady={creativeModelLoaded} 
            canvasTitle={canvasTitle}
            onCanvasTitleChange={onCanvasTitleChange}
            onSuggestPrompt={handleSuggestPrompt}
            isSuggestingPrompt={isLoadingPromptSuggestion}
            controlsGloballyDisabled={controlsGloballyDisabled || isPageLoading}
          />
        </div>

        <div className="lg:col-span-8 space-y-10">
          {webLLMError && <Alert type="error" message={webLLMError} onClose={() => setWebLLMError(null)} />}
          {systemNotification && <Alert type={systemNotification.type} message={systemNotification.message} onClose={() => setSystemNotification(null)} />}

          {creativeModelLoaded && (!activeCanvas || (activeCanvas && (activeCanvas.status === CanvasStatus.DRAFT || (activeCanvas.status === CanvasStatus.NEEDS_REVISION && currentUser?.id === activeCanvas.createdBy)))) && (
             <section className="neo-border bg-neo-black p-8 text-white neo-shadow-md relative overflow-hidden -rotate-1">
               <div className="absolute top-0 right-0 p-4 opacity-10">
                 <i className="fas fa-robot text-8xl"></i>
               </div>
               <div className="flex items-center gap-4 mb-6 border-b-2 border-white/20 pb-4">
                 <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                 <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                 <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                 <h2 className="text-xs font-black uppercase tracking-[0.3em] ml-4">GENERATED_OUTPUT_STREAM</h2>
               </div>

               <div ref={rawOutputRef} className="space-y-6 max-h-[500px] overflow-y-auto scrollbar-hide">
                 {isLoadingInitialItems ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="w-10 h-10 neo-border-sm bg-neo-accent animate-bounce"></div>
                      <p className="mt-4 font-black uppercase tracking-widest text-neo-accent">AI_THINKING...</p>
                    </div>
                 ) : parsedRawItems && parsedRawItems.length > 0 ? (
                    <div className="grid gap-6">
                      {parsedRawItems.map((item, index) => (
                        <div key={index} className="flex flex-col md:flex-row items-start justify-between gap-6 p-6 bg-white/5 neo-border-sm hover:bg-white/10 transition-colors group">
                          <div className="flex-1">
                            <span className="text-[10px] font-black text-neo-accent mb-2 block">ENTRY_0{index+1}</span>
                            <p className="text-sm font-bold leading-relaxed">{item}</p>
                          </div>
                          <button 
                            onClick={() => handleGenerateCardFromRaw(item)}
                            disabled={controlsGloballyDisabled || itemEditingDisabled || isPageLoading}
                            className="bg-neo-secondary text-neo-black px-4 py-2 neo-border-sm font-black uppercase text-[10px] tracking-widest hover:bg-neo-accent hover:text-white transition-all active:translate-x-1 active:translate-y-1"
                          >
                            INSERT_CARD
                          </button>
                        </div>
                      ))}
                    </div>
                 ) : (
                    <div className="py-20 text-center opacity-40">
                        <i className="fas fa-terminal text-4xl mb-4"></i>
                        <p className="font-black uppercase tracking-widest text-xs">AWAITING MISSION PARAMETERS...</p>
                    </div>
                 )}
               </div>
             </section>
          )}

          {!activeCanvas && !isPageLoading && !isLoadingCanvases && creativeModelLoaded && (
            <div className="neo-border bg-white p-32 text-center neo-shadow-md rotate-1">
               <i className="fas fa-layer-group text-8xl text-neo-muted mb-8"></i>
               <h2 className="text-3xl font-black uppercase tracking-tighter mb-4">WORKSPACE_EMPTY</h2>
               <p className="text-neo-black/60 font-bold">ACTIVATE ENGINE TO GENERATE CONTENT ENTITIES.</p>
            </div>
          )}

          {activeCanvas && !isPageLoading && (
            <div className="space-y-12">
              <div className="flex items-center justify-between bg-neo-black text-white p-8 neo-border neo-shadow-sm">
                <div>
                   <span className="text-[10px] font-black uppercase tracking-widest text-neo-muted mb-1 block">ACTIVE_CANVAS</span>
                   <h2 className="text-3xl font-black uppercase tracking-tighter truncate max-w-md">{activeCanvas.title}</h2>
                </div>
                <div className="flex flex-col items-end">
                   <div className={`px-4 py-1 neo-border-sm font-black uppercase text-xs rotate-2 ${activeCanvas.status === CanvasStatus.APPROVED ? 'bg-neo-accent' : 'bg-neo-secondary text-neo-black'}`}>
                      {activeCanvas.status}
                   </div>
                   <span className="text-[10px] font-bold mt-2 opacity-60 uppercase">{activeCanvas.items.length} ENTITIES DETECTED</span>
                </div>
              </div>

              {activeCanvas.status === CanvasStatus.NEEDS_REVISION && activeCanvas.adminFeedback && (
                <div className="bg-neo-muted p-6 neo-border neo-shadow-sm -rotate-1">
                  <div className="flex items-center gap-3 mb-2 text-neo-black">
                     <i className="fas fa-exclamation-triangle"></i>
                     <span className="font-black uppercase tracking-widest text-xs">ADMIN_DIRECTIVE</span>
                  </div>
                  <p className="font-bold italic">"{activeCanvas.adminFeedback}"</p>
                </div>
              )}

              <div className="grid gap-12">
                {activeCanvas.items.map((item, index) => (
                  <Card key={item.id} className="!p-0 overflow-hidden neo-shadow-md hover:neo-shadow-lg transition-all">
                    <div className="bg-neo-bg p-6 neo-border-b flex justify-between items-center">
                       <span className="bg-neo-black text-white px-3 py-1 neo-border-sm font-black text-xs rotate-2">ENTITY_#0{index+1}</span>
                       <div className="flex gap-4">
                          <button 
                            onClick={() => handleOpenPreview(item.basePlatformContext, item.originalText, wipState.overallImagePreview || activeCanvas.overallImagePreview || null)}
                            className="w-10 h-10 neo-border-sm bg-white flex items-center justify-center hover:bg-neo-secondary transition-colors"
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          {!itemEditingDisabled && (
                            <button 
                              onClick={() => handleRemoveItem(item.id)}
                              className="w-10 h-10 neo-border-sm bg-neo-accent text-white flex items-center justify-center hover:bg-neo-black transition-colors"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          )}
                       </div>
                    </div>

                    <div className="p-8 space-y-8">
                      <div className="relative">
                        <div className="absolute -left-12 top-0 w-2 h-full bg-neo-accent opacity-20"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-neo-black/40 mb-3 block">CORE_IDEA [TONE:{item.baseTone}]</span>
                        <div className="text-xl font-black leading-tight prose prose-xl max-w-none">
                           <ReactMarkdown remarkPlugins={[remarkGfm as any]}>{String(item.originalText)}</ReactMarkdown>
                        </div>
                      </div>

                      {(wipState.overallImagePreview || activeCanvas.overallImagePreview) && (
                        <div className="relative">
                          <div className="absolute inset-0 neo-border translate-x-2 translate-y-2 bg-neo-black opacity-10 pointer-events-none"></div>
                          <img 
                            src={wipState.overallImagePreview || activeCanvas.overallImagePreview!} 
                            alt="Entity Visual" 
                            className="relative neo-border w-full object-cover max-h-[400px] grayscale hover:grayscale-0 transition-all" 
                          />
                        </div>
                      )}

                      <div className="pt-6 border-t-4 border-neo-black">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neo-black mb-4 block">ADAPTATION_MATRIX</span>
                        <div className="flex flex-wrap gap-4 mb-8">
                          {platformOptionsForAdaptation.map(p => (
                            <button 
                              key={p} 
                              onClick={() => handleAdaptItem(item, p)}
                              disabled={itemEditingDisabled || isLoadingAdaptation[item.id]?.[p] || isPageLoading}
                              className={`px-4 py-2 neo-border-sm font-black uppercase text-[10px] tracking-[0.2em] transition-all active:translate-x-1 active:translate-y-1 ${isLoadingAdaptation[item.id]?.[p] ? 'bg-neo-accent text-white animate-pulse' : 'bg-neo-muted hover:bg-neo-secondary'}`}
                            >
                              {isLoadingAdaptation[item.id]?.[p] ? 'ADAPTING...' : `FOR_${p}`}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-6">
                          {Object.entries(item.adaptations).map(([platform, adaptation]) => (
                            adaptation && (
                              <div key={platform} className="bg-white neo-border p-6 neo-shadow-sm flex flex-col md:flex-row justify-between items-start gap-6 group">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-3">
                                      <i className={`fab fa-${platform.toLowerCase()} text-neo-accent`}></i>
                                      <span className="text-[10px] font-black uppercase tracking-widest">RESULT:{platform}</span>
                                    </div>
                                    <div className="font-bold text-neo-black leading-relaxed prose max-w-none">
                                      <ReactMarkdown remarkPlugins={[remarkGfm as any]}>{String(adaptation.text)}</ReactMarkdown>
                                    </div>
                                </div>
                                <button 
                                  onClick={() => handleOpenPreview(platform as SocialPlatform, adaptation.text, wipState.overallImagePreview || activeCanvas.overallImagePreview || null)}
                                  className="neo-border-sm bg-neo-black text-white px-4 py-2 font-black text-[10px] uppercase tracking-widest hover:bg-neo-accent transition-colors"
                                >
                                  PREVIEW
                                </button>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {(activeCanvas.status === CanvasStatus.DRAFT || (activeCanvas.status === CanvasStatus.NEEDS_REVISION && currentUser?.id === activeCanvas.createdBy)) && (
                <div className="pt-12">
                  <Button
                      onClick={handleSubmitCanvasForReview}
                      variant="primary" size="lg" className="w-full !py-8 !text-2xl"
                      isLoading={isSubmittingCanvas}
                      disabled={itemEditingDisabled || isLoadingInitialItems || isPageLoading || isSubmittingCanvas || Object.values(isLoadingAdaptation).some(pL => Object.values(pL).some(s => s))}
                  >
                    DEPLOY TO REVIEW SYSTEM
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <PreviewModal isOpen={isPreviewOpen} onClose={handleClosePreview} title={`VIEW_PORT [PLATFORM:${previewContent?.platform}]`}>
        {previewContent && (
          <SocialPostPreview
            platform={previewContent.platform}
            text={previewContent.text}
            imagePreview={previewContent.imagePreview || wipState.overallImagePreview || activeCanvas?.overallImagePreview || undefined}
            avatar={currentUser?.profilePictureUrl || undefined}
            userName={currentUser?.username || undefined}
            userHandle={currentUser ? `@${currentUser.username.toUpperCase()}` : undefined}
          />
        )}
      </PreviewModal>
    </div>
  );
};

export default GenerationPage;
