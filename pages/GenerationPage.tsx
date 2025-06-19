import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SocialPlatform, CaptionTone, CanvasStatus, InitialIdea, ContentCanvas, CanvasItem } from '../types';
import { AVAILABLE_PLATFORMS, AVAILABLE_TONES } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { createCanvas as createCanvasService, updateCanvasStatus, addOrUpdateCanvasItemAdaptation, updateCanvasItemNotes, getCanvasById, updateCanvas } from '../services/postService';
import { useAI } from '../contexts/AIContext';
import ControlsPanel from '../components/generation/ControlsPanel';
import Alert from '../components/ui/Alert';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

// ++ 1. NEW COMPONENT: A generic modal for the preview ++
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
      className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-lg m-4"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <Button onClick={onClose} variant="secondary" size="sm" aria-label="Close modal">
            <i className="fas fa-times"></i>
          </Button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

// ++ 2. NEW COMPONENT: The UI for the social media post preview ++
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
  avatar = "https://placehold.co/48x48/3b82f6/ffffff?text=B" // Blue placeholder with white text
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
            <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap mb-4">{text}</p>
            {imagePreview && (
                <img src={imagePreview} alt="Post media" className="rounded-lg border border-slate-200 dark:border-slate-700 w-full object-cover max-h-80" />
            )}
            <div className="flex justify-around items-center pt-4 mt-4 border-t border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                <div className="flex items-center space-x-2 cursor-pointer hover:text-primary-500">
                    <i className="far fa-heart"></i>
                    <span>Like</span>
                </div>
                <div className="flex items-center space-x-2 cursor-pointer hover:text-primary-500">
                    <i className="far fa-comment"></i>
                    <span>Comment</span>
                </div>
                <div className="flex items-center space-x-2 cursor-pointer hover:text-primary-500">
                    <i className="far fa-share-square"></i>
                    <span>Share</span>
                </div>
            </div>
        </div>
    );
};

