-- Anexos cadastrais do cliente (contrato, procuração, contrato social, certidões).
-- Arquivos ficam no bucket cliente-documentos em {cliente_id}/cadastro/{tipo}/...

BEGIN;

CREATE TABLE IF NOT EXISTS public.cliente_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (
    tipo IN ('contrato', 'procuracao', 'contrato_social', 'certidao', 'outro')
  ),
  nome_arquivo text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  tamanho_bytes integer,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cliente_documentos_cliente_criado_idx
  ON public.cliente_documentos (cliente_id, criado_em DESC);

COMMENT ON TABLE public.cliente_documentos IS
  'Documentos cadastrais do cliente (contrato, procuração, contrato social, certidões).';

ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.cliente_documentos TO authenticated;

DROP POLICY IF EXISTS "cliente_documentos_select" ON public.cliente_documentos;
CREATE POLICY "cliente_documentos_select"
ON public.cliente_documentos FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'pmo'::public.app_role)
  OR public.has_role(auth.uid(), 'gestor_tributario'::public.app_role)
  OR public.has_role(auth.uid(), 'comercial'::public.app_role)
  OR public.has_role(auth.uid(), 'sdr'::public.app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
);

DROP POLICY IF EXISTS "cliente_documentos_insert" ON public.cliente_documentos;
CREATE POLICY "cliente_documentos_insert"
ON public.cliente_documentos FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'pmo'::public.app_role)
  OR public.has_role(auth.uid(), 'gestor_tributario'::public.app_role)
);

DROP POLICY IF EXISTS "cliente_documentos_delete" ON public.cliente_documentos;
CREATE POLICY "cliente_documentos_delete"
ON public.cliente_documentos FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'pmo'::public.app_role)
  OR public.has_role(auth.uid(), 'gestor_tributario'::public.app_role)
);

-- Comercial precisa baixar o contrato; o upload continua só com a operação.
DROP POLICY IF EXISTS "operacao_select_cliente_documentos" ON storage.objects;
CREATE POLICY "operacao_select_cliente_documentos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'cliente-documentos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'pmo'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::public.app_role)
    OR public.has_role(auth.uid(), 'comercial'::public.app_role)
    OR public.has_role(auth.uid(), 'sdr'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
  )
);

COMMIT;
