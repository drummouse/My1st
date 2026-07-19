import { useEffect, useRef, useState } from 'react';

// Guided camera for one capture photo. Native getUserMedia with rear-camera
// preference; every failure path lands on the gallery fallback rather than
// a dead end: permission denied, no camera, or an unsupported browser all
// show the same "choose from gallery" input. Capture → review → accept or
// retake; accepting hands a JPEG File to the parent and closes.
export default function CaptureCamera({ purposeLabel, onAccept, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraState, setCameraState] = useState('starting'); // starting | live | unavailable
  const [cameraMessage, setCameraMessage] = useState('');
  const [preview, setPreview] = useState(null); // { blob, url }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('unavailable');
        setCameraMessage('This browser has no camera support — choose a photo from your gallery instead.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraState('live');
      } catch (error) {
        setCameraState('unavailable');
        setCameraMessage(error?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings and reopen, or choose a photo from your gallery.'
          : 'The camera could not be started — choose a photo from your gallery instead.');
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (blob) setPreview({ blob, url: URL.createObjectURL(blob) });
  };

  const accept = () => {
    if (!preview) return;
    onAccept(new File([preview.blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    onClose();
  };

  const galleryPick = (file) => {
    if (!file) return;
    onAccept(file);
    onClose();
  };

  return (
    <div className="capture-camera" role="dialog" aria-label={`Capture ${purposeLabel} photo`}>
      <div className="control-label">{purposeLabel}</div>

      {preview ? (
        <>
          <img className="capture-camera-view" src={preview.url} alt={`${purposeLabel} preview — accept or retake`} />
          <div className="export-buttons">
            <button type="button" className="btn-primary" onClick={accept}>Use This Photo</button>
            <button type="button" className="btn-secondary" onClick={() => setPreview(null)}>Retake</button>
          </div>
        </>
      ) : (
        <>
          {cameraState !== 'unavailable' && (
            <video ref={videoRef} className="capture-camera-view" autoPlay playsInline muted />
          )}
          {cameraState === 'unavailable' && (
            <div className="control-sublabel" role="status">{cameraMessage}</div>
          )}
          <div className="export-buttons">
            {cameraState === 'live' && (
              <button type="button" className="btn-primary" onClick={takePhoto}>Take Photo</button>
            )}
            <label className="btn-secondary capture-gallery-btn">
              Choose from Gallery
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => galleryPick(e.target.files?.[0])}
              />
            </label>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
