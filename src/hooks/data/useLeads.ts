import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listLeads,
  listLeadsBasic,
  getLeadExceptions,
  updateLeadStatus,
  analyzeLead,
  enviarDiagnosticoWhatsapp,
  createLead,
  updateLead,
  deleteLeads,
  atribuirLeads,
  type LeadUpdatePayload,
  type AtribuicaoLeads,
} from "@/services/leadsService";
import type { Database } from "@/integrations/supabase/types";
import { toastError } from "@/lib/handle-error";
import { toast } from "sonner";
import { mensagemErroEnvio } from "@/lib/diagnostico-whatsapp";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export function useLeadsPipeline() {
  return useQuery({
    queryKey: ["leads", "pipeline"],
    queryFn: listLeads,
  });
}

export function useLeadsBasic(statusFilter?: string) {
  return useQuery({
    queryKey: ["leads", "basic", statusFilter],
    queryFn: () => listLeadsBasic(statusFilter),
  });
}

export function useLeadExceptions() {
  return useQuery({
    queryKey: ["leads", "exceptions"],
    queryFn: getLeadExceptions,
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, statusFunil }: { id: string; statusFunil: string }) =>
      updateLeadStatus(id, statusFunil),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toastError(err, "Erro ao atualizar status do lead"),
  });
}

export function useAnalyzeLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => analyzeLead(leadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Diagnóstico gerado");
    },
    onError: (err) => toastError(err, "Erro ao gerar diagnóstico"),
  });
}

/** Envia o link do diagnóstico pelo WhatsApp da empresa (fila do Atendimento). */
export function useEnviarDiagnosticoWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => enviarDiagnosticoWhatsapp(leadId),
    onSuccess: (r) => {
      if (r.ok) {
        qc.invalidateQueries({ queryKey: ["leads"] });
        toast.success("Diagnóstico enviado no WhatsApp", {
          description: "A mensagem está na conversa do lead em Atendimento.",
        });
      } else {
        toast.error(mensagemErroEnvio(r.erro));
      }
    },
    onError: (err) => toastError(err, "Erro ao enviar diagnóstico"),
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lead: LeadInsert) => createLead(lead),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toastError(err, "Erro ao criar lead"),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LeadUpdatePayload }) =>
      updateLead(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Lead atualizado");
    },
    onError: (err) => toastError(err, "Erro ao atualizar lead"),
  });
}

export function useDeleteLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deleteLeads(ids),
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(ids.length === 1 ? "Lead excluído" : `${ids.length} leads excluídos`);
    },
    onError: (err) => toastError(err, "Erro ao excluir lead"),
  });
}

export function useAtribuirLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, atribuicao }: { ids: string[]; atribuicao: AtribuicaoLeads }) => atribuirLeads(ids, atribuicao),
    onSuccess: (_, { ids }) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(ids.length === 1 ? "Lead atribuído" : `${ids.length} leads atribuídos`);
    },
    onError: (err) => toastError(err, "Erro ao atribuir leads"),
  });
}
