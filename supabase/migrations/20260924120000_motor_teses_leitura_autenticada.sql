-- Catálogo de teses ativas: leitura para qualquer usuário autenticado.
--
-- motor_teses_config só liberava SELECT para admin e pmo. A terceira política
-- ("Service select motor_teses"), que permite ler as teses ativas, vale apenas
-- para o papel anon — usada pela calculadora pública. Resultado: quem entra
-- como gestor_tributario ou comercial lia zero linhas, e o seletor "Tese" do
-- modal Adicionar tese abria vazio, sem erro, porque RLS filtra em silêncio.
--
-- O catálogo de teses ativas é a lista de produtos que a Focus vende; não há
-- nada sensível nele, e quem cadastra a tese de um cliente precisa enxergá-lo.
-- A escrita continua restrita ao admin, pela política "Admin CRUD motor_teses".
CREATE POLICY "Autenticado select motor_teses ativas"
  ON public.motor_teses_config
  FOR SELECT
  TO authenticated
  USING (ativo = true);
