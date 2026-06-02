import React, { useState, useEffect, useMemo } from 'react';
import { ContentCanvas, CanvasItem, SocialPlatform } from '../../types';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Alert from '../ui/Alert';
import Card from '../ui/Card';
import Input from '../ui/Input'; 

interface PostToFacebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvas: ContentCanvas | null;
  onConfirmPost: (
    selectedItem: CanvasItem, 
    textToPost: string, 
    imageToUse?: string | null, 
    newImageFile?: File | null,
    isScheduled?: boolean,
    scheduledPublishTime?: number
  ) => Promise<void>;
  isPosting: boolean;
  postError: string | null;
  postSuccessMessage: string | null;
  onCloseSuccess?: () => void;
}

const PostToFacebookModal: React.FC<PostToFacebookModalProps> = ({
  isOpen,
  onClose,
  canvas,
  onConfirmPost,
  isPosting,
  postError,
  postSuccessMessage,
  onCloseSuccess,
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [textToPost, setTextToPost] = useState('');
  const [userSelectedRetryFile, setUserSelectedRetryFile] = useState<File | null>(null);

  // Scheduling State
  const [postStrategy, setPostStrategy] = useState<'now' | 'schedule'>('now');
  
  // Helper to format date to YYYY-MM-DDTHH:MM
  const getInitialScheduledString = () => {
    const futureDate = new Date();
    // Default to 1 hour in the future
    futureDate.setHours(futureDate.getHours() + 1);
    futureDate.setMinutes(futureDate.getMinutes() - futureDate.getMinutes() % 5); // round to nearest 5 mins
    
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = futureDate.getFullYear();
    const mm = pad(futureDate.getMonth() + 1);
    const dd = pad(futureDate.getDate());
    const hh = pad(futureDate.getHours());
    const min = pad(futureDate.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  const getMinDateTimeString = () => {
    const minDate = new Date();
    // Minimum 10 minutes in the future (use 11 minutes to be safe)
    minDate.setMinutes(minDate.getMinutes() + 11);
    
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${minDate.getFullYear()}-${pad(minDate.getMonth() + 1)}-${pad(minDate.getDate())}T${pad(minDate.getHours())}:${pad(minDate.getMinutes())}`;
  };

  const [scheduledTimeStr, setScheduledTimeStr] = useState(getInitialScheduledString());

  const selectedItem = useMemo(() => {
    return canvas?.items.find(item => item.id === selectedItemId) || null;
  }, [canvas, selectedItemId]);

  useEffect(() => {
    if (isOpen) {
        setUserSelectedRetryFile(null); 
        setPostStrategy('now');
        setScheduledTimeStr(getInitialScheduledString());
        if (canvas && canvas.items.length > 0) {
            const initialItem = canvas.items[0];
            setSelectedItemId(initialItem.id);
            const fbAdaptation = initialItem.adaptations[SocialPlatform.Facebook]?.text;
            setTextToPost(fbAdaptation || initialItem.originalText);
        } else {
            setSelectedItemId('');
            setTextToPost('');
        }
    }
  }, [canvas, isOpen]); 

  useEffect(() => {
    if (selectedItem && isOpen) { 
      const fbAdaptation = selectedItem.adaptations[SocialPlatform.Facebook]?.text;
      setTextToPost(fbAdaptation || selectedItem.originalText);
    } else if (!selectedItem && isOpen) {
      setTextToPost('');
    }
  }, [selectedItem, isOpen]);

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

  if (!isOpen || !canvas) return null;

  const handleItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedItemId(e.target.value);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextToPost(e.target.value);
  };

  const handleSubmit = () => {
    if (selectedItem) {
      if (postStrategy === 'schedule') {
        const selectedDate = new Date(scheduledTimeStr);
        const now = new Date();
        const diffMs = selectedDate.getTime() - now.getTime();
        const diffMins = diffMs / (1000 * 60);

        if (isNaN(selectedDate.getTime())) {
          alert("PLEASE SPECIFY A VALID DATE AND TIME.");
          return;
        }

        if (diffMins < 10) {
          alert("SCHEDULED PUBLISH TIME MUST BE AT LEAST 10 MINUTES IN THE FUTURE.");
          return;
        }

        if (diffMins > 30 * 24 * 60) {
          alert("SCHEDULED PUBLISH TIME CANNOT BE GREATER THAN 30 DAYS IN THE FUTURE.");
          return;
        }

        const unixTimestampSeconds = Math.floor(selectedDate.getTime() / 1000);
        onConfirmPost(
          selectedItem, 
          textToPost, 
          canvas.overallImagePreview, 
          userSelectedRetryFile,
          true,
          unixTimestampSeconds
        );
      } else {
        onConfirmPost(
          selectedItem, 
          textToPost, 
          canvas.overallImagePreview, 
          userSelectedRetryFile,
          false
        );
      }
    }
  };

  const itemOptions = canvas.items.map(item => ({
    value: item.id,
    label: `Item: ${item.originalText.substring(0, 50)}...`,
  }));

  const isBase64Image = canvas.overallImagePreview && canvas.overallImagePreview.startsWith('data:image');
  // Condition for showing the retry image upload section
  const showRetryImageUpload = postError && 
    (postError.toLowerCase().includes("failed to upload") || 
     postError.toLowerCase().includes("custom hosting") ||
     postError.toLowerCase().includes("invalid file input") ||
     postError.toLowerCase().includes("image format for upload"));

  const minDateTimeStr = getMinDateTimeString();

  return (
    <div
      className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-to-facebook-modal-title"
    >
      <Card
        title="Post to Facebook"
        className="w-full max-w-lg bg-white"
        onClick={(e) => e.stopPropagation()}
        actions={<Button onClick={onClose} variant="secondary" size="sm" aria-label="Close modal"><i className="fas fa-times"></i></Button>}
      >
        <div id="post-to-facebook-modal-title" className="sr-only">Post to Facebook Dialog</div>
        {postError && !showRetryImageUpload && <Alert type="error" message={postError} onClose={onClose} className="mb-4" />}
        {postSuccessMessage && <Alert type="success" message={postSuccessMessage} onClose={onCloseSuccess} className="mb-4" />}

        <div className="space-y-4">
          <Select
            label="Select Content Item to Post"
            options={itemOptions}
            value={selectedItemId}
            onChange={handleItemChange}
            disabled={isPosting}
          />

          <div>
            <label htmlFor="textToPost" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Text for Facebook Post:
            </label>
            <textarea
              id="textToPost"
              value={textToPost}
              onChange={handleTextChange}
              rows={5}
              className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-slate-900 disabled:opacity-70 font-bold"
              placeholder="Enter text for your Facebook post..."
              disabled={isPosting}
            />
            <p className="text-xs text-slate-500 mt-1">
              This will use the Facebook adaptation if available, or the item's original text. You can edit it here.
            </p>
          </div>

          {canvas.overallImagePreview && !showRetryImageUpload && ( 
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">Image to Post:</p>
              <img src={canvas.overallImagePreview} alt="Canvas Preview" className="rounded-md max-h-36 w-auto shadow border border-slate-200" />
              <p className="text-xs text-slate-500 mt-1">
                {isBase64Image
                  ? "This image will be uploaded to custom hosting and linked."
                  : canvas.overallImagePreview.startsWith('http')
                  ? "This image URL will be used directly as a link."
                  : "Image format unrecognized. It may not be posted."
                }
              </p>
            </div>
          )}
          {!canvas.overallImagePreview && !showRetryImageUpload && (
            <p className="text-sm text-slate-500">No image associated with this canvas. Text-only post will be made.</p>
          )}

          {showRetryImageUpload && (
            <div className="mt-4 p-3 border border-dashed border-red-500 rounded-md bg-red-50">
              <Alert type="error" message={postError || "Failed to process the original image."} className="mb-2"/>
              <p className="text-sm font-medium text-red-700 mb-2">
                It seems there was an issue with the image. You can try uploading a new one to be hosted.
              </p>
              <Input
                type="file"
                accept="image/*"
                label="Upload New Image for Retry"
                onChange={(event) => {
                  const target = event.target as HTMLInputElement;
                  if (target.files && target.files[0]) {
                    setUserSelectedRetryFile(target.files[0]);
                  } else {
                    setUserSelectedRetryFile(null);
                  }
                }}
                className="text-sm"
                wrapperClassName="!mb-1"
                disabled={isPosting}
                id="retryImageUpload"
              />
              {userSelectedRetryFile && <p className="text-xs text-slate-500 mt-1">Selected for retry: {userSelectedRetryFile.name}</p>}
               {!userSelectedRetryFile && (
                <p className="text-xs text-slate-500 mt-1">
                    If no new image is selected, an attempt will be made with the original image (if any) or as text-only.
                </p>
                )}
            </div>
          )}

          {/* Publish Strategy Picker */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-neo-black mb-2">Publish Strategy</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-neo-muted neo-border-sm">
              <button
                type="button"
                onClick={() => setPostStrategy('now')}
                disabled={isPosting}
                className={`py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  postStrategy === 'now'
                    ? 'bg-neo-black text-white neo-border-sm translate-x-[-2px] translate-y-[-2px] neo-shadow-sm'
                    : 'text-neo-black hover:bg-white/50'
                }`}
              >
                <i className="fas fa-paper-plane mr-2"></i>
                Direct Post
              </button>
              <button
                type="button"
                onClick={() => setPostStrategy('schedule')}
                disabled={isPosting}
                className={`py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  postStrategy === 'schedule'
                    ? 'bg-neo-black text-white neo-border-sm translate-x-[-2px] translate-y-[-2px] neo-shadow-sm'
                    : 'text-neo-black hover:bg-white/50'
                }`}
              >
                <i className="fas fa-clock mr-2"></i>
                Schedule Post
              </button>
            </div>
          </div>

          {/* Publish Date/Time Picker */}
          {postStrategy === 'schedule' && (
            <div className="p-4 bg-neo-muted neo-border-sm space-y-3">
              <label htmlFor="publishDateTime" className="block text-[10px] font-black uppercase tracking-[0.2em] text-neo-black">
                Select Publish Date & Time
              </label>
              <input
                type="datetime-local"
                id="publishDateTime"
                value={scheduledTimeStr}
                onChange={(e) => setScheduledTimeStr(e.target.value)}
                min={minDateTimeStr}
                className="w-full px-3 py-2 bg-white border-2 border-neo-black font-bold text-sm text-neo-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:translate-x-[1px] focus:translate-y-[1px] focus:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-75"
                disabled={isPosting}
              />
              <p className="text-[9px] text-neo-black/60 font-bold leading-normal uppercase">
                * Facebook scheduled posts must be set between 10 minutes and 30 days in the future.
              </p>
            </div>
          )}

          <div className="flex justify-end space-x-3 mt-6">
            <Button onClick={onClose} variant="secondary" disabled={isPosting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="primary"
              isLoading={isPosting}
              disabled={isPosting || !selectedItem || !textToPost.trim()}
            >
              {isPosting 
                ? (postStrategy === 'schedule' ? 'Scheduling...' : 'Posting...') 
                : (showRetryImageUpload && userSelectedRetryFile 
                    ? 'Retry with New Image' 
                    : (postStrategy === 'schedule' ? 'Confirm & Schedule' : 'Confirm & Post to Facebook'))}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default PostToFacebookModal;
