import { useState } from "react";
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

export interface LeaveRequest {
  id: string;
  employeeName: string;
  role: string;
  leaveType: "Annual Leave" | "Sick Leave" | "Personal Leave" | "Maternity Leave";
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  avatarUrl?: string;
  initials: string;
}

interface LeaveRequestsViewProps {
  requests: LeaveRequest[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

export function LeaveRequestsView({
  requests = [],
  onApprove,
  onReject,
}: LeaveRequestsViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  // REMOVED: filterLeaveType state declaration

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const approvedCount = requests.filter(r => r.status === "approved").length;
  const totalDaysRequested = requests.reduce((acc, r) => acc + (r.status === "approved" ? r.totalDays : 0), 0);

  // UPDATED: Filtration rules look strictly at search text and status matches now
  const filteredRequests = requests.filter(req => {
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
      <div className="grid gap-4 sm:grid-cols-3">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
      <div className="space-y-4">
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
                  <div className="flex items-center gap-1 mt-1 text-xs text-slate-600">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>{request.startDate} to {request.endDate}</span>
                    <span className="font-semibold text-slate-900">({request.totalDays}d)</span>
                  </div>
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle className="h-3.5 w-3.5" /> Approved
                  </span>
                )}
                
                {request.status === "rejected" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                    <XCircle className="h-3.5 w-3.5" /> Declined
                  </span>
                )}

                {request.status === "pending" && (
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                      onClick={() => onReject && onReject(request.id)}
                      className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" /> Decline
                    </button>
                    <button
                      onClick={() => onApprove && onApprove(request.id)}
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
    </div>
  );
}