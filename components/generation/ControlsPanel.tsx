import React, { useRef } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { SocialPlatform, CaptionTone } from '../../types';
import Card from '../ui/Card';

interface ControlsPanelProps {
  onSelectFolder: () => void;
  onNumberOfGenerationsChange: (value: number) => void;
  wipState: any; // Using any for brevity here, should ideally be WIPState

  onTextFileUpload: (file: File | null) => void;
  textFile: File | null;

  onImageModeChange: (mode: 'generate' | 'upload') => void;
  onImageUpload: (file: File | null) => void;
  imageFile: File | null;
  
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
  platformContext: SocialPlatform; 
  onPlatformContextChange: (value: SocialPlatform) => void; 
  availablePlatforms: SocialPlatform[];
  tone: CaptionTone;
  onToneChange: (value: CaptionTone) => void;
  availableTones: CaptionTone[];
  numberOfIdeas: number; 
  onNumberOfIdeasChange: (value: number) => void;
  
  onGenerateIdeas: () => void;
  isGenerating: boolean;
  isModelReady: boolean;
  canvasTitle: string; 
  onCanvasTitleChange: (value: string) => void; 

  onSuggestPrompt: () => void; 
  isSuggestingPrompt: boolean; 
  controlsGloballyDisabled: boolean;
}

