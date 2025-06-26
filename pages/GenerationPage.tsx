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
  if (!isOpen) return null;
  return (
    <div 
      className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-lg m-4"
        onClick={(e) => e.stopPropagation()} 
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 id="preview-modal-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title || "Preview"}</h3>
          <Button onClick={onClose} variant="secondary" size="sm" aria-label="Close modal">
            <i className="fas fa-times"></i>
          </Button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto">
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
  userName = "Your Brand Name",
  userHandle = "@yourhandle",
  avatar = "https://placehold.co/48x48/3b82f6/ffffff?text=B" 
}) => {
    return (
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center mb-3">
                <img src={avatar} alt="User Avatar" className="w-12 h-12 rounded-full mr-4" />
                <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">{userName}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{userHandle}</p>
                </div>
            </div>
            <div className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap mb-4 prose prose-sm dark:prose-invert max-w-none break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm as any]}>{String(text)}</ReactMarkdown>
            </div>
            {imagePreview && (
                <img src={imagePreview} alt="Post media" className="rounded-lg border border-slate-200 dark:border-slate-700 w-full object-cover max-h-80" />
            )}
            <div className="flex justify-around items-center pt-4 mt-4 border-t border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                <button className="flex items-center space-x-2 cursor-pointer hover:text-primary-500">
                    <i className="far fa-heart"></i>
                    <span>Like</span>
                </button>
                <button className="flex items-center space-x-2 cursor-pointer hover:text-primary-500">
                    <i className="far fa-comment"></i>
                    <span>Comment</span>
                </button>
                <button className="flex items-center space-x-2 cursor-pointer hover:text-primary-500">
                    <i className="far fa-share-square"></i>
                    <span>Share</span>
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
    isLoadingCanvases // From CanvasContext
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

  const [activeCanvas, setActiveCanvas] = useState<ContentCanvas | null>(null);
  const [systemNotification, setSystemNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const rawOutputRef = useRef<HTMLDivElement>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<{ platform: SocialPlatform; text: string; imagePreview: string | null } | null>(null);

  const [isPageLoading, setIsPageLoading] = useState(false); // General page operations like loading/saving canvas
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


  const handleStartOver = useCallback(() => {
    setActiveCanvas(null); 
    clearWIPState(); 
    setSystemNotification(null);
    setWebLLMError(null);
    navigate('/generate', { replace: true });
  }, [navigate, clearWIPState, setWebLLMError]);

  // Effect for loading canvas or initializing WIP based on URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const canvasIdFromUrl = params.get('canvasId');
    
    const loadData = async () => {
        setIsPageLoading(true);
        if (canvasIdFromUrl) {
            if (!activeCanvas || activeCanvas.id !== canvasIdFromUrl) {
                try {
                    const canvasToLoad = await getCanvasById(canvasIdFromUrl);
                    if (canvasToLoad) {
                        setActiveCanvas(canvasToLoad);
                        initializeWIPFromCanvas(canvasToLoad); // Initialize WIP from loaded canvas (including its wipStateSnapshot)
                        setSystemNotification({ type: 'info', message: `Loaded canvas: "${canvasToLoad.title || 'Untitled'}".` });
                    } else {
                        setSystemNotification({ type: 'error', message: `Canvas with ID "${canvasIdFromUrl}" not found. Starting fresh.` });
                        handleStartOver();
                    }
                } catch (error) {
                    console.error("Error loading canvas:", error);
                    setSystemNotification({ type: 'error', message: "Failed to load canvas." });
                    handleStartOver();
                }
            }
        } else { // No canvasId in URL
            // If there was an active canvas, clear it. Then init WIP for a new canvas.
            if(activeCanvas) setActiveCanvas(null);
            initializeWIPFromCanvas(null); // Initialize WIP for a new canvas (no snapshot)
        }
        setIsPageLoading(false);
    };
    loadData();
  }, [location.search, getCanvasById, initializeWIPFromCanvas, handleStartOver]); // activeCanvas removed to prevent re-triggering just on its change


  useEffect(() => {
    if (rawAIResponse && rawOutputRef.current) {
      rawOutputRef.current.scrollTop = rawOutputRef.current.scrollHeight;
    }
  }, [rawAIResponse]);
  

  const handleGenerateIdeas = useCallback(async () => {
    if (!currentUser) { setWebLLMError("User not logged in."); return; }
    if (!customPrompt.trim()) { setSystemNotification({ type: 'error', message: "A prompt is required to generate ideas." }); return; }
    
    setSystemNotification(null);
    setWebLLMError(null);
    setWIPState({ parsedRawItems: null });

    try {
      const generatedTextsArray = await generateInitialCanvasItems({
        customPrompt, textFileContent: overallTextFileContent, platform: platformContext, tone, numberOfIdeas
      });
      setWIPState({ parsedRawItems: generatedTextsArray });
      if (generatedTextsArray.length === 0) {
        setSystemNotification({ type: 'info', message: "AI generated a response, but no distinct items could be parsed." });
      } else {
        setSystemNotification({ type: 'success', message: `${generatedTextsArray.length} new ideas generated. Add them as cards.` });
      }
    } catch (err: unknown) {
      setWebLLMError(err instanceof Error ? err.message : String(err));
      setWIPState({ parsedRawItems: null });
    }
  }, [currentUser, generateInitialCanvasItems, customPrompt, overallTextFileContent, platformContext, tone, numberOfIdeas, setWebLLMError, setWIPState, setSystemNotification]);


  const handleGenerateCardFromRaw = useCallback(async (itemText: string) => {
    if (!currentUser) { setSystemNotification({ type: 'error', message: "You must be logged in." }); return; }
    setIsPageLoading(true);
    
    const newItem: CanvasItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalText: itemText,
        adaptations: {},
        baseTone: tone, 
        basePlatformContext: platformContext,
    }
    
    const currentWipSnapshot = getWIPScreenshotForSave();
    const currentCanvasTitleResolved = canvasTitle.trim() || (activeCanvas?.title) || `Canvas - ${new Date().toLocaleDateString()}`;

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
            setSystemNotification({ type: 'success', message: `Item added to canvas "${finalCanvas.title}".` });
            if(!activeCanvas && finalCanvas) navigate(`/generate?canvasId=${finalCanvas.id}`, {replace: true}); // Navigate to new canvas URL
        } else {
             setSystemNotification({ type: 'error', message: 'Failed to create or update canvas.'});
        }
    } catch (err: any) {
        setSystemNotification({ type: 'error', message: err.message || 'Error processing card.'});
    } finally {
        setIsPageLoading(false);
    }
  }, [
    activeCanvas, currentUser, canvasTitle, customPrompt, tone, platformContext, 
    overallImagePreview, overallTextFileContent, getWIPScreenshotForSave,
    createCanvasInContext, updateCanvasInContext, setWIPState, setSystemNotification, navigate
  ]);
  
  const handleAdaptItem = useCallback(async (item: CanvasItem, targetPlatform: SocialPlatform) => {
    if (!currentUser || !activeCanvas) { setSystemNotification({ type: 'error', message: 'User or canvas not available.' }); return; }
    // No need for setIsPageLoading(true) here as adaptCanvasItem has its own loading state (isLoadingAdaptation)
    try {
      const promptForAdapt = wipState.customPrompt || activeCanvas.overallCustomPrompt;
      const textFileForAdapt = wipState.overallTextFileContent || activeCanvas.overallTextFileContent;

      const adaptedText = await adaptCanvasItem({
        itemId: item.id, originalText: item.originalText, targetPlatform,
        baseTone: item.baseTone, customPrompt: promptForAdapt,
        textFileContent: textFileForAdapt ?? null
      });
      const updatedCanvas = await addOrUpdateAdaptationInContext(activeCanvas.id, item.id, targetPlatform, adaptedText);
      if (updatedCanvas){
        setActiveCanvas(updatedCanvas);
        // window.location.reload(); // Reload to ensure WIP state is in sync with updated canvas
      }
      else setSystemNotification({ type: 'error', message: `Failed to save adaptation.` }); 
    } catch (err: unknown) { 
      setSystemNotification({ type: 'error', message: `Failed to adapt item: ${err instanceof Error ? err.message : String(err)}` }); 
    }
  }, [currentUser, activeCanvas, adaptCanvasItem, addOrUpdateAdaptationInContext, wipState, setSystemNotification]);

  const handleItemNotesChange = useCallback(async (itemId: string, notes: string) => {
    if (!activeCanvas) return;
    // No full page loader, assume quick operation
    try {
        const updatedCanvas = await updateItemNotesInContext(activeCanvas.id, itemId, notes);
        if (updatedCanvas) setActiveCanvas(updatedCanvas);
        else setSystemNotification({ type: 'error', message: 'Failed to update item notes.' });
    } catch(err: any) {
         setSystemNotification({ type: 'error', message: `Error updating notes: ${err.message}` });
    }
  }, [activeCanvas, updateItemNotesInContext, setSystemNotification]);

  const handleSubmitCanvasForReview = useCallback(async () => {
    if (!activeCanvas || !currentUser) return;
    setIsSubmittingCanvas(true);

    const currentWipSnapshot = getWIPScreenshotForSave();
    const canvasToSubmit: ContentCanvas = {
        ...activeCanvas,
        title: canvasTitle.trim() || activeCanvas.title || `Canvas - ${new Date().toLocaleDateString()}`,
        overallCustomPrompt: customPrompt,
        overallTone: tone,
        overallPlatformContext: platformContext,
        overallImagePreview: overallImagePreview,
        overallTextFileContent: overallTextFileContent,
        wipStateSnapshot: currentWipSnapshot, // Save current WIP with the canvas
    };

    console.log(canvasToSubmit);

    try {
        const savedCanvas = await updateCanvasInContext(canvasToSubmit);
        if (!savedCanvas) { 
            setSystemNotification({ type: 'error', message: "Failed to save canvas changes before submitting." }); 
            setIsSubmittingCanvas(false);
            return; 
        }

        const updatedStatusCanvas = await updateCanvasStatusInContext(savedCanvas.id, CanvasStatus.PENDING_REVIEW, currentUser.id);
        console.log(updatedStatusCanvas);
        
        if (updatedStatusCanvas) {
          setActiveCanvas(updatedStatusCanvas);
          initializeWIPFromCanvas(updatedStatusCanvas); // Re-initialize WIP from the submitted canvas state
          setSystemNotification({ type: 'success', message: `Canvas "${updatedStatusCanvas.title}" submitted for review.` });
        } else {
          setActiveCanvas(savedCanvas); // Revert to saved state if status update failed
          setSystemNotification({ type: 'error', message: "Failed to submit canvas for review." });
        }
    } catch (err: any) {
        setSystemNotification({ type: 'error', message: `Error submitting canvas: ${err.message}`});
    } finally {
        setIsSubmittingCanvas(false);
    }
  }, [
      activeCanvas, currentUser, canvasTitle, customPrompt, tone, platformContext, overallImagePreview, overallTextFileContent,
      updateCanvasInContext, updateCanvasStatusInContext, initializeWIPFromCanvas, getWIPScreenshotForSave, setSystemNotification
    ]);

  const handleSuggestPrompt = useCallback(async () => {
    if (!canvasTitle.trim()) { setSystemNotification({ type: 'error', message: "Please enter a Canvas Title to get suggestions." }); return; }
    try {
      const suggestedPromptText = await suggestPromptForCanvasTitle(canvasTitle);
      setWIPState({ customPrompt: suggestedPromptText });
      setSystemNotification({ type: 'success', message: "AI prompt suggestion applied!" });
    } catch (errorCaught: unknown) {
        setWebLLMError(errorCaught instanceof Error ? errorCaught.message : String(errorCaught));
    }
  }, [canvasTitle, suggestPromptForCanvasTitle, setWIPState, setWebLLMError, setSystemNotification]);

  const handleOpenPreview = (platformValue: SocialPlatform, textValue: string, image: string | null) => {
    setPreviewContent({ platform: platformValue, text: textValue, imagePreview: image });
    setIsPreviewOpen(true);
  };
  const handleClosePreview = () => { setIsPreviewOpen(false); setPreviewContent(null); };

  const handleRemoveItem = useCallback(async (itemIdToRemove: string) => {
    if (!activeCanvas) { setSystemNotification({ type: 'error', message: "Cannot remove item: No active canvas." }); return; }
    setIsPageLoading(true);
    try {
        const updatedItems = activeCanvas.items.filter(item => item.id !== itemIdToRemove);
        const updatedCanvasData = { ...activeCanvas, items: updatedItems };
        
        const savedCanvas = await updateCanvasInContext(updatedCanvasData);
        if(savedCanvas) {
            setActiveCanvas(savedCanvas);
            setSystemNotification({ type: 'success', message: 'Item removed successfully.' });
        } else {
            setSystemNotification({ type: 'error', message: 'Failed to save canvas after item removal.' });
        }
    } catch (err: any) {
         setSystemNotification({ type: 'error', message: `Error removing item: ${err.message}`});
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

  if (isPageLoading && !activeCanvas) { // Full page loader for initial canvas load or clearing
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-slate-600 dark:text-slate-300">Loading Canvas Workspace...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Content Canvas Workspace</h1>
        {(activeCanvas || wipState.canvasTitle || wipState.customPrompt || wipState.parsedRawItems) && (
          <Button onClick={handleStartOver} variant="danger" size="sm" disabled={isPageLoading || isSubmittingCanvas}>
            <i className="fas fa-times-circle mr-2"></i>Clear Canvas & Start New
          </Button>
        )}
      </div>

      {webLLMError && <Alert type="error" message={webLLMError} onClose={() => setWebLLMError(null)} />}
      {systemNotification && <Alert type={systemNotification.type} message={systemNotification.message} onClose={() => setSystemNotification(null)} />}
      
      {creativeModelLoaded && (!activeCanvas || (activeCanvas && (activeCanvas.status === CanvasStatus.DRAFT || (activeCanvas.status === CanvasStatus.NEEDS_REVISION && currentUser?.id === activeCanvas.createdBy)))) && (
         <Card title="AI Generated Ideas" className="mb-6">
           <div ref={rawOutputRef} className="text-sm text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 p-4 rounded-md overflow-auto max-h-72 min-h-[5rem]" aria-live="polite">
             {isLoadingInitialItems ? (
                <div className="flex items-center justify-center py-4"> <LoadingSpinner size="md" /><p className="ml-3 italic">AI is thinking...</p></div>
             ) : parsedRawItems && parsedRawItems.length > 0 ? (
                <ul className="space-y-4">
                  {parsedRawItems.map((item, index) => (
                    <li key={index} className="flex items-start justify-between gap-4 p-3 bg-slate-200 dark:bg-slate-700 rounded shadow-sm">
                      <p className="flex-1 whitespace-pre-wrap">{item}</p>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => handleGenerateCardFromRaw(item)}
                        disabled={controlsGloballyDisabled || itemEditingDisabled || isPageLoading}
                        isLoading={isPageLoading}
                        title={ (controlsGloballyDisabled || itemEditingDisabled) ? "Canvas is not editable in current state" : "Add this idea as a card to the canvas"}
                      >
                        <i className="fas fa-plus-circle mr-1"></i> Add Card
                      </Button>
                    </li>
                  ))}
                </ul>
             ) : rawAIResponse && requestType === 'initialCanvasItems' && !isLoadingInitialItems ? (
                <p className="italic text-slate-500 dark:text-slate-400">
                  AI response received, but no distinct items could be parsed.
                </p>
             ) : (
                <p className="italic text-slate-500 dark:text-slate-400">
                    Use the controls to generate creative ideas. Results will appear here.
                </p>
             )}
           </div>
           {rawAIResponse && (parsedRawItems === null || parsedRawItems.length === 0) && requestType?.startsWith('initial') && (
             <details className="mt-2 text-xs">
               <summary className="cursor-pointer text-slate-500 dark:text-slate-400 hover:underline">View Raw AI Output</summary>
               <pre className="mt-1 p-2 bg-slate-200 dark:bg-slate-700 rounded text-xs whitespace-pre-wrap max-h-40 overflow-auto">{String(rawAIResponse)}</pre>
             </details>
           )}
         </Card>
      )}

      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4">
          <ControlsPanel
            onImageUpload={handleOverallImageUpload}
            imagePreview={overallImagePreview}
            imageFile={overallImageFile}
            onTextFileUpload={handleOverallTextFileUpload}
            textFile={overallTextFile}
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
        <div className="lg:col-span-8">
            {(isLoadingCanvases || isPageLoading) && !activeCanvas && <div className="h-96 flex justify-center items-center"><LoadingSpinner size="lg"/><p className="ml-2">Loading Canvas...</p></div>} 
            {!activeCanvas && !isPageLoading && !isLoadingCanvases && creativeModelLoaded && (
              <Card className="h-96 flex justify-center items-center">
                <div className="text-center">
                  <i className="fas fa-edit text-6xl text-primary-400 mb-6"></i>
                  <h2 className="text-2xl font-semibold">Start or Load a Content Canvas</h2>
                  <p className="mt-2 text-slate-500">Use controls to start new, or load one via Dashboard.</p>
                </div>
              </Card>
            )}
            {activeCanvas && !isPageLoading && (
              <Card title={`Working on Canvas: "${wipState.canvasTitle || activeCanvas.title || 'Untitled'}"`}
                    titleClassName={activeCanvas.status === CanvasStatus.APPROVED ? 'text-green-600 dark:text-green-400' : activeCanvas.status === CanvasStatus.PENDING_REVIEW ? 'text-yellow-600 dark:text-yellow-400' : activeCanvas.status === CanvasStatus.NEEDS_REVISION ? 'text-orange-600 dark:text-orange-400' : ''}
                    actions={<span className={`px-3 py-1 text-xs font-semibold rounded-full text-white ${activeCanvas.status === CanvasStatus.DRAFT ? 'bg-slate-500' : activeCanvas.status === CanvasStatus.PENDING_REVIEW ? 'bg-yellow-500' : activeCanvas.status === CanvasStatus.NEEDS_REVISION ? 'bg-orange-500' : activeCanvas.status === CanvasStatus.APPROVED ? 'bg-green-500' : 'bg-gray-500'}`}>{activeCanvas.status?.replace('_', ' ').toUpperCase()}</span>}
              >
                {activeCanvas.status === CanvasStatus.NEEDS_REVISION && activeCanvas.adminFeedback && (
                  <Alert type="warning" message={`Admin Feedback: ${activeCanvas.adminFeedback}`} className="mb-4"/>
                )}
                <div className="space-y-6">
                  {activeCanvas.items.map((item, index) => (
                    <Card key={item.id} title={`Item ${index + 1}: ${item.originalText.substring(0,60)}...`}
                          className="bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                          <strong>Original Idea (Tone: {item.baseTone}, Context: {item.basePlatformContext}):</strong><br/>
                          <ReactMarkdown remarkPlugins={[remarkGfm as any]}>{String(item.originalText)}</ReactMarkdown>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => handleOpenPreview(item.basePlatformContext, item.originalText, wipState.overallImagePreview || activeCanvas.overallImagePreview || null)}
                          aria-label="Preview item"
                          disabled={isPageLoading}
                        >
                          <i className="fas fa-eye"></i>
                        </Button>
                        {!itemEditingDisabled && (
                          <Button 
                            variant="danger" 
                            size="sm" 
                            onClick={() => handleRemoveItem(item.id)}
                            aria-label="Remove item"
                            disabled={itemEditingDisabled || isPageLoading}
                            isLoading={isPageLoading}
                          >
                            <i className="fas fa-trash-alt"></i>
                          </Button>
                        )}
                      </div>
                      </div>
                      
                      {(wipState.overallImagePreview || activeCanvas.overallImagePreview) && (
                        <div className="my-4">
                          <img 
                            src={wipState.overallImagePreview || activeCanvas.overallImagePreview!} 
                            alt="Canvas content" 
                            className="rounded-lg w-full object-cover max-h-60 border border-slate-200 dark:border-slate-700" 
                          />
                        </div>
                      )}

                      <div className="my-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Adapt Item for Platform:</h4>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {platformOptionsForAdaptation.map(p => (
                            <Button key={p} onClick={() => handleAdaptItem(item, p)}
                                    variant="secondary" size="sm"
                                    isLoading={isLoadingAdaptation[item.id]?.[p]}
                                    disabled={itemEditingDisabled || isLoadingAdaptation[item.id]?.[p] || isPageLoading} >
                              {isLoadingAdaptation[item.id]?.[p] ? `Adapting...` : `Adapt for ${p}`}
                            </Button>
                          ))}
                        </div>
                      </div>
                      
                      {Object.entries(item.adaptations).map(([platform, adaptation]) => (
                        adaptation && (
                          <div key={platform} className="p-3 bg-white dark:bg-slate-700 rounded shadow-sm mb-2 flex justify-between items-start gap-2">
                            <div>
                                <p className="text-xs font-semibold text-primary-600 dark:text-primary-400">Adapted for {platform}:</p>
                                <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none break-words">
                                  <ReactMarkdown remarkPlugins={[remarkGfm as any]}>{String(adaptation.text)}</ReactMarkdown>
                                </div>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => handleOpenPreview(platform as SocialPlatform, adaptation.text, wipState.overallImagePreview || activeCanvas.overallImagePreview || null)} disabled={isPageLoading}>
                                <i className="fas fa-eye"></i>
                            </Button>
                          </div>
                        )
                      ))}
                      
                       {/* <Input
                          label="Notes for Admin (optional)"
                          id={`notes-${item.id}`}
                          type="textarea"
                          rows={2}
                          value={item.notesForAdmin || ''}
                          onChange={(e) => handleItemNotesChange(item.id, e.target.value)}
                          placeholder="Add notes for this specific item..."
                          className="mt-3 text-sm"
                          // disabled={itemEditingDisabled || isPageLoading}
                        /> */}
                    </Card>
                  ))}
                </div>
                {(activeCanvas.status === CanvasStatus.DRAFT || (activeCanvas.status === CanvasStatus.NEEDS_REVISION && currentUser?.id === activeCanvas.createdBy)) && (
                  <Button
                      onClick={handleSubmitCanvasForReview}
                      variant="primary" size="lg" className="mt-6 w-full"
                      isLoading={isSubmittingCanvas}
                      disabled={itemEditingDisabled || isLoadingInitialItems || isPageLoading || isSubmittingCanvas || Object.values(isLoadingAdaptation).some(pL => Object.values(pL).some(s => s))}>
                    Submit Canvas for Review
                  </Button>
                )}
                {activeCanvas.status === CanvasStatus.PENDING_REVIEW && (
                  <p className="mt-6 text-center text-yellow-600 dark:text-yellow-400 font-semibold">This canvas is pending admin review.</p>
                )}
                {activeCanvas.status === CanvasStatus.APPROVED && (
                  <p className="mt-6 text-center text-green-600 dark:text-green-400 font-semibold">This canvas has been approved!</p>
                )}
              </Card>
            )}
        </div>
      </div>
      <PreviewModal isOpen={isPreviewOpen} onClose={handleClosePreview} title={`Preview for ${previewContent?.platform}`}>
        {previewContent && (
          <SocialPostPreview
            platform={previewContent.platform}
            text={previewContent.text}
            imagePreview={previewContent.imagePreview || wipState.overallImagePreview || activeCanvas?.overallImagePreview || undefined}
            avatar={currentUser?.profilePictureUrl || undefined}
            userName={currentUser?.username || undefined}
          />
        )}
      </PreviewModal>
    </div>
  );
};

export default GenerationPage;