const GenerationPage: React.FC = () => {
  const {
    modelLoaded,
    modelProgress,
    isLoadingInitialItems,
    isLoadingAdaptation,
    isLoadingPromptSuggestion,
    error: webLLMError,
    rawAIResponse,
    requestType,
    suggestAIPrompt,
    generateInitialCanvasItems,
    adaptCanvasItem,
    suggestPromptForCanvasTitle,
    setError: setWebLLMError
  } = useAI();
  const { currentUser } = useAuth();

  // Control panel states for overall canvas settings
  const [canvasTitle, setCanvasTitle] = useState('');
  const [overallImageFile, setOverallImageFile] = useState<File | null>(null);
  const [overallImagePreview, setOverallImagePreview] = useState<string | null>(null);
  const [overallTextFile, setOverallTextFile] = useState<File | null>(null);
  const [overallTextFileContent, setOverallTextFileContent] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [platformContext, setPlatformContext] = useState<SocialPlatform>(SocialPlatform.General);
  const [tone, setTone] = useState<CaptionTone>(CaptionTone.Friendly);
  const [numberOfIdeas, setNumberOfIdeas] = useState(3);

  const [parsedRawItems, setParsedRawItems] = useState<string[] | null>(null);

  // Active Content Canvas state
  const [activeCanvas, setActiveCanvas] = useState<ContentCanvas | null>(null);

  const [systemNotification, setSystemNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const rawOutputRef = useRef<HTMLDivElement>(null);

    // ++ MODIFIED: The preview content state now also holds the image to display ++
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<{ platform: SocialPlatform; text: string; imagePreview: string | null } | null>(null);
  
  useEffect(() => {
    if (rawAIResponse && rawOutputRef.current) {
      rawOutputRef.current.scrollTop = rawOutputRef.current.scrollHeight;
    }
  }, [rawAIResponse]);

  // This effect correctly injects the AI suggestion into the customPrompt state ONCE.
  useEffect(() => {
    if (suggestAIPrompt) {
      setCustomPrompt(suggestAIPrompt);
    }
  }, [suggestAIPrompt]);

  // ++ NEW EFFECT: Parse the raw AI response when it arrives
  useEffect(() => {
    if (rawAIResponse && requestType === 'initialCanvasItems') {
      try {
        const startIndex = rawAIResponse.indexOf('[');
        const endIndex = rawAIResponse.lastIndexOf(']');
        if (startIndex !== -1 && endIndex !== -1) {
          const jsonString = rawAIResponse.substring(startIndex, endIndex + 1);
          const items = JSON.parse(jsonString);
          if (Array.isArray(items) && items.every(item => typeof item === 'string')) {
            setParsedRawItems(items);
            return; // Successfully parsed, exit
          }
        }
      } catch (e) {
        console.error("Failed to parse raw AI response as JSON array:", e);
      }
    }
    // If parsing fails or conditions aren't met, reset the parsed items
    setParsedRawItems(null);
  }, [rawAIResponse, requestType]);

  // This function now generates the ideas but doesn't automatically create the canvas.
  // It populates the raw output box, allowing the user to pick which ideas to turn into cards.
  const handleGenerateIdeas = useCallback(async () => {
    if (!currentUser) {
      setWebLLMError("User not logged in.");
      return;
    }
    if (!customPrompt.trim()) {
      setSystemNotification({ type: 'error', message: "A prompt is required to generate ideas." });
      return;
    }
    setSystemNotification(null);
    // We don't nullify the active canvas anymore, allowing users to add to it.
    // setActiveCanvas(null); 

    try {
      // This will trigger the AI and the result will be caught by the `rawAIResponse` state update
      await generateInitialCanvasItems({
        customPrompt, textFileContent: overallTextFileContent, platform: platformContext, tone, numberOfIdeas
      });
    } catch (err: any) {
      setWebLLMError(err.message || "An unknown error occurred during idea generation.");
    }
  }, [currentUser, generateInitialCanvasItems, customPrompt, overallTextFileContent, platformContext, tone, numberOfIdeas, setWebLLMError]);


  const handleGenerateCardFromRaw = useCallback(async (itemText: string) => {
    if (!currentUser) {
        setSystemNotification({ type: 'error', message: "You must be logged in." });
        return;
    }

    const newItem: CanvasItem = {
        id: `item-${Date.now()}-${Math.random()}`,
        originalText: itemText,
        adaptations: {},
        baseTone: tone,
        basePlatformContext: platformContext,
    };

    let updatedCanvas: ContentCanvas;

    if (activeCanvas) {
        updatedCanvas = { ...activeCanvas, items: [...activeCanvas.items, newItem], overallImagePreview: overallImagePreview,};
        // ++ FIX: await the updateCanvas function ++
        await updateCanvas(updatedCanvas);
    } else {
        // ++ FIX: await the createCanvasService function ++
        updatedCanvas = await createCanvasService({
            title: canvasTitle.trim() || `Canvas - ${new Date().toLocaleDateString()}`,
            overallCustomPrompt: customPrompt,
            overallTone: tone,
            overallPlatformContext: platformContext,
            overallImagePreview: overallImagePreview,
            overallTextFileContent: overallTextFileContent,
            createdBy: currentUser.id,
        }, [newItem]);
    }
    
    setActiveCanvas(updatedCanvas);
    setSystemNotification({ type: 'success', message: `Card added to canvas "${updatedCanvas.title}".` });

  }, [activeCanvas, currentUser, canvasTitle, customPrompt, tone, platformContext, overallImagePreview, overallTextFileContent]);


  const handleOverallImageUpload = useCallback((file: File | null) => {
    setOverallImageFile(file);
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => setOverallImagePreview(reader.result as string);
        reader.readAsDataURL(file);
    } else {
        setOverallImagePreview(null);
    }
  }, []);

  const handleOverallTextFileUpload = useCallback((file: File | null) => {
    setOverallTextFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setOverallTextFileContent(reader.result as string);
      reader.readAsText(file);
    } else {
      setOverallTextFileContent(null);
    }
  }, []);

  const handleCreateNewCanvas = useCallback(async () => {
    if (!currentUser) {
      setWebLLMError("User not logged in.");
      return;
    }
    // Simplified check: Now we only need to check the single source of truth, `customPrompt`.
    if (!customPrompt.trim()) {
      setSystemNotification({ type: 'error', message: "A prompt is required to generate ideas." });
      return;
    }
    setSystemNotification(null);
    setActiveCanvas(null);

    try {
      const generatedTexts = await generateInitialCanvasItems({
        customPrompt, textFileContent: overallTextFileContent, platform: platformContext, tone, numberOfIdeas
      });

      if (generatedTexts && generatedTexts.length > 0) {
        const initialItems: CanvasItem[] = generatedTexts.map((text, idx) => ({
          id: `item-${Date.now()}-${idx}`,
          originalText: text,
          adaptations: {},
          baseTone: tone,
          basePlatformContext: platformContext,
        }));

        const newCanvas = await createCanvasService({
          title: canvasTitle.trim() || `Canvas - ${new Date().toLocaleDateString()}`,
          overallCustomPrompt: customPrompt,
          overallTone: tone,
          overallPlatformContext: platformContext,
          overallImagePreview: overallImagePreview,
          overallTextFileContent: overallTextFileContent,
          createdBy: currentUser.id,
        }, initialItems);
        setActiveCanvas(newCanvas);
        setSystemNotification({ type: 'success', message: `New canvas "${newCanvas.title}" created with ${initialItems.length} item(s).` });
      } else {
        if (!rawAIResponse) {
          setWebLLMError("No ideas were generated, and no raw response captured.");
        } else {
           console.warn("Item texts array is empty, but raw AI response is available.");
           setSystemNotification({type: 'info', message: "AI generated a response, but no distinct items could be parsed. Check raw output."});
        }
      }
    } catch (err: any) {
      setWebLLMError(err.message || "An unknown error occurred during canvas creation.");
    }
  }, [currentUser, generateInitialCanvasItems, customPrompt, overallTextFileContent, platformContext, tone, numberOfIdeas, canvasTitle, overallImagePreview, setWebLLMError, rawAIResponse]);

  // handleAdaptItem, handleItemNotesChange, etc. remain the same...
  const handleAdaptItem = useCallback(async (item: CanvasItem, targetPlatform: SocialPlatform) => {
    if (!currentUser || !activeCanvas) {
      setSystemNotification({ type: 'error', message: 'User or canvas not available.' });
      return;
    }
    try {
      const adaptedText = await adaptCanvasItem({
        itemId: item.id,
        originalText: item.originalText,
        targetPlatform,
        baseTone: item.baseTone,
        customPrompt: activeCanvas.overallCustomPrompt,
        textFileContent: activeCanvas.overallTextFileContent ?? null
      });

      // ++ FIX: await the addOrUpdateCanvasItemAdaptation function ++
      const updatedCanvas = await addOrUpdateCanvasItemAdaptation(activeCanvas.id, item.id, targetPlatform, adaptedText);
      if (updatedCanvas) setActiveCanvas(updatedCanvas);

    } catch (err: any) {
      setSystemNotification({ type: 'error', message: `Failed to adapt item: ${err.message}` });
    }
  }, [currentUser, activeCanvas, adaptCanvasItem]);

  const handleItemNotesChange = useCallback(async (itemId: string, notes: string) => {
    if (!activeCanvas) return;
    // ++ FIX: await the updateCanvasItemNotes function ++
    const updatedCanvas = await updateCanvasItemNotes(activeCanvas.id, itemId, notes);
    if (updatedCanvas) setActiveCanvas(updatedCanvas);
  }, [activeCanvas]);

  const handleSubmitCanvasForReview = useCallback(async () => {
    if (!activeCanvas || !currentUser) return;
    // ++ FIX: await the updateCanvasStatus function ++
    const updated = await updateCanvasStatus(activeCanvas.id, CanvasStatus.PENDING_REVIEW, currentUser.id);
    if (updated) {
      setActiveCanvas(updated);
      setSystemNotification({ type: 'success', message: `Canvas "${updated.title}" submitted for review.` });
    } else {
      setSystemNotification({ type: 'error', message: "Failed to submit canvas for review." });
    }
  }, [activeCanvas, currentUser]);


  const handleSuggestPrompt = useCallback(async () => {
    if (!canvasTitle.trim()) {
      setSystemNotification({ type: 'error', message: "Please enter a Canvas Title to get suggestions." });
      return;
    }
    try {
      // The `suggestPromptForCanvasTitle` function will trigger the `useEffect` to update the prompt
      await suggestPromptForCanvasTitle(canvasTitle);
      setSystemNotification({ type: 'success', message: "AI prompt suggestion applied!" });

    } catch (err: any) {
      setWebLLMError(err.message || "Failed to get prompt suggestion.");
      setSystemNotification({ type: 'error', message: err.message || "Failed to get prompt suggestion." });
    }
  }, [canvasTitle, suggestPromptForCanvasTitle, setWebLLMError]);

 // ++ 4. NEW HANDLERS: To open and close the preview modal ++
  const handleOpenPreview = (platform: SocialPlatform, text: string, image: string | null) => {
    setPreviewContent({ platform, text, imagePreview: image });
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewContent(null);
  };
  
  const platformOptionsForAdaptation = AVAILABLE_PLATFORMS.filter(p => p !== SocialPlatform.General);

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-100">Content Canvas Workspace</h1>

      {webLLMError && <Alert type="error" message={webLLMError} onClose={() => setWebLLMError(null)} />}
      {systemNotification && <Alert type={systemNotification.type} message={systemNotification.message} onClose={() => setSystemNotification(null)} />}

       {/* ++ UPDATED RAW OUTPUT SECTION ++ */}
      {modelLoaded && (
         <Card title="AI Generated Ideas" className="mb-6">
           <div ref={rawOutputRef} className="text-sm text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 p-4 rounded-md overflow-auto max-h-72 min-h-[5rem]" aria-live="polite">
             {isLoadingInitialItems ? (
                <p className="italic text-slate-500 dark:text-slate-400">Waiting for AI response...</p>
             ) : parsedRawItems ? (
                <ul className="space-y-4">
                  {parsedRawItems.map((item, index) => (
                    <li key={index} className="flex items-start justify-between gap-4 p-3 bg-slate-200 dark:bg-slate-700 rounded">
                      <p className="flex-1 whitespace-pre-wrap">{item}</p>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => handleGenerateCardFromRaw(item)}
                      >
                        Generate Card
                      </Button>
                    </li>
                  ))}
                </ul>
             ) : (
                <p className="italic text-slate-500 dark:text-slate-400">
                    {rawAIResponse ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{rawAIResponse}</ReactMarkdown> : "Use the controls to generate creative ideas."}
                </p>
             )}
           </div>
         </Card>
      )}

      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4">
          {/* Note the change from onCreateNewCanvas to onGenerateIdeas */}
          <ControlsPanel
            onImageUpload={handleOverallImageUpload}
            imagePreview={overallImagePreview}
            imageFile={overallImageFile}
            onTextFileUpload={handleOverallTextFileUpload}
            textFile={overallTextFile}
            customPrompt={customPrompt} 
            onCustomPromptChange={setCustomPrompt}
            platformContext={platformContext}
            onPlatformContextChange={setPlatformContext}
            availablePlatforms={Object.values(SocialPlatform).filter(p => p !== SocialPlatform.Twitter)}
            tone={tone}
            onToneChange={setTone}
            availableTones={AVAILABLE_TONES}
            numberOfIdeas={numberOfIdeas}
            onNumberOfIdeasChange={setNumberOfIdeas}
            onGenerateIdeas={handleGenerateIdeas} // Changed prop name for clarity
            isGenerating={isLoadingInitialItems} // Changed prop name for clarity
            isModelReady={modelLoaded}
            canvasTitle={canvasTitle}
            onCanvasTitleChange={setCanvasTitle}
            onSuggestPrompt={handleSuggestPrompt}
            isSuggestingPrompt={isLoadingPromptSuggestion}
          />
        </div>
        <div className="lg:col-span-8">
            {/* The rest of your JSX remains unchanged */}
            {!activeCanvas && modelLoaded && !isLoadingInitialItems && (
              <Card className="h-96 flex justify-center items-center">
                <div className="text-center">
                  <i className="fas fa-edit text-6xl text-primary-400 mb-6"></i>
                  <h2 className="text-2xl font-semibold">Start a New Content Canvas</h2>
                  <p className="mt-2 text-slate-500">Use the controls on the left to set up your canvas and generate initial creative items.</p>
                </div>
              </Card>
            )}
            {activeCanvas && (
              <Card title={`Working on Canvas: "${activeCanvas.title}" (Status: ${activeCanvas.status.replace('_', ' ')})`}>
                {activeCanvas.status === CanvasStatus.NEEDS_REVISION && activeCanvas.adminFeedback && (
                  <Alert type="warning" message={`Admin Feedback: ${activeCanvas.adminFeedback}`} className="mb-4"/>
                )}
                <div className="space-y-6">
                  {activeCanvas.items.map((item, index) => (
                    <Card key={item.id} title={`Item ${index + 1}: ${item.originalText.substring(0,60)}...`}
                          className="bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex justify-between items-start mb-3">
                        <p className="flex-1 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                          <strong>Original Idea (Tone: {item.baseTone}, Context: {item.basePlatformContext}):</strong><br/>{item.originalText}
                        </p>
                        {/* ++ FIX: Pass the image from the ACTIVE CANVAS, not the page state ++ */}
                        <Button variant="secondary" size="sm" onClick={() => handleOpenPreview(item.basePlatformContext, item.originalText, activeCanvas.overallImagePreview || null)}>
                            <i className="fas fa-eye mr-2"></i>Preview
                        </Button>
                      </div>
                      
                      {activeCanvas.overallImagePreview && (
                        <div className="my-4">
                          <img 
                            src={activeCanvas.overallImagePreview} 
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
                                    disabled={isLoadingAdaptation[item.id]?.[p] || isLoadingInitialItems} >
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
                                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{adaptation.text}</p>
                            </div>
                            {/* ++ MODIFIED: Pass the overall image to the preview handler for adaptations ++ */}
                            <Button variant="secondary" size="sm" onClick={() => handleOpenPreview(platform as SocialPlatform, adaptation.text, overallImagePreview)}>
                                <i className="fas fa-eye"></i>
                            </Button>
                          </div>
                        )
                      ))}
                      
                      {/* The notes Input is unchanged */}
                    </Card>
                  ))}
                </div>
                {(activeCanvas.status === CanvasStatus.DRAFT || activeCanvas.status === CanvasStatus.NEEDS_REVISION) && (
                  <Button
                      onClick={handleSubmitCanvasForReview}
                      variant="primary" size="lg" className="mt-6 w-full"
                      disabled={isLoadingInitialItems || Object.values(isLoadingAdaptation).some(pL => Object.values(pL).some(s => s))}>
                    Submit Canvas for Review
                  </Button>
                )}
                {activeCanvas.status === CanvasStatus.PENDING_REVIEW && (
                  <p className="mt-6 text-center text-blue-600 dark:text-blue-400 font-semibold">This canvas is pending admin review.</p>
                )}
                {activeCanvas.status === CanvasStatus.APPROVED && (
                  <p className="mt-6 text-center text-green-600 dark:text-green-400 font-semibold">This canvas has been approved!</p>
                )}
              </Card>
            )}
        </div>
      </div>
       {/* ++ 7. RENDER THE MODAL ++ */}
      <PreviewModal isOpen={isPreviewOpen} onClose={handleClosePreview} title={`Preview for ${previewContent?.platform}`}>
        {previewContent && (
          <SocialPostPreview
            platform={previewContent.platform}
            text={previewContent.text}
            imagePreview={previewContent.imagePreview} // Use the overall canvas image preview (string) for the preview
          />
        )}
      </PreviewModal>
    </div>
  );
};

export default GenerationPage;