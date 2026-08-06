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
          unidade_id: string
        }
        Insert: {
          created_at?: string
          id: string
          nome?: string
          unidade_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
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
          complemento: string | null
          complemento_entrega: string | null
          created_at: string
          data_entrega_efetiva: string | null
          data_pedido: string
          data_prevista_retorno: string | null
          horario_preferido: Database["public"]["Enums"]["horario_preferido"]
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
        }
        Insert: {
          bairro: string
          bairro_entrega?: string | null
          complemento?: string | null
          complemento_entrega?: string | null
          created_at?: string
          data_entrega_efetiva?: string | null
          data_pedido?: string
          data_prevista_retorno?: string | null
          horario_preferido?: Database["public"]["Enums"]["horario_preferido"]
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
        }
        Update: {
          bairro?: string
          bairro_entrega?: string | null
          complemento?: string | null
          complemento_entrega?: string | null
          created_at?: string
          data_entrega_efetiva?: string | null
          data_pedido?: string
          data_prevista_retorno?: string | null
          horario_preferido?: Database["public"]["Enums"]["horario_preferido"]
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
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_delivery_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          cidade: string
          created_at: string
          id: string
          nome: string
          prazo_padrao_horas: number
          slug: string
        }
        Insert: {
          cidade: string
          created_at?: string
          id?: string
          nome: string
          prazo_padrao_horas?: number
          slug: string
        }
        Update: {
          cidade?: string
          created_at?: string
          id?: string
          nome?: string
          prazo_padrao_horas?: number
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      minha_unidade_id: { Args: never; Returns: string }
    }
    Enums: {
      horario_preferido: "manha" | "tarde" | "sem_preferencia"
      pedido_status:
        | "recebido"
        | "motoboy_busca"
        | "processando"
        | "pronto"
        | "motoboy_entrega"
        | "entregue"
        | "cancelado"
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
      horario_preferido: ["manha", "tarde", "sem_preferencia"],
      pedido_status: [
        "recebido",
        "motoboy_busca",
        "processando",
        "pronto",
        "motoboy_entrega",
        "entregue",
        "cancelado",
      ],
      tipo_servico: ["busca", "entrega", "busca_e_entrega"],
    },
  },
} as const
