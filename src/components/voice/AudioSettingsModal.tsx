"use client";

import { useEffect, useState } from "react";
import { X, Mic, Volume2, Sliders, ShieldCheck } from "lucide-react";

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  micVolume?: number;
}

export function AudioSettingsModal({ isOpen, onClose, micVolume = 0 }: AudioSettingsModalProps) {
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>("");
  const [selectedOutput, setSelectedOutput] = useState<string>("");
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");
        const outputs = devices.filter((d) => d.kind === "audiooutput");

        setAudioInputs(inputs);
        setAudioOutputs(outputs);

        if (inputs.length > 0 && !selectedInput) {
          setSelectedInput(inputs[0].deviceId);
        }
        if (outputs.length > 0 && !selectedOutput) {
          setSelectedOutput(outputs[0].deviceId);
        }
      } catch (err) {
        console.warn("Could not list audio devices:", err);
      }
    };

    loadDevices();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md p-6 rounded-2xl bg-card border border-slate-300 dark:border-slate-700/80 shadow-2xl text-slate-900 dark:text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-500 dark:text-slate-400 hover:text-white rounded-lg hover:bg-slate-200 dark:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Sliders size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Audio Settings</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Microphone & crystal audio processing</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Live Mic Test Meter */}
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              <span className="flex items-center gap-1.5">
                <Mic size={14} className="text-indigo-400" /> Mic Input Test
              </span>
              <span className="text-slate-700 dark:text-slate-300 font-mono">{micVolume}%</span>
            </div>
            {/* Solid Meter Bar */}
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
              <div
                className="h-full bg-emerald-500 transition-all duration-75 rounded-full"
                style={{ width: `${Math.min(100, micVolume * 1.3)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Speak into your microphone to verify level meter activity.
            </p>
          </div>

          {/* Microphone Device Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Input Device (Microphone)
            </label>
            <select
              value={selectedInput}
              onChange={(e) => setSelectedInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 text-white focus:outline-none focus:border-indigo-500 text-xs"
            >
              {audioInputs.length > 0 ? (
                audioInputs.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))
              ) : (
                <option value="">Default System Microphone</option>
              )}
            </select>
          </div>

          {/* Output Device Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Output Device (Headphones / Speakers)
            </label>
            <select
              value={selectedOutput}
              onChange={(e) => setSelectedOutput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 text-white focus:outline-none focus:border-indigo-500 text-xs"
            >
              {audioOutputs.length > 0 ? (
                audioOutputs.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Speaker ${i + 1}`}
                  </option>
                ))
              ) : (
                <option value="">Default System Output</option>
              )}
            </select>
          </div>

          {/* Audio Enhancements Toggles */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">Noise Suppression</div>
                  <div className="text-[10px] text-slate-500">Filter background keyboard & fan noises</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNoiseSuppression(!noiseSuppression)}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${noiseSuppression ? "bg-indigo-600" : "bg-slate-700"
                  }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${noiseSuppression ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Volume2 size={16} className="text-cyan-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">Echo Cancellation</div>
                  <div className="text-[10px] text-slate-500">Prevent feedback loop from speakers</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEchoCancellation(!echoCancellation)}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${echoCancellation ? "bg-indigo-600" : "bg-slate-700"
                  }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${echoCancellation ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
}
