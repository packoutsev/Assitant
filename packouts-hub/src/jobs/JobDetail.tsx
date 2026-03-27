import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Phone, Mail, Shield, Calendar, Loader2, ExternalLink, FileText, Download, Folder, Image, FileSpreadsheet, File, Video, X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { getMcpClient } from './McpClient';
import StatusBadge from './components/StatusBadge';
import PhotoGrid from './components/PhotoGrid';
import InvoiceTable from './components/InvoiceTable';
import NoteTimeline from './components/NoteTimeline';
import { formatDate } from '../lib/format';
import type {
  XcelerateJob, ScheduleEntry, EncircleClaim, EncircleRoom, EncircleNote,
  EncircleClaimDetail, MoistureReading, EncircleEquipment, QBOInvoice, JobTab,
} from './types';

const TABS: { key: JobTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'docs', label: 'Docs' },
  { key: 'photos', label: 'Photos' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'notes', label: 'Notes' },
];

// Fuzzy name matching — normalize and check inclusion
function namesMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = normalize(a);
  const nb = normalize(b);
  return na.includes(nb) || nb.includes(na);
}

// Flatten Encircle API notes response into a sorted array
interface EncircleNotesResponse {
  claim_notes?: {
    id: number; title?: string; text: string;
    client_created?: string; server_created?: string;
    creator?: { actor_identifier?: string };
  }[];
  room_notes?: Record<string, {
    id: number; title?: string; text: string;
    client_created?: string; server_created?: string;
    creator?: { actor_identifier?: string };
  }[]>;
}

function flattenEncircleNotes(data: EncircleNotesResponse): EncircleNote[] {
  const notes: EncircleNote[] = [];
  const seen = new Set<number>();

  for (const n of data.claim_notes || []) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    notes.push({
      id: n.id, title: n.title, text: n.text,
      created_at: n.client_created || n.server_created || '',
      author: n.creator?.actor_identifier,
    });
  }

  for (const [room, roomNotes] of Object.entries(data.room_notes || {})) {
    for (const n of roomNotes) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      notes.push({
        id: n.id, title: n.title, text: n.text,
        created_at: n.client_created || n.server_created || '',
        author: n.creator?.actor_identifier, room,
      });
    }
  }

  return notes.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

