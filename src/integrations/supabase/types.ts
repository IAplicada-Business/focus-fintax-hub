export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      benchmarks_teses: {
        Row: {
          ativo: boolean
          atualizado_em: string
          faturamento_faixa: string
          id: string
          percentual_maximo: number
          percentual_minimo: number
          segmento: string
          tese_nome: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          faturamento_faixa?: string
          id?: string
          percentual_maximo?: number
          percentual_minimo?: number
          segmento?: string
          tese_nome?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          faturamento_faixa?: string
          id?: string
          percentual_maximo?: number
          percentual_minimo?: number
          segmento?: string
          tese_nome?: string
        }
        Relationships: []
      }
      calculadora_leads: {
        Row: {
          aceite_lgpd: boolean
          aceite_lgpd_at: string | null
          criado_em: string
          economia_potencial_anual: number | null
          email: string
          faturamento_mensal: number
          ibs_cbs_estimado: number | null
          id: string
          ip_address: string | null
          ja_faz_recuperacao: boolean
          nome: string
          regime: string
          resultado_dre_atual: Json | null
          resultado_dre_reforma: Json | null
          segmento: string
          telefone: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          aceite_lgpd?: boolean
          aceite_lgpd_at?: string | null
          criado_em?: string
          economia_potencial_anual?: number | null
          email: string
          faturamento_mensal: number
          ibs_cbs_estimado?: number | null
          id?: string
          ip_address?: string | null
          ja_faz_recuperacao?: boolean
          nome: string
          regime: string
          resultado_dre_atual?: Json | null
          resultado_dre_reforma?: Json | null
          segmento: string
          telefone: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          aceite_lgpd?: boolean
          aceite_lgpd_at?: string | null
          criado_em?: string
          economia_potencial_anual?: number | null
          email?: string
          faturamento_mensal?: number
          ibs_cbs_estimado?: number | null
          id?: string
          ip_address?: string | null
          ja_faz_recuperacao?: boolean
          nome?: string
          regime?: string
          resultado_dre_atual?: Json | null
          resultado_dre_reforma?: Json | null
          segmento?: string
          telefone?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      calculadora_snapshots: {
        Row: {
          criado_em: string
          focus_indices_snapshot: Json
          id: string
          input_payload: Json
          lead_id: string
          output_payload: Json
          reforma_config_snapshot: Json
        }
        Insert: {
          criado_em?: string
          focus_indices_snapshot: Json
          id?: string
          input_payload: Json
          lead_id: string
          output_payload: Json
          reforma_config_snapshot: Json
        }
        Update: {
          criado_em?: string
          focus_indices_snapshot?: Json
          id?: string
          input_payload?: Json
          lead_id?: string
          output_payload?: Json
          reforma_config_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "calculadora_snapshots_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "calculadora_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_historico: {
        Row: {
          cliente_id: string
          created_at: string
          descricao: string | null
          id: string
          tipo: string
          usuario_id: string | null
          valor_anterior: Json | null
          valor_novo: Json | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          tipo: string
          usuario_id?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          tipo?: string
          usuario_id?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cliente_historico_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cliente_historico_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_status_compensacao"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "fk_cliente_historico_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      clientes: {
        Row: {
          atualizado_em: string | null
          cnpj: string
          compensacao_outro_escritorio: string | null
          compensando_fintax: boolean | null
          criado_em: string | null
          data_apuracao: string | null
          email: string | null
          empresa: string
          faturamento_faixa: string | null
          id: string
          lead_id: string | null
          nome_contato: string | null
          observacoes: string | null
          regiao: string | null
          regime_tributario: string | null
          segmento: string | null
          status: string | null
          status_operacional:
            | Database["public"]["Enums"]["status_cliente"]
            | null
          taxa_honorario: number | null
          tese_ativa_id: string | null
          whatsapp: string | null
        }
        Insert: {
          atualizado_em?: string | null
          cnpj?: string
          compensacao_outro_escritorio?: string | null
          compensando_fintax?: boolean | null
          criado_em?: string | null
          data_apuracao?: string | null
          email?: string | null
          empresa: string
          faturamento_faixa?: string | null
          id?: string
          lead_id?: string | null
          nome_contato?: string | null
          observacoes?: string | null
          regiao?: string | null
          regime_tributario?: string | null
          segmento?: string | null
          status?: string | null
          status_operacional?:
            | Database["public"]["Enums"]["status_cliente"]
            | null
          taxa_honorario?: number | null
          tese_ativa_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          atualizado_em?: string | null
          cnpj?: string
          compensacao_outro_escritorio?: string | null
          compensando_fintax?: boolean | null
          criado_em?: string | null
          data_apuracao?: string | null
          email?: string | null
          empresa?: string
          faturamento_faixa?: string | null
          id?: string
          lead_id?: string | null
          nome_contato?: string | null
          observacoes?: string | null
          regiao?: string | null
          regime_tributario?: string | null
          segmento?: string | null
          status?: string | null
          status_operacional?:
            | Database["public"]["Enums"]["status_cliente"]
            | null
          taxa_honorario?: number | null
          tese_ativa_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["crm_lead_id"]
          },
          {
            foreignKeyName: "clientes_tese_ativa_id_fkey"
            columns: ["tese_ativa_id"]
            isOneToOne: false
            referencedRelation: "teses_tributarias"
            referencedColumns: ["id"]
          },
        ]
      }
      compensacoes_mensais: {
        Row: {
          cliente_id: string
          criado_em: string | null
          honorario_percentual: number | null
          honorario_valor: number | null
          id: string
          lancado_mapa: boolean
          mes_referencia: string
          nfse_valor: number | null
          observacao: string | null
          processo_tese_id: string | null
          status_pagamento: string | null
          status_pagamento_honorario: Database["public"]["Enums"]["status_pagamento"]
          tese_origem_id: string | null
          tributo: string | null
          tributo_enum: Database["public"]["Enums"]["tributo"]
          valor_compensado: number | null
          valor_nf_servico: number | null
          vencimento_debito: string | null
        }
        Insert: {
          cliente_id: string
          criado_em?: string | null
          honorario_percentual?: number | null
          honorario_valor?: number | null
          id?: string
          lancado_mapa?: boolean
          mes_referencia: string
          nfse_valor?: number | null
          observacao?: string | null
          processo_tese_id?: string | null
          status_pagamento?: string | null
          status_pagamento_honorario?: Database["public"]["Enums"]["status_pagamento"]
          tese_origem_id?: string | null
          tributo?: string | null
          tributo_enum: Database["public"]["Enums"]["tributo"]
          valor_compensado?: number | null
          valor_nf_servico?: number | null
          vencimento_debito?: string | null
        }
        Update: {
          cliente_id?: string
          criado_em?: string | null
          honorario_percentual?: number | null
          honorario_valor?: number | null
          id?: string
          lancado_mapa?: boolean
          mes_referencia?: string
          nfse_valor?: number | null
          observacao?: string | null
          processo_tese_id?: string | null
          status_pagamento?: string | null
          status_pagamento_honorario?: Database["public"]["Enums"]["status_pagamento"]
          tese_origem_id?: string | null
          tributo?: string | null
          tributo_enum?: Database["public"]["Enums"]["tributo"]
          valor_compensado?: number | null
          valor_nf_servico?: number | null
          vencimento_debito?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compensacoes_mensais_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensacoes_mensais_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_status_compensacao"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "compensacoes_mensais_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "compensacoes_mensais_processo_tese_id_fkey"
            columns: ["processo_tese_id"]
            isOneToOne: false
            referencedRelation: "processos_teses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensacoes_mensais_tese_origem_id_fkey"
            columns: ["tese_origem_id"]
            isOneToOne: false
            referencedRelation: "teses_tributarias"
            referencedColumns: ["id"]
          },
        ]
      }
      creditos_apurados: {
        Row: {
          atualizado_em: string
          cliente_id: string
          criado_em: string
          data_apuracao: string | null
          id: string
          incluir_no_calculo: boolean
          observacoes: string | null
          status_utilizacao: string | null
          tese_id: string
          valor_apurado_inicial: number
          valor_compensado_manual: number | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id: string
          criado_em?: string
          data_apuracao?: string | null
          id?: string
          incluir_no_calculo?: boolean
          observacoes?: string | null
          status_utilizacao?: string | null
          tese_id: string
          valor_apurado_inicial: number
          valor_compensado_manual?: number | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string
          criado_em?: string
          data_apuracao?: string | null
          id?: string
          incluir_no_calculo?: boolean
          observacoes?: string | null
          status_utilizacao?: string | null
          tese_id?: string
          valor_apurado_inicial?: number
          valor_compensado_manual?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creditos_apurados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_apurados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_status_compensacao"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "creditos_apurados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "creditos_apurados_tese_id_fkey"
            columns: ["tese_id"]
            isOneToOne: false
            referencedRelation: "teses_tributarias"
            referencedColumns: ["id"]
          },
        ]
      }
      dcomps: {
        Row: {
          compensacao_id: string
          criado_em: string
          id: string
          numero_declaracao: string
        }
        Insert: {
          compensacao_id: string
          criado_em?: string
          id?: string
          numero_declaracao: string
        }
        Update: {
          compensacao_id?: string
          criado_em?: string
          id?: string
          numero_declaracao?: string
        }
        Relationships: [
          {
            foreignKeyName: "dcomps_compensacao_id_fkey"
            columns: ["compensacao_id"]
            isOneToOne: false
            referencedRelation: "compensacoes_mensais"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnosticos_leads: {
        Row: {
          criado_em: string | null
          descricao_comercial: string | null
          estimativa_maxima: number | null
          estimativa_minima: number | null
          id: string
          lead_id: string
          ordem_exibicao: number | null
          percentual_maximo: number | null
          percentual_minimo: number | null
          tese_nome: string
        }
        Insert: {
          criado_em?: string | null
          descricao_comercial?: string | null
          estimativa_maxima?: number | null
          estimativa_minima?: number | null
          id?: string
          lead_id: string
          ordem_exibicao?: number | null
          percentual_maximo?: number | null
          percentual_minimo?: number | null
          tese_nome: string
        }
        Update: {
          criado_em?: string | null
          descricao_comercial?: string | null
          estimativa_maxima?: number | null
          estimativa_minima?: number | null
          id?: string
          lead_id?: string
          ordem_exibicao?: number | null
          percentual_maximo?: number | null
          percentual_minimo?: number | null
          tese_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnosticos_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnosticos_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["crm_lead_id"]
          },
        ]
      }
      focus_indices: {
        Row: {
          ativo: boolean
          criado_em: string
          entra_na_exclusao_credito: boolean
          gera_credito_ibs_cbs: boolean
          grupo: string
          id: string
          ordem_exibicao: number | null
          percentual_sobre_faturamento: number
          rubrica: string
          segmento: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          entra_na_exclusao_credito?: boolean
          gera_credito_ibs_cbs?: boolean
          grupo: string
          id?: string
          ordem_exibicao?: number | null
          percentual_sobre_faturamento?: number
          rubrica: string
          segmento: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          entra_na_exclusao_credito?: boolean
          gera_credito_ibs_cbs?: boolean
          grupo?: string
          id?: string
          ordem_exibicao?: number | null
          percentual_sobre_faturamento?: number
          rubrica?: string
          segmento?: string
        }
        Relationships: []
      }
      intimacoes: {
        Row: {
          cliente_id: string | null
          created_at: string
          criado_por: string | null
          data_intimacao: string | null
          empresa_nome: string
          id: string
          motivo: string
          observacoes: string | null
          prazo_dias: number | null
          prazo_vencimento: string | null
          proximo_passo: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_intimacao?: string | null
          empresa_nome: string
          id?: string
          motivo: string
          observacoes?: string | null
          prazo_dias?: number | null
          prazo_vencimento?: string | null
          proximo_passo?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_intimacao?: string | null
          empresa_nome?: string
          id?: string
          motivo?: string
          observacoes?: string | null
          prazo_dias?: number | null
          prazo_vencimento?: string | null
          proximo_passo?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intimacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intimacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_status_compensacao"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "intimacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      lead_historico: {
        Row: {
          anotacao: string | null
          criado_em: string | null
          criado_por: string | null
          de_etapa: string | null
          id: string
          lead_id: string
          para_etapa: string
        }
        Insert: {
          anotacao?: string | null
          criado_em?: string | null
          criado_por?: string | null
          de_etapa?: string | null
          id?: string
          lead_id: string
          para_etapa: string
        }
        Update: {
          anotacao?: string | null
          criado_em?: string | null
          criado_por?: string | null
          de_etapa?: string | null
          id?: string
          lead_id?: string
          para_etapa?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_lead_historico_lead"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_lead_historico_lead"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["crm_lead_id"]
          },
          {
            foreignKeyName: "lead_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["crm_lead_id"]
          },
        ]
      }
      leads: {
        Row: {
          calculadora_lead_id: string | null
          cnpj: string
          created_by: string | null
          criado_em: string
          email: string
          empresa: string
          faturamento_faixa: string
          id: string
          nome: string
          observacoes: string | null
          origem: string
          regime_tributario: string
          score_lead: number | null
          segmento: string
          status: string
          status_funil: string
          status_funil_atualizado_em: string | null
          token: string
          whatsapp: string
        }
        Insert: {
          calculadora_lead_id?: string | null
          cnpj?: string
          created_by?: string | null
          criado_em?: string
          email?: string
          empresa?: string
          faturamento_faixa?: string
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: string
          regime_tributario?: string
          score_lead?: number | null
          segmento?: string
          status?: string
          status_funil?: string
          status_funil_atualizado_em?: string | null
          token?: string
          whatsapp?: string
        }
        Update: {
          calculadora_lead_id?: string | null
          cnpj?: string
          created_by?: string | null
          criado_em?: string
          email?: string
          empresa?: string
          faturamento_faixa?: string
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: string
          regime_tributario?: string
          score_lead?: number | null
          segmento?: string
          status?: string
          status_funil?: string
          status_funil_atualizado_em?: string | null
          token?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_calculadora_lead_id_fkey"
            columns: ["calculadora_lead_id"]
            isOneToOne: false
            referencedRelation: "calculadora_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_sets: {
        Row: {
          campaign_id: string | null
          daily_budget: number | null
          end_time: string | null
          id: string
          name: string | null
          raw: Json | null
          start_time: string | null
          status: string | null
          synced_at: string
          targeting: Json | null
        }
        Insert: {
          campaign_id?: string | null
          daily_budget?: number | null
          end_time?: string | null
          id: string
          name?: string | null
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          synced_at?: string
          targeting?: Json | null
        }
        Update: {
          campaign_id?: string | null
          daily_budget?: number | null
          end_time?: string | null
          id?: string
          name?: string | null
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          synced_at?: string
          targeting?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      meta_ads: {
        Row: {
          ad_set_id: string | null
          campaign_id: string | null
          creative_id: string | null
          id: string
          name: string | null
          raw: Json | null
          status: string | null
          synced_at: string
        }
        Insert: {
          ad_set_id?: string | null
          campaign_id?: string | null
          creative_id?: string | null
          id: string
          name?: string | null
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Update: {
          ad_set_id?: string | null
          campaign_id?: string | null
          creative_id?: string | null
          id?: string
          name?: string | null
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "meta_ads_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "meta_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          ad_account_id: string
          created_time: string | null
          daily_budget: number | null
          id: string
          lifetime_budget: number | null
          name: string | null
          objective: string | null
          raw: Json | null
          start_time: string | null
          status: string | null
          stop_time: string | null
          synced_at: string
        }
        Insert: {
          ad_account_id: string
          created_time?: string | null
          daily_budget?: number | null
          id: string
          lifetime_budget?: number | null
          name?: string | null
          objective?: string | null
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          synced_at?: string
        }
        Update: {
          ad_account_id?: string
          created_time?: string | null
          daily_budget?: number | null
          id?: string
          lifetime_budget?: number | null
          name?: string | null
          objective?: string | null
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      meta_creatives: {
        Row: {
          body: string | null
          id: string
          image_url: string | null
          name: string | null
          raw: Json | null
          synced_at: string
          thumbnail_url: string | null
          title: string | null
        }
        Insert: {
          body?: string | null
          id: string
          image_url?: string | null
          name?: string | null
          raw?: Json | null
          synced_at?: string
          thumbnail_url?: string | null
          title?: string | null
        }
        Update: {
          body?: string | null
          id?: string
          image_url?: string | null
          name?: string | null
          raw?: Json | null
          synced_at?: string
          thumbnail_url?: string | null
          title?: string | null
        }
        Relationships: []
      }
      meta_credentials: {
        Row: {
          active: boolean
          ad_account_id: string
          app_id: string
          business_id: string | null
          created_at: string
          id: number
          ig_business_account_id: string | null
          page_id: string
          pixel_id: string | null
          updated_at: string
          waba_id: string | null
          webhook_verify_token: string
        }
        Insert: {
          active?: boolean
          ad_account_id: string
          app_id: string
          business_id?: string | null
          created_at?: string
          id?: number
          ig_business_account_id?: string | null
          page_id: string
          pixel_id?: string | null
          updated_at?: string
          waba_id?: string | null
          webhook_verify_token: string
        }
        Update: {
          active?: boolean
          ad_account_id?: string
          app_id?: string
          business_id?: string | null
          created_at?: string
          id?: number
          ig_business_account_id?: string | null
          page_id?: string
          pixel_id?: string | null
          updated_at?: string
          waba_id?: string | null
          webhook_verify_token?: string
        }
        Relationships: []
      }
      meta_execution_log: {
        Row: {
          context: Json | null
          error_text: string | null
          finished_at: string | null
          function_name: string
          id: number
          ok: boolean | null
          rows_affected: number | null
          started_at: string
        }
        Insert: {
          context?: Json | null
          error_text?: string | null
          finished_at?: string | null
          function_name: string
          id?: number
          ok?: boolean | null
          rows_affected?: number | null
          started_at?: string
        }
        Update: {
          context?: Json | null
          error_text?: string | null
          finished_at?: string | null
          function_name?: string
          id?: number
          ok?: boolean | null
          rows_affected?: number | null
          started_at?: string
        }
        Relationships: []
      }
      meta_insights_daily: {
        Row: {
          actions: Json | null
          clicks: number | null
          cost_per_action_type: Json | null
          cost_per_lead: number | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          date: string
          frequency: number | null
          id: number
          impressions: number | null
          leads: number | null
          level: string
          link_clicks: number | null
          object_id: string
          raw: Json | null
          reach: number | null
          spend: number | null
          synced_at: string
        }
        Insert: {
          actions?: Json | null
          clicks?: number | null
          cost_per_action_type?: Json | null
          cost_per_lead?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          date: string
          frequency?: number | null
          id?: number
          impressions?: number | null
          leads?: number | null
          level: string
          link_clicks?: number | null
          object_id: string
          raw?: Json | null
          reach?: number | null
          spend?: number | null
          synced_at?: string
        }
        Update: {
          actions?: Json | null
          clicks?: number | null
          cost_per_action_type?: Json | null
          cost_per_lead?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          date?: string
          frequency?: number | null
          id?: number
          impressions?: number | null
          leads?: number | null
          level?: string
          link_clicks?: number | null
          object_id?: string
          raw?: Json | null
          reach?: number | null
          spend?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      meta_leadgen_forms: {
        Row: {
          created_time: string | null
          id: string
          leads_count: number | null
          name: string | null
          page_id: string
          questions: Json | null
          raw: Json | null
          status: string | null
          synced_at: string
        }
        Insert: {
          created_time?: string | null
          id: string
          leads_count?: number | null
          name?: string | null
          page_id: string
          questions?: Json | null
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Update: {
          created_time?: string | null
          id?: string
          leads_count?: number | null
          name?: string | null
          page_id?: string
          questions?: Json | null
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      meta_leads: {
        Row: {
          ad_id: string | null
          campaign_id: string | null
          cnpj: string | null
          created_time: string | null
          crm_lead_id: string | null
          email: string | null
          error_text: string | null
          faturamento_estimado: number | null
          faturamento_faixa: string | null
          field_data: Json
          form_id: string | null
          id: string
          inserted_at: string
          ja_fez_compensacao: boolean | null
          nome: string | null
          page_id: string
          phone: string | null
          processed_at: string | null
          raw: Json | null
          razao_social: string | null
          regime_tributacao: string | null
          segmento: string | null
        }
        Insert: {
          ad_id?: string | null
          campaign_id?: string | null
          cnpj?: string | null
          created_time?: string | null
          crm_lead_id?: string | null
          email?: string | null
          error_text?: string | null
          faturamento_estimado?: number | null
          faturamento_faixa?: string | null
          field_data: Json
          form_id?: string | null
          id: string
          inserted_at?: string
          ja_fez_compensacao?: boolean | null
          nome?: string | null
          page_id: string
          phone?: string | null
          processed_at?: string | null
          raw?: Json | null
          razao_social?: string | null
          regime_tributacao?: string | null
          segmento?: string | null
        }
        Update: {
          ad_id?: string | null
          campaign_id?: string | null
          cnpj?: string | null
          created_time?: string | null
          crm_lead_id?: string | null
          email?: string | null
          error_text?: string | null
          faturamento_estimado?: number | null
          faturamento_faixa?: string | null
          field_data?: Json
          form_id?: string | null
          id?: string
          inserted_at?: string
          ja_fez_compensacao?: boolean | null
          nome?: string | null
          page_id?: string
          phone?: string | null
          processed_at?: string | null
          raw?: Json | null
          razao_social?: string | null
          regime_tributacao?: string | null
          segmento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_leads_crm_lead_id_fkey"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_leads_crm_lead_id_fkey"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["crm_lead_id"]
          },
          {
            foreignKeyName: "meta_leads_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "meta_leadgen_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_log_tributo_20260706: {
        Row: {
          compensacao_id: string
          id: string
          migrated_at: string
          tributo_final: Database["public"]["Enums"]["tributo"]
          tributo_original: string | null
        }
        Insert: {
          compensacao_id: string
          id?: string
          migrated_at?: string
          tributo_final: Database["public"]["Enums"]["tributo"]
          tributo_original?: string | null
        }
        Update: {
          compensacao_id?: string
          id?: string
          migrated_at?: string
          tributo_final?: Database["public"]["Enums"]["tributo"]
          tributo_original?: string | null
        }
        Relationships: []
      }
      motor_teses_config: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          atualizado_por: string | null
          descricao_comercial: string | null
          id: string
          nome_exibicao: string
          ordem_exibicao: number | null
          percentual_max: number
          percentual_min: number
          regimes_elegiveis: string[]
          segmentos_elegiveis: string[]
          tese: string
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          atualizado_por?: string | null
          descricao_comercial?: string | null
          id?: string
          nome_exibicao: string
          ordem_exibicao?: number | null
          percentual_max: number
          percentual_min: number
          regimes_elegiveis?: string[]
          segmentos_elegiveis?: string[]
          tese: string
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          atualizado_por?: string | null
          descricao_comercial?: string | null
          id?: string
          nome_exibicao?: string
          ordem_exibicao?: number | null
          percentual_max?: number
          percentual_min?: number
          regimes_elegiveis?: string[]
          segmentos_elegiveis?: string[]
          tese?: string
        }
        Relationships: []
      }
      observacoes_cliente: {
        Row: {
          cliente_id: string
          created_by: string | null
          criado_em: string
          data: string
          id: string
          texto: string
        }
        Insert: {
          cliente_id: string
          created_by?: string | null
          criado_em?: string
          data?: string
          id?: string
          texto: string
        }
        Update: {
          cliente_id?: string
          created_by?: string | null
          criado_em?: string
          data?: string
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "observacoes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_status_compensacao"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "observacoes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      processos_teses: {
        Row: {
          atualizado_em: string | null
          categoria: string
          cliente_id: string
          criado_em: string | null
          id: string
          nome_exibicao: string
          observacao: string | null
          percentual_honorario: number | null
          status_contrato: string | null
          status_processo: string | null
          tese: string
          valor_credito: number | null
          valor_honorario: number | null
        }
        Insert: {
          atualizado_em?: string | null
          categoria?: string
          cliente_id: string
          criado_em?: string | null
          id?: string
          nome_exibicao: string
          observacao?: string | null
          percentual_honorario?: number | null
          status_contrato?: string | null
          status_processo?: string | null
          tese: string
          valor_credito?: number | null
          valor_honorario?: number | null
        }
        Update: {
          atualizado_em?: string | null
          categoria?: string
          cliente_id?: string
          criado_em?: string | null
          id?: string
          nome_exibicao?: string
          observacao?: string | null
          percentual_honorario?: number | null
          status_contrato?: string | null
          status_processo?: string | null
          tese?: string
          valor_credito?: number | null
          valor_honorario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_processos_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_processos_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_status_compensacao"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "fk_processos_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "processos_teses_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_teses_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_status_compensacao"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "processos_teses_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      profiles: {
        Row: {
          cargo: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          cargo?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          cargo?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reforma_config: {
        Row: {
          atualizado_em: string
          chave: string
          descricao: string | null
          valor: number
        }
        Insert: {
          atualizado_em?: string
          chave: string
          descricao?: string | null
          valor: number
        }
        Update: {
          atualizado_em?: string
          chave?: string
          descricao?: string | null
          valor?: number
        }
        Relationships: []
      }
      relatorios_leads: {
        Row: {
          conteudo_html: string
          criado_em: string
          enviado_em: string | null
          enviado_whatsapp: boolean
          estimativa_total_maxima: number
          estimativa_total_minima: number
          id: string
          lead_id: string
          score: number
          teses_identificadas: Json
        }
        Insert: {
          conteudo_html?: string
          criado_em?: string
          enviado_em?: string | null
          enviado_whatsapp?: boolean
          estimativa_total_maxima?: number
          estimativa_total_minima?: number
          id?: string
          lead_id: string
          score?: number
          teses_identificadas?: Json
        }
        Update: {
          conteudo_html?: string
          criado_em?: string
          enviado_em?: string | null
          enviado_whatsapp?: boolean
          estimativa_total_maxima?: number
          estimativa_total_minima?: number
          id?: string
          lead_id?: string
          score?: number
          teses_identificadas?: Json
        }
        Relationships: [
          {
            foreignKeyName: "relatorios_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relatorios_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["crm_lead_id"]
          },
        ]
      }
      teses_tributarias: {
        Row: {
          ativo: boolean
          atualizado_em: string
          codigo: Database["public"]["Enums"]["tese_tributaria"]
          criado_em: string
          id: string
          incluir_no_calculo: boolean
          label: string
          visivel_cliente: boolean
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          codigo: Database["public"]["Enums"]["tese_tributaria"]
          criado_em?: string
          id?: string
          incluir_no_calculo?: boolean
          label: string
          visivel_cliente?: boolean
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          codigo?: Database["public"]["Enums"]["tese_tributaria"]
          criado_em?: string
          id?: string
          incluir_no_calculo?: boolean
          label?: string
          visivel_cliente?: boolean
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_access: boolean
          created_at: string | null
          id: string
          read_only: boolean
          screen_key: string
          user_id: string
        }
        Insert: {
          can_access?: boolean
          created_at?: string | null
          id?: string
          read_only?: boolean
          screen_key: string
          user_id: string
        }
        Update: {
          can_access?: boolean
          created_at?: string | null
          id?: string
          read_only?: boolean
          screen_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_cliente_totais_calculo: {
        Row: {
          cliente_id: string | null
          credito_apurado: number | null
          possiveis_creditos_futuros: number | null
          saldo_restante: number | null
          teses_fora_calculo: number | null
          teses_no_calculo: number | null
          total_compensado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creditos_apurados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_apurados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_status_compensacao"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "creditos_apurados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_clientes_status_compensacao: {
        Row: {
          cliente_id: string | null
          compensacao_outro_escritorio: string | null
          compensando_fintax: boolean | null
          status_principal: string | null
          tem_alguma_tese_assinada: boolean | null
          tem_compensacao_mes_corrente: boolean | null
          tem_compensacao_qualquer: boolean | null
          tem_judicial: boolean | null
          tem_reporto: boolean | null
          tem_tese_ativa: boolean | null
          todos_encerrados: boolean | null
          ultima_competencia_compensada: string | null
        }
        Relationships: []
      }
      v_mapa_creditos: {
        Row: {
          cliente_id: string | null
          incluir_no_calculo: boolean | null
          saldo_final: number | null
          status_utilizacao: string | null
          tese_codigo: Database["public"]["Enums"]["tese_tributaria"] | null
          tese_id: string | null
          tese_label: string | null
          total_compensado: number | null
          valor_apurado_inicial: number | null
          visivel_cliente: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "creditos_apurados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_apurados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_status_compensacao"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "creditos_apurados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_meta_lead_funnel"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "creditos_apurados_tese_id_fkey"
            columns: ["tese_id"]
            isOneToOne: false
            referencedRelation: "teses_tributarias"
            referencedColumns: ["id"]
          },
        ]
      }
      v_meta_lead_funnel: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          cliente_id: string | null
          cliente_status: string | null
          cnpj: string | null
          crm_lead_at: string | null
          crm_lead_id: string | null
          crm_status: string | null
          email: string | null
          faturamento_estimado: number | null
          faturamento_faixa: string | null
          form_name: string | null
          ja_fez_compensacao: boolean | null
          lead_at: string | null
          meta_lead_id: string | null
          nome: string | null
          objective: string | null
          phone: string | null
          razao_social: string | null
          regime_tributacao: string | null
          relatorio_id: string | null
          relatorio_score: number | null
          segmento: string | null
          valor_estimado_max: number | null
          valor_estimado_min: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calcular_diagnostico: {
        Args: {
          _faturamento_mensal: number
          _lead_id: string
          _regime: string
          _segmento: string
        }
        Returns: undefined
      }
      get_diagnostico_by_token: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "pmo" | "gestor_tributario" | "comercial" | "cliente"
      regime_tributario: "lucro_real" | "lucro_presumido" | "simples_nacional"
      status_cliente: "fechado" | "relatorio_enviado" | "em_analise" | "ativo"
      status_pagamento: "pendente" | "pago"
      tese_tributaria:
        | "INSUMOS"
        | "SUBVENCAO"
        | "ICMS_ST"
        | "EXCLUSAO_ICMS_BC"
        | "PIS_COFINS_JUD"
        | "PREVIDENCIARIO"
        | "REPORTO"
      tributo:
        | "INSS_52"
        | "INSS_retidos"
        | "PIS"
        | "COFINS"
        | "IRPJ_CSLL_agregado"
        | "DCTWEB_trimestral"
        | "outros"
        | "ICMS"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "pmo", "gestor_tributario", "comercial", "cliente"],
      regime_tributario: ["lucro_real", "lucro_presumido", "simples_nacional"],
      status_cliente: ["fechado", "relatorio_enviado", "em_analise", "ativo"],
      status_pagamento: ["pendente", "pago"],
      tese_tributaria: [
        "INSUMOS",
        "SUBVENCAO",
        "ICMS_ST",
        "EXCLUSAO_ICMS_BC",
        "PIS_COFINS_JUD",
        "PREVIDENCIARIO",
        "REPORTO",
      ],
      tributo: [
        "INSS_52",
        "INSS_retidos",
        "PIS",
        "COFINS",
        "IRPJ_CSLL_agregado",
        "DCTWEB_trimestral",
        "outros",
        "ICMS",
      ],
    },
  },
} as const
