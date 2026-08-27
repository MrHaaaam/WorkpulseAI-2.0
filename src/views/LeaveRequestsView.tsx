import { useEffect, useState } from "react";
import { 
  Check, 
  X, 
  Clock, 
  Calendar, 
  Search, 
  CheckCircle, 
  XCircle, 
  AlertCircle 
} from "lucide-react";
import { useToast } from "../components/ui/Toast";
import { apiFetch } from "../lib/api";
import { Dialog, DialogClose, DialogHeader } from "../components/ui/Dialog";
import { Button } from "../components/ui/Button";
import { LeaveDatePicker } from "../components/LeaveDatePicker";

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
  status: "pending" | "approved" | "rejected" | "cancelled";
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

function LeaveDates({ request }: { request: LeaveRequest }) {
  const dates = request.approvedDates?.length ? request.approvedDates : request.requestedDates?.length ? request.requestedDates : [];
  if (!dates.length) return <div className="mt-1 flex items-center gap-1 text-xs text-slate-600"><Calendar className="h-3.5 w-3.5 text-slate-400"/><span>{friendlyDate(request.startDate)} to {friendlyDate(request.endDate)}</span><span className="font-semibold text-slate-900">({request.totalDays} days)</span></div>;
  return <div className="mt-1 flex flex-wrap items-center gap-1.5" title={dates.map(friendlyDate).join(", ")}>{dates.slice(0,3).map((date)=><span key={date} className="rounded-md bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">{friendlyDate(date)}</span>)}{dates.length>3&&<span className="text-[11px] font-semibold text-slate-500">+{dates.length-3} more</span>}<span className="text-[11px] font-bold text-slate-700">{dates.length} {dates.length===1?"day":"days"}</span></div>;
}

