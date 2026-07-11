// Fetches a public Blob URL and converts it to a data URL — jsPDF's
// addImage needs an already-loaded image (data URL, or an <img>/Image
// element), it can't take a remote URL directly. Also used for embedding
// downsized Photo attachment thumbnails in the PDF (Phase 7).
export async function urlToDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
