import React, { useState, useEffect, useCallback } from 'react';
import { ContentCanvas, CanvasStatus, UserRole, FacebookPage, CanvasItem, FacebookSettings } from '../types';
import { 
    getCanvases, 
    updateCanvasStatus as updateCanvasStatusService, 
    deleteCanvas as deleteCanvasService 
} from '../services/postService';
import { getFacebookSettings } from '../services/settingsService';
import { useAuth } from '../contexts/AuthContext';
import useFacebookSDK from '../hooks/useFacebookSDK';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import PostToFacebookModal from '../components/dashboard/PostToFacebookModal'; // Import the modal
import LoadingSpinner from '../components/ui/LoadingSpinner';

const CanvasDisplayCard: React.FC<{ 
  canvas: ContentCanvas; 
  onUpdateStatus: (canvasId: string, status: CanvasStatus, feedback?: string) => void; 
  onDelete: (canvasId: string) => void; 
  onOpenPostModal: (canvas: ContentCanvas) => void; // Added for modal
  currentUserRole: UserRole | undefined;
  currentUserId: string | undefined;
  isFacebookReady: boolean;
}> = ({ canvas, onUpdateStatus, onDelete, onOpenPostModal, currentUserRole, currentUserId, isFacebookReady }) => {
  const isAdmin = currentUserRole === UserRole.ADMIN;
  const [adminFeedbackInput, setAdminFeedbackInput] = useState('');

  const handleApprove = () => onUpdateStatus(canvas.id, CanvasStatus.APPROVED);
  const handleRequestRevision = () => {
    if (!adminFeedbackInput.trim() && canvas.status === CanvasStatus.PENDING_REVIEW) {
        alert("Please provide feedback when requesting revisions.");
        return;
    }
    onUpdateStatus(canvas.id, CanvasStatus.NEEDS_REVISION, adminFeedbackInput);
    setAdminFeedbackInput('');
  };
  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete canvas "${canvas.title || canvas.id}"? This action cannot be undone.`)) {
        onDelete(canvas.id);
    }
  };

  const getStatusColor = (status: CanvasStatus) => {
    switch (status) {
      case CanvasStatus.DRAFT: return 'bg-slate-500';
      case CanvasStatus.PENDING_REVIEW: return 'bg-yellow-500';
      case CanvasStatus.NEEDS_REVISION: return 'bg-orange-500';
      case CanvasStatus.APPROVED: return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card className="flex flex-col h-full shadow-lg hover:shadow-xl transition-shadow duration-300">
      <div className={`p-4 border-b dark:border-slate-700 ${getStatusColor(canvas.status)}`}>
        <div className="flex justify-between items-center ">
            <h3 className="text-lg font-semibold text-white truncate" title={canvas.title || 'Untitled Canvas'}>
                {canvas.title || 'Untitled Canvas'}
            </h3>
            <span className={`px-2 py-0.5 text-xs text-white rounded-full border border-white/50`}>
                {canvas.status.replace('_', ' ').toUpperCase()}
            </span>
        </div>
        <p className="text-xs text-white/80 mt-1">Created: {new Date(canvas.createdAt).toLocaleDateString()}</p>
        {canvas.submittedAt && <p className="text-xs text-white/80">Submitted: {new Date(canvas.submittedAt).toLocaleDateString()}</p>}
      </div>
      
      <div className="p-4 flex-grow flex flex-col">
        <div className="mb-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Content Summary:</p>
            {canvas.items && canvas.items.length > 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400 truncate" title={canvas.items[0].originalText}>
                    {canvas.items[0].originalText}
                </p>
            ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No content items in this canvas.</p>
            )}
        </div>
        <div className="mb-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Items: <span className="font-normal">{canvas.items.length}</span></p>
        </div>

        {canvas.overallImagePreview && (
            <div className="my-2">
                <img src={canvas.overallImagePreview} alt="Canvas context" className="rounded h-auto w-full shadow-md"/>
            </div>
        )}
        
        {canvas.status === CanvasStatus.NEEDS_REVISION && canvas.adminFeedback && (
            <Alert type="warning" message={`Admin Feedback: ${canvas.adminFeedback}`} className="my-2 text-xs"/>
        )}

        <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
          {isAdmin && canvas.status === CanvasStatus.PENDING_REVIEW && (
            <>
              <Button onClick={handleApprove} variant="success" size="sm" className="w-full">Approve</Button>
              <Input 
                type="textarea"
                placeholder="Feedback for revision..."
                value={adminFeedbackInput}
                onChange={(e) => setAdminFeedbackInput(e.target.value)}
                rows={2}
                wrapperClassName="my-2"
              />
              <Button onClick={handleRequestRevision} variant="warning" size="sm" className="w-full">Request Revisions</Button>
            </>
          )}

          {(isAdmin || (canvas.createdBy === currentUserId && (canvas.status === CanvasStatus.DRAFT || canvas.status === CanvasStatus.NEEDS_REVISION))) && (
             <Button onClick={handleDelete} variant="danger" size="sm" className="w-full mt-2">Delete Canvas</Button>
           )}
            
            <a href={`#/generate?canvasId=${canvas.id}`} className="block mt-2">
              <Button variant="secondary" size="sm" className="w-full">
                {canvas.status === CanvasStatus.DRAFT || (canvas.createdBy === currentUserId && canvas.status === CanvasStatus.NEEDS_REVISION) ? "Edit Canvas" : "View Canvas Details"}
              </Button>
            </a>

            {canvas.status === CanvasStatus.APPROVED && (
              <Button 
                onClick={() => onOpenPostModal(canvas)} 
                variant="primary" 
                size="sm" 
                className="w-full mt-2"
                disabled={!isFacebookReady}
                title={!isFacebookReady ? "Connect to Facebook in Settings to enable posting" : "Post to Facebook"}
              >
                <i className="fab fa-facebook mr-2"></i> Post to Facebook
              </Button>
            )}
        </div>
      </div>
    </Card>
  );
};