// Format type_of_loss from Encircle's internal format
function formatLossType(raw?: string): string {
  if (!raw) return '';
  return raw.replace(/^type_of_loss_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const [tab, setTab] = useState<JobTab>('overview');
  const [docsSubTab, setDocsSubTab] = useState<'documentation' | 'encircle' | 'drive'>('encircle');

  // Xcelerate state
  const [job, setJob] = useState<XcelerateJob | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [jobLoading, setJobLoading] = useState(true);
  const [jobError, setJobError] = useState<string | null>(null);

  // Encircle state — claim resolution (shared by all tabs)
  const [claimId, setClaimId] = useState<number | null>(null);
  const [claimDetail, setClaimDetail] = useState<EncircleClaimDetail | null>(null);
  const [moistureReadings, setMoistureReadings] = useState<MoistureReading[]>([]);
  const [equipment, setEquipment] = useState<EncircleEquipment[]>([]);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimResolved, setClaimResolved] = useState(false);

  // Encircle state — documents (PDFs from get_media)
  const [documents, setDocuments] = useState<{ filename: string; download_uri: string; creator: string; created: string }[]>([]);
  const [previewDocIndex, setPreviewDocIndex] = useState<number>(-1);

  // Google Drive state — files in project folder
  const [driveFiles, setDriveFiles] = useState<{ id: string; name: string; mime_type: string; size: number | null; modified: string | null; url: string | null; is_folder: boolean }[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveLoaded, setDriveLoaded] = useState(false);
  const [previewDriveIndex, setPreviewDriveIndex] = useState<number>(-1);

  // Encircle state — rooms + notes (lazy for Photos/Notes tabs)
  const [rooms, setRooms] = useState<EncircleRoom[]>([]);
  const [notes, setNotes] = useState<EncircleNote[]>([]);
  const [roomsNotesLoading, setRoomsNotesLoading] = useState(false);
  const [roomsNotesLoaded, setRoomsNotesLoaded] = useState(false);

  // QBO state
  const [invoices, setInvoices] = useState<QBOInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);

  // Load Xcelerate job data on mount
  useEffect(() => {
    if (!jobId) return;
    const xc = getMcpClient('xcelerate');

    Promise.all([
      xc.callTool<XcelerateJob>('get_job', { job_id: jobId }),
      xc.callTool<ScheduleEntry[]>('get_schedule', { job_id: jobId }).catch(() => []),
    ])
      .then(([jobData, scheduleData]) => {
        setJob(jobData);
        setSchedule(Array.isArray(scheduleData) ? scheduleData : []);
      })
      .catch((err) => setJobError(err.message))
      .finally(() => setJobLoading(false));
  }, [jobId]);

  // Resolve Encircle claim on mount (after job loads) — loads overview data
  const claimResolvingRef = useRef(false);
  const resolveEncircleClaim = useCallback(async () => {
    if (claimResolved || claimResolvingRef.current || !job) return;
    claimResolvingRef.current = true;
    setClaimLoading(true);

    try {
      const enc = getMcpClient('encircle');
      let resolvedId: number | null = null;
      let wasReLinked = false;

      // Helper: search by name and return best match
      const searchByName = async (): Promise<number | null> => {
        if (!job.customer_name) return null;
        const nameParts = job.customer_name.split(' ');
        const searchName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : job.customer_name;
        const claims = await enc.callTool<EncircleClaim[]>('search_claims', { policyholder_name: searchName });
        const matched = Array.isArray(claims)
          ? claims.filter((c) => c.policyholder_name && namesMatch(c.policyholder_name, job.customer_name))
          : [];
        return matched.length > 0 ? matched[0].id : null;
      };

      // Fast path: use persisted encircle_claim_id
      if (job.encircle_claim_id) {
        resolvedId = typeof job.encircle_claim_id === 'number'
          ? job.encircle_claim_id
          : parseInt(String(job.encircle_claim_id), 10);

        // Verify the claim still exists (may have been merged/deleted)
        const check = await enc.callTool<EncircleClaimDetail>('get_claim', { claim_id: String(resolvedId) }).catch(() => null);
        if (!check) {
          // Claim was merged or deleted — re-resolve by name
          const newId = await searchByName();
          if (newId) {
            resolvedId = newId;
            wasReLinked = true;
          } else {
            resolvedId = null;
          }
        }
      } else {
        // No persisted ID — search by name
        resolvedId = await searchByName();
        if (resolvedId) wasReLinked = true;
      }

      // Persist new link if we re-resolved
      if (wasReLinked && resolvedId) {
        getMcpClient('xcelerate').callTool('link_job', {
          job_id: job.id, encircle_claim_id: String(resolvedId),
        }).catch(() => {});
      }

      if (resolvedId) {
        setClaimId(resolvedId);
        // Load overview data in parallel
        const [detail, moisture, equip, media] = await Promise.all([
          // Skip get_claim if we already verified it above (non-relinked fast path already has it)
          wasReLinked || !job.encircle_claim_id
            ? enc.callTool<EncircleClaimDetail>('get_claim', { claim_id: String(resolvedId) }).catch(() => null)
            : enc.callTool<EncircleClaimDetail>('get_claim', { claim_id: String(resolvedId) }).catch(() => null),
          enc.callTool<MoistureReading[]>('get_moisture_readings', { claim_id: String(resolvedId) }).catch(() => []),
          enc.callTool<EncircleEquipment[]>('get_equipment', { claim_id: String(resolvedId) }).catch(() => []),
          enc.callTool<{ items: { source_type: string; filename: string; content_type: string; download_uri: string; creator: string; created: string }[] }>('get_media', { claim_id: String(resolvedId) }).catch(() => ({ items: [] })),
        ]);
        if (detail) setClaimDetail(detail);
        setMoistureReadings(Array.isArray(moisture) ? moisture : []);
        setEquipment(Array.isArray(equip) ? equip : []);
        // Extract PDF documents from media
        const mediaItems = (media as { items?: unknown[] })?.items || [];
        const pdfs = (mediaItems as { content_type?: string; source_type?: string; filename?: string; download_uri?: string; creator?: string; created?: string }[])
          .filter((m) => m.content_type === 'application/pdf' || m.source_type === 'ClaimPdfReport')
          .map((m) => ({ filename: m.filename || 'Document', download_uri: m.download_uri || '', creator: m.creator || '', created: m.created || '' }));
        setDocuments(pdfs);
      }
    } catch {
      // Encircle is supplementary
    }

    setClaimLoading(false);
    setClaimResolved(true);
    claimResolvingRef.current = false;
  }, [claimResolved, job]);

  // Trigger claim resolution when job loads
  useEffect(() => {
    if (job && !claimResolved) resolveEncircleClaim();
  }, [job, claimResolved, resolveEncircleClaim]);

  // Lazy-load rooms + notes for Photos/Notes tabs
  const loadRoomsAndNotes = useCallback(async () => {
    if (roomsNotesLoaded || !claimId) return;
    setRoomsNotesLoading(true);
    try {
      const enc = getMcpClient('encircle');
      const [roomData, notesData] = await Promise.all([
        enc.callTool<{ rooms: EncircleRoom[] }>('get_rooms', { claim_id: String(claimId) }).catch(() => []),
        enc.callTool<EncircleNotesResponse>('get_notes', { claim_id: String(claimId) }).catch(() => ({ claim_notes: [], room_notes: {} })),
      ]);
      const roomList = Array.isArray(roomData) ? roomData : ((roomData as { rooms: EncircleRoom[] })?.rooms || []);
      setRooms(roomList);
      setNotes(flattenEncircleNotes(notesData as EncircleNotesResponse));
    } catch { /* silent */ }
    setRoomsNotesLoading(false);
    setRoomsNotesLoaded(true);
  }, [roomsNotesLoaded, claimId]);

  // Lazy-load QBO invoices
  const loadInvoices = useCallback(async () => {
    if (invoicesLoaded || !job?.customer_name) return;
    setInvoicesLoading(true);
    try {
      const qbo = getMcpClient('qbo');
      const nameParts = job.customer_name.split(' ');
      const searchName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : job.customer_name;
      let results = await qbo.callTool<QBOInvoice[]>('search_invoices', { customer_name: searchName });
      if (!Array.isArray(results)) results = [];

      if (results.length === 0 && job.job_number) {
        const byJobNum = await qbo.callTool<QBOInvoice[]>('search_invoices', { customer_name: job.job_number });
        if (Array.isArray(byJobNum)) results = byJobNum;
      }

      // Persist the QBO customer name for future lookups
      if (results.length > 0 && !job.qbo_customer_name) {
        const qboCustomer = results[0].customer || searchName;
        getMcpClient('xcelerate').callTool('link_job', {
          job_id: job.id, qbo_customer_name: qboCustomer,
        }).catch(() => {});
      }

      setInvoices(results);
    } catch { /* silent */ }
    setInvoicesLoading(false);
    setInvoicesLoaded(true);
  }, [invoicesLoaded, job?.customer_name, job?.job_number, job?.qbo_customer_name, job?.id]);

  // Lazy-load Google Drive files
  const loadDriveFiles = useCallback(async () => {
    if (driveLoaded || !job?.gdrive_folder_id) return;
    setDriveLoading(true);
    try {
      const files = await getMcpClient('xcelerate').callTool<{ id: string; name: string; mime_type: string; size: number | null; modified: string | null; url: string | null; is_folder: boolean }[]>(
        'list_drive_files', { folder_id: job.gdrive_folder_id }
      );
      const fileList = Array.isArray(files) ? files : [];
      setDriveFiles(fileList);
      // Auto-select Documentation tab if a "Documentation" Google Doc exists
      const hasDocumentation = fileList.some((f) => {
        if (f.mime_type !== 'application/vnd.google-apps.document') return false;
        const leaf = (f.name.split('/').pop() || f.name).toLowerCase().trim();
        return leaf === 'documentation' || leaf.includes('documentation');
      });
      if (hasDocumentation) setDocsSubTab('documentation');
    } catch { /* silent */ }
    setDriveLoading(false);
    setDriveLoaded(true);
  }, [driveLoaded, job?.gdrive_folder_id]);

  // Tab-switch triggers
  useEffect(() => {
    if ((tab === 'photos' || tab === 'notes') && claimId) loadRoomsAndNotes();
    if (tab === 'docs') loadDriveFiles();
    if (tab === 'invoices') loadInvoices();
  }, [tab, claimId, loadRoomsAndNotes, loadDriveFiles, loadInvoices]);

  if (jobLoading) {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-navy animate-spin" />
        <span className="ml-3 text-gray-500">Loading job...</span>
      </div>
    );
  }

  if (jobError || !job) {
    return (
      <div className="min-h-screen bg-warm">
        <header className="bg-navy text-white">
          <div className="max-w-5xl mx-auto px-6 py-6">
            <Link to="/jobs" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Jobs
            </Link>
          </div>
        </header>
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
            {jobError || 'Job not found'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <Link to="/jobs" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Jobs
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{job.customer_name}</h1>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-white/60">
                {job.property_address && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {job.property_address}{job.property_city ? `, ${job.property_city}` : ''}
                  </span>
                )}
                {job.customer_phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {job.customer_phone}
                  </span>
                )}
                {job.customer_email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    {job.customer_email}
                  </span>
                )}
              </div>
            </div>
            <StatusBadge status={job.status} />
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-navy text-navy'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.label}
                {t.key === 'docs' && (documents.length + driveFiles.filter(f => !f.is_folder).length) > 0 && (
                  <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {documents.length}{driveFiles.filter(f => !f.is_folder).length > 0 ? `+${driveFiles.filter(f => !f.is_folder).length}` : ''}
                  </span>
                )}
                {t.key === 'notes' && notes.length > 0 && (
                  <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {notes.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Job Details Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Job Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {job.job_number && <Field label="Job #" value={job.job_number} mono />}
                {job.loss_type && <Field label="Loss Type" value={job.loss_type} />}
                {job.date_of_loss && <Field label="Loss Date" value={formatDate(job.date_of_loss)} />}
                {job.insurance_company && (
                  <Field label="Insurance" value={job.insurance_company} icon={<Shield className="w-3.5 h-3.5" />} />
                )}
                {job.claim_number && <Field label="Claim #" value={job.claim_number} mono />}
                {job.substatus && <Field label="Substatus" value={job.substatus} />}
                {job.project_manager && <Field label="Project Manager" value={job.project_manager} />}
                {job.assigned_crew && job.assigned_crew.length > 0 && <Field label="Crew" value={job.assigned_crew.join(', ')} />}
                {job.estimator && <Field label="Estimator" value={job.estimator} />}
                {job.estimated_amount != null && <Field label="Estimated Amount" value={`$${job.estimated_amount.toLocaleString()}`} mono />}
                {job.date_received && <Field label="Received" value={formatDate(job.date_received)} />}
                {job.date_scheduled && <Field label="Scheduled" value={formatDate(job.date_scheduled)} />}
                {job.date_started && <Field label="Started" value={formatDate(job.date_started)} />}
                {job.date_completed && <Field label="Completed" value={formatDate(job.date_completed)} />}
                {job.updated_at && <Field label="Last Updated" value={formatDate(job.updated_at)} />}
              </div>
            </div>

            {/* Encircle Claim Details Card */}
            {claimLoading && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-navy animate-spin" />
                  <span className="text-sm text-gray-400">Loading Encircle data...</span>
                </div>
              </div>
            )}
            {claimDetail && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Encircle Claim</h2>
                  {claimDetail.permalink_url && (
                    <a
                      href={claimDetail.permalink_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-navy/60 hover:text-navy flex items-center gap-1 transition-colors"
                    >
                      Open in Encircle <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {claimDetail.policyholder_name && <Field label="Policyholder" value={claimDetail.policyholder_name} />}
                  {claimDetail.type_of_loss && <Field label="Loss Type" value={formatLossType(claimDetail.type_of_loss)} />}
                  {claimDetail.full_address && <Field label="Loss Address" value={claimDetail.full_address} />}
                  {claimDetail.date_of_loss && <Field label="Date of Loss" value={formatDate(claimDetail.date_of_loss)} />}
                  {claimDetail.insurance_company_name && (
                    <Field label="Insurance" value={claimDetail.insurance_company_name} icon={<Shield className="w-3.5 h-3.5" />} />
                  )}
                  {claimDetail.insurer_identifier && <Field label="Policy/Claim #" value={claimDetail.insurer_identifier} mono />}
                  {claimDetail.contractor_identifier && <Field label="Contractor ID" value={claimDetail.contractor_identifier} mono />}
                  {claimDetail.adjuster_name && <Field label="Adjuster" value={claimDetail.adjuster_name} />}
                  {claimDetail.project_manager_name && <Field label="PM (Encircle)" value={claimDetail.project_manager_name} />}
                  {claimDetail.policyholder_phone_number && (
                    <Field label="Policyholder Phone" value={claimDetail.policyholder_phone_number} />
                  )}
                  {claimDetail.policyholder_email_address && (
                    <Field label="Policyholder Email" value={claimDetail.policyholder_email_address} />
                  )}
                  {claimDetail.date_claim_created && <Field label="Claim Created" value={formatDate(claimDetail.date_claim_created)} />}
                </div>
              </div>
            )}

            {/* Moisture Readings Card */}
            {moistureReadings.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Moisture Readings
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {moistureReadings.length} reading{moistureReadings.length !== 1 ? 's' : ''}
                  </span>
                </h2>
                <pre className="text-xs text-gray-600 bg-gray-50 p-4 rounded-lg overflow-x-auto max-h-60">
                  {JSON.stringify(moistureReadings.slice(0, 10), null, 2)}
                </pre>
              </div>
            )}

            {/* Equipment Card */}
            {equipment.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Equipment on Site
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {equipment.length} unit{equipment.length !== 1 ? 's' : ''}
                  </span>
                </h2>
                <pre className="text-xs text-gray-600 bg-gray-50 p-4 rounded-lg overflow-x-auto max-h-60">
                  {JSON.stringify(equipment.slice(0, 10), null, 2)}
                </pre>
              </div>
            )}

            {/* Schedule Card */}
            {schedule.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Schedule</h2>
                <div className="space-y-3">
                  {schedule.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                      <Calendar className="w-4 h-4 text-navy/40 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {entry.event_type || 'Scheduled'}
                          {entry.scheduled_time && ` at ${entry.scheduled_time}`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {entry.scheduled_date && formatDate(entry.scheduled_date)}
                          {entry.assigned_to && entry.assigned_to.length > 0 && ` · ${entry.assigned_to.join(', ')}`}
                        </p>
                        {entry.notes && <p className="text-xs text-gray-500 mt-0.5">{entry.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'docs' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            {/* Sub-tabs */}
            {(() => {
              const docFile = driveFiles.find((f) => {
                if (f.mime_type !== 'application/vnd.google-apps.document') return false;
                const leaf = (f.name.split('/').pop() || f.name).toLowerCase().trim();
                return leaf === 'documentation' || leaf.includes('documentation');
              });
              return (
                <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
                  {docFile && (
                    <button
                      onClick={() => setDocsSubTab('documentation')}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        docsSubTab === 'documentation'
                          ? 'border-navy text-navy'
                          : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      Documentation
                    </button>
                  )}
                  <button
                    onClick={() => setDocsSubTab('encircle')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      docsSubTab === 'encircle'
                        ? 'border-navy text-navy'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    Encircle Reports
                    {documents.length > 0 && (
                      <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        {documents.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => { setDocsSubTab('drive'); loadDriveFiles(); }}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      docsSubTab === 'drive'
                        ? 'border-navy text-navy'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    Google Drive
                    {driveFiles.filter(f => !f.is_folder).length > 0 && (
                      <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        {driveFiles.filter(f => !f.is_folder).length}
                      </span>
                    )}
                  </button>
                </div>
              );
            })()}

            {/* Documentation sub-tab — embedded Google Doc */}
            {docsSubTab === 'documentation' && (() => {
              const docFile = driveFiles.find((f) => {
                if (f.mime_type !== 'application/vnd.google-apps.document') return false;
                const leaf = (f.name.split('/').pop() || f.name).toLowerCase().trim();
                return leaf === 'documentation' || leaf.includes('documentation');
              });
              if (!docFile) return <p className="text-sm text-gray-400 text-center py-8">No Documentation file found.</p>;
              return (
                <div className="-mx-6 -mb-6">
                  <div className="flex justify-end px-6 pb-2">
                    <a
                      href={docFile.url || `https://docs.google.com/document/d/${docFile.id}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-navy/60 hover:text-navy flex items-center gap-1 transition-colors"
                    >
                      Open in Google Docs <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <iframe
                    src={`https://docs.google.com/document/d/${docFile.id}/preview`}
                    className="w-full border-0 rounded-b-2xl"
                    style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}
                    title="Documentation"
                  />
                </div>
              );
            })()}

            {/* Encircle Reports sub-tab */}
            {docsSubTab === 'encircle' && (
              <>
                {claimLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 text-navy animate-spin" />
                    <span className="ml-2 text-gray-500 text-sm">Loading documents...</span>
                  </div>
                ) : documents.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    {claimId ? 'No PDF reports on this claim.' : 'No Encircle claim linked.'}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {documents.map((doc, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-navy/30 hover:bg-gray-50 transition-all group cursor-pointer"
                        onClick={() => setPreviewDocIndex(i)}
                      >
                        <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-700 group-hover:text-navy truncate">
                            {doc.filename}
                          </div>
                          <div className="text-xs text-gray-400">
                            {doc.creator && doc.creator.split('@')[0]}
                            {doc.created && ` · ${formatDate(doc.created)}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Eye className="w-3.5 h-3.5 text-gray-300 group-hover:text-navy" />
                          <a
                            href={doc.download_uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-300 hover:text-navy"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Google Drive sub-tab */}
            {docsSubTab === 'drive' && (
              <>
                <div className="flex justify-end mb-3">
                  <a
                    href={
                      job.gdrive_folder_id
                        ? `https://drive.google.com/drive/folders/${job.gdrive_folder_id}`
                        : 'https://drive.google.com/drive/u/1/folders/1JIV2OEzO3wQ66PpIXp2__6ZDR1riQAPF'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-navy/60 hover:text-navy flex items-center gap-1 transition-colors"
                  >
                    Open in Drive <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {driveLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 text-navy animate-spin" />
                    <span className="ml-2 text-gray-500 text-sm">Loading Drive files...</span>
                  </div>
                ) : !job.gdrive_folder_id ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    No project folder linked. <a href="https://drive.google.com/drive/u/1/folders/1JIV2OEzO3wQ66PpIXp2__6ZDR1riQAPF" target="_blank" rel="noopener noreferrer" className="text-navy underline">Open Projects folder</a>
                  </p>
                ) : driveFiles.filter(f => !f.is_folder).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No files in this project folder.</p>
                ) : (
                  <div className="space-y-1.5">
                    {driveFiles.filter(f => !f.is_folder).map((f, idx) => {
                      const pathParts = f.name.split('/');
                      const fileName = pathParts.pop() || f.name;
                      const folderPath = pathParts.join('/');
                      const canPreview = f.mime_type === 'application/pdf' || f.mime_type.includes('google-apps') || f.mime_type.startsWith('image/');
                      return (
                        <div
                          key={f.id}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-navy/30 hover:bg-gray-50 transition-all group cursor-pointer"
                          onClick={() => canPreview ? setPreviewDriveIndex(idx) : window.open(f.url || `https://drive.google.com/file/d/${f.id}/view`, '_blank')}
                        >
                          <DriveFileIcon mimeType={f.mime_type} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-700 group-hover:text-navy truncate">
                              {fileName}
                            </div>
                            <div className="text-xs text-gray-400">
                              {folderPath && <span className="text-navy/40">{folderPath} · </span>}
                              {formatMimeType(f.mime_type)}
                              {f.size != null && ` · ${formatFileSize(f.size)}`}
                              {f.modified && ` · ${formatDate(f.modified)}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {canPreview && <Eye className="w-3.5 h-3.5 text-gray-300 group-hover:text-navy" />}
                            <a
                              href={f.url || `https://drive.google.com/file/d/${f.id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-300 hover:text-navy"
                              title="Open in Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'photos' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Encircle Photos
            </h2>
            {(claimLoading || roomsNotesLoading) ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-navy animate-spin" />
                <span className="ml-2 text-gray-500 text-sm">Loading rooms...</span>
              </div>
            ) : (
              <PhotoGrid rooms={rooms} claimId={claimId} />
            )}
          </div>
        )}

        {tab === 'invoices' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              QuickBooks Invoices
            </h2>
            {invoicesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-navy animate-spin" />
                <span className="ml-2 text-gray-500 text-sm">Loading invoices...</span>
              </div>
            ) : (
              <InvoiceTable invoices={invoices} />
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Encircle Notes
            </h2>
            {(claimLoading || roomsNotesLoading) ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-navy animate-spin" />
                <span className="ml-2 text-gray-500 text-sm">Loading notes...</span>
              </div>
            ) : (
              <NoteTimeline notes={notes} />
            )}
          </div>
        )}
      </main>

      {/* Encircle PDF Preview Modal */}
      {previewDocIndex >= 0 && previewDocIndex < documents.length && (
        <PdfPreviewModal
          url={`https://docs.google.com/viewer?url=${encodeURIComponent(documents[previewDocIndex].download_uri)}&embedded=true`}
          title={documents[previewDocIndex].filename}
          index={previewDocIndex}
          total={documents.length}
          onClose={() => setPreviewDocIndex(-1)}
          onPrev={() => setPreviewDocIndex((i) => Math.max(0, i - 1))}
          onNext={() => setPreviewDocIndex((i) => Math.min(documents.length - 1, i + 1))}
          downloadUrl={documents[previewDocIndex].download_uri}
        />
      )}

      {/* Google Drive PDF Preview Modal */}
      {previewDriveIndex >= 0 && (() => {
        const realFiles = driveFiles.filter(f => !f.is_folder);
        const f = realFiles[previewDriveIndex];
        if (!f) return null;
        const previewUrl = f.mime_type === 'application/pdf'
          ? `https://drive.google.com/file/d/${f.id}/preview`
          : f.mime_type.includes('google-apps')
            ? f.url || `https://drive.google.com/file/d/${f.id}/preview`
            : `https://drive.google.com/file/d/${f.id}/preview`;
        const pathParts = f.name.split('/');
        const fileName = pathParts.pop() || f.name;
        return (
          <PdfPreviewModal
            url={previewUrl}
            title={fileName}
            index={previewDriveIndex}
            total={realFiles.length}
            onClose={() => setPreviewDriveIndex(-1)}
            onPrev={() => setPreviewDriveIndex((i) => Math.max(0, i - 1))}
            onNext={() => setPreviewDriveIndex((i) => Math.min(realFiles.length - 1, i + 1))}
            downloadUrl={f.url || undefined}
          />
        );
      })()}
    </div>
  );
}

// PDF Preview Modal with arrow navigation
function PdfPreviewModal({ url, title, index, total, onClose, onPrev, onNext, downloadUrl }: {
  url: string;
  title: string;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  downloadUrl?: string;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); onNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); onPrev(); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNext, onPrev, onClose]);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/60" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-white min-w-0">
          <span className="text-white/50 font-mono text-xs">{index + 1} / {total}</span>
          <span className="text-sm font-medium truncate">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={downloadUrl || url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/60 hover:text-white text-xs flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open
          </a>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* PDF iframe */}
      <div className="flex-1 relative" onClick={(e) => e.stopPropagation()}>
        {/* Previous arrow */}
        {index > 0 && (
          <button
            onClick={onPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 transition-colors z-10"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Next arrow */}
        {index < total - 1 && (
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 transition-colors z-10"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        <iframe
          key={url}
          src={url}
          className="w-full h-full border-0"
          title={title}
        />
      </div>
    </div>
  );
}

// Helper components
function Field({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wider">{label}</dt>
      <dd className={`text-sm text-gray-800 mt-0.5 flex items-center gap-1.5 ${mono ? 'font-mono' : ''}`}>
        {icon}
        {value}
      </dd>
    </div>
  );
}

function DriveFileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === 'application/vnd.google-apps.folder') return <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
  if (mimeType.startsWith('image/')) return <Image className="w-4 h-4 text-green-500 flex-shrink-0" />;
  if (mimeType.startsWith('video/')) return <Video className="w-4 h-4 text-purple-500 flex-shrink-0" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
  if (mimeType.includes('pdf')) return <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />;
  if (mimeType.includes('document') || mimeType.includes('word')) return <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />;
  return <File className="w-4 h-4 text-gray-400 flex-shrink-0" />;
}

function formatMimeType(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.form': 'Google Form',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'video/mp4': 'MP4',
  };
  return map[mime] || mime.split('/').pop()?.replace('vnd.google-apps.', '') || 'File';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
