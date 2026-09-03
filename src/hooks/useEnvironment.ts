import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  AMBIENTE_HOME,
  ambientesDisponiveis,
  pathToAmbiente,
  readStoredAmbiente,
  subscribeStoredAmbiente,
  writeStoredAmbiente,
  type Ambiente,
} from "@/lib/environments";

const getServerSnapshot = (): Ambiente | null => null;

export function useEnvironment() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Fonte única: localStorage + assinantes. Todo componente que chama o hook
  // vê a mesma troca na hora (header, sidebar, dashboard).
  const stored = useSyncExternalStore(subscribeStoredAmbiente, readStoredAmbiente, getServerSnapshot);

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
    }
  }, [disponiveis, stored]);

  // A rota manda: chegar numa tela do outro ambiente (link direto, notificação,
  // botão "Ver na esteira") troca o ambiente salvo, pra switcher e sidebar
  // acompanharem em vez de ficarem presos ao valor antigo.
  useEffect(() => {
    const daRota = pathToAmbiente(location.pathname);
    if (daRota && daRota !== stored && disponiveis.includes(daRota)) {
      writeStoredAmbiente(daRota);
    }
  }, [location.pathname, stored, disponiveis]);

  const setAmbiente = useCallback((next: Ambiente) => {
    writeStoredAmbiente(next);
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
