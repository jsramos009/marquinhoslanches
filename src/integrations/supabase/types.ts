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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_note: string | null
          created_at: string
          id: string
          opened_at: string
          opened_by: string | null
          opening_note: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_note?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          opened_by?: string | null
          opening_note?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_note?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          opened_by?: string | null
          opening_note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      couriers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          id: string
          last_address: string | null
          last_neighborhood: string | null
          last_order_at: string | null
          name: string | null
          orders_count: number
          phone: string
          total_spent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_address?: string | null
          last_neighborhood?: string | null
          last_order_at?: string | null
          name?: string | null
          orders_count?: number
          phone: string
          total_spent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_address?: string | null
          last_neighborhood?: string | null
          last_order_at?: string | null
          name?: string | null
          orders_count?: number
          phone?: string
          total_spent?: number
          updated_at?: string
        }
        Relationships: []
      }
      delivery_fees: {
        Row: {
          created_at: string
          fee: number
          id: string
          is_active: boolean
          neighborhood: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee?: number
          id?: string
          is_active?: boolean
          neighborhood: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee?: number
          id?: string
          is_active?: boolean
          neighborhood?: string
          updated_at?: string
        }
        Relationships: []
      }
      dining_consumption_batches: {
        Row: {
          batch_number: number
          created_at: string
          created_by: string | null
          dining_session_id: string
          id: string
          notes: string | null
          request_key: string
        }
        Insert: {
          batch_number: number
          created_at?: string
          created_by?: string | null
          dining_session_id: string
          id?: string
          notes?: string | null
          request_key: string
        }
        Update: {
          batch_number?: number
          created_at?: string
          created_by?: string | null
          dining_session_id?: string
          id?: string
          notes?: string | null
          request_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "dining_consumption_batches_dining_session_id_fkey"
            columns: ["dining_session_id"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dining_session_item_addons: {
        Row: {
          addon_id: string | null
          addon_name_snapshot: string
          created_at: string
          dining_session_item_id: string
          id: string
          quantity: number
          unit_price_snapshot: number
        }
        Insert: {
          addon_id?: string | null
          addon_name_snapshot: string
          created_at?: string
          dining_session_item_id: string
          id?: string
          quantity: number
          unit_price_snapshot: number
        }
        Update: {
          addon_id?: string | null
          addon_name_snapshot?: string
          created_at?: string
          dining_session_item_id?: string
          id?: string
          quantity?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "dining_session_item_addons_dining_session_item_id_fkey"
            columns: ["dining_session_item_id"]
            isOneToOne: false
            referencedRelation: "dining_session_items"
            referencedColumns: ["id"]
          },
        ]
      }
      dining_session_items: {
        Row: {
          created_at: string
          dining_consumption_batch_id: string
          dining_session_id: string
          id: string
          line_total: number
          notes: string | null
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_snapshot: number
        }
        Insert: {
          created_at?: string
          dining_consumption_batch_id: string
          dining_session_id: string
          id?: string
          line_total: number
          notes?: string | null
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_snapshot: number
        }
        Update: {
          created_at?: string
          dining_consumption_batch_id?: string
          dining_session_id?: string
          id?: string
          line_total?: number
          notes?: string | null
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "dining_session_items_dining_consumption_batch_id_fkey"
            columns: ["dining_consumption_batch_id"]
            isOneToOne: false
            referencedRelation: "dining_consumption_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dining_session_items_dining_session_id_fkey"
            columns: ["dining_session_id"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dining_sessions: {
        Row: {
          cash_amount: number | null
          change_for: number | null
          closed_at: string | null
          closed_by: string | null
          customer_address: string | null
          customer_name: string | null
          customer_phone: string | null
          dining_table_id: string
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          payment_method: string | null
          secondary_payment_method: string | null
          service_charge_amount: number
          service_charge_percent: number
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          cash_amount?: number | null
          change_for?: number | null
          closed_at?: string | null
          closed_by?: string | null
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          dining_table_id: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          payment_method?: string | null
          secondary_payment_method?: string | null
          service_charge_amount?: number
          service_charge_percent?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cash_amount?: number | null
          change_for?: number | null
          closed_at?: string | null
          closed_by?: string | null
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          dining_table_id?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          payment_method?: string | null
          secondary_payment_method?: string | null
          service_charge_amount?: number
          service_charge_percent?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dining_sessions_dining_table_id_fkey"
            columns: ["dining_table_id"]
            isOneToOne: false
            referencedRelation: "dining_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      dining_tables: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          table_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          table_number: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          table_number?: number
        }
        Relationships: []
      }
      order_item_addons: {
        Row: {
          addon_id: string | null
          addon_name_snapshot: string
          created_at: string
          id: string
          order_item_id: string
          quantity: number
          unit_price_snapshot: number
        }
        Insert: {
          addon_id?: string | null
          addon_name_snapshot: string
          created_at?: string
          id?: string
          order_item_id: string
          quantity?: number
          unit_price_snapshot: number
        }
        Update: {
          addon_id?: string | null
          addon_name_snapshot?: string
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_addons_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          notes: string | null
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_snapshot: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_snapshot: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cash_amount: number | null
          cash_session_id: string | null
          change_for: number | null
          channel: Database["public"]["Enums"]["order_channel"]
          confirmed_at: string | null
          courier_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee: number
          delivery_mode: string
          delivery_neighborhood: string | null
          discount: number
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          ready_at: string | null
          secondary_payment_method:
            | Database["public"]["Enums"]["order_payment_method"]
            | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cash_amount?: number | null
          cash_session_id?: string | null
          change_for?: number | null
          channel?: Database["public"]["Enums"]["order_channel"]
          confirmed_at?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_mode?: string
          delivery_neighborhood?: string | null
          discount?: number
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["order_payment_method"]
          ready_at?: string | null
          secondary_payment_method?:
            | Database["public"]["Enums"]["order_payment_method"]
            | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cash_amount?: number | null
          cash_session_id?: string | null
          change_for?: number | null
          channel?: Database["public"]["Enums"]["order_channel"]
          confirmed_at?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_mode?: string
          delivery_neighborhood?: string | null
          discount?: number
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["order_payment_method"]
          ready_at?: string | null
          secondary_payment_method?:
            | Database["public"]["Enums"]["order_payment_method"]
            | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          attempts: number
          auto_print: boolean
          claimed_at: string | null
          created_at: string
          document_type: string
          id: string
          job_key: string
          last_error: string | null
          lease_expires_at: string | null
          payload: Json
          printed_at: string | null
          source_id: string
          source_kind: string
          station_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          auto_print?: boolean
          claimed_at?: string | null
          created_at?: string
          document_type: string
          id?: string
          job_key: string
          last_error?: string | null
          lease_expires_at?: string | null
          payload: Json
          printed_at?: string | null
          source_id: string
          source_kind: string
          station_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          auto_print?: boolean
          claimed_at?: string | null
          created_at?: string
          document_type?: string
          id?: string
          job_key?: string
          last_error?: string | null
          lease_expires_at?: string | null
          payload?: Json
          printed_at?: string | null
          source_id?: string
          source_kind?: string
          station_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      print_system_state: {
        Row: {
          activated_at: string
          created_at: string
          last_online_scan_at: string | null
          singleton: boolean
          updated_at: string
        }
        Insert: {
          activated_at?: string
          created_at?: string
          last_online_scan_at?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          activated_at?: string
          created_at?: string
          last_online_scan_at?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      product_addons: {
        Row: {
          addon_id: string
          created_at: string
          product_id: string
          sort_order: number
        }
        Insert: {
          addon_id: string
          created_at?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          addon_id?: string
          created_at?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          accepts_addons: boolean
          category_id: string
          cost: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          sort_order: number
          stock_quantity: number | null
          suggestion_order: number | null
          track_stock: boolean
        }
        Insert: {
          accepts_addons?: boolean
          category_id: string
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          sort_order?: number
          stock_quantity?: number | null
          suggestion_order?: number | null
          track_stock?: boolean
        }
        Update: {
          accepts_addons?: boolean
          category_id?: string
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          stock_quantity?: number | null
          suggestion_order?: number | null
          track_stock?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_cash_session_id: { Args: never; Returns: string }
      dashboard_metrics: { Args: { _range?: string }; Returns: Json }
      dining_add_consumption: {
        Args: {
          p_created_by: string
          p_items: Json
          p_notes?: string
          p_request_key: string
          p_session_id: string
        }
        Returns: string
      }
      dining_cancel_empty_session: {
        Args: { p_cancelled_by: string; p_session_id: string }
        Returns: undefined
      }
      dining_close_session: {
        Args: {
          p_cash_amount?: number
          p_change_for?: number
          p_closed_by: string
          p_notes?: string
          p_payment_method: string
          p_secondary_payment_method?: string
          p_service_charge_percent: number
          p_session_id: string
        }
        Returns: string
      }
      dining_open_session:
        | {
            Args: {
              p_customer_name?: string
              p_opened_by: string
              p_table_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_customer_address?: string
              p_customer_name?: string
              p_customer_phone?: string
              p_opened_by: string
              p_table_id: string
            }
            Returns: string
          }
      dining_set_active_count: {
        Args: { p_active_count: number }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_staff_access: { Args: { _user_id: string }; Returns: boolean }
      print_claim_job: {
        Args: { p_job_id: string; p_station_id: string }
        Returns: {
          attempts: number
          auto_print: boolean
          claimed_at: string | null
          created_at: string
          document_type: string
          id: string
          job_key: string
          last_error: string | null
          lease_expires_at: string | null
          payload: Json
          printed_at: string | null
          source_id: string
          source_kind: string
          station_id: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      print_claim_next_job: {
        Args: { p_station_id: string }
        Returns: {
          attempts: number
          auto_print: boolean
          claimed_at: string | null
          created_at: string
          document_type: string
          id: string
          job_key: string
          last_error: string | null
          lease_expires_at: string | null
          payload: Json
          printed_at: string | null
          source_id: string
          source_kind: string
          station_id: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      print_complete_job: {
        Args: { p_job_id: string; p_station_id: string }
        Returns: undefined
      }
      print_fail_job: {
        Args: { p_error: string; p_job_id: string; p_station_id: string }
        Returns: undefined
      }
      print_renew_job_claim: {
        Args: {
          p_hold_seconds?: number
          p_job_id: string
          p_station_id: string
        }
        Returns: undefined
      }
      print_reopen_job: { Args: { p_job_id: string }; Returns: undefined }
      print_retry_job: { Args: { p_job_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "staff" | "balcao"
      order_channel: "whatsapp" | "balcao" | "telefone" | "outro"
      order_payment_method:
        | "pix"
        | "cartao_credito"
        | "cartao_debito"
        | "dinheiro"
        | "nao_informado"
      order_status:
        | "recebido"
        | "em_producao"
        | "pronto"
        | "entregue"
        | "cancelado"
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
      app_role: ["admin", "staff", "balcao"],
      order_channel: ["whatsapp", "balcao", "telefone", "outro"],
      order_payment_method: [
        "pix",
        "cartao_credito",
        "cartao_debito",
        "dinheiro",
        "nao_informado",
      ],
      order_status: [
        "recebido",
        "em_producao",
        "pronto",
        "entregue",
        "cancelado",
      ],
    },
  },
} as const
