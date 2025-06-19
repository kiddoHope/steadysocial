import React, { useRef } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { SocialPlatform, CaptionTone } from '../../types';
import Card from '../ui/Card';

interface ControlsPanelProps {
  onImageUpload: (file: File | null) => void;
  imagePreview: string | null;
  imageFile: File | null;
  onTextFileUpload: (file: File | null) => void;
  textFile: File | null;
  
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
}

const ControlsPanel: React.FC<ControlsPanelProps> = ({
  onImageUpload, imagePreview, imageFile,
  onTextFileUpload, textFile,
  customPrompt, onCustomPromptChange,
  platformContext, onPlatformContextChange, availablePlatforms,
  tone, onToneChange, availableTones,
  numberOfIdeas, onNumberOfIdeasChange,
  onGenerateIdeas, isGenerating, isModelReady,
  canvasTitle, onCanvasTitleChange,
  onSuggestPrompt, isSuggestingPrompt
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onImageUpload(e.target.files ? e.target.files[0] : null);
  };

  const handleTextFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onTextFileUpload(e.target.files ? e.target.files[0] : null);
  };

  const modelNotReady = !isModelReady;

  return (
    <Card title="Content Canvas Setup" className="sticky top-20">
      <div className="space-y-4">
        <Input
          label="Canvas Title (Optional)"
          id="canvasTitle"
          type="text"
          value={canvasTitle}
          onChange={(e) => onCanvasTitleChange(e.target.value)}
          placeholder="e.g., Summer Campaign Ideas"
          disabled={modelNotReady}
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Upload Primary Image (Optional)</label>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleImageFileChange}
            ref={imageInputRef}
            className="hidden"
            disabled={modelNotReady}
            id="imageUploadInput"
          />
          <Button 
            onClick={() => imageInputRef.current?.click()} 
            variant="primary" 
            size="sm"
            disabled={modelNotReady}
            type="button" 
            aria-label="Upload primary image"
            className='w-full'
          >
            <i className="fas fa-image mr-2"></i> Choose Image
          </Button>
          {imageFile && <span className="ml-3 text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs inline-block align-middle">{imageFile.name}</span>}
          {/* ++ STYLE FIX: Constrained height for better layout consistency ++ */}
          {imagePreview && <img src={imagePreview} alt="Canvas Preview" className="mt-2 rounded-md max-h-48 w-full object-cover shadow"/>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Upload Primary Text File (Optional)</label>
          <input 
            type="file" 
            accept=".txt,.md" 
            onChange={handleTextFileChange}
            ref={textInputRef}
            className="hidden"
            disabled={modelNotReady}
            id="textFileUploadInput"
          />
           <Button 
            onClick={() => textInputRef.current?.click()} 
            variant="primary" 
            size="sm"
            disabled={modelNotReady}
            type="button"
            aria-label="Upload primary text file"
            className='w-full'
          >
            <i className="fas fa-file-alt mr-2"></i> Choose Text File
          </Button>
          {textFile && <span className="ml-3 text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs inline-block align-middle">{textFile.name}</span>}
        </div>
        
        <div className="relative">
          <Input
            label="Core Message / Prompt for Ideas"
            id="customPrompt"
            type="textarea"
            rows={4}
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder="e.g., Launching a new eco-friendly product..."
            className="resize-none"
            required
            disabled={modelNotReady}
          />
          <Button
            onClick={onSuggestPrompt}
            variant="secondary"
            size="sm"
            className="absolute top-[26px] right-1 text-xs"
            isLoading={isSuggestingPrompt}
            disabled={modelNotReady || !canvasTitle.trim() || isSuggestingPrompt || isGenerating}
            title={!canvasTitle.trim() ? "Enter a Canvas Title first to enable suggestions" : "Suggest a prompt based on Canvas Title"}
            type="button"
          >
           <i className="fas fa-lightbulb mr-1"></i> AI Suggest
          </Button>
        </div>


        <Select
          label="General Social Platform Context"
          id="platformContext"
          value={platformContext}
          onChange={(e) => onPlatformContextChange(e.target.value as SocialPlatform)}
          // This will now correctly receive the full list from the parent component
          options={availablePlatforms.map(p => ({ value: p, label: p }))}
          disabled={modelNotReady}
        />

        <Select
          label="Overall Tone of Voice"
          id="tone"
          value={tone}
          onChange={(e) => onToneChange(e.target.value as CaptionTone)}
          options={Object.values(CaptionTone).map(t => ({ value: t, label: t }))}
          disabled={modelNotReady}
        />
        
        <Input
          label="Number of Initial Ideas to Generate"
          id="numberOfIdeas"
          type="number"
          min="1"
          max="5"
          value={numberOfIdeas}
          onChange={(e) => onNumberOfIdeasChange(parseInt(e.target.value))}
          disabled={modelNotReady}
        />

        <Button 
          onClick={onGenerateIdeas} 
          isLoading={isGenerating || modelNotReady} 
          disabled={isGenerating || modelNotReady || !customPrompt.trim()}
          className="w-full"
          size="lg"
          type="button"
        >
          {modelNotReady ? 'Model Loading...' : isGenerating ? 'Generating Ideas...' : 'Generate Ideas'}
        </Button>
      </div>
    </Card>
  );
};

export default ControlsPanel;