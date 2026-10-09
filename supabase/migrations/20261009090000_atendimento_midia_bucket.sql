-- Bucket de mídia do atendimento (anexos enviados pelo time: imagem, áudio,
-- documento). O schema de atendimento_mensagens já suporta mídia desde o
-- Step 11 (colunas tipo/midia_url) — só faltava onde guardar o arquivo.
--
-- Privado, acesso via signed URL — mesmo padrão do bucket cliente-documentos
-- (migration 20261006121000). Mesmos 6 papéis que já leem/escrevem
-- atendimento_mensagens (migration 20260826170000): quem pode mandar
-- mensagem pode subir o anexo que vai nela.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'atendimento-midia',
  'atendimento-midia',
  false,
  15728640, -- 15 MB — abaixo do limite de 16 MB de mídia do WhatsApp/Z-API
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/ogg','audio/webm','audio/wav','audio/mpeg','audio/mp4',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Time select atendimento midia" ON storage.objects;
CREATE POLICY "Time select atendimento midia"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'atendimento-midia' AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'gestor_tributario'::public.app_role) OR
    public.has_role(auth.uid(), 'pmo'::public.app_role) OR
    public.has_role(auth.uid(), 'comercial'::public.app_role) OR
    public.has_role(auth.uid(), 'gestor_comercial'::public.app_role) OR
    public.has_role(auth.uid(), 'sdr'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Time insert atendimento midia" ON storage.objects;
CREATE POLICY "Time insert atendimento midia"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'atendimento-midia' AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'gestor_tributario'::public.app_role) OR
    public.has_role(auth.uid(), 'pmo'::public.app_role) OR
    public.has_role(auth.uid(), 'comercial'::public.app_role) OR
    public.has_role(auth.uid(), 'gestor_comercial'::public.app_role) OR
    public.has_role(auth.uid(), 'sdr'::public.app_role)
  )
);

-- Só admin/pmo/gestor_tributario apagam — mesma régua do cliente-documentos.
DROP POLICY IF EXISTS "Time delete atendimento midia" ON storage.objects;
CREATE POLICY "Time delete atendimento midia"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'atendimento-midia' AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'gestor_tributario'::public.app_role) OR
    public.has_role(auth.uid(), 'pmo'::public.app_role)
  )
);

COMMIT;
