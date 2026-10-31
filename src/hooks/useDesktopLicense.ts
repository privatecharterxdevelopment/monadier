import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface StoredLicense {
  code: string;
  plan_tier: string;
  activated_at: string;
  machine_id: string;
}

export interface LicenseValidation {
  valid: boolean;
  plan_tier?: string;
  error?: string;
}

// Check if running in Tauri (desktop app)
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function useDesktopLicense() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [license, setLicense] = useState<StoredLicense | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if we're in desktop mode and get stored license
  useEffect(() => {
    const checkDesktop = async () => {
      const desktop = isDesktopApp();
      setIsDesktop(desktop);

      if (desktop) {
        try {
          const storedLicense = await invoke<StoredLicense | null>('get_stored_license');
          setLicense(storedLicense);
        } catch (err) {
          console.error('Error getting stored license:', err);
        }
      }

      setIsLoading(false);
    };

    checkDesktop();
  }, []);

  // Get machine ID
  const getMachineId = useCallback(async (): Promise<string | null> => {
    if (!isDesktop) return null;

    try {
      return await invoke<string>('get_machine_id');
    } catch (err) {
      console.error('Error getting machine ID:', err);
      return null;
    }
  }, [isDesktop]);

  // Validate and activate a license code
  const validateLicense = useCallback(async (
    licenseCode: string,
    supabaseUrl: string
  ): Promise<LicenseValidation> => {
    if (!isDesktop) {
      return { valid: false, error: 'Not running in desktop mode' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<LicenseValidation>('validate_license', {
        licenseCode,
        supabaseUrl,
      });

      if (result.valid) {
        // Refresh stored license
        const storedLicense = await invoke<StoredLicense | null>('get_stored_license');
        setLicense(storedLicense);
      } else if (result.error) {
        setError(result.error);
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Validation failed';
      setError(errorMessage);
      return { valid: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [isDesktop]);

  // Clear/deactivate license
  const clearLicense = useCallback(async (): Promise<void> => {
    if (!isDesktop) return;

    try {
      await invoke('clear_license');
      setLicense(null);
    } catch (err) {
      console.error('Error clearing license:', err);
    }
  }, [isDesktop]);

  return {
    isDesktop,
    isLicensed: !!license,
    license,
    isLoading,
    error,
    getMachineId,
    validateLicense,
    clearLicense,
  };
}
