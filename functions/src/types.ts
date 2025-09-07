export interface ServiceField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'email' | 'tel';
  required: boolean;
  pattern?: string; // regex
  options?: string[]; // para selects
  help?: string;
}

export interface Price {
  base: number; // COP
  fee: number;  // COP
  iva: number;  // COP
  total: number; // COP
}

export interface Service {
  id: string; // doc id
  name: string;
  description?: string;
  enabled: boolean;
  price: Price;
  fields: ServiceField[];
  sla_hours: number;
  deliver_channels: ('email' | 'whatsapp')[];
}

export interface Payment {
  mode: 'mock' | 'wompi';
  status: 'pending' | 'paid' | 'failed';
  external_id?: string;
  events?: Array<{ at: string; type: string; payload?: unknown }>;
}

export type OrderStatus = 'pending' | 'queued' | 'in_progress' | 'delivered' | 'rejected';

export interface Order {
  id: string; // doc id
  service_id: string;
  contact: { email: string; phone: string };
  form_data: Record<string, unknown>;
  price_breakdown: Price;
  payment: Payment;
  status: OrderStatus;
  audit: { created_at: string; updated_at: string; actor: 'system' | 'user' | 'operator' };
  delivery?: { pdf_url?: string; sent_email?: boolean; sent_whatsapp?: boolean };
}

export interface Flags {
  payments: { useMock: boolean };
  maintenance?: { enabled: boolean; message?: string };
}
