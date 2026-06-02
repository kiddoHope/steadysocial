
import React, { useState, useEffect, useCallback } from 'react';
import { ContentCanvas, CanvasStatus, UserRole, FacebookPage, CanvasItem, FacebookSettings } from '../types';
import { useCanvas } from '../contexts/CanvasContext';
import { dbGetFacebookSettings } from '../services/settingsService'; // Use direct DB call
import { useAuth } from '../contexts/AuthContext';
import useFacebookSDK from '../hooks/useFacebookSDK';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import PostToFacebookModal from '../components/dashboard/PostToFacebookModal';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Link } from 'react-router-dom';


// Unused helper removed


const CanvasDisplayCard: React.FC<{ 
  canvas: ContentCanvas; 
  onUpdateStatus: (canvasId: string, status: CanvasStatus, feedback?: string) => Promise<void>; 
  onDelete: (canvasId: string) => Promise<void>; 
  onOpenPostModal: (canvas: ContentCanvas) => void; 
  currentUserRole: UserRole | undefined;
  currentUserId: string | undefined;
  isFacebookReady: boolean;
  isProcessing: boolean;
}> = ({ canvas, onUpdateStatus, onDelete, onOpenPostModal, currentUserRole, currentUserId, isFacebookReady, isProcessing }) => {
  const isAdmin = currentUserRole === UserRole.ADMIN;
  const [adminFeedbackInput, setAdminFeedbackInput] = useState('');

  const handleApprove = async () => {
    if (isProcessing) return;
    await onUpdateStatus(canvas.id, CanvasStatus.APPROVED);
  }
  const handleRequestRevision = async () => {
    if (isProcessing) return;
    if (!adminFeedbackInput.trim() && canvas.status === CanvasStatus.PENDING_REVIEW) {
        alert("Please provide feedback when requesting revisions.");
        return;
    }
    await onUpdateStatus(canvas.id, CanvasStatus.NEEDS_REVISION, adminFeedbackInput);
    setAdminFeedbackInput('');
  };
  const handleDelete = async () => {
    if (isProcessing) return;
    if (window.confirm(`Are you sure you want to delete canvas "${canvas.title || canvas.id}"?`)) {
        await onDelete(canvas.id);
    }
  };

  const getStatusInfo = (status: CanvasStatus) => {
    switch (status) {
      case CanvasStatus.DRAFT: return { color: 'bg-white', text: 'DRAFT', icon: 'fa-pencil-alt' };
      case CanvasStatus.PENDING_REVIEW: return { color: 'bg-neo-secondary', text: 'REVIEW', icon: 'fa-search' };
      case CanvasStatus.NEEDS_REVISION: return { color: 'bg-neo-muted', text: 'REVISE', icon: 'fa-sync' };
      case CanvasStatus.APPROVED: return { color: 'bg-neo-accent', text: 'READY', icon: 'fa-check' };
      default: return { color: 'bg-white', text: 'UNKNOWN', icon: 'fa-question' };
    }
  };

  const statusInfo = getStatusInfo(canvas.status);
  const canEditOrDelete = isAdmin || (canvas.createdBy === currentUserId && (canvas.status === CanvasStatus.DRAFT || canvas.status === CanvasStatus.NEEDS_REVISION));

  return (
    <Card 
      hoverEffect 
      className="flex flex-col h-full !p-0 neo-card-hover group"
    >
      <div className={`p-5 neo-border-b bg-neo-black text-white relative overflow-hidden`}>
        <div className="absolute top-0 right-0 p-4 opacity-10 -rotate-12 translate-x-2 -translate-y-2 group-hover:scale-125 transition-transform">
            <i className={`fas ${statusInfo.icon} text-6xl`}></i>
        </div>
        <div className="flex justify-between items-start relative z-10">
            <h3 className="text-xl font-black uppercase tracking-tighter truncate max-w-[70%]" title={canvas.title || 'Untitled'}>
                {canvas.title || 'Untitled'}
            </h3>
            <div className={`${statusInfo.color} neo-border-sm px-2 py-1 rotate-3 group-hover:rotate-0 transition-transform`}>
                <span className="text-[10px] font-black text-neo-black uppercase tracking-widest">
                    {statusInfo.text}
                </span>
            </div>
        </div>
        <div className="mt-4 flex gap-4">
            <div className="bg-white/10 px-2 py-1 text-[10px] font-bold uppercase">
                {new Date(canvas.createdAt).toLocaleDateString()}
            </div>
            {canvas.items.length > 0 && (
                <div className="bg-white/10 px-2 py-1 text-[10px] font-bold uppercase">
                    {canvas.items.length} ITEMS
                </div>
            )}
        </div>
      </div>
      
      <div className="p-6 flex-grow flex flex-col bg-white group-hover:bg-neo-bg transition-colors">
        <div className="mb-4 relative">
            <div className="absolute -left-6 top-0 w-1 h-full bg-neo-black opacity-10"></div>
            <p className="text-xs font-black uppercase tracking-widest text-neo-black/40 mb-2">Primary Content</p>
            {canvas.items && canvas.items.length > 0 ? (
                <p className="text-sm font-bold leading-relaxed line-clamp-3">
                    {canvas.items[0].originalText}
                </p>
            ) : (
                <p className="text-sm font-bold italic opacity-40">Empty Canvas.</p>
            )}
        </div>

        {canvas.overallImagePreview && (
            <div className="my-4 relative">
                <div className="absolute inset-0 neo-border translate-x-2 translate-y-2 pointer-events-none"></div>
                <img src={canvas.overallImagePreview} alt="Preview" className="neo-border w-full aspect-video object-cover grayscale group-hover:grayscale-0 transition-all"/>
            </div>
        )}
        
        {canvas.status === CanvasStatus.NEEDS_REVISION && canvas.adminFeedback && (
            <div className="my-4 bg-neo-muted p-4 neo-border-sm rotate-1">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1">Feedback</p>
                <p className="text-xs font-bold italic">"{canvas.adminFeedback}"</p>
            </div>
        )}

        <div className="mt-auto pt-6 flex flex-col gap-3">
          {isAdmin && canvas.status === CanvasStatus.PENDING_REVIEW && (
            <div className="bg-neo-secondary/10 p-4 neo-border-sm mb-2">
              <Button onClick={handleApprove} variant="success" size="sm" className="w-full" disabled={isProcessing} isLoading={isProcessing}>APPROVE SYSTEM</Button>
              <Input 
                type="textarea"
                placeholder="REVISION NOTES..."
                value={adminFeedbackInput}
                onChange={(e) => setAdminFeedbackInput(e.target.value)}
                rows={2}
                wrapperClassName="my-3 mb-0"
                className="!text-xs"
                disabled={isProcessing}
              />
              <Button onClick={handleRequestRevision} variant="warning" size="sm" className="w-full mt-3" disabled={isProcessing || !adminFeedbackInput.trim()} isLoading={isProcessing}>DEMAND REVISION</Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link to={`/generate?canvasId=${canvas.id}`} className="block">
              <Button variant="secondary" size="sm" className="w-full !px-2" disabled={isProcessing}>
                {canvas.status === CanvasStatus.DRAFT || (canvas.createdBy === currentUserId && canvas.status === CanvasStatus.NEEDS_REVISION) ? "EDIT" : "VIEW"}
              </Button>
            </Link>
            
            {canEditOrDelete && (
                <Button onClick={handleDelete} variant="danger" size="sm" className="w-full" disabled={isProcessing} isLoading={isProcessing}>DELETE</Button>
            )}
          </div>

            {canvas.status === CanvasStatus.APPROVED && (
              <Button 
                onClick={() => onOpenPostModal(canvas)} 
                variant="primary" 
                size="md" 
                className="w-full mt-1"
                disabled={!isFacebookReady || isProcessing}
                icon={<i className="fab fa-facebook"></i>}
              >
                POST TO FACEBOOK
              </Button>
            )}
        </div>
      </div>
    </Card>
  );
};


const DashboardPage: React.FC = () => {
  const { 
    canvases: allCanvasesFromContext, 
    updateCanvasStatus: updateCanvasStatusInContext, 
    deleteCanvas: deleteCanvasInContext,
    isLoadingCanvases,
    fetchCanvases // Added fetchCanvases
  } = useCanvas();
  
  const [displayedCanvases, setDisplayedCanvases] = useState<ContentCanvas[]>([]);
  
  const [filter, setFilter] = useState<CanvasStatus | 'all'>('all');
  const { currentUser } = useAuth();
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [operationInProgress, setOperationInProgress] = useState(false); // For card button disabling
  
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [selectedCanvasForPost, setSelectedCanvasForPost] = useState<ContentCanvas | null>(null);
  const [isPostingToFacebook, setIsPostingToFacebook] = useState(false);
  const [postToFacebookError, setPostToFacebookError] = useState<string | null>(null);
  const [postToFacebookSuccess, setPostToFacebookSuccess] = useState<string | null>(null);
  
  const [fbSettings, setFbSettings] = useState<FacebookSettings | null>(null);
  const [isLoadingFbSettings, setIsLoadingFbSettings] = useState(true);

  useEffect(() => {
    const loadFbSettings = async () => {
      setIsLoadingFbSettings(true);
      try {
        const settings = await dbGetFacebookSettings();
        setFbSettings(settings);
      } catch (err) {
        console.error("Failed to load Facebook settings", err);
        setNotification({ type: 'error', message: 'Could not load Facebook settings.' });
      } finally {
        setIsLoadingFbSettings(false);
      }
    };
    loadFbSettings();
  }, []);
  
  // Call fetchCanvases on mount if not already handled by CanvasContext's useEffect
  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);


  const { fbApi, error: sdkError } = useFacebookSDK(
    fbSettings?.appId, 
    undefined,
    fbSettings?.accessToken
  );

  const isFacebookReady = !!fbSettings?.accessToken && !!fbApi && !isLoadingFbSettings;

  useEffect(() => {
    if (!isLoadingCanvases) {
        if (currentUser?.role !== UserRole.ADMIN) {
            setDisplayedCanvases(allCanvasesFromContext.filter(c => 
                c.createdBy === currentUser?.id ||
                c.status === CanvasStatus.APPROVED
            ));
        } else {
            setDisplayedCanvases(allCanvasesFromContext);
        }
    }
  }, [allCanvasesFromContext, currentUser, isLoadingCanvases]);


  const handleUpdateStatus = async (canvasId: string, status: CanvasStatus, feedback?: string) => {
    setOperationInProgress(true);
    try {
      const updatedCanvas = await updateCanvasStatusInContext(canvasId, status, currentUser?.id, feedback);
      if (updatedCanvas) {
        setNotification({type: 'success', message: `Canvas status updated to ${status?.replace('_',' ')}.`});
      } else {
        setNotification({type: 'error', message: 'Failed to update canvas status.'});
      }
    } catch (err: any) {
        setNotification({type: 'error', message: err.message || 'Error updating canvas status.'});
    } finally {
        setOperationInProgress(false);
        setTimeout(() => setNotification(null), 3000);
    }
  };
  
  const handleDeleteCanvas = async (canvasId: string) => {
    setOperationInProgress(true);
    try {
      await deleteCanvasInContext(canvasId);
      setNotification({ type: 'success', message: 'Canvas deleted successfully.' });
    } catch (err: any) {
        setNotification({type: 'error', message: err.message || 'Error deleting canvas.'});
    } finally {
        setOperationInProgress(false);
        setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleOpenPostModal = (canvas: ContentCanvas) => {
    if (!fbSettings?.pageId) {
      setNotification({ type: 'info', message: "Please select a Facebook Page in Settings before posting."});
      return;
    }
    if (!fbSettings?.appId) {
        setNotification({ type: 'info', message: "Facebook App ID is not configured in Settings. Posting features require an App ID."});
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
    _selectedItem: CanvasItem, 
    textToPost: string,
    imageToUse?: string | null, 
    newImageFile?: File | null,
    isScheduled?: boolean,
    scheduledPublishTime?: number
  ) => {
    if (!fbApi || !fbSettings?.pageId || !fbSettings?.appId || !isFacebookReady) {
      setPostToFacebookError("Facebook connection not ready, Page ID, or App ID not set. Configure access token in Settings.");
      return;
    }
    setIsPostingToFacebook(true);
    setPostToFacebookError(null);
    setPostToFacebookSuccess(null);

    let imageNote = "";

    try {
      const pageAccessToken = fbSettings.accessToken;
      if (!pageAccessToken) {
          throw new Error("Access Token not found. Please configure it in Settings.");
      }

      if (newImageFile || (imageToUse && imageToUse.startsWith('data:image'))) {
        setPostToFacebookSuccess(isScheduled ? "Preparing image for schedule..." : "Preparing image for upload...");

        let imageDataUrl: string | null = null;

        if (newImageFile) {
            // Convert File to data URL for the backend to handle simply
            const reader = new FileReader();
            imageDataUrl = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(newImageFile);
            });
            setPostToFacebookSuccess(isScheduled ? "New image prepared. Scheduling on Facebook..." : "New image prepared. Uploading to Facebook...");
        } else {
            imageDataUrl = imageToUse!;
            setPostToFacebookSuccess(isScheduled ? "Original image prepared. Scheduling on Facebook..." : "Original image prepared. Uploading to Facebook...");
        }

        if (!imageDataUrl) {
            throw new Error("Failed to process image for upload.");
        }

        // Use the simplified photo API call which the backend handles
        const photoParams: any = {
            imageDataUrl: imageDataUrl,
            message: textToPost,
            access_token: pageAccessToken
        };
        if (isScheduled && scheduledPublishTime) {
            photoParams.published = false;
            photoParams.scheduled_publish_time = scheduledPublishTime;
        } else {
            photoParams.published = true;
        }

        await fbApi(`/${fbSettings.pageId}/photos`, 'post', photoParams);
        
        imageNote = isScheduled 
          ? ` (Image uploaded and scheduled for ${new Date(scheduledPublishTime! * 1000).toLocaleString()}).` 
          : " (Image uploaded and posted with caption).";
        
        setPostToFacebookSuccess(isScheduled 
          ? `Successfully scheduled post for Facebook page "${fbSettings.pageId}"${imageNote}`
          : `Successfully posted to Facebook page "${fbSettings.pageId}"${imageNote}.`
        );

      } else if (imageToUse && (imageToUse.startsWith('http://') || imageToUse.startsWith('https://'))) {
          // If it's a URL, use the photos endpoint with imageUrl
          setPostToFacebookSuccess(isScheduled ? "Image URL provided. Scheduling on Facebook..." : "Image URL provided. Posting to Facebook...");
          
          const photoParams: any = {
              imageUrl: imageToUse,
              message: textToPost,
              access_token: pageAccessToken
          };
          if (isScheduled && scheduledPublishTime) {
              photoParams.published = false;
              photoParams.scheduled_publish_time = scheduledPublishTime;
          } else {
              photoParams.published = true;
          }

          await fbApi(`/${fbSettings.pageId}/photos`, 'post', photoParams);
          
          imageNote = isScheduled
            ? ` (Image URL scheduled as photo with caption for ${new Date(scheduledPublishTime! * 1000).toLocaleString()}).`
            : " (Image URL posted as photo with caption).";
          
          setPostToFacebookSuccess(isScheduled 
            ? `Successfully scheduled post for Facebook page "${fbSettings.pageId}"${imageNote}`
            : `Successfully posted to Facebook page "${fbSettings.pageId}"${imageNote}.`
          );
      } else {
          // Text-only post
          setPostToFacebookSuccess(isScheduled ? "Preparing scheduled text-only post..." : "Preparing text-only post...");
          
          const feedParams: any = {
              message: textToPost,
              access_token: pageAccessToken
          };
          if (isScheduled && scheduledPublishTime) {
              feedParams.published = false;
              feedParams.scheduled_publish_time = scheduledPublishTime;
          } else {
              feedParams.published = true;
          }

          await fbApi(`/${fbSettings.pageId}/feed`, 'post', feedParams);
          
          setPostToFacebookSuccess(isScheduled 
            ? `Successfully scheduled post for Facebook page "${fbSettings.pageId}" at ${new Date(scheduledPublishTime! * 1000).toLocaleString()}.`
            : `Successfully posted to Facebook page "${fbSettings.pageId}".`
          );
      }
      
    } catch (err: any) {
      console.error("Error posting to Facebook:", err);
      const errorMessage = err.message || err.error?.message || "An unknown error occurred.";
      setPostToFacebookError(isScheduled ? `Failed to schedule: ${errorMessage}` : `Failed to post: ${errorMessage}`);
      setPostToFacebookSuccess(null); 
    } finally {
      setIsPostingToFacebook(false);
    }
  };


  const filteredAndSortedCanvases = displayedCanvases
    .filter(c => filter === 'all' || c.status === filter)
    .sort((a,b) => (b.submittedAt || b.createdAt) - (a.submittedAt || a.createdAt)); 
  
  const filterOptions: {label: string, value: CanvasStatus | 'all'}[] = [
    { label: 'All Canvases', value: 'all' },
    ...Object.values(CanvasStatus).map(s => ({label: s.replace('_', ' ').toUpperCase(), value: s})),
  ];

  if (isLoadingCanvases || isLoadingFbSettings) {
     return (
        <div className="flex flex-col items-center justify-center h-96">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-slate-600 dark:text-slate-300">
              {isLoadingCanvases ? 'Loading Canvases...' : 'Loading Facebook Settings...'}
            </p>
        </div>
     );
  }

  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>
      
      <div className="relative z-10 max-w-7xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <div className="inline-block bg-neo-muted neo-border-sm px-2 py-0.5 mb-2 rotate-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-neo-black">CONTROL CENTER</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-neo-black leading-none">
              Content <span className="text-neo-accent">Canvas</span>
            </h1>
          </div>
          
          {currentUser?.role === UserRole.CREATIVE && (
             <Link to="/generate">
                 <Button variant="primary" size="lg" disabled={operationInProgress} icon={<i className="fas fa-plus"></i>}>
                     NEW CANVAS
                 </Button>
            </Link>
          )}
        </header>

        {notification && <Alert type={notification.type} message={notification.message} onClose={() => setNotification(null)} className="mb-8" />}
        {sdkError && <Alert type="error" message={`SDK ERROR: ${sdkError}`} className="mb-4"/>}
        {!isFacebookReady && fbSettings?.appId && (
           <Alert type="info" message="FACEBOOK OFFLINE: Connect in settings to enable distribution." className="mb-4"/>
        )}

        <div className="mb-10 flex flex-wrap items-center gap-6 bg-white neo-border p-6 neo-shadow-sm -rotate-1">
          <div className="flex items-center gap-3">
            <i className="fas fa-filter text-neo-accent"></i>
            <span className="text-sm font-black uppercase tracking-widest text-neo-black">Filter by status</span>
          </div>
          <Select
            id="statusFilter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as CanvasStatus | 'all')}
            options={filterOptions}
            wrapperClassName="mb-0 min-w-[250px]"
            disabled={operationInProgress}
          />
        </div>

        {filteredAndSortedCanvases.length === 0 ? (
          <div className="neo-border bg-white p-20 text-center neo-shadow-md rotate-1">
            <i className="fas fa-folder-open text-6xl text-neo-muted mb-6"></i>
            <p className="text-xl font-bold text-neo-black">
              NO CANVASES DETECTED.
              {currentUser?.role === UserRole.CREATIVE && (
                <span className="block mt-4">
                  INITIATE <Link to="/generate" className="text-neo-accent underline decoration-4">NEW CANVAS</Link> TO PROCEED.
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {filteredAndSortedCanvases.map(canvas => (
              <CanvasDisplayCard 
                key={canvas.id} 
                canvas={canvas} 
                onUpdateStatus={handleUpdateStatus} 
                onDelete={handleDeleteCanvas}
                onOpenPostModal={handleOpenPostModal}
                currentUserRole={currentUser?.role}
                currentUserId={currentUser?.id}
                isFacebookReady={isFacebookReady}
                isProcessing={operationInProgress}
              />
            ))}
          </div>
        )}
      </div>

      {selectedCanvasForPost && (
        <PostToFacebookModal
          isOpen={isPostModalOpen}
          onClose={() => {
            setIsPostModalOpen(false);
            if (postToFacebookError) setPostToFacebookError(null); 
            if (postToFacebookSuccess && !postToFacebookSuccess?.includes("Successfully posted")) {
                 setPostToFacebookSuccess(null); 
            }
          }}
          canvas={selectedCanvasForPost}
          onConfirmPost={handleConfirmPostToFacebook}
          isPosting={isPostingToFacebook}
          postError={postToFacebookError}
          postSuccessMessage={postToFacebookSuccess}
          onCloseSuccess={() => setPostToFacebookSuccess(null)}
        />
      )}
    </div>
  );
};

export default DashboardPage;