export function LeaveRequestsView({
  requests = [],
  onApprove,
  onReject,
}: LeaveRequestsViewProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [localRequests, setLocalRequests] = useState(requests);
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [approvalDates, setApprovalDates] = useState<string[]>([]);
  useEffect(() => { apiFetch('/api/leave-requests').then((response) => response.ok ? response.json() : Promise.reject()).then(setLocalRequests).catch(() => setLocalRequests([])); }, []);

  async function updateRequest(id: string, status: "approved" | "rejected", approvedDates: string[] = []) {
    const request = localRequests.find((item) => item.id === id);
    try {
      const response = await apiFetch(`/api/leave-requests/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, approvedDates }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Unable to ${status === "approved" ? "approve" : "reject"} leave request`);
      setLocalRequests((current) => current.map((item) => item.id === id ? { ...item, ...data } : item));
      if (status === "approved") onApprove?.(id); else onReject?.(id);
      toast({ title: status === "approved" ? "Leave approved" : "Leave rejected", description: request ? `${request.employeeName}'s request was updated.` : "The leave request was updated.", variant: status === "approved" ? "success" : "info" });
      setReviewTarget(null);
    } catch (reason) {
      toast({ title: "Leave request not updated", description: reason instanceof Error ? reason.message : "Please try again.", variant: "error" });
    }
  }
  async function undoApproval(request: LeaveRequest) {
    if (!window.confirm(`Undo ${request.employeeName}'s approved leave? Future On Leave attendance will be removed and their credits restored.`)) return;
    try {
      const response = await apiFetch(`/api/leave-requests/${request.id}/undo-approval`, { method: 'PATCH' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Approval could not be undone');
      setLocalRequests((current) => current.map((item) => item.id === request.id ? { ...item, ...data } : item));
      toast({ title: "Approval undone", description: `${request.employeeName}'s leave was cancelled and future attendance access was restored.`, variant: "success" });
    } catch (reason) { toast({ title: "Approval was not undone", description: reason instanceof Error ? reason.message : "Please try again.", variant: "error" }); }
  }
  // REMOVED: filterLeaveType state declaration

  const today = (() => { const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; })();
  const activeRequests = localRequests.filter((request) => {
    const dates = request.approvedDates?.length ? request.approvedDates : request.requestedDates?.length ? request.requestedDates : [request.endDate];
    return [...dates].sort().at(-1)! >= today;
  }).sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime());
  const pendingCount = activeRequests.filter(r => r.status === "pending").length;
  const approvedCount = activeRequests.filter(r => r.status === "approved").length;
  const totalDaysRequested = activeRequests.reduce((acc, r) => acc + (r.status === "approved" ? r.totalDays : 0), 0);

  // UPDATED: Filtration rules look strictly at search text and status matches now
  const filteredRequests = activeRequests.filter(req => {
    const matchesSearch = req.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          req.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || req.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Leave Requests</h2>
          <p className="text-sm text-slate-500">Review, approve, or decline time-off requests from your team.</p>
        </div>
      </div>

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
            <p className="text-sm font-medium text-slate-500">Approved This Month</p>
            <p className="text-2xl font-bold text-slate-900">{approvedCount}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#8642ED]/10 text-[#8642ED]">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Team Days Approved</p>
            <p className="text-2xl font-bold text-slate-900">{totalDaysRequested} Days</p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div data-guide="leave-filters" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search Input */}
        <div className="relative max-w-md flex-1 w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-[#8642ED] focus:outline-none focus:ring-1 focus:ring-[#8642ED]"
          />
        </div>

        {/* Status Filter Pills (Leave Type Pills have been completely removed) */}
        <div className="flex gap-2 overflow-x-auto scrollbar-thin">
          {[
            ["all", "All Statuses"],
            ["pending", "Pending"],
            ["approved", "Approved"],
            ["rejected", "Declined"]
          ].map(([val, label]) => (
            <button
              key={val}
onClick={() => setFilterStatus(val as "all" | "pending" | "approved" | "rejected")}
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
      <div data-guide="leave-list" className="space-y-4">
        {filteredRequests.length > 0 ? (
          filteredRequests.map((request) => (
            <div
              key={request.id}
              className="flex flex-col md:flex-row md:items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-md"
            >
              {/* Employee Quick Info */}
              <div className="flex items-center gap-3.5 min-w-[240px]">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#8642ED]/10 text-sm font-bold text-[#8642ED]">
                  {request.initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{request.employeeName}</p>
                  <p className="truncate text-xs text-slate-400">{request.role}</p>
                </div>
              </div>

              {/* Leave Type and Dates */}
              <div className="grid grid-cols-2 md:flex md:items-center gap-4 md:gap-8 flex-1">
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
                <div className="col-span-2 md:flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reason</p>
                  <p className="mt-1 text-xs text-slate-600 truncate md:max-w-xs lg:max-w-md" title={request.reason}>
                    "{request.reason}"
                  </p>
                </div>
              </div>

              {/* Actions & Status Badge */}
              <div className="flex items-center justify-between md:justify-end gap-3 mt-4 md:mt-0 border-t md:border-none pt-3 md:pt-0 border-slate-100">
                {request.status === "approved" && (
                  <div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle className="h-3.5 w-3.5" /> Approved</span>{request.approvedDates?.some((date)=>date>=today)&&<button onClick={()=>void undoApproval(request)} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">Undo Approval</button>}</div>
                )}
                
                {request.status === "rejected" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                    <XCircle className="h-3.5 w-3.5" /> Declined
                  </span>
                )}
                {request.status === "cancelled" && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"><XCircle className="h-3.5 w-3.5" /> Cancelled</span>}

                {request.status === "pending" && (
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                      onClick={() => updateRequest(request.id, "rejected")}
                      className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" /> Decline
                    </button>
                    <button
                      onClick={() => { setReviewTarget(request); setApprovalDates(request.requestedDates?.length ? request.requestedDates : []); }}
                      className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 rounded-lg bg-[#8642ED] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#7232db] shadow-sm transition-colors"
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
      </div>
      <Dialog open={Boolean(reviewTarget)} onClose={() => setReviewTarget(null)} className="max-w-2xl"><DialogHeader><div><h3 className="text-base font-bold text-slate-900">Review leave dates</h3><p className="mt-1 text-sm text-slate-500">Select the exact requested dates to approve for {reviewTarget?.employeeName}.</p></div><DialogClose onClose={() => setReviewTarget(null)}/></DialogHeader><div className="space-y-4 px-6 pb-6 pt-3">{reviewTarget&&<LeaveDatePicker selected={approvalDates} onChange={setApprovalDates} allowedDates={reviewTarget.requestedDates}/>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setReviewTarget(null)}>Cancel</Button><Button disabled={!approvalDates.length} onClick={()=>reviewTarget&&void updateRequest(reviewTarget.id,"approved",approvalDates)}><Check className="h-4 w-4"/>Approve {approvalDates.length} {approvalDates.length===1?"Date":"Dates"}</Button></div></div></Dialog>
    </div>
  );
}
