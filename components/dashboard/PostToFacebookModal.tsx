import React, { useState, useEffect, useMemo } from 'react';
import { ContentCanvas, CanvasItem, SocialPlatform } from '../../types';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Alert from '../ui/Alert';
import Card from '../ui/Card';

interface PostToFacebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvas: ContentCanvas | null;
  onConfirmPost: (selectedItem: CanvasItem, textToPost: string, imageToUse?: string | null) => Promise<void>;
  isPosting: boolean;
  postError: string | null;
  postSuccessMessage: string | null;
}

const PostToFacebookModal: React.FC<PostToFacebookModalProps> = ({
  isOpen,
  onClose,
  canvas,
  onConfirmPost,
  isPosting,
  postError,
  postSuccessMessage,
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [textToPost, setTextToPost] = useState('');

  const selectedItem = useMemo(() => {
    return canvas?.items.find(item => item.id === selectedItemId) || null;
  }, [canvas, selectedItemId]);

  useEffect(() => {
    if (canvas && canvas.items.length > 0) {
      const initialItem = canvas.items[0];
      setSelectedItemId(initialItem.id);
      const fbAdaptation = initialItem.adaptations[SocialPlatform.Facebook]?.text;
      setTextToPost(fbAdaptation || initialItem.originalText);
    } else {
      setSelectedItemId('');
      setTextToPost('');
    }
  }, [canvas, isOpen]); // Reset when canvas changes or modal opens

  useEffect(() => {
    if (selectedItem) {
      const fbAdaptation = selectedItem.adaptations[SocialPlatform.Facebook]?.text;
      setTextToPost(fbAdaptation || selectedItem.originalText);
    } else {
      setTextToPost('');
    }
  }, [selectedItem]);

  if (!isOpen || !canvas) return null;

  const handleItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedItemId(e.target.value);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextToPost(e.target.value);
  };

  const handleSubmit = () => {
    if (selectedItem) {
      onConfirmPost(selectedItem, textToPost, canvas.overallImagePreview);
    }
  };

  const itemOptions = canvas.items.map(item => ({
    value: item.id,
    label: `Item: ${item.originalText.substring(0, 50)}...`,
  }));

  return (
    <div
      className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-to-facebook-modal-title"
    >
      <Card
        title="Post to Facebook"
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        actions={<Button onClick={onClose} variant="secondary" size="sm" aria-label="Close modal"><i className="fas fa-times"></i></Button>}
      >
        <div id="post-to-facebook-modal-title" className="sr-only">Post to Facebook Dialog</div>
        {postError && <Alert type="error" message={postError} className="mb-4" />}
        {postSuccessMessage && <Alert type="success" message={postSuccessMessage} className="mb-4" />}

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
              rows={6}
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-slate-900 dark:text-slate-100 disabled:opacity-70"
              placeholder="Enter text for your Facebook post..."
              disabled={isPosting}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              This will use the Facebook adaptation if available, or the item's original text. You can edit it here.
            </p>
          </div>

          {canvas.overallImagePreview && (
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Image to Post:</p>
              <img src={canvas.overallImagePreview} alt="Canvas Preview" className="rounded-md max-h-40 w-auto shadow border border-slate-200 dark:border-slate-700" />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {canvas.overallImagePreview.startsWith('http') 
                  ? "This image will be posted as a link." 
                  : "This image is a local preview (base64). Text-only post will be made to Facebook. For images, upload them directly to Facebook or use a URL."
                }
              </p>
            </div>
          )}
          {!canvas.overallImagePreview && (
            <p className="text-sm text-slate-500 dark:text-slate-400">No image associated with this canvas. Text-only post will be made.</p>
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
              {isPosting ? 'Posting...' : 'Confirm & Post to Facebook'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default PostToFacebookModal;
