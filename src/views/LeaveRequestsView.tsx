import { Input } from "../components/ui/Input";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { useEffect, useState } from "react";
import {
  Check,
  X,
  Clock,
  Calendar,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle, KeyRound, ChevronDown
} from "lucide-react";
import { useToast } from "../components/ui/Toast";
import { apiFetch } from "../lib/api";
import { Dialog, DialogClose, DialogHeader } from "../components/ui/Dialog";
import { Button } from "../components/ui/Button";
import { LeaveDatePicker } from "../components/LeaveDatePicker";
import { PaginationControls } from "../components/ui/Pagination";
import { usePagination } from "../hooks/usePagination";

export interface LeaveRequest {
  id: string;
  employeeId?: string;
  employeeName: string;
  role: string;
  leaveType: "Annual Leave" | "Sick Leave" | "Personal Leave" | "Maternity Leave";
  startDate: string;
  endDate: string;
  requestedDates?: string[];
  approvedDates?: string[];
  totalDays: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "passed";
  avatarUrl?: string;
  initials: string;
  createdAt?: string;
}

interface LeaveRequestsViewProps {
  requests: LeaveRequest[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

function friendlyDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-PH", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

function requestedDatesFor(request: LeaveRequest) {
  if (request.requestedDates?.length) return [...new Set(request.requestedDates)].sort();
  const start = new Date(`${request.startDate}T00:00:00Z`);
  const end = new Date(`${request.endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const dates: string[] = [];
  for (let date = start; date <= end; date = new Date(date.getTime() + 86_400_000)) dates.push(date.toISOString().slice(0, 10));
  return dates;
}

function LeaveDates({ request }: { request: LeaveRequest }) {
  const dates = request.approvedDates?.length ? request.approvedDates : request.requestedDates?.length ? request.requestedDates : [];
  const rangeLabel = request.startDate === request.endDate
    ? friendlyDate(request.startDate)
    : `${friendlyDate(request.startDate)} to ${friendlyDate(request.endDate)}`;
  const labels = dates.length ? dates.slice(0, 3).map(friendlyDate) : [rangeLabel];
  const dayCount = dates.length || request.totalDays;
  return <div className="mt-1 flex flex-wrap items-center gap-1.5" title={dates.length ? dates.map(friendlyDate).join(", ") : rangeLabel}>{labels.map((label, index)=><span key={index} className="rounded-md bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">{label}</span>)}{dates.length>3&&<span className="text-[11px] font-semibold text-slate-500">+{dates.length-3} more</span>}<span className="text-[11px] font-bold text-slate-700">{dayCount} {dayCount===1?"day":"days"}</span></div>;
}

function requestedOn(value?: string) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Requested date not recorded';
  return `Requested ${date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
}

type ApprovalPreview = { today: string; requestStatus: string; dates: { date: string; past: boolean; attendanceStatus: string; blockedReason: string | null }[] };

function LeaveReason({ request }: { request: LeaveRequest }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `leave-reason-${request.id}`;
  return <div className="min-w-0 min-[400px]:col-span-2">
    <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(current => !current)} className="flex min-h-11 items-center gap-2 rounded-md text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:min-h-8">
      Reason <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      <span className="sr-only">{expanded ? 'Collapse' : 'Expand'} reason for {request.employeeName}</span>
    </button>
    <p id={contentId} className={`whitespace-pre-wrap break-words text-xs leading-5 text-slate-600 ${expanded ? '' : 'line-clamp-1'}`}>
      "{request.reason}"
    </p>
  </div>;
}

export function LeaveRequestsView({
  requests = [],
  onApprove,
  onReject,
}: LeaveRequestsViewProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected" | "passed">("all");
  const [localRequests, setLocalRequests] = useState(requests);
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [undoTarget, setUndoTarget] = useState<LeaveRequest | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [approvalDates, setApprovalDates] = useState<string[]>([]);
  const [approvalPreview, setApprovalPreview] = useState<ApprovalPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [reviewPast, setReviewPast] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"approved" | "rejected" | null>(null);
  const [bulkPassword, setBulkPassword] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFailures, setBulkFailures] = useState<{ id: string; error: string }[]>([]);
  useEffect(() => { apiFetch('/api/leave-requests').then((response) => response.ok ? response.json() : Promise.reject()).then(setLocalRequests).catch(() => setLocalRequests([])); }, []);

  function openApproval(request: LeaveRequest) {
    setReviewTarget(request); setApprovalPreview(null); setPreviewLoading(true); setPreviewError("");
    setApprovalDates([]); setReviewPast(false); setCorrectionReason(""); setConfirmApproval(false);
  }

  useEffect(() => {
    if (!reviewTarget) return;
    const controller = new AbortController();
    apiFetch(`/api/leave-requests/${reviewTarget.id}/approval-preview`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Approval checks failed.');
      if (controller.signal.aborted) return;
      const preview = data as ApprovalPreview;
      setApprovalPreview(preview);
      setApprovalDates(preview.dates.filter(item => !item.past && !item.blockedReason).map(item => item.date));
    }).catch(error => { if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : 'Approval checks failed.'); })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [reviewTarget]);

  const selectedPreview = approvalPreview?.dates.filter(item => approvalDates.includes(item.date)) ?? [];
  const correctingPast = selectedPreview.some(item => item.past);
  const validReason = correctionReason.trim().length >= 5 && correctionReason.trim().length <= 500;
  const canApprove = Boolean(approvalPreview && approvalDates.length && !previewLoading && !approvalBusy && !selectedPreview.some(item => item.blockedReason) && (!correctingPast || (reviewPast && validReason)));
  const dateDetails = Object.fromEntries((approvalPreview?.dates ?? []).map(item => [item.date, {
    detail: `${item.past ? 'Past date · ' : item.date === approvalPreview?.today ? 'Today · ' : ''}${item.attendanceStatus}`,
    disabledReason: item.blockedReason || (item.past && !reviewPast ? 'Past date—requires correction. Enable Review past dates below.' : item.past && !validReason ? 'Enter a correction reason first (at least 5 characters).' : undefined),
  }]));

  async function updateRequest(id: string, status: "approved" | "rejected", approvedDates: string[] = []) {
    if (approvalBusy) return;
    setApprovalBusy(true);
    const request = localRequests.find((item) => item.id === id);
    try {
      const response = await apiFetch(`/api/leave-requests/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, approvedDates, correctionReason, confirmPastCorrection: status === 'approved' && confirmApproval && reviewPast && correctingPast }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Unable to ${status === "approved" ? "approve" : "reject"} leave request`);
      setLocalRequests((current) => current.map((item) => item.id === id ? { ...item, ...data } : item));
      if (status === "approved") onApprove?.(id); else onReject?.(id);
      toast({ title: status === "approved" ? "Leave approved" : "Leave rejected", description: request ? `${request.employeeName}'s request was updated.` : "The leave request was updated.", variant: status === "approved" ? "success" : "info" });
      setReviewTarget(null);
    } catch (reason) {
      setConfirmApproval(false);
      setPreviewError(reason instanceof Error ? reason.message : 'Refresh and review the request again.');
      toast({ title: "Leave request not updated", description: reason instanceof Error ? reason.message : "Please try again.", variant: "error" });
    } finally { setApprovalBusy(false); }
  }
  async function undoApproval(request: LeaveRequest) {
    setUndoing(true);
    try {
      const response = await apiFetch(`/api/leave-requests/${request.id}/undo-approval`, { method: 'PATCH' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Approval could not be undone');
      setLocalRequests((current) => current.map((item) => item.id === request.id ? { ...item, ...data } : item));
      const keptDates = data.approvedDates?.length ?? 0;
      const undoneDays = Math.max(0, (request.approvedDates?.length ?? 0) - keptDates);
      toast({ title: "Leave approval updated", description: `${request.employeeName}: approval removed for ${undoneDays} ${undoneDays === 1 ? "day" : "days"}.${keptDates ? ` ${keptDates} past ${keptDates === 1 ? "day stays" : "days stay"} approved.` : " The request is now cancelled."} Recorded time-ins are unchanged.`, variant: "success" });
      setUndoTarget(null);
    } catch (reason) { toast({ title: "Approval was not undone", description: reason instanceof Error ? reason.message : "Please try again.", variant: "error" }); }
    finally { setUndoing(false); }
  }
  async function submitBulkDecision() {
    if (!bulkAction || !selectedIds.length || !bulkPassword) return;
    setBulkBusy(true);
    try {
      const response = await apiFetch('/api/leave-requests/bulk-status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds, status: bulkAction, password: bulkPassword }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Bulk leave processing failed');
      const successful = Array.isArray(data.successful) ? data.successful : [];
      const updates = new Map<string, LeaveRequest>(successful.map((item: { id: string; request: LeaveRequest }) => [item.id, item.request]));
      setLocalRequests(current => current.map(item => updates.has(item.id) ? { ...item, ...updates.get(item.id)! } : item));
      const failed = Array.isArray(data.failed) ? data.failed : [];
      setSelectedIds(failed.map((item: { id: string }) => item.id)); setBulkFailures(failed);
      toast({ title: `${successful.length} request${successful.length===1?'':'s'} ${bulkAction}`, description: data.failed?.length ? `${data.failed.length} could not be processed and remain selected.` : 'Every selected request was processed successfully.', variant: data.failed?.length ? 'info' : 'success' });
      if (!failed.length) setBulkAction(null); setBulkPassword("");
    } catch (reason) { toast({ title: 'Selected requests were not processed', description: reason instanceof Error ? reason.message : 'Please try again.', variant: 'error' }); }
    finally { setBulkBusy(false); }
  }
  // REMOVED: filterLeaveType state declaration

  const today = (() => { const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; })();
  const undoDates = (undoTarget?.approvedDates ?? []).filter(date => date >= today);
  const keptDates = (undoTarget?.approvedDates ?? []).filter(date => date < today);
  const activeRequests = [...localRequests].sort((left, right) => Number(right.status === "pending") - Number(left.status === "pending") || new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime());
  const pendingCount = activeRequests.filter(r => r.status === "pending").length;
  const approvedCount = activeRequests.filter(r => r.status === "approved" && r.approvedDates?.some(date => date >= today)).length;
  const totalDaysRequested = activeRequests.reduce((acc, r) => acc + (r.status === "approved" ? r.approvedDates?.filter(date => date >= today).length ?? 0 : 0), 0);

  // UPDATED: Filtration rules look strictly at search text and status matches now
  const filteredRequests = activeRequests.filter(req => {
    const matchesSearch = req.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          req.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || req.status === filterStatus;

    return matchesSearch && matchesStatus;
  });
  const leavePage = usePagination(filteredRequests, `${searchTerm}|${filterStatus}`);
  const pendingOnPage = leavePage.pageItems.filter(request => request.status === 'pending').map(request => request.id);
  const allPagePendingSelected = pendingOnPage.length > 0 && pendingOnPage.every(id => selectedIds.includes(id));

  return (
    <div className="leave-page mx-auto w-full max-w-7xl space-y-6">
      <AdminPageHeader title="Leave Requests" description="Review leave dates and reasons. Pending requests appear first." icon={Calendar} />

      {/* Modern Stats Bar */}
      <div data-guide="leave-summary" className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Pending Review</p>
            <p className="text-2xl font-bold text-slate-900">{pendingCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Upcoming Approved Leave</p>
            <p className="text-2xl font-bold text-slate-900">{approvedCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#8642ED]/10 text-[#8642ED]">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Upcoming Approved Days</p>
            <p className="text-2xl font-bold text-slate-900">{totalDaysRequested} Days</p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div data-guide="leave-filters" className="flex flex-col gap-3 xl:flex-row xl:items-center">
        {/* Search Input */}
        <div className="relative min-w-0 w-full xl:max-w-md xl:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label="Search leave requests by employee name or role"
            type="text"
            placeholder="Search employee or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-[#8642ED] focus:outline-none focus:ring-1 focus:ring-[#8642ED]"
          />
        </div>

        {/* Status Filter Pills (Leave Type Pills have been completely removed) */}
        <div className="flex flex-wrap gap-2" aria-label="Leave status filters">
          {[
            ["all", "All"],
            ["pending", "Pending"],
            ["approved", "Approved"],
            ["rejected", "Declined"]
            , ["passed", "Passed"]
          ].map(([val, label]) => (
            <button
              type="button"
              key={val}
              aria-pressed={filterStatus === val}
              onClick={() => setFilterStatus(val as "all" | "pending" | "approved" | "rejected" | "passed")}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                filterStatus === val
                  ? "bg-[#8642ED] text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Leave Requests Feed */}
      {pendingOnPage.length>0&&<div className="leave-bulk-toolbar rounded-xl border border-violet-200 bg-violet-50 p-3"><label className="flex items-center gap-2 text-sm font-semibold text-violet-900"><Input type="checkbox" className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 p-0 accent-violet-600" checked={allPagePendingSelected} onChange={event=>setSelectedIds(current=>event.target.checked?[...new Set([...current,...pendingOnPage])]:current.filter(id=>!pendingOnPage.includes(id)))}/>Select all pending on this page</label><span className="text-xs text-violet-700">{selectedIds.length} selected</span><div className="ml-auto flex gap-2"><Button size="sm" variant="outline" disabled={!selectedIds.length} onClick={()=>{setBulkFailures([]);setBulkAction('rejected')}}><X className="h-4 w-4"/>Reject Selected</Button><Button size="sm" disabled={!selectedIds.length} onClick={()=>{setBulkFailures([]);setBulkAction('approved')}}><Check className="h-4 w-4"/>Approve Selected</Button></div></div>}
      <div data-guide="leave-list" className="space-y-3" aria-live="polite" aria-label={`${filteredRequests.length} leave requests shown`}>
        {filteredRequests.length > 0 ? (
          leavePage.pageItems.map((request) => (
            <div
              key={request.id}
              className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-md xl:grid-cols-[minmax(160px,0.8fr)_minmax(0,1.8fr)_240px] xl:items-start xl:gap-5"
            >
              {/* Employee Quick Info */}
              <div className="flex min-w-0 items-center gap-3">
                {request.status==='pending'&&<Input type="checkbox" className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 p-0 accent-violet-600" aria-label={`Select ${request.employeeName}'s leave request`} checked={selectedIds.includes(request.id)} onChange={event=>setSelectedIds(current=>event.target.checked?[...new Set([...current,request.id])]:current.filter(id=>id!==request.id))}/>}
                {request.status!=='pending'&&<span aria-hidden="true" className="hidden h-5 w-5 shrink-0 xl:block"/>}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#8642ED]/10 text-sm font-bold text-[#8642ED]">
                  {request.initials}
                </div>
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-slate-900">{request.employeeName}</p>
                  <p className="truncate text-xs text-slate-400">{request.role}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{requestedOn(request.createdAt)}</p>
                </div>
              </div>

              {/* Leave Type and Dates */}
              <div className="grid min-w-0 grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Leave Type</p>
                  <span className={`inline-block mt-1 text-xs font-semibold ${
                    request.leaveType === 'Sick Leave' ? 'text-rose-600' :
                    request.leaveType === 'Annual Leave' ? 'text-[#8642ED]' : 'text-slate-600'
                  }`}>
                    {request.leaveType}
                  </span>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dates</p>
                  <LeaveDates request={request}/>
                </div>

                {/* Reason */}
                <LeaveReason request={request}/>
              </div>

              {/* Actions & Status Badge */}
              <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-slate-100 pt-3 xl:w-full xl:self-start xl:justify-end xl:border-t-0 xl:pt-0">
                {request.status === "approved" && (
                  <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle className="h-3.5 w-3.5" /> Approved</span>{request.approvedDates?.some((date)=>date>=today)&&<button type="button" onClick={()=>setUndoTarget(request)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300">Undo Approval</button>}</div>
                )}

                {request.status === "rejected" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                    <XCircle className="h-3.5 w-3.5" /> Declined
                  </span>
                )}
                {request.status === "cancelled" && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"><XCircle className="h-3.5 w-3.5" /> Cancelled</span>}
                {request.status === "passed" && <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"><Clock className="h-3.5 w-3.5" /> Leave request passed</span><Button size="sm" variant="outline" onClick={() => openApproval(request)}>Review past dates</Button></div>}

                {request.status === "pending" && (
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <button
                      onClick={() => updateRequest(request.id, "rejected")}
                      className="min-h-11 flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" /> Decline
                    </button>
                    <button
                      onClick={() => openApproval(request)}
                      className="min-h-11 flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-lg bg-[#8642ED] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#7232db] shadow-sm transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
            <AlertCircle className="h-10 w-10 text-slate-400" />
            <h3 className="mt-4 text-sm font-semibold text-slate-900">No requests found</h3>
            <p className="mt-1 text-xs text-slate-500">Try adjusting your filters or search terms.</p>
          </div>
        )}
        <PaginationControls {...leavePage} onPageChange={leavePage.setPage} />
      </div>
      <Dialog open={Boolean(reviewTarget)} onClose={() => !approvalBusy && setReviewTarget(null)} className="max-w-2xl">
        <DialogHeader><div><h3 className="text-base font-bold text-slate-900">{confirmApproval ? 'Confirm leave approval' : 'Review requested leave'}</h3><p className="mt-1 text-sm text-slate-500">Today and upcoming dates are included only when attendance and payroll allow approval. Past dates need a separate correction reason.</p></div><DialogClose onClose={() => !approvalBusy && setReviewTarget(null)}/></DialogHeader>
        <div className="space-y-4 px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
          {reviewTarget && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-semibold text-slate-900">{reviewTarget.employeeName}</p><p className="mt-1 text-sm text-slate-600">{reviewTarget.leaveType} · {reviewTarget.reason}</p></div>}
          {previewLoading && <p role="status" className="text-sm text-slate-500">Checking requested dates, attendance, and paid payroll…</p>}
          {previewError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{previewError} Close this review and reopen it to refresh the checks.</p>}
          {approvalPreview && !confirmApproval && <>
            <LeaveDatePicker selected={approvalDates} onChange={setApprovalDates} allowedDates={approvalPreview.dates.map(item => item.date)} dateDetails={dateDetails}/>
            {approvalPreview.dates.some(item => item.past) && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-amber-950"><Input type="checkbox" checked={reviewPast} onChange={event => { setReviewPast(event.target.checked); if (!event.target.checked) setApprovalDates(current => current.filter(date => date >= approvalPreview.today)); }}/>Review past dates</label>
              <p className="text-xs leading-5 text-amber-950">Past dates stay excluded unless you enable this option, enter a reason, and select each date. Dates with recorded work or paid payroll stay blocked.</p>
              {reviewPast && <label className="block space-y-2"><span className="text-sm font-semibold text-amber-950">Why are you correcting past attendance?</span><textarea value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} minLength={5} maxLength={500} rows={3} className="input h-auto py-2" placeholder="For example: Sick leave was submitted on time but reviewed late."/><span className="block text-xs text-amber-950">5–500 characters. This reason is saved in the approval history.</span></label>}
            </div>}
          </>}
          {confirmApproval && <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-sm font-bold text-violet-950">Approve {approvalDates.length} {approvalDates.length === 1 ? 'date' : 'dates'}</p>
            <ul className="space-y-2 text-sm text-slate-700">{selectedPreview.map(item => <li key={item.date}><strong>{friendlyDate(item.date)}</strong>: {item.attendanceStatus} → On Leave{item.past ? ' (past-date correction)' : ''}</li>)}</ul>
            {correctingPast && <p className="text-sm text-amber-950"><strong>Correction reason:</strong> {correctionReason.trim()}</p>}
            <p className="text-xs leading-5 text-slate-600">Only the listed dates will change. Recorded work and paid payroll cannot be changed by this approval. Approval does not automatically add paid hours.</p>
            {approvalPreview && approvalPreview.dates.length > approvalDates.length && <p className="text-xs leading-5 text-slate-600">Unselected dates will not be approved. This review completes the request; check all dates before confirming.</p>}
          </div>}
          <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={approvalBusy} onClick={() => confirmApproval ? setConfirmApproval(false) : setReviewTarget(null)}>{confirmApproval ? 'Back to dates' : 'Cancel'}</Button><Button disabled={!canApprove || Boolean(previewError)} onClick={() => confirmApproval ? reviewTarget && void updateRequest(reviewTarget.id, 'approved', approvalDates) : setConfirmApproval(true)}><Check className="h-4 w-4"/>{approvalBusy ? 'Saving…' : confirmApproval ? correctingPast ? 'Confirm Past-Date Correction' : 'Confirm Approval' : `Review ${approvalDates.length} ${approvalDates.length === 1 ? 'Date' : 'Dates'}`}</Button></div>
        </div>
      </Dialog>
      <Dialog open={Boolean(undoTarget)} onClose={() => !undoing && setUndoTarget(null)} className="max-w-md">
        <DialogHeader><div><h3 className="text-base font-bold text-amber-800">Undo leave for today and upcoming days?</h3><p className="mt-1 text-sm leading-6 text-slate-600">Today is {friendlyDate(today)}. Past approved days will stay approved.</p></div><DialogClose onClose={() => !undoing && setUndoTarget(null)}/></DialogHeader>
        <div className="space-y-4 px-6 pb-6 pt-3">
          <p className="font-semibold text-slate-900">{undoTarget?.employeeName}</p>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-950">Remove approval for {undoDates.length} {undoDates.length === 1 ? 'day' : 'days'}</p>
            <p className="mt-1 text-sm leading-6 text-amber-950">{undoDates.map(friendlyDate).join(', ') || 'No days available to undo.'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-900">Keep approved</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{keptDates.length ? keptDates.map(friendlyDate).join(', ') : 'No past approved days.'}</p>
            <p className="mt-2 text-xs leading-5 text-slate-600">{keptDates.length ? `The request will remain Approved with ${keptDates.length} ${keptDates.length === 1 ? 'day' : 'days'}.` : 'The request will be marked Cancelled.'}</p>
          </div>
          <p className="text-sm leading-6 text-slate-600">For the days being undone, linked “On Leave” attendance entries will be removed only if there is no time-in. The employee can clock in again. Existing time-ins and past attendance records will stay unchanged.</p>
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={undoing} onClick={()=>setUndoTarget(null)}>Keep Approval</Button><Button type="button" variant="destructive" disabled={undoing || !undoDates.length} onClick={()=>undoTarget&&void undoApproval(undoTarget)}>{undoing ? 'Undoing...' : `Undo ${undoDates.length} ${undoDates.length === 1 ? 'Day' : 'Days'}`}</Button></div>
        </div>
      </Dialog>
      <Dialog open={Boolean(bulkAction)} onClose={()=>!bulkBusy&&setBulkAction(null)} className="max-w-xl"><DialogHeader><div><h3 className="text-base font-bold text-slate-900">{bulkAction==='approved'?'Approve':'Reject'} {selectedIds.length} leave requests?</h3><p className="mt-1 text-sm text-slate-500">Bulk approval checks attendance and paid payroll. Requests containing past dates need individual review and remain selected if approval fails.</p></div><DialogClose onClose={()=>!bulkBusy&&setBulkAction(null)}/></DialogHeader><div className="space-y-4 px-6 pb-6 pt-3">{bulkFailures.length>0&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-sm font-bold text-rose-800">Requests needing review</p>{bulkFailures.map(item=><p key={item.id} className="mt-1 text-xs text-rose-700">{localRequests.find(request=>request.id===item.id)?.employeeName||item.id}: {item.error}</p>)}</div>}<div className="max-h-52 space-y-2 overflow-y-auto">{selectedIds.map(id=>{const request=localRequests.find(item=>item.id===id);return request?<div key={id} className="rounded-xl border border-slate-200 p-3"><p className="text-sm font-semibold text-slate-900">{request.employeeName}</p><p className="text-xs text-slate-500">{requestedDatesFor(request).map(friendlyDate).join(', ')}</p></div>:null})}</div><label className="block space-y-2"><span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><KeyRound className="h-4 w-4"/>Administrator password</span><Input type="password" autoFocus value={bulkPassword} onChange={event=>setBulkPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Confirm your password"/></label><div className="flex justify-end gap-2"><Button variant="outline" disabled={bulkBusy} onClick={()=>setBulkAction(null)}>Cancel</Button><Button variant={bulkAction==='rejected'?'destructive':undefined} disabled={bulkBusy||!bulkPassword} onClick={()=>void submitBulkDecision()}>{bulkBusy?'Processing...':bulkAction==='approved'?'Approve Selected':'Reject Selected'}</Button></div></div></Dialog>
    </div>
  );
}
