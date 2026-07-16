import { useState } from "react";
import { 
  Check, 
  X, 
  Clock, 
  Calendar, 
  Search, 
  User, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle 
} from "lucide-react";

interface LeaveRequest {
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

const initialRequests: LeaveRequest[] = [
  {
    id: "LR-101",
    employeeName: "Sarah Jenkins",
    role: "Senior Frontend Engineer",
    leaveType: "Annual Leave",
    startDate: "2026-07-20",
    endDate: "2026-07-24",
    totalDays: 5,
    reason: "Family trip to Hawaii. Flights and hotel are already booked.",
    status: "pending",
    initials: "SJ"
  },
  {
    id: "LR-102",
    employeeName: "Marcus Vance",
    role: "UI/UX Designer",
    leaveType: "Sick Leave",
    startDate: "2026-07-16",
    endDate: "2026-07-17",
    totalDays: 2,
    reason: "Dental procedure scheduled. Recovering at home.",
    status: "pending",
    initials: "MV"
  },
  {
    id: "LR-103",
    employeeName: "Elena Rostova",
    role: "QA Lead",
    leaveType: "Personal Leave",
    startDate: "2026-07-28",
    endDate: "2026-07-28",
    totalDays: 1,
    reason: "Moving to a new apartment. Need the day to coordinate movers.",
    status: "approved",
    initials: "ER"
  },
  {
    id: "LR-104",
    employeeName: "David Kim",
    role: "DevOps Engineer",
    leaveType: "Annual Leave",
    startDate: "2026-08-03",
    endDate: "2026-08-14",
    totalDays: 10,
    reason: "Summer vacation back home to visit grandparents.",
    status: "rejected",
    initials: "DK"
  }
];

export function LeaveRequestsView() {
  const [requests, setRequests] = useState<LeaveRequest[]>(initialRequests);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");

  // Handle Approve Action
  const handleApprove = (id: string) => {
    setRequests(prev => 
      prev.map(req => req.id === id ? { ...req, status: "approved" as const } : req)
    );
  };

  // Handle Reject Action
  const handleReject = (id: string) => {
    setRequests(prev => 
      prev.map(req => req.id === id ? { ...req, status: "rejected" as const } : req)
    );
  };

  // Calculate quick stats dynamically
  const pendingCount = requests.filter(r => r.status === "pending").length;
  const approvedCount = requests.filter(r => r.status === "approved").length;
  const totalDaysRequested = requests.reduce((acc, r) => acc + (r.status === "approved" ? r.totalDays : 0), 0);

  // Filter requests
  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          req.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || req.status === filterStatus;
    return matchesSearch && matchesFilter;
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left Side: Filter Tabs */}
        <div className="flex gap-1.5 rounded-lg bg-slate-100 p-1 self-start">
          {(["all", "pending", "approved", "rejected"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                filterStatus === status
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Right Side: Search Input */}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-[#8642ED] focus:outline-none focus:ring-1 focus:ring-[#8642ED]"
          />
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
                {/* Status Badges */}
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

                {/* Real-time Interaction Actions */}
                {request.status === "pending" && (
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                      onClick={() => handleReject(request.id)}
                      className="flex-1 md:flex-none inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" /> Decline
                    </button>
                    <button
                      onClick={() => handleApprove(request.id)}
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
          /* Empty Search or Filters State */
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