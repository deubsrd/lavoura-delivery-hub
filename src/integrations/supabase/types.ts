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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      atendentes: {
        Row: {
          created_at: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["atendente_role"]
          unidade_id: string
        }
        Insert: {
          created_at?: string
          id: string
          nome?: string
          role?: Database["public"]["Enums"]["atendente_role"]
          unidade_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          role?: Database["public"]["Enums"]["atendente_role"]
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendentes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendentes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cpf: string
          created_at: string
          id: string
          nome_completo: string
          telefone: string
          ultima_referencia: string | null
          ultima_referencia_entrega: string | null
          ultima_rua: string | null
          ultima_rua_entrega: string | null
          ultimo_bairro: string | null
          ultimo_bairro_entrega: string | null
          ultimo_complemento: string | null
          ultimo_complemento_entrega: string | null
          ultimo_mesmo_endereco_entrega: boolean | null
          ultimo_numero: string | null
          ultimo_numero_entrega: string | null
          unidade_id: string
          updated_at: string
        }
        Insert: {
          cpf: string
          created_at?: string
          id?: string
          nome_completo: string
          telefone: string
          ultima_referencia?: string | null
          ultima_referencia_entrega?: string | null
          ultima_rua?: string | null
          ultima_rua_entrega?: string | null
          ultimo_bairro?: string | null
          ultimo_bairro_entrega?: string | null
          ultimo_complemento?: string | null
          ultimo_complemento_entrega?: string | null
          ultimo_mesmo_endereco_entrega?: boolean | null
          ultimo_numero?: string | null
          ultimo_numero_entrega?: string | null
          unidade_id: string
          updated_at?: string
        }
        Update: {
          cpf?: string
          created_at?: string
          id?: string
          nome_completo?: string
          telefone?: string
          ultima_referencia?: string | null
          ultima_referencia_entrega?: string | null
          ultima_rua?: string | null
          ultima_rua_entrega?: string | null
          ultimo_bairro?: string | null
          ultimo_bairro_entrega?: string | null
          ultimo_complemento?: string | null
          ultimo_complemento_entrega?: string | null
          ultimo_mesmo_endereco_entrega?: boolean | null
          ultimo_numero?: string | null
          ultimo_numero_entrega?: string | null
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracao_precos: {
        Row: {
          created_at: string
          id: string
          unidade_id: string
          updated_at: string
          valor_atendente_por_pedido: number
          valor_lavagem_por_cesto: number
          valor_secagem_por_cesto: number
        }
        Insert: {
          created_at?: string
          id?: string
          unidade_id: string
          updated_at?: string
          valor_atendente_por_pedido: number
          valor_lavagem_por_cesto: number
          valor_secagem_por_cesto: number
        }
        Update: {
          created_at?: string
          id?: string
          unidade_id?: string
          updated_at?: string
          valor_atendente_por_pedido?: number
          valor_lavagem_por_cesto?: number
          valor_secagem_por_cesto?: number
        }
        Relationships: [
          {
            foreignKeyName: "configuracao_precos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: true
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracao_precos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: true
            referencedRelation: "unidades_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      faixas_delivery: {
        Row: {
          created_at: string
          distancia_ate_km: number
          id: string
          unidade_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          distancia_ate_km: number
          id?: string
          unidade_id: string
          valor: number
        }
        Update: {
          created_at?: string
          distancia_ate_km?: number
          id?: string
          unidade_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "faixas_delivery_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faixas_delivery_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_pedido: {
        Row: {
          created_at: string
          id: string
          pedido_id: string
          resposta: string | null
          status_notificado: Database["public"]["Enums"]["pedido_status"]
          sucesso: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          pedido_id: string
          resposta?: string | null
          status_notificado: Database["public"]["Enums"]["pedido_status"]
          sucesso: boolean
        }
        Update: {
          created_at?: string
          id?: string
          pedido_id?: string
          resposta?: string | null
          status_notificado?: Database["public"]["Enums"]["pedido_status"]
          sucesso?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_delivery"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_status_historico: {
        Row: {
          id: string
          observacao: string | null
          pedido_id: string
          status: Database["public"]["Enums"]["pedido_status"]
          timestamp: string
        }
        Insert: {
          id?: string
          observacao?: string | null
          pedido_id: string
          status: Database["public"]["Enums"]["pedido_status"]
          timestamp?: string
        }
        Update: {
          id?: string
          observacao?: string | null
          pedido_id?: string
          status?: Database["public"]["Enums"]["pedido_status"]
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_status_historico_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_delivery"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_delivery: {
        Row: {
          bairro: string
          bairro_entrega: string | null
          cliente_id: string | null
          complemento: string | null
          complemento_entrega: string | null
          created_at: string
          data_entrega_efetiva: string | null
          data_pedido: string
          data_prevista_retorno: string | null
          desconto_descricao: string | null
          distancia_km: number | null
          id: string
          ip_origem: string | null
          mesmo_endereco_entrega: boolean | null
          motivo_cancelamento: string | null
          motoboy_nome: string | null
          nome_completo: string
          numero: string
          numero_entrega: string | null
          observacoes: string | null
          quantidade_cestos: number
          referencia: string | null
          referencia_entrega: string | null
          rua: string
          rua_entrega: string | null
          status: Database["public"]["Enums"]["pedido_status"]
          telefone: string
          tipo_servico: Database["public"]["Enums"]["tipo_servico"]
          unidade_id: string
          updated_at: string
          valor_atendente: number | null
          valor_delivery: number | null
          valor_desconto: number
          valor_lavagem: number | null
          valor_secagem: number | null
          valor_total: number | null
        }
        Insert: {
          bairro: string
          bairro_entrega?: string | null
          cliente_id?: string | null
          complemento?: string | null
          complemento_entrega?: string | null
          created_at?: string
          data_entrega_efetiva?: string | null
          data_pedido?: string
          data_prevista_retorno?: string | null
          desconto_descricao?: string | null
          distancia_km?: number | null
          id?: string
          ip_origem?: string | null
          mesmo_endereco_entrega?: boolean | null
          motivo_cancelamento?: string | null
          motoboy_nome?: string | null
          nome_completo: string
          numero: string
          numero_entrega?: string | null
          observacoes?: string | null
          quantidade_cestos?: number
          referencia?: string | null
          referencia_entrega?: string | null
          rua: string
          rua_entrega?: string | null
          status?: Database["public"]["Enums"]["pedido_status"]
          telefone: string
          tipo_servico: Database["public"]["Enums"]["tipo_servico"]
          unidade_id: string
          updated_at?: string
          valor_atendente?: number | null
          valor_delivery?: number | null
          valor_desconto?: number
          valor_lavagem?: number | null
          valor_secagem?: number | null
          valor_total?: number | null
        }
        Update: {
          bairro?: string
          bairro_entrega?: string | null
          cliente_id?: string | null
          complemento?: string | null
          complemento_entrega?: string | null
          created_at?: string
          data_entrega_efetiva?: string | null
          data_pedido?: string
          data_prevista_retorno?: string | null
          desconto_descricao?: string | null
          distancia_km?: number | null
          id?: string
          ip_origem?: string | null
          mesmo_endereco_entrega?: boolean | null
          motivo_cancelamento?: string | null
          motoboy_nome?: string | null
          nome_completo?: string
          numero?: string
          numero_entrega?: string | null
          observacoes?: string | null
          quantidade_cestos?: number
          referencia?: string | null
          referencia_entrega?: string | null
          rua?: string
          rua_entrega?: string | null
          status?: Database["public"]["Enums"]["pedido_status"]
          telefone?: string
          tipo_servico?: Database["public"]["Enums"]["tipo_servico"]
          unidade_id?: string
          updated_at?: string
          valor_atendente?: number | null
          valor_delivery?: number | null
          valor_desconto?: number
          valor_lavagem?: number | null
          valor_secagem?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_delivery_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_delivery_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_delivery_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios_unidade: {
        Row: {
          ativo: boolean
          dia_semana: number
          hora_abertura: string
          hora_fechamento: string
          id: string
          unidade_id: string
        }
        Insert: {
          ativo?: boolean
          dia_semana: number
          hora_abertura?: string
          hora_fechamento?: string
          id?: string
          unidade_id: string
        }
        Update: {
          ativo?: boolean
          dia_semana?: number
          hora_abertura?: string
          hora_fechamento?: string
          id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "horarios_unidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horarios_unidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      promocoes_dia_semana: {
        Row: {
          aplica_em: Database["public"]["Enums"]["aplica_desconto_em"]
          ativo: boolean
          created_at: string
          dia_semana: number
          id: string
          tipo_desconto: Database["public"]["Enums"]["tipo_desconto"]
          unidade_id: string
          valor: number
        }
        Insert: {
          aplica_em?: Database["public"]["Enums"]["aplica_desconto_em"]
          ativo?: boolean
          created_at?: string
          dia_semana: number
          id?: string
          tipo_desconto: Database["public"]["Enums"]["tipo_desconto"]
          unidade_id: string
          valor: number
        }
        Update: {
          aplica_em?: Database["public"]["Enums"]["aplica_desconto_em"]
          ativo?: boolean
          created_at?: string
          dia_semana?: number
          id?: string
          tipo_desconto?: Database["public"]["Enums"]["tipo_desconto"]
          unidade_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "promocoes_dia_semana_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocoes_dia_semana_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          cidade: string
          codigo_convite: string
          created_at: string
          endereco_completo: string | null
          hora_abertura: string
          hora_fechamento: string
          hora_limite_pedido: string
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          prazo_padrao_horas: number
          quantidade_maquinas: number
          slug: string
        }
        Insert: {
          cidade: string
          codigo_convite?: string
          created_at?: string
          endereco_completo?: string | null
          hora_abertura?: string
          hora_fechamento?: string
          hora_limite_pedido?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          prazo_padrao_horas?: number
          quantidade_maquinas?: number
          slug: string
        }
        Update: {
          cidade?: string
          codigo_convite?: string
          created_at?: string
          endereco_completo?: string | null
          hora_abertura?: string
          hora_fechamento?: string
          hora_limite_pedido?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          prazo_padrao_horas?: number
          quantidade_maquinas?: number
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      unidades_publico: {
        Row: {
          cidade: string | null
          created_at: string | null
          hora_abertura: string | null
          hora_fechamento: string | null
          hora_limite_pedido: string | null
          id: string | null
          nome: string | null
          prazo_padrao_horas: number | null
          slug: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string | null
          hora_abertura?: string | null
          hora_fechamento?: string | null
          hora_limite_pedido?: string | null
          id?: string | null
          nome?: string | null
          prazo_padrao_horas?: number | null
          slug?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string | null
          hora_abertura?: string | null
          hora_fechamento?: string | null
          hora_limite_pedido?: string | null
          id?: string | null
          nome?: string | null
          prazo_padrao_horas?: number | null
          slug?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      minha_unidade_id: { Args: never; Returns: string }
      sou_admin: { Args: never; Returns: boolean }
      unidade_por_codigo_convite: { Args: { codigo: string }; Returns: string }
    }
    Enums: {
      aplica_desconto_em:
        | "tudo"
        | "lavagem"
        | "secagem"
        | "atendente"
        | "delivery"
      atendente_role: "atendente" | "admin"
      pedido_status:
        | "recebido"
        | "motoboy_busca"
        | "processando"
        | "pronto"
        | "motoboy_entrega"
        | "entregue"
        | "cancelado"
      tipo_desconto: "percentual" | "valor_fixo"
      tipo_servico: "busca" | "entrega" | "busca_e_entrega"
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
      aplica_desconto_em: [
        "tudo",
        "lavagem",
        "secagem",
        "atendente",
        "delivery",
      ],
      atendente_role: ["atendente", "admin"],
      pedido_status: [
        "recebido",
        "motoboy_busca",
        "processando",
        "pronto",
        "motoboy_entrega",
        "entregue",
        "cancelado",
      ],
      tipo_desconto: ["percentual", "valor_fixo"],
      tipo_servico: ["busca", "entrega", "busca_e_entrega"],
    },
  },
} as const
