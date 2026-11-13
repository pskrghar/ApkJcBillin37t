import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { 
  ArrowDownTrayIcon, 
  DevicePhoneMobileIcon, 
  CheckCircleIcon,
  XMarkIcon,
  ShareIcon
} from '@heroicons/react/24/outline';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'navbar' | 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  className = '',
  variant = 'navbar'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If already installed in standalone mode, do not show install prompt
  if (isInstalled) {
    return null;
  }

  // If not installable and not iOS, hide button
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIosInstructions(true);
      return;
    }

    try {
      setIsInstalling(true);
      await install();
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <>
      <button
        id="btn-pwa-install-app"
        onClick={handleInstallClick}
        disabled={isInstalling}
        title="Install JCBilling as Desktop/Mobile standalone application"
        className={`relative inline-flex items-center gap-2 font-semibold transition-all duration-200 shadow-sm active:scale-95 ${
          variant === 'navbar'
            ? 'px-3.5 py-1.5 text-xs rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/20 border border-emerald-400/30'
            : variant === 'compact'
            ? 'p-2 rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/20'
            : 'w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white justify-center text-sm shadow-md'
        } ${className}`}
      >
        <ArrowDownTrayIcon className={`animate-bounce ${variant === 'compact' ? 'w-5 h-5' : 'w-4 h-4'}`} />
        {variant !== 'compact' && (
          <span className="whitespace-nowrap font-medium">
            {isInstalling ? 'Installing...' : 'Install App'}
          </span>
        )}
        <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
      </button>

      {/* iOS Installation Instruction Modal */}
      {showIosInstructions && (
        <div 
          id="modal-ios-install"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative w-full max-w-md p-6 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl text-slate-100">
            <button
              onClick={() => setShowIosInstructions(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded-lg bg-slate-800"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
                <DevicePhoneMobileIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Install on iPhone / iPad</h3>
                <p className="text-xs text-slate-400">Install Remix JCBilling as an offline home app</p>
              </div>
            </div>

            <div className="space-y-3.5 my-5 text-sm text-slate-300">
              <div className="flex items-start gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <div className="p-1.5 bg-indigo-500/20 rounded-lg text-indigo-400 mt-0.5">
                  <ShareIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-white">Step 1: </span>
                  Tap the Safari <strong>Share</strong> button at the bottom of the screen.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <div className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400 mt-0.5">
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-white">Step 2: </span>
                  Scroll down and tap <strong>"Add to Home Screen"</strong>.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <div className="p-1.5 bg-teal-500/20 rounded-lg text-teal-400 mt-0.5">
                  <CheckCircleIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-white">Done: </span>
                  Launch directly from your home screen for full offline scanning!
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIosInstructions(false)}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
