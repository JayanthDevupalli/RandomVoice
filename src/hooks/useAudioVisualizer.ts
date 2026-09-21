"use client";

import { useEffect, useRef, useState } from "react";

export function useAudioVisualizer(stream: MediaStream | null, isEnabled: boolean = true) {
  const [volume, setVolume] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [frequencies, setFrequencies] = useState<number[]>([0, 0, 0, 0, 0]);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!stream || !isEnabled) {
      setVolume(0);
      setIsSpeaking(false);
      setFrequencies([0, 0, 0, 0, 0]);
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      let lastUpdateTime = 0;

      const updateMeter = (timestamp: number) => {
        animationFrameRef.current = requestAnimationFrame(updateMeter);

        // Throttle updates to ~15fps (every 66ms) to prevent UI lag
        if (timestamp - lastUpdateTime < 66) return;
        lastUpdateTime = timestamp;

        analyser.getByteFrequencyData(dataArray);

        // Calculate peak energy in the vocal range frequencies (approx bins 1 to 24)
        // rather than averaging the whole spectrum, which dilutes the signal.
        let peak = 0;
        const vocalBins = Math.min(24, dataArray.length);
        for (let i = 1; i < vocalBins; i++) {
          if (dataArray[i] > peak) {
            peak = dataArray[i];
          }
        }
        
        // Normalize 0-100 based on peak
        const normalized = Math.min(100, Math.round((peak / 255) * 100));

        setVolume((prev) => {
          if (Math.abs(prev - normalized) > 3) return normalized;
          return prev;
        });
        // Peak threshold of ~18% is usually a good balance for speech vs noise
        setIsSpeaking(normalized > 18);

        // Get 5 visual frequency bands
        const bands = [
          dataArray[2] || 0,
          dataArray[4] || 0,
          dataArray[8] || 0,
          dataArray[12] || 0,
          dataArray[16] || 0,
        ].map((v) => Math.round((v / 255) * 100));

        // Only update frequencies if they actually changed significantly
        setFrequencies((prev) => {
          const changed = prev.some((p, i) => Math.abs(p - bands[i]) > 5);
          return changed ? bands : prev;
        });
      };

      animationFrameRef.current = requestAnimationFrame(updateMeter);
    } catch (err) {
      console.warn("Web Audio API visualizer initialization error:", err);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {}
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        try {
          audioContextRef.current.close();
        } catch (e) {}
      }
    };
  }, [stream, isEnabled]);

  return { volume, isSpeaking, frequencies };
}
