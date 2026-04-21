import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Trash2, Download, AlertTriangle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useLoans } from '@/context/LoanContext';
import { useToast } from '@/components/common/Toast';

export function ImportPage() {
  const { importFile, exportData, clearAllData } = useApp();
  const { loans } = useLoans();
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  async function handleFile(file: File) {
    if (!file.name.match(/\.xlsx?$/i)) {
      showError('Please select a valid Excel file (.xlsx or .xls)');
      return;
    }
    setLoading(true);
    try {
      await importFile(file);
      showSuccess('Data imported successfully into Supabase!');
    } catch (err) {
      showError('Import failed. Check the file format matches the Loan Tracker template.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleClearData() {
    try {
      await clearAllData();
      setShowClearConfirm(false);
      setConfirmText('');
      showSuccess('All data cleared from Supabase');
    } catch {
      showError('Failed to clear data');
    }
  }

  function openClearConfirm() {
    setConfirmText('');
    setShowClearConfirm(true);
  }

  const hasData = loans.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Import / Export</h2>
        <p className="text-slate-500 mt-1 text-sm">
          Import your Loan_Tracker Excel file to load all data into Supabase, or export current data back to Excel.
        </p>
      </div>

      {/* Import Zone */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2 text-sm">
          <Upload size={16} /> Import from Excel
        </h3>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet size={36} className="mx-auto mb-3 text-slate-300" />
          {loading ? (
            <>
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-indigo-600 font-medium">Importing into Supabase...</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-700">
                Drag & drop your Excel file here, or tap to browse
              </p>
              <p className="text-xs text-slate-400 mt-1">Supports .xlsx and .xls · All data saved to Supabase</p>
            </>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>

      {/* Export */}
      {hasData && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="font-semibold text-slate-800 mb-1.5 flex items-center gap-2 text-sm">
            <Download size={16} /> Export to Excel
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Download all current Supabase data as an Excel file with 4 sheets.
          </p>
          <button
            onClick={() => { exportData(); showSuccess('Excel exported!'); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 w-full sm:w-auto justify-center"
          >
            <Download size={15} /> Export to Excel
          </button>
        </div>
      )}

      {/* Danger Zone */}
      {hasData && (
        <div className="bg-white rounded-2xl border border-red-100 p-5">
          <h3 className="font-semibold text-red-600 mb-1.5 text-sm">Danger Zone</h3>
          <p className="text-sm text-slate-500 mb-4">
            Permanently deletes all loans, payments, and reminders from Supabase. Export first to keep a backup.
          </p>
          <button
            onClick={openClearConfirm}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 w-full sm:w-auto justify-center"
          >
            <Trash2 size={15} /> Clear All Data
          </button>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40" onClick={() => setShowClearConfirm(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm z-10 p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-2 bg-red-100 rounded-full shrink-0">
                  <AlertTriangle size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Clear all data?</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    This will permanently delete all loans and payments from Supabase. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Type <span className="font-bold text-slate-800">CONFIRM</span> to proceed
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CONFIRM"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowClearConfirm(false); setConfirmText(''); }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearData}
                  disabled={confirmText !== 'CONFIRM'}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Delete Everything
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
