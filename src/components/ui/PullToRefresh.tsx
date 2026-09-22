"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);

  useEffect(() => {
    // Prevent native pull-to-refresh on mobile browsers for this container
    document.body.style.overscrollBehaviorY = 'none';
    
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;
      currentY.current = e.touches[0].clientY;
      const distance = currentY.current - startY.current;
      
      if (distance > 0 && window.scrollY <= 0) {
        if (e.cancelable) e.preventDefault(); // prevent native scroll
        setPullDistance(Math.min(distance * 0.4, 70)); // Add friction and max distance
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      
      if (pullDistance >= 50 && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(50); // Hold at threshold
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.body.style.overscrollBehaviorY = 'auto';
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing, onRefresh]);

  return (
    <div className="relative min-h-screen overflow-hidden">
       {/* Refresh Indicator */}
       <div 
         className="absolute top-0 left-0 right-0 flex justify-center items-start pt-4 transition-transform z-50 pointer-events-none"
         style={{ transform: `translateY(${Math.max(pullDistance - 50, -50)}px)` }}
       >
          <div 
            className={`w-10 h-10 rounded-full bg-card border border-white/10 shadow-xl flex items-center justify-center text-indigo-400 transition-opacity ${pullDistance > 0 || isRefreshing ? 'opacity-100' : 'opacity-0'}`}
            style={{ transform: `rotate(${pullDistance * 5}deg)` }}
          >
             <Loader2 className={isRefreshing ? "animate-spin" : ""} size={20} />
          </div>
       </div>
       
       {/* Content */}
       <div 
         style={{ transform: `translateY(${pullDistance}px)`, transition: isPulling.current ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
         className="min-h-screen"
       >
         {children}
       </div>
    </div>
  );
}
