import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

export default function UploadStep({ onComplete, onBack }) {
  const { t } = useTranslation('tailor');
  const { t: tCommon } = useTranslation('common');
  const [mode, setMode] = useState('upload');
  const [pasteText, setPasteText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('cv', file);
      const res = await api.post('/cv/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onComplete(res.data.cvText, 'upload');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to extract text. Try pasting instead.');
      setFileName('');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/cv/paste', { cvText: pasteText.trim() });
      onComplete(res.data.cvText, 'paste');
    } catch {
      onComplete(pasteText.trim(), 'paste');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="btn-ghost mb-4 -ml-2">
        <svg className="w-4 h-4 mr-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
        </svg>
        {tCommon('back')}
      </button>

      <h2 className="text-2xl font-bold text-surface-900 mb-6">{t('upload_cv')}</h2>

      <div className="flex gap-1 p-1 bg-surface-100 rounded-xl mb-6">
        <button onClick={() => setMode('upload')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${mode === 'upload' ? 'bg-surface-0 text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          <svg className="w-4 h-4 mr-1.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {tCommon('upload')} file
        </button>
        <button onClick={() => setMode('paste')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${mode === 'paste' ? 'bg-surface-0 text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          <svg className="w-4 h-4 mr-1.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          </svg>
          Paste text
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-sm p-3 rounded-xl border border-rose-100 mb-4 animate-scale-in">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {mode === 'upload' ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => !loading && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 sm:p-12 text-center cursor-pointer transition-all duration-200 ${dragging ? 'border-brand-400 bg-brand-50/50 scale-[1.01]' : 'border-surface-200 hover:border-brand-300 hover:bg-surface-50'} ${loading ? 'pointer-events-none' : ''}`}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={(e) => handleFile(e.target.files[0])} className="hidden" />
          {loading ? (
            <div className="animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center mx-auto mb-4">
                <svg className="animate-spin h-6 w-6 text-brand-600" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <p className="font-medium text-surface-700 mb-1">Processing {fileName}...</p>
              <p className="text-sm text-surface-400">Extracting text from your file</p>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <p className="font-medium text-surface-700 mb-1">{t('upload_drag')}</p>
              <p className="text-sm text-surface-400">{t('upload_formats')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="animate-fade-in">
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={t('paste_placeholder')} rows={12} className="input-field resize-y min-h-[200px]" />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-surface-400">{pasteText.length > 0 && `${pasteText.split(/\s+/).filter(Boolean).length} words`}</span>
            <button onClick={handlePasteSubmit} disabled={!pasteText.trim()} className="btn-primary !py-2.5">{tCommon('next')} &rarr;</button>
          </div>
        </div>
      )}
    </div>
  );
}
