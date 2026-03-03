// Xcelerate job data
export interface XcelerateJob {
  id: string;
  job_number?: string;
  customer_name: string;
  property_address?: string;
  property_city?: string;
  property_state?: string;
  property_zip?: string;
  customer_phone?: string;
  customer_email?: string;
  status: string;
  substatus?: string;
  loss_type?: string;
  date_of_loss?: string;
  date_received?: string;
  date_scheduled?: string;
  date_started?: string;
  date_completed?: string;
  updated_at?: string;
  project_manager?: string;
  assigned_crew?: string[];
  estimator?: string;
  estimated_amount?: number;
  insurance_company?: string;
  claim_number?: string;
  encircle_claim_id?: string | number;
  qbo_customer_name?: string;
  gdrive_doc_id?: string;
  gdrive_folder_id?: string;
  [key: string]: unknown;
}

export interface XcelerateNote {
  id: string;
  job_id?: string;
  type?: string;
  text: string;
  created_at: string;
  author?: string;
  [key: string]: unknown;
}

export interface ScheduleEntry {
  id: string;
  job_id?: string;
  event_type?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  end_time?: string;
  assigned_to?: string[];
  location?: string;
  notes?: string;
  status?: string;
  customer_name?: string;
  property_address?: string;
  created_at?: string;
  [key: string]: unknown;
}

// Encircle room data
export interface EncircleRoom {
  id: number;
  name: string;
  _structure_id?: number;
  _structure_name?: string;
  [key: string]: unknown;
}

// Encircle claim data
export interface EncircleClaim {
  id: number;
  claim_number?: string;
  policyholder_name?: string;
  loss_address?: string;
  loss_type?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface EncirclePhoto {
  source_id: string;
  source_type?: string;
  filename?: string;
  download_uri: string;
  room_name?: string;
  structure_name?: string;
  labels?: string[];
  creator?: string;
  created?: string;
  [key: string]: unknown;
}

// QBO invoice data (cleaned format from MCP search_invoices)
export interface QBOInvoice {
  id: string;
  doc_number?: string;
  customer?: string;
  txn_date?: string;
  due_date?: string;
  total?: number;
  balance?: number;
  status?: string;
  email_status?: string;
  [key: string]: unknown;
}

// Encircle claim detail (from get_claim)
export interface EncircleClaimDetail {
  id: number;
  policyholder_name?: string;
  policyholder_phone_number?: string;
  policyholder_email_address?: string;
  type_of_loss?: string;
  full_address?: string;
  date_of_loss?: string;
  date_claim_created?: string;
  contractor_identifier?: string;
  insurer_identifier?: string;
  insurance_company_name?: string;
  adjuster_name?: string;
  project_manager_name?: string;
  permalink_url?: string;
  [key: string]: unknown;
}

// Encircle moisture/atmosphere reading
export interface MoistureReading {
  id?: number;
  [key: string]: unknown;
}

// Encircle equipment placed on a claim
export interface EncircleEquipment {
  id?: number;
  [key: string]: unknown;
}

// Encircle note (flattened from claim_notes + room_notes)
export interface EncircleNote {
  id: number;
  title?: string;
  text: string;
  created_at: string;
  author?: string;
  room?: string;
}

// Fire Leads
export type FireLeadStatus = 'new' | 'contacted' | 'pursuing' | 'not_interested' | 'converted' | 'no_answer';

export interface CallNote {
  text: string;
  author?: string;
  created_at?: string;
}

export interface FireLead {
  id: string;
  incident_number?: string;
  incident_type?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  date?: string;
  time?: string;
  fire_department?: string;
  notes?: string;
  owner_name?: string;
  owner_phone?: string;
  owner_address?: string;
  occupancy?: string;
  renter_name?: string;
  renter_phone?: string;
  commercial_name?: string;
  commercial_phone?: string;
  property_details?: string;
  property_value?: string;
  services?: string[];
  status: FireLeadStatus;
  assigned_to?: string;
  source_email_id?: string;
  received_at?: string;
  updated_at?: string;
  contacted_at?: string;
  call_notes?: CallNote[];
}

// Collections
export interface CollectionsData {
  as_of: string;
  last_7_days: number;
  last_30_days: number;
  last_month: {
    period: string;
    total: number;
  };
  ytd: number;
  recent_payments: {
    customer: string;
    amount: number;
    date: string;
    method?: string | null;
  }[];
}

// A/R Aging
export interface AgingInvoice {
  customer: string;
  invoice_num: string;
  invoice_date: string;
  due_date: string;
  balance: number;
  days_outstanding: number;
  bucket: string;
}

export interface AgingBucketSummary {
  count: number;
  total: number;
}

export interface AgingData {
  as_of: string;
  summary: Record<string, AgingBucketSummary>;
  buckets: Record<string, AgingInvoice[]>;
}

// Build Journal
export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  body: string;
  tags: string[];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Website Analytics (GA4)
export interface WebsiteAnalytics {
  property_id: string;
  last_7_days: { users: number; sessions: number; pageviews: number };
  last_28_days: { users: number; sessions: number; pageviews: number };
  top_pages: { path: string; views: number }[];
  daily_trend: { date: string; users: number; sessions: number; pageviews: number }[];
}

// UI state
export type JobTab = 'overview' | 'docs' | 'photos' | 'invoices' | 'notes';

export type StatusFilter = 'all' | 'active' | 'storage' | 'closed';