const DashboardPage: React.FC = () => {
  const [canvases, setCanvases] = useState<ContentCanvas[]>([]);
  const [filter, setFilter] = useState<CanvasStatus | 'all'>('all');
  const { currentUser } = useAuth();
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [selectedCanvasForPost, setSelectedCanvasForPost] = useState<ContentCanvas | null>(null);
  const [isPostingToFacebook, setIsPostingToFacebook] = useState(false);
  const [postToFacebookError, setPostToFacebookError] = useState<string | null>(null);
  const [postToFacebookSuccess, setPostToFacebookSuccess] = useState<string | null>(null);
  
  const [fbSettings, setFbSettings] = useState<FacebookSettings | null>(null);

  useEffect(() => {
    setFbSettings(getFacebookSettings());
  }, []);

  const { isSdkInitialized, fbApi, error: sdkError, FB: fbInstance } = useFacebookSDK(
    fbSettings?.appId, // Use main app ID for posting
    fbSettings?.sdkUrl
  );

  const isFacebookReady = isSdkInitialized && !!fbInstance?.getUserID();


  const fetchCanvases = useCallback(async () => {
    try {
        const allCanvases = await getCanvases();
        if (currentUser?.role !== UserRole.ADMIN) {
            setCanvases(allCanvases.filter(c => 
                c.createdBy === currentUser?.id ||
                c.status === CanvasStatus.APPROVED
            ));
        } else {
            setCanvases(allCanvases);
        }
    } catch (error) {
        console.error("Failed to fetch canvases:", error);
        setNotification({ type: 'error', message: "Could not load canvas data." });
    }
  }, [currentUser]);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  const handleUpdateStatus = async (canvasId: string, status: CanvasStatus, feedback?: string) => {
    const updatedCanvas = await updateCanvasStatusService(canvasId, status, currentUser?.id, feedback);
    if (updatedCanvas) {
      fetchCanvases();
      setNotification({type: 'success', message: `Canvas status updated to ${status.replace('_',' ')}.`});
    } else {
      setNotification({type: 'error', message: 'Failed to update canvas status.'});
    }
    setTimeout(() => setNotification(null), 3000);
  };
  
  const handleDeleteCanvas = async (canvasId: string) => {
    await deleteCanvasService(canvasId);
    fetchCanvases();
    setNotification({ type: 'success', message: 'Canvas deleted successfully.' });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleOpenPostModal = (canvas: ContentCanvas) => {
    if (!fbSettings?.pageId) {
      setNotification({ type: 'info', message: "Please select a Facebook Page in Settings before posting."});
      return;
    }
    if (!isFacebookReady) {
      setNotification({ type: 'info', message: "Please connect to Facebook with the Main App ID in Settings before posting."});
      return;
    }
    setSelectedCanvasForPost(canvas);
    setIsPostModalOpen(true);
    setPostToFacebookError(null);
    setPostToFacebookSuccess(null);
  };

  const handleConfirmPostToFacebook = async (
    _selectedItem: CanvasItem, // Item might be used for more specific image/link logic in future
    textToPost: string,
    imageToUse?: string | null
  ) => {
    if (!fbApi || !fbSettings?.pageId || !isFacebookReady) {
      setPostToFacebookError("Facebook connection not ready or Page ID not set.");
      return;
    }
    setIsPostingToFacebook(true);
    setPostToFacebookError(null);
    setPostToFacebookSuccess(null);

    try {
      const accountsResponse = await fbApi<{data: FacebookPage[]}>('/me/accounts?fields=id,name,access_token');
      const targetPage = accountsResponse.data.find(p => p.id === fbSettings.pageId);

      if (!targetPage?.access_token) {
        throw new Error("Page Access Token not found. Please ensure the page is managed by the connected user and permissions are granted.");
      }
      const pageAccessToken = targetPage.access_token;
      
      const postPayload: { message: string; link?: string; access_token: string } = {
        message: textToPost,
        access_token: pageAccessToken,
      };

      let imageNote = "";
      if (imageToUse) {
        if (imageToUse.startsWith('http://') || imageToUse.startsWith('https://')) {
          postPayload.link = imageToUse;
        } else {
          // Base64 image, can't directly post to feed with a link.
          // Consider photo upload endpoint for future or just post text.
          imageNote = " (Image is local; posting text-only. For images, use a public URL or upload directly to Facebook).";
        }
      }

      await fbApi(`/${fbSettings.pageId}/feed`, 'post', postPayload);
      setPostToFacebookSuccess(`Successfully posted to Facebook page "${targetPage.name}"${imageNote}.`);
      // Optionally close modal after a delay or let user close
      // setTimeout(() => setIsPostModalOpen(false), 3000); 
    } catch (err: any) {
      console.error("Error posting to Facebook:", err);
      setPostToFacebookError(`Failed to post: ${err.message}`);
    } finally {
      setIsPostingToFacebook(false);
    }
  };


  const filteredCanvases = canvases.filter(c => filter === 'all' || c.status === filter);
  
  const filterOptions: {label: string, value: CanvasStatus | 'all'}[] = [
    { label: 'All Canvases', value: 'all' },
    ...Object.values(CanvasStatus).map(s => ({label: s.replace('_', ' ').toUpperCase(), value: s})),
  ];

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-100">Content Canvas Dashboard</h1>
      {notification && <Alert type={notification.type} message={notification.message} onClose={() => setNotification(null)}/>}
      {sdkError && <Alert type="error" message={`Facebook SDK Error: ${sdkError}. Posting features may be affected.`} className="mb-4"/>}
      {!isFacebookReady && fbSettings?.appId && (
         <Alert type="info" message="Facebook is not connected for the Main App ID. Please connect in Settings to enable posting features." className="mb-4"/>
      )}


      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label htmlFor="statusFilter" className="text-sm font-medium text-slate-700 dark:text-slate-300">Filter by status:</label>
        <Select
          id="statusFilter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as CanvasStatus | 'all')}
          options={filterOptions}
          wrapperClassName="mb-0 min-w-[200px]"
          className="dark:bg-slate-700"
        />
         {currentUser?.role === UserRole.CREATIVE && (
             <a href="#/generate" className="ml-auto">
                 <Button variant="primary">
                     <i className="fas fa-plus mr-2"></i> Create New Canvas
                 </Button>
            </a>
         )}
      </div>

      {filteredCanvases.length === 0 ? (
        <Card>
          <p className="text-center text-slate-500 dark:text-slate-400 py-10">
            No canvases found matching your criteria.
            {currentUser?.role === UserRole.CREATIVE && <span className="block mt-2">Try <a href="#/generate" className="text-primary-500 hover:underline">creating a new canvas</a>!</span>}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {filteredCanvases.map(canvas => (
            <CanvasDisplayCard 
              key={canvas.id} 
              canvas={canvas} 
              onUpdateStatus={handleUpdateStatus} 
              onDelete={handleDeleteCanvas}
              onOpenPostModal={handleOpenPostModal}
              currentUserRole={currentUser?.role}
              currentUserId={currentUser?.id}
              isFacebookReady={isFacebookReady}
            />
          ))}
        </div>
      )}
      {selectedCanvasForPost && (
        <PostToFacebookModal
          isOpen={isPostModalOpen}
          onClose={() => setIsPostModalOpen(false)}
          canvas={selectedCanvasForPost}
          onConfirmPost={handleConfirmPostToFacebook}
          isPosting={isPostingToFacebook}
          postError={postToFacebookError}
          postSuccessMessage={postToFacebookSuccess}
        />
      )}
    </div>
  );
};

export default DashboardPage;