const ControlsPanel: React.FC<ControlsPanelProps> = ({
  onSelectFolder, onNumberOfGenerationsChange, wipState,
  onTextFileUpload, textFile,
  onImageModeChange, onImageUpload, imageFile,
  customPrompt, onCustomPromptChange,
  platformContext, onPlatformContextChange, availablePlatforms,
  tone, onToneChange, availableTones,
  numberOfIdeas, onNumberOfIdeasChange,
  onGenerateIdeas, isGenerating, isModelReady,
  canvasTitle, onCanvasTitleChange,
  onSuggestPrompt, isSuggestingPrompt
}) => {
  const textInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleTextFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onTextFileUpload(e.target.files ? e.target.files[0] : null);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onImageUpload(e.target.files ? e.target.files[0] : null);
  };

  const modelNotReady = !isModelReady;

  return (
    <Card 
      className="sticky top-24 bg-white !p-8 neo-shadow-lg"
      title="ENGINE CONTROLS"
      titleClassName="text-neo-accent"
    >
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>
      
      <div className="space-y-8 relative z-10">
        <Input
          label="Project Identity"
          id="canvasTitle"
          type="text"
          value={canvasTitle}
          onChange={(e) => onCanvasTitleChange(e.target.value)}
          placeholder="ENTER CAMPAIGN TITLE"
          disabled={modelNotReady}
        />

        {/* Visual Strategy Mode Selector */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-neo-black mb-2">Visual Strategy</label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-neo-muted neo-border-sm">
            <button
              type="button"
              onClick={() => onImageModeChange('generate')}
              disabled={modelNotReady}
              className={`py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                wipState.imageMode === 'generate' || !wipState.imageMode
                  ? 'bg-neo-black text-white neo-border-sm translate-x-[-2px] translate-y-[-2px] neo-shadow-sm'
                  : 'text-neo-black hover:bg-white/50'
              }`}
            >
              <i className="fas fa-magic mr-2"></i>
              Generate Image
            </button>
            <button
              type="button"
              onClick={() => onImageModeChange('upload')}
              disabled={modelNotReady}
              className={`py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                wipState.imageMode === 'upload'
                  ? 'bg-neo-black text-white neo-border-sm translate-x-[-2px] translate-y-[-2px] neo-shadow-sm'
                  : 'text-neo-black hover:bg-white/50'
              }`}
            >
              <i className="fas fa-upload mr-2"></i>
              Upload Image
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Conditional Rendering of Generate Mode vs Upload Mode */}
          {(wipState.imageMode === 'generate' || !wipState.imageMode) ? (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-neo-black mb-2">Visual Source Directory</label>
              <div className="flex gap-2">
                <div className="flex-1 neo-border-sm bg-neo-muted p-3 text-[10px] font-bold text-neo-black truncate uppercase tracking-tighter">
                  {wipState.folderPath || 'NO FOLDER SELECTED'}
                </div>
                <button 
                  onClick={onSelectFolder} 
                  disabled={modelNotReady}
                  type="button" 
                  className="neo-border-sm bg-neo-secondary px-4 py-3 flex items-center justify-center gap-3 font-black uppercase text-xs neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all hover:bg-neo-accent hover:text-white"
                >
                  <i className="fas fa-folder-open"></i> 
                  BROWSE
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-neo-black mb-2">Upload Visual Asset</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageFileChange}
                ref={imageInputRef}
                className="hidden"
                disabled={modelNotReady}
                id="imageFileUploadInput"
              />
              <div className="relative group">
                {wipState.overallImagePreview ? (
                  <div className="relative neo-border bg-neo-muted overflow-hidden flex flex-col items-center justify-center p-4 min-h-[140px]">
                    <img 
                      src={wipState.overallImagePreview} 
                      alt="Uploaded preview" 
                      className="max-h-[100px] object-cover neo-border-sm mb-2"
                    />
                    <div className="flex gap-2 w-full">
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="flex-1 py-1.5 bg-white neo-border-sm text-[9px] font-black uppercase tracking-wider text-neo-black hover:bg-neo-secondary transition-colors"
                      >
                        CHANGE IMAGE
                      </button>
                      <button
                        type="button"
                        onClick={() => onImageUpload(null)}
                        className="py-1.5 px-3 bg-neo-accent text-white neo-border-sm text-[9px] font-black uppercase tracking-wider hover:bg-neo-black transition-colors"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => imageInputRef.current?.click()} 
                    disabled={modelNotReady}
                    type="button"
                    className="w-full min-h-[140px] neo-border bg-white p-6 flex flex-col items-center justify-center gap-2 font-black uppercase text-xs neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none hover:bg-neo-secondary/30 transition-all border-dashed"
                  >
                    <i className="fas fa-cloud-upload-alt text-3xl text-neo-black/60 mb-1"></i>
                    <span>CLICK TO SELECT IMAGE</span>
                    <span className="text-[9px] text-neo-black/40 font-bold">SUPPORTS JPG, PNG, WEBP</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className={(wipState.imageMode === 'generate' || !wipState.imageMode) ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"}>
            {(wipState.imageMode === 'generate' || !wipState.imageMode) && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-neo-black mb-2">Gen Count (1-4)</label>
                <Select
                  id="numberOfGenerations"
                  value={wipState.numberOfGenerations}
                  onChange={(e) => onNumberOfGenerationsChange(parseInt(e.target.value))}
                  options={[1, 2, 3, 4].map(n => ({ value: n, label: n.toString() }))}
                  disabled={modelNotReady}
                  wrapperClassName="!mb-0"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-neo-black mb-2">Data Context</label>
              <input 
                type="file" 
                accept=".txt,.md" 
                onChange={handleTextFileChange}
                ref={textInputRef}
                className="hidden"
                disabled={modelNotReady}
                id="textFileUploadInput"
              />
               <button 
                onClick={() => textInputRef.current?.click()} 
                disabled={modelNotReady}
                type="button"
                className="w-full h-[46px] neo-border-sm bg-white p-3 flex items-center justify-center gap-3 font-black uppercase text-xs neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
              >
                <i className="fas fa-file-alt"></i> 
                {textFile ? 'CHANGE DATA' : 'SELECT DATA'}
              </button>
            </div>
          </div>
          {textFile && <div className="text-[10px] font-bold text-neo-accent truncate uppercase tracking-tighter -mt-2">SELECTED: {textFile.name}</div>}
        </div>

        {((wipState.imageMode === 'generate' && wipState.folderPath) || textFile) && (
          <div className="bg-neo-muted p-3 neo-border-sm -rotate-1">
            <div className="flex items-center gap-2 mb-1">
              <i className="fas fa-exclamation-triangle text-neo-accent text-xs"></i>
              <span className="text-[9px] font-black uppercase tracking-widest text-neo-accent">VISION_NOTICE</span>
            </div>
            <p className="text-[10px] font-bold text-neo-black/70 leading-relaxed">
              For the AI to analyze images and PDFs, your local LLM must support <strong>vision/multimodal</strong> capabilities 
              (e.g. LLaVA, Llama 3.2 Vision, Qwen-VL). Text-only models will ignore visual inputs.
            </p>
          </div>
        )}
        
        <div className="relative">
          <Input
            label="System Prompt"
            id="customPrompt"
            type="textarea"
            rows={5}
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder="DEFINE YOUR MISSION..."
            className="!text-sm"
            required
            disabled={modelNotReady}
          />
          <button
            onClick={onSuggestPrompt}
            className="absolute top-0 right-0 bg-neo-secondary px-3 py-1 neo-border-sm text-[10px] font-black uppercase tracking-widest hover:bg-neo-accent hover:text-white transition-colors disabled:opacity-50"
            disabled={modelNotReady || !canvasTitle.trim() || isSuggestingPrompt || isGenerating}
            title={!canvasTitle.trim() ? "IDENTITY REQUIRED" : "AI INSPIRATION"}
            type="button"
          >
           {isSuggestingPrompt ? '...' : <><i className="fas fa-lightbulb mr-1"></i> SUGGEST</>}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Platform"
            id="platformContext"
            value={platformContext}
            onChange={(e) => onPlatformContextChange(e.target.value as SocialPlatform)}
            options={availablePlatforms.map(p => ({ value: p, label: p.toUpperCase() }))}
            disabled={modelNotReady}
            wrapperClassName="!mb-0"
          />

          <Select
            label="Voice Tone"
            id="tone"
            value={tone}
            onChange={(e) => onToneChange(e.target.value as CaptionTone)}
            options={Object.values(CaptionTone).map(t => ({ value: t, label: t.toUpperCase() }))}
            disabled={modelNotReady}
            wrapperClassName="!mb-0"
          />

          <Select
            label="Caption Count"
            id="numberOfIdeas"
            value={numberOfIdeas}
            onChange={(e) => onNumberOfIdeasChange(parseInt(e.target.value))}
            options={[1, 2, 3, 4, 5].map(n => ({ value: n, label: `${n} OPTION${n > 1 ? 'S' : ''}` }))}
            disabled={modelNotReady}
            wrapperClassName="!mb-0"
          />
        </div>
        
        <div className="pt-4">
          <Button 
            onClick={onGenerateIdeas} 
            isLoading={isGenerating || modelNotReady} 
            disabled={isGenerating || modelNotReady || !customPrompt.trim()}
            className="w-full !py-6 !text-lg"
            variant="primary"
            type="button"
          >
            {modelNotReady 
              ? 'BOOTING SYSTEM...' 
              : isGenerating 
                ? 'EXECUTING...' 
                : (wipState.imageMode === 'generate' || !wipState.imageMode) 
                  ? 'GENERATE MISSION' 
                  : 'GENERATE CAPTIONS'
            }
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ControlsPanel;