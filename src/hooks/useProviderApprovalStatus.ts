import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ApprovalState, GateKey } from "@/lib/providerApproval/gates";

export interface ProviderApprovalGates {
  identity: boolean;
  identity_in_review: boolean;
  photo: boolean;
  photo_in_review: boolean;
  photo_status: string;
  photo_reason_codes: string[];
  profile: boolean;
  services: boolean;
  quiz: boolean;
  documents: boolean;
  stripe: boolean;
  all_green: boolean;
  missing: GateKey[];
  sandbox_identity: boolean | null;
  production: boolean;
  error?: string;
}

export interface ProviderApprovalStatus {
  state: ApprovalState | null;
  is_public: boolean;
  is_bookable: boolean;
  evaluated_at: string | null;
  photo_moderation_status: string | null;
  gates: ProviderApprovalGates | null;
}

/** Reads the server-authoritative approval state for the signed-in provider. */
export function useProviderApprovalStatus(enabled = true) {
  const [status, setStatus] = useState<ProviderApprovalStatus | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("my_provider_approval_status");
    if (rpcError) {
      setError(rpcError.message);
      setStatus(null);
    } else {
      setStatus(data as unknown as ProviderApprovalStatus);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return { status, gates: status?.gates ?? null, loading, error, refresh };
}
