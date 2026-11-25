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
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    // Prevent native pull-to-refresh on mobile browsers for this container
    document.body.style.overscrollBehaviorY = 'none';

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && !isRefreshingRef.current) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshingRef.current) return;
      currentY.current = e.touches[0].clientY;
      const distance = currentY.current - startY.current;

      if (distance > 6 && window.scrollY <= 0) {
        if (e.cancelable) e.preventDefault();
        const nextDistance = Math.min((distance - 6) * 0.4, 70);
        pullDistanceRef.current = nextDistance;
        setPullDistance(nextDistance);
      } else if (distance < 0) {
        // User is scrolling down normally; release pull tracking
        isPulling.current = false;
        if (pullDistanceRef.current !== 0) {
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;

      if (pullDistanceRef.current >= 50 && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        pullDistanceRef.current = 50;
        setPullDistance(50);
        try {
          await onRefreshRef.current();
        } finally {
          isRefreshingRef.current = false;
          setIsRefreshing(false);
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
      } else if (pullDistanceRef.current !== 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.body.style.overscrollBehaviorY = 'auto';
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const isActive = pullDistance > 0 || isRefreshing;

  return (
    <div className="relative min-h-screen overflow-x-clip">
       {/* Refresh Indicator */}
       {isActive && (
         <div 
           className="fixed top-0 left-0 right-0 flex justify-center items-start pt-4 z-50 pointer-events-none"
           style={{ transform: `translate3d(0, ${Math.max(pullDistance - 40, 8)}px, 0)` }}
         >
            <div 
              className="w-10 h-10 rounded-full bg-[#12141E] border border-white/15 shadow-xl flex items-center justify-center text-indigo-400"
              style={{ transform: `rotate(${pullDistance * 5}deg)` }}
            >
               <Loader2 className={isRefreshing ? "animate-spin" : ""} size={20} />
            </div>
         </div>
       )}
       
       {/* Content - only promote/transform when actively pulling */}
       <div 
         style={isActive ? {
           transform: `translate3d(0, ${pullDistance}px, 0)`,
           transition: isPulling.current ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
         } : undefined}
         className="min-h-screen"
       >
         {children}
       </div>
    </div>
  );
}
