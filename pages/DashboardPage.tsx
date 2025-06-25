
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


const base64ToBlob = async (base64Data: string): Promise<{ blob: Blob, mimeType: string, fileName: string } | null> => {
  if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image')) {
    console.warn("base64ToBlob: Input is not a valid base64 image data URI string starting with 'data:image'. Input:", base64Data?.substring(0, 100));
    return null;
  }
  try {
    const response = await fetch(base64Data); 
    if (!response.ok) {
        console.warn("base64ToBlob: Fetch failed for data URI.", response.status, response.statusText);
        return null;
    }
    const blob = await response.blob();

    if (blob.size === 0) {
      console.warn("base64ToBlob: Produced an empty blob from fetch. Original data may be corrupt or empty.");
      return null;
    }
    
    const mimeType = blob.type; 
    if (!mimeType || !mimeType.startsWith('image/')) {
        console.warn("base64ToBlob: Fetched blob is not an image type or MIME type is missing.", mimeType);
        return null;
    }
    
    const supportedFacebookMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/tiff', 'image/webp'];
    if (!supportedFacebookMimeTypes.includes(mimeType.toLowerCase())) {
        console.warn(`base64ToBlob: MIME type "${mimeType}" may not be explicitly listed as supported by Facebook. Attempting anyway. Supported: ${supportedFacebookMimeTypes.join(', ')}`);
    }

    const extensionParts = mimeType.split('/');
    const extension = extensionParts.length > 1 ? extensionParts[1].split('+')[0] : 'png'; 
    const fileName = `image.${extension}`; 

    return { blob, mimeType, fileName };
  } catch (error) {
    console.error("Error converting base64 to Blob using fetch:", error);
    return null;
  }
};


