import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  AMBIENTE_HOME,
  ambientesDisponiveis,
  readStoredAmbiente,
  writeStoredAmbiente,
  type Ambiente,
} from "@/lib/environments";

export function useEnvironment() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const [stored, setStored] = useState<Ambiente | null>(readStoredAmbiente);

  const disponiveis = useMemo(() => ambientesDisponiveis(permissions), [permissions]);
  const permissionsReady = permissions.length > 0;

  const ambiente = useMemo<Ambiente | null>(() => {
    if (stored && disponiveis.includes(stored)) return stored;
    if (disponiveis.length === 1) return disponiveis[0];
    return null;
  }, [stored, disponiveis]);

  useEffect(() => {
    if (disponiveis.length === 1 && stored !== disponiveis[0]) {
      writeStoredAmbiente(disponiveis[0]);
      setStored(disponiveis[0]);
    }
  }, [disponiveis, stored]);

  const setAmbiente = useCallback((next: Ambiente) => {
    writeStoredAmbiente(next);
    setStored(next);
  }, []);

  const switchAmbiente = useCallback(
    (next: Ambiente) => {
      setAmbiente(next);
      navigate(AMBIENTE_HOME[next]);
    },
    [navigate, setAmbiente],
  );

  return {
    ambiente,
    disponiveis,
    canSwitch: disponiveis.length > 1,
    setAmbiente,
    switchAmbiente,
    home: ambiente ? AMBIENTE_HOME[ambiente] : null,
    permissionsReady,
  };
}
