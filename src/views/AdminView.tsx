import { useEffect, useState } from "react";
import { Archive, Check, KeyRound, RotateCcw, ShieldCheck, X } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Dialog, DialogClose, DialogHeader } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import type { Employee } from "../lib/data";
import { useToast } from "../components/ui/Toast";
import { apiFetch } from "../lib/api";

const hoverScrollbarClasses = 
  "max-h-[400px] overflow-y-auto pr-2 " +
  "[scrollbar-width:thin] [scrollbar-color:transparent_transparent] hover:[scrollbar-color:#cbd5e1_transparent] " +
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent " +
  "hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors duration-300";

export function AdminView() {
  const { toast } = useToast();
  const [localEmployees, setLocalEmployees] = useState<(Employee & { banned?: boolean })[]>([]);
  const [archivedAccounts, setArchivedAccounts] = useState<{ id: string; name: string; type: "Employee"; record: Employee & { banned?: boolean } }[]>([]);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordRetrySeconds, setPasswordRetrySeconds] = useState(0);

  useEffect(() => {
    if (passwordRetrySeconds <= 0) return;
    const timer = window.setInterval(() => setPasswordRetrySeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [passwordRetrySeconds > 0]);

  useEffect(() => {
    Promise.all([apiFetch('/api/employees'), apiFetch('/api/archived-employees')]).then(async ([activeResponse, archivedResponse]) => {
      if (activeResponse.ok) setLocalEmployees(await activeResponse.json());
      if (archivedResponse.ok) {
        const archived = await archivedResponse.json() as (Employee & { banned?: boolean })[];
        setArchivedAccounts(archived.map((record) => ({ id: record.id, name: record.name, type: 'Employee' as const, record })));
      }
    }).catch(() => {});
  }, []);

  function toggleBanEmployee(id: string) {
    const employee = localEmployees.find((item) => item.id === id);
    setLocalEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, banned: !(e as any).banned } : e)));
    if (employee) toast({ title: (employee as any).banned ? "Account access restored" : "Account access blocked", description: `${employee.name}'s access was updated.`, variant: (employee as any).banned ? "success" : "info" });
  }

  async function unlockAdminControls(event: React.FormEvent) {
    event.preventDefault();
    if (!password) { setPasswordError("Enter your admin password."); return; }
    try {
      const response = await apiFetch('/api/auth/verify-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const contentType = response.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json') ? await response.json() : null;
      if (response.status === 429) {
        const seconds = Number(data?.retryAfterSeconds || response.headers.get('Retry-After') || 0);
        setPasswordRetrySeconds(seconds);
        throw new Error(`Too many password attempts. Try again in ${seconds} seconds.`);
      }
      if (!response.ok) throw new Error(data?.error || `Password verification failed (server returned ${response.status})`);
      setPasswordPromptOpen(false);
      setAdminUnlocked(true);
      setPasswordError("");
      setPassword("");
      toast({ title: "Admin controls unlocked", description: "Protected account controls are now available.", variant: "success" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Password verification failed'; setPasswordError(message); toast({ title: "Unable to unlock controls", description: message, variant: "error" });
    }
  }

  async function restoreAccount(id: string) {
    const account = archivedAccounts.find((item) => item.id === id);
    if (!account) return;
    const response = await apiFetch(`/api/employees/${id}/unarchive`, { method: 'POST' });
    if (!response.ok) { toast({ title: "Account was not restored", description: "Please try again.", variant: "error" }); return; }
    const restored = await response.json();
    setLocalEmployees((current) => [...current, { ...restored, banned: false }]);
    setArchivedAccounts((current) => current.filter((item) => item.id !== id));
    toast({ title: "Account restored", description: `${account.name} returned to the employee directory.`, variant: "success" });
  }

  if (!adminUnlocked) return (
    <div className="flex min-h-[calc(100svh-10rem)] items-center justify-center py-6"><Card className="w-full max-w-md"><CardContent className="flex flex-col items-center p-6 text-center sm:p-8"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#8642ED]/10"><KeyRound className="h-7 w-7 text-[#8642ED]" /></div><h2 className="mt-4 text-xl font-bold text-slate-900">Admin Controls Locked</h2><p className="mt-1 text-sm text-slate-500">Password verification is required before accessing any administrative controls.</p><Button className="mt-5" onClick={() => { setPassword(""); setPasswordError(""); setPasswordPromptOpen(true); }}>Enter Password</Button></CardContent></Card>
      <Dialog open={passwordPromptOpen} onClose={() => setPasswordPromptOpen(false)} className="max-w-sm"><DialogHeader><div><h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><KeyRound className="h-4 w-4 text-[#8642ED]" /> Admin Password</h3><p className="mt-1 text-xs text-slate-500">Verify your current account password to continue.</p></div><DialogClose onClose={() => setPasswordPromptOpen(false)} /></DialogHeader><form onSubmit={unlockAdminControls} className="space-y-3 px-6 pb-6 pt-3"><Input type="password" autoFocus disabled={passwordRetrySeconds > 0} value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(""); }} placeholder={passwordRetrySeconds > 0 ? `Try again in ${passwordRetrySeconds}s` : "Enter admin password"} />{passwordRetrySeconds > 0 && <p className="text-xs font-medium text-amber-600">Password attempts locked for {passwordRetrySeconds} more seconds.</p>}{passwordError && <p className="text-xs text-rose-600">{passwordError}</p>}<div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setPasswordPromptOpen(false)}>Cancel</Button><Button type="submit" size="sm" disabled={passwordRetrySeconds > 0}>{passwordRetrySeconds > 0 ? `Wait ${passwordRetrySeconds}s` : "Unlock"}</Button></div></form></Dialog>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 px-5 py-5 shadow-sm backdrop-blur">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Admin Control Panel</h2>
            <p className="text-sm text-slate-500">Manage user access, bans, and global system configuration</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end"><Button className="flex-1 sm:flex-none" variant="outline" onClick={() => setArchiveOpen(true)}><Archive className="h-4 w-4" /> Archive</Button><Button className="flex-1 sm:flex-none" variant="outline" onClick={() => { setArchiveOpen(false); setAdminUnlocked(false); }}><KeyRound className="h-4 w-4" /> Lock</Button></div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Ban / Unban Employees Table */}
        <Card>
          <CardHeader>
            <CardTitle>Employee Access</CardTitle>
            <CardDescription>Manage all employee accounts, including employees assigned as managers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={hoverScrollbarClasses}>
              <Table className="min-w-[620px]">
                <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localEmployees.map((e) => (
                    <TableRow key={e.id} className="group hover:bg-slate-50/70">
                      <TableCell>
                        <div className="font-medium text-slate-900">{e.name}</div>
                        <div className="text-xs text-slate-500">{e.id}</div>
                      </TableCell>
                      <TableCell className="capitalize text-slate-600">{e.role}</TableCell>
                      <TableCell>
                        {(e as any).banned ? (
                          <Badge variant="danger">Banned</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={(e as any).banned ? "outline" : undefined} onClick={() => toggleBanEmployee(e.id)}>
                          {(e as any).banned ? (
                            <><Check className="mr-1.5 h-3.5 w-3.5" />Unban</>
                          ) : (
                            <><X className="mr-1.5 h-3.5 w-3.5" />Ban</>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Global Settings Table */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-slate-700" />
              System Settings
            </CardTitle>
            <CardDescription>Global configuration and system restrictions</CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Configuration</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium text-slate-900">Maintenance Mode</TableCell>
                  <TableCell className="text-slate-500 text-sm">Lock out all non-admin users instantly</TableCell>
                  <TableCell><Badge variant="neutral">Off</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline">Toggle</Button></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-slate-900">Automated Backups</TableCell>
                  <TableCell className="text-slate-500 text-sm">Daily database snapshots at 00:00 UTC</TableCell>
                  <TableCell><Badge variant="success">Active</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline">Configure</Button></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-slate-900">New User Registration</TableCell>
                  <TableCell className="text-slate-500 text-sm">Allow new employees to sign up</TableCell>
                  <TableCell><Badge variant="success">Open</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline">Restrict</Button></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {archiveOpen && (
        <Card className="border-violet-200">
          <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2"><Archive className="h-5 w-5 text-[#8642ED]" /> Archive</CardTitle><CardDescription>Protected archived accounts. Restore records when needed.</CardDescription></div><Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => setArchiveOpen(false)}>Close &amp; Lock</Button></div></CardHeader>
          <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>
            {archivedAccounts.map((account) => <TableRow key={account.id}><TableCell><div className="font-medium text-slate-900">{account.name}</div><div className="text-xs text-slate-400">{account.id}</div></TableCell><TableCell><Badge variant="neutral">{account.type}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => restoreAccount(account.id)}><RotateCcw className="h-3.5 w-3.5" /> Restore</Button></TableCell></TableRow>)}
          </TableBody></Table>{archivedAccounts.length === 0 && <div className="py-10 text-center text-sm text-slate-400">The archive is empty.</div>}</CardContent>
        </Card>
      )}

    </div>
  );
}
