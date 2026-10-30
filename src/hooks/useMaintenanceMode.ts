"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import type { MaintenanceData } from "@/lib/maintenance";

const DEFAULT_MAINTENANCE_DATA: MaintenanceData = {
  enabled: false,
  title: "Maintenance in Progress",
  message: "Platform updates in progress. Voice rooms & features remain active!",
  severity: "warning",
  updated_at: null,
  updated_by: null,
};

export function useMaintenanceMode() {
  const { user, isLoaded } = useUser();
  const [maintenanceData, setMaintenanceData] = useState<MaintenanceData>(DEFAULT_MAINTENANCE_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const cleanName = user?.name?.trim().toLowerCase() || "";
  const cleanUsername = user?.username?.trim().toLowerCase() || "";
  const isSuperAdmin =
    user?.role === "super_admin" ||
    cleanName === "jayanthadmin" ||
    cleanName === "jayanth" ||
    cleanUsername === "jayanthadmin" ||
    cleanUsername === "jayanth";

  // Fetch current maintenance status from API
  const fetchMaintenanceStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/maintenance", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.maintenance) {
          setMaintenanceData(json.maintenance);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch maintenance status:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Subscribe to real-time broadcasts
  useEffect(() => {
    fetchMaintenanceStatus();

    // Check session storage to see if user minimized in current tab
    try {
      const dismissed = sessionStorage.getItem("yapclub_maintenance_dismissed");
      if (dismissed === "true") {
        setIsDismissed(true);
      }
    } catch {}

    const channelId = "maintenance_mode_broadcast";
    const channel = supabase.channel(channelId);

    channel
      .on("broadcast", { event: "maintenance_status_changed" }, (payload: any) => {
        if (payload?.payload) {
          setMaintenanceData(payload.payload);
          // If toggled back on, un-dismiss so user sees the new notification
          if (payload.payload.enabled) {
            setIsDismissed(false);
            try {
              sessionStorage.removeItem("yapclub_maintenance_dismissed");
            } catch {}
          }
        }
      })
      .subscribe();

    // Refresh when user tabs back to the browser window
    const handleFocus = () => {
      fetchMaintenanceStatus();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(channel);
    };
  }, [fetchMaintenanceStatus]);

  // Toggle Maintenance Mode (Super Admin only)
  const toggleMaintenance = useCallback(
    async (enabled: boolean, customMessage?: string, customTitle?: string) => {
      if (!isSuperAdmin) {
        return { success: false, error: "Only Super Admin (jayanthadmin) can toggle maintenance mode." };
      }

      setIsUpdating(true);
      const prevData = { ...maintenanceData };

      // Optimistic update
      const optimisticData: MaintenanceData = {
        ...maintenanceData,
        enabled,
        message: customMessage !== undefined ? customMessage : maintenanceData.message,
        title: customTitle !== undefined ? customTitle : maintenanceData.title,
        updated_at: new Date().toISOString(),
        updated_by: user?.username || user?.name || "jayanthadmin",
      };
      setMaintenanceData(optimisticData);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          ...(user?.name ? { "x-requester-username": user.name } : {}),
          ...(user?.username ? { "x-requester-username": user.username } : {}),
          ...(user?.role ? { "x-requester-role": user.role } : {}),
        };

        const res = await fetch("/api/maintenance", {
          method: "POST",
          headers,
          body: JSON.stringify({
            enabled,
            title: optimisticData.title,
            message: optimisticData.message,
            severity: optimisticData.severity,
            requesterUsername: user?.username || user?.name || "jayanthadmin",
            requesterRole: user?.role || "super_admin",
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to update maintenance mode");
        }

        if (data.maintenance) {
          setMaintenanceData(data.maintenance);
        }

        return { success: true };
      } catch (err: any) {
        // Revert on failure
        setMaintenanceData(prevData);
        return { success: false, error: err.message || "Failed to update maintenance mode" };
      } finally {
        setIsUpdating(false);
      }
    },
    [isSuperAdmin, maintenanceData, user]
  );

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem("yapclub_maintenance_dismissed", "true");
    } catch {}
  }, []);

  const restore = useCallback(() => {
    setIsDismissed(false);
    try {
      sessionStorage.removeItem("yapclub_maintenance_dismissed");
    } catch {}
  }, []);

  return {
    isMaintenance: Boolean(maintenanceData.enabled),
    maintenanceData,
    isLoading,
    isUpdating,
    isSuperAdmin,
    isDismissed,
    toggleMaintenance,
    dismiss,
    restore,
    refetch: fetchMaintenanceStatus,
  };
}
