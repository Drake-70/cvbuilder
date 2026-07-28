import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

export default function ImageUploader({ onTextExtracted }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setError('Please upload a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB.');
      return;
    }

    setPreview(URL.createObjectURL(file));
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await api.post('/ocr/extract', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onTextExtracted(res.data.text);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to extract text from image');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  return (
    <div className="animate-slide-up">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
          loading
            ? 'border-brand-300 bg-brand-50/50'
            : 'border-surface-200 hover:border-brand-300 hover:bg-brand-50/30'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-brand-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-surface-500">{t('tailor.extractingText', 'Extracting text from image...')}</p>
          </div>
        ) : preview ? (
          <div className="flex flex-col items-center gap-3">
            <img src={preview} alt="Job posting" className="max-h-32 rounded-xl object-contain" />
            <p className="text-xs text-surface-400">{t('tailor.clickToReupload', 'Click or drop to upload a different image')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-surface-500">{t('tailor.dropImage', 'Drop a job posting screenshot here')}</p>
            <p className="text-xs text-surface-400">{t('tailor.orClick', 'or click to browse')}</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-rose-500 text-xs mt-2">{error}</p>
      )}
    </div>
  );
}
