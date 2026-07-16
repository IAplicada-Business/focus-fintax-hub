# Validação Fox — SQL + gráficos + emissão de relatório

## 1) SQL `20260708` — validado no banco

View `v_cliente_totais_calculo` para Maravista (CNPJ `30140610000151`):

| Métrica | Valor no banco | Planilha |
|---------|----------------|----------|
| Crédito apurado | **5.783.964,78** | Insumos 2.407.515,09 + Subvenção 3.376.449,69 |
| Total compensado | **2.771.471,64** | 2.407.515,09 + 363.956,55 |
| Saldo restante | **3.012.493,14** | bate |
| Teses no cálculo | **2** | Insumos + Subvenção |
| Possíveis futuros | **0** | Reporto não entra |

SQL da Controle de créditos: **OK**.

Financeiro (fluxo de caixa mês a mês → `compensacoes_mensais`): ainda via importador da UI (`Importar fluxo de caixa`), não via esse SQL.

---

## 2) Gaps da call que ainda quebravam visão/relatório

| Gap | Solução aplicada neste commit |
|-----|-------------------------------|
| Dashboard operacional somava Reporto no saldo/ranking | Usa `v_cliente_totais_calculo` + exclui `categoria=reporto` |
| Resumo financeiro do cliente (gráfico) incluía Reporto | KPIs/chart só teses de compensação |
| Executiva: apurado filtrado, compensado não | Compensado/mensal/top também filtrados |
| Label “Reporto” nos filtros | → “Possíveis futuros” |
| % honorário não recalculava valor | Auto em Processos e Compensações Linear |
| WhatsApp recalculava % na hora (divergia) | Usa `honorario_valor` salvo |
| Import Controle não setava `incluir_no_calculo` | Seta INSUMOS/SUBVENCAO=true |
| Emissão sem “feito” para Paulo | Botão “Marcar competência como emitida” (`lancado_mapa`) |

---

## 3) Ainda não é produto completo (backlog explícito)

- Fila SLA / WhatsApp delivery com status `enviado` / falha / prazo (Paulo)
- Página dedicada “Emissões do mês”
- Preenchimento automático DARF/Multa/Juros no PDF do mapa
- Import SQL do Financeiro Fintax (fluxo) — usar modal existente ou gerar SQL sob demanda

---

## 4) Como validar na tela (após merge)

1. Dashboard → Operacional: saldo não deve incluir Reporto  
2. Cliente Maravista → header: ~R$ 5,78M apurado / ~R$ 3,01M saldo  
3. Resumo financeiro: gráfico sem Reporto  
4. Compensações → WhatsApp: valores = honorário salvo; marcar emitida  
5. Grid linear: mudar % → honorário recalcula sozinho  