const CanvasDisplayCard: React.FC<{ 
  canvas: ContentCanvas; 
  onUpdateStatus: (canvasId: string, status: CanvasStatus, feedback?: string) => Promise<void>; 
  onDelete: (canvasId: string) => Promise<void>; 
  onOpenPostModal: (canvas: ContentCanvas) => void; 
  currentUserRole: UserRole | undefined;
  currentUserId: string | undefined;
  isFacebookReady: boolean;
  isProcessing: boolean; // Added to disable buttons during operations
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
    if (window.confirm(`Are you sure you want to delete canvas "${canvas.title || canvas.id}"? This action cannot be undone.`)) {
        await onDelete(canvas.id);
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

  const canEditOrDelete = isAdmin || (canvas.createdBy === currentUserId && (canvas.status === CanvasStatus.DRAFT || canvas.status === CanvasStatus.NEEDS_REVISION));

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
              <Button onClick={handleApprove} variant="success" size="sm" className="w-full" disabled={isProcessing} isLoading={isProcessing}>Approve</Button>
              <Input 
                type="textarea"
                placeholder="Feedback for revision..."
                value={adminFeedbackInput}
                onChange={(e) => setAdminFeedbackInput(e.target.value)}
                rows={2}
                wrapperClassName="my-2"
                disabled={isProcessing}
              />
              <Button onClick={handleRequestRevision} variant="warning" size="sm" className="w-full" disabled={isProcessing || !adminFeedbackInput.trim()} isLoading={isProcessing}>Request Revisions</Button>
            </>
          )}

          {canEditOrDelete && (
             <Button onClick={handleDelete} variant="danger" size="sm" className="w-full mt-2" disabled={isProcessing} isLoading={isProcessing}>Delete Canvas</Button>
           )}
            
            <a href={`/generate?canvasId=${canvas.id}`} className="block mt-2">
              <Button variant="secondary" size="sm" className="w-full" disabled={isProcessing}>
                {canvas.status === CanvasStatus.DRAFT || (canvas.createdBy === currentUserId && canvas.status === CanvasStatus.NEEDS_REVISION) ? "Edit Canvas" : "View Canvas Details"}
              </Button>
            </a>

            {canvas.status === CanvasStatus.APPROVED && (
              <Button 
                onClick={() => onOpenPostModal(canvas)} 
                variant="primary" 
                size="sm" 
                className="w-full mt-2"
                disabled={!isFacebookReady || isProcessing}
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
  const { 
    canvases: allCanvasesFromContext, 
    updateCanvasStatus: updateCanvasStatusInContext, 
    deleteCanvas: deleteCanvasInContext,
    isLoadingCanvases,
    fetchCanvases // Added fetchCanvases
  } = useCanvas();
  
  const [displayedCanvases, setDisplayedCanvases] = useState<ContentCanvas[]>([]);
  console.log(displayedCanvases);
  
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


  const { isSdkInitialized, fbApi, error: sdkError, FB: fbInstance } = useFacebookSDK(
    fbSettings?.appId, 
    fbSettings?.sdkUrl
  );

  const isFacebookReady = isSdkInitialized && !!fbInstance?.getUserID() && !isLoadingFbSettings;

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
        setNotification({type: 'success', message: `Canvas status updated to ${status.replace('_',' ')}.`});
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
    newImageFile?: File | null   
  ) => {
    if (!fbApi || !fbSettings?.pageId || !fbSettings?.appId || !isFacebookReady || !fbInstance) {
      setPostToFacebookError("Facebook connection not ready, Page ID, or App ID not set.");
      return;
    }
    setIsPostingToFacebook(true);
    setPostToFacebookError(null);
    setPostToFacebookSuccess(null);

    let imageNote = "";
    let mediaFbid: string | null = null;

    try {
      setPostToFacebookSuccess("Fetching Page Access Token...");
      const accountsResponse = await fbApi<{data: FacebookPage[]}>('/me/accounts?fields=id,name,access_token');
      const targetPage = accountsResponse.data.find(p => p.id === fbSettings.pageId);
      if (!targetPage?.access_token) {
        throw new Error("Page Access Token not found. Ensure page is managed and permissions granted.");
      }
      const pageAccessToken = targetPage.access_token;
      
      const userAuthResponse = fbInstance.getAuthResponse();
      if (!userAuthResponse?.accessToken) {
          throw new Error("User Access Token not found. Please re-login via Facebook in Settings.");
      }
      const userAccessToken = userAuthResponse.accessToken;

      if (newImageFile || (imageToUse && imageToUse.startsWith('data:image'))) {
        setPostToFacebookSuccess("Starting image upload process...");

        let fileDataBlob: Blob;
        let uploadFileName: string;

        if (newImageFile) {
            fileDataBlob = newImageFile;
            uploadFileName = newImageFile.name;
            setPostToFacebookSuccess("New image provided. Preparing for resumable upload...");
        } else { 
            const blobInfo = await base64ToBlob(imageToUse!);
            if (!blobInfo) {
                throw new Error("Failed to convert original image data for upload.");
            }
            fileDataBlob = blobInfo.blob;
            uploadFileName = blobInfo.fileName;
            setPostToFacebookSuccess("Original image converted. Preparing for resumable upload...");
        }

        const fileLength = fileDataBlob.size;
        const fileType = fileDataBlob.type;

        setPostToFacebookSuccess("Step 1/3: Starting upload session...");
        const uploadSessionResponse = await fbApi<{ id: string }>(
            `/${fbSettings.appId}/uploads`,
            'post',
            {
                file_name: uploadFileName,
                file_length: fileLength,
                file_type: fileType,
                access_token: userAccessToken 
            }
        );
        const rawUploadSessionId = uploadSessionResponse.id; 
        if (!rawUploadSessionId || !rawUploadSessionId.startsWith('upload:')) {
            throw new Error("Failed to start upload session or received invalid session ID.");
        }
        setPostToFacebookSuccess(`Step 1/3: Upload session started (ID: ${rawUploadSessionId}).`);

        setPostToFacebookSuccess("Step 2/3: Uploading file data...");
        const uploadUrl = `https://graph.facebook.com/v23.0/${rawUploadSessionId}`;
        const uploadFileResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `OAuth ${userAccessToken}`,
                'file_offset': '0',
            },
            body: fileDataBlob,
        });

        if (!uploadFileResponse.ok) {
            const errorData = await uploadFileResponse.json().catch(() => ({ message: "Unknown upload error", error: { message: "Unknown upload error" } }));
            throw new Error(`Failed to upload file (Step 2): ${errorData.error?.message || errorData.message || uploadFileResponse.statusText}`);
        }
        const uploadResult = await uploadFileResponse.json();
        const fileHandle = uploadResult.h;
        if (!fileHandle) {
            throw new Error("File upload successful (Step 2) but no file handle received.");
        }
        setPostToFacebookSuccess(`Step 2/3: File data uploaded (Handle: ${fileHandle}).`);

        setPostToFacebookSuccess("Step 3/3: Creating page photo from uploaded file...");
        const photoPublishResponse = await fbApi<{ id: string }>(
            `/${fbSettings.pageId}/photos`,
            'post',
            {
                source: `fh:${fileHandle}`,
                published: false,
                temporary: true,
                access_token: pageAccessToken, 
            }
        );

        if (!photoPublishResponse?.id) {
          throw new Error("Failed to publish photo from file handle or get photo ID (Step 3).");
        }
        mediaFbid = photoPublishResponse.id;
        imageNote = " (Image successfully uploaded via resumable session and attached).";
        setPostToFacebookSuccess("Step 3/3: Page photo created. Preparing post...");

      } else if (imageToUse && (imageToUse.startsWith('http://') || imageToUse.startsWith('https://'))) {
         imageNote = " (Image will be posted as a link).";
         setPostToFacebookSuccess("Image provided as URL. Preparing post...");
      } else if (imageToUse) {
        imageNote = " (Original image is in an unrecognized format or could not be processed for direct upload; posting text-only).";
         console.warn("Facebook Post: Original image provided but is not a data URI and not a direct URL. Posting text-only.", imageToUse.substring(0,100));
         setPostToFacebookSuccess("Original image format not suitable for upload. Preparing text-only post...");
      } else {
        setPostToFacebookSuccess("No image provided. Preparing text-only post...");
      }

      const postPayload: { message: string; link?: string; access_token: string; attached_media?: string } = {
        message: textToPost,
        access_token: pageAccessToken,
      };

      if (mediaFbid) {
        postPayload.attached_media = `[{"media_fbid":"${mediaFbid}"}]`;
      } else if (!newImageFile && imageToUse && (imageToUse.startsWith('http://') || imageToUse.startsWith('https://'))){
        postPayload.link = imageToUse; 
      }
      
      setPostToFacebookSuccess(`Posting content to Facebook page "${targetPage.name}"...`);
      await fbApi(`/${fbSettings.pageId}/feed`, 'post', postPayload);
      setPostToFacebookSuccess(`Successfully posted to Facebook page "${targetPage.name}"${imageNote}.`);
      
    } catch (err: any) {
      console.error("Error posting to Facebook:", err);
      const errorMessage = err.message || err.error?.message || "An unknown error occurred.";
      setPostToFacebookError(`Failed to post: ${errorMessage}`);
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
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-100">Content Canvas Dashboard</h1>
      {notification && <Alert type={notification.type} message={notification.message} onClose={() => setNotification(null)}/>}
      {sdkError && <Alert type="error" message={`Facebook SDK Error: ${sdkError}. Posting features may be affected.`} className="mb-4"/>}
      {!isFacebookReady && fbSettings?.appId && (
         <Alert type="info" message="Facebook is not connected for the Main App ID or settings are still loading. Please connect in Settings to enable posting features." className="mb-4"/>
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
          disabled={operationInProgress}
        />
         {currentUser?.role === UserRole.CREATIVE && (
             <a href="#/generate" className="ml-auto">
                 <Button variant="primary" disabled={operationInProgress}>
                     <i className="fas fa-plus mr-2"></i> Create New Canvas
                 </Button>
            </a>
         )}
      </div>

      {filteredAndSortedCanvases.length === 0 ? (
        <Card>
          <p className="text-center text-slate-500 dark:text-slate-400 py-10">
            No canvases found matching your criteria.
            {currentUser?.role === UserRole.CREATIVE && <span className="block mt-2">Try <a href="#/generate" className="text-primary-500 hover:underline">creating a new canvas</a>!</span>}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
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
        />
      )}
    </div>
  );
};

export default DashboardPage;
